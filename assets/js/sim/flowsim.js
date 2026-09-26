/* 樹脂流動シミュレーター：充填解析エンジン
 *
 * 市販の 2.5D 流動解析（中立面モデル）と同じ枠組みを、教育用に簡潔に実装したもの。
 *  - 流れ   : Hele-Shaw 近似。充填済みセルで ∇·(S∇p)=0、流動先端で p=0（ベント）、
 *             ゲートは共通圧力の Dirichlet 条件。S = h_m³ / (12 η_eff) は流動度。
 *  - 前進   : コントロールボリューム法。先端セルに流れ込んだ体積で充填率 F を進める。
 *  - 粘度   : Cross-WLF ＋ Rabinowitsch 補正（せん断速度は前ステップの流れから評価）。
 *  - 熱     : 風上陰解法による移流、せん断発熱（Q·Δp）、固化界面への熱損失。
 *  - 固化層 : 固化層を通した壁への伝導と、溶融コアからの熱供給の収支（Stefan 型）。
 *             溶融層厚 h_m = h − 2δ が流動度に 3 乗で効く。
 *  - 空気   : 外周（PL）またはベントに通じていない未充填領域を「エアトラップ」とし、
 *             閉じ込めた空気を断熱圧縮（γ=1.4）させて先端の背圧にする。
 *  - 制御   : 設定流量（射出速度）で押し、ゲート圧が上限に達したら圧力制御に切り替える。
 * 線形方程式は充填順に並べた未知数に対する IC(0) 前処理付き共役勾配法で解く。
 */
(function (root) {
  'use strict';
  var K = root.KANAGATA = root.KANAGATA || {};
  var RH = K.rheology;

  var EMPTY = 0, FRONT = 1, FULL = 2;
  var P_ATM = 101325, GAMMA = 1.4, T_AIR0 = 25;
  var NU = 8.0;          // 溶融コア → 固化界面の熱伝達（実効ヌセルト数）
  var W_VISC = 0.8;      // 粘度を評価する温度：界面(Tnf) とコア温度の内分比
  var FILL_EPS = 0.004;  // この未充填率以下なら充填済みとみなす
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // E, W, S, N
  var DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  var ADVANCE = 1.5;         // 1 ステップで最速の流動先端が進むセル数（あふれは下流へ受け渡す）

  function erfinv(x) {                // Winitzki の近似＋ニュートン補正
    x = Math.max(-0.999999, Math.min(0.999999, x));
    var a = 0.147, ln = Math.log(1 - x * x);
    var t = 2 / (Math.PI * a) + ln / 2;
    var y = Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t);
    for (var i = 0; i < 2; i++) {
      var err = erf(y) - x;
      y -= err / (2 / Math.sqrt(Math.PI) * Math.exp(-y * y));
    }
    return y;
  }
  function erf(x) {                   // Abramowitz-Stegun 7.1.26
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }

  function FlowSim(grid, mat, cond) {
    var nx = grid.nx, ny = grid.ny, n = nx * ny, dx = grid.dx;
    this.grid = grid; this.mat = mat;
    this.nx = nx; this.ny = ny; this.n = n; this.dx = dx;
    this.Tm = cond.Tm; this.Tw = cond.Tw;
    this.Pmax = cond.Pmax;                       // [Pa]
    this.h = grid.h;

    var V = this.V = new Float64Array(n), Vtot = 0, i;
    for (i = 0; i < n; i++) { V[i] = grid.h[i] * dx * dx; Vtot += V[i]; }
    this.Vtot = Vtot;
    this.Qset = cond.Qset || Vtot / cond.fillTime;   // 設定流量 [m³/s]
    this.tEst = Vtot / this.Qset;
    this.dtMax = this.tEst / 120;
    this.tLimit = this.tEst * 4 + 3;
    this.advance = cond.advance || ADVANCE;
    this.vpAt = cond.vp || 0.98;           // V/P 切替（この充填率で圧力制御＝保圧へ）
    this.vpDone = false; this.vpT = null; this.Ppack = null;

    // 状態量
    this.state = new Uint8Array(n);
    this.F = new Float64Array(n);
    this.T = new Float64Array(n);
    this.dl = new Float64Array(n);        // 片側の固化層厚 [m]
    this.S = new Float64Array(n);
    this.gApp = new Float64Array(n);      // 見かけのせん断速度 [1/s]
    this.p = new Float64Array(n);
    this.p1 = new Float64Array(n);        // ゲート単位圧力の解（ウォームスタート用）
    this.p0 = new Float64Array(n);        // エアトラップ背圧の解
    this.tFill = new Float64Array(n).fill(Infinity);
    this.Tfill = new Float32Array(n);     // 充填した瞬間の先端温度
    this.dirX = new Float32Array(n); this.dirY = new Float32Array(n);
    this.meet = new Uint8Array(n);        // 先端がセル内で正面衝突した
    this.up = new Int32Array(n).fill(-1);  // 流動の木：このセルに樹脂を送り込んだ上流セル
    this.upc = new Int32Array(n).fill(-1); // 先端セルへの最大流入元（候補）
    this.depth = new Int32Array(n);        // ゲートからの木の深さ
    this.isGate = new Uint8Array(n);
    this.vent = new Uint8Array(n);
    this.trapId = new Int32Array(n).fill(-1);
    this.reach = new Int32Array(n);
    this.stamp = 0; this.reachStamp = 0; this.trapStamp = 0; this.dedupeStamp = 0;
    this.Qin = new Float64Array(n);
    this.inX = new Float64Array(n); this.inY = new Float64Array(n);
    this.qvx = new Float64Array(n); this.qvy = new Float64Array(n);
    this.heat = new Float64Array(n);

    // 未知数系
    this.filledOrder = new Int32Array(n); this.nFilled = 0;
    this.front = [];
    this.uidx = new Int32Array(n).fill(-1);
    this.ucell = new Int32Array(n);
    this.diag = new Float64Array(n);
    this.nbU = new Int32Array(n * 4);
    this.gU = new Float64Array(n * 4);
    this.rhs1 = new Float64Array(n); this.rhs0 = new Float64Array(n);
    this.x1 = new Float64Array(n); this.x0 = new Float64Array(n);
    this.w_r = new Float64Array(n); this.w_z = new Float64Array(n);
    this.w_p = new Float64Array(n); this.w_Ap = new Float64Array(n);
    this.piv = new Float64Array(n); this.ipiv = new Float64Array(n);
    this.cnt = new Uint8Array(n); this.nlo = new Uint8Array(n);
    this.MC = 64;                                        // 粗い空間（集約）の最大数
    this.E = new Float64Array(this.MC * this.MC);
    this.azJ = new Int32Array(n * 5); this.azV = new Float64Array(n * 5); this.azN = new Uint8Array(n);
    this.cs = new Float64Array(this.MC); this.ce = new Float64Array(this.MC);
    this.aggOf = new Int32Array(n);
    this.useDefl = false; this.lastIters = 0;
    this.nu = 0;
    this.off = new Int32Array([1, -1, nx, -nx]);
    this.thOrder = new Int32Array(n); this.nTh = 0; this.inTh = new Uint8Array(n);
    this.stk = new Int32Array(n);
    this.Uj = new Float64Array(n);
    this.qc = new Int32Array(n); this.qt = new Float64Array(n); this.qr = new Float64Array(n); this.qv = new Float64Array(n);
    this.ttf = new Float64Array(n);
    this.fillQueue = [];

    // 熱物性・固化モデル
    var theta = (mat.Tnf - this.Tw) / Math.max(1, this.Tm - this.Tw);
    theta = Math.min(0.97, Math.max(0.03, theta));
    var lam = erfinv(theta);
    this.Lstar = mat.cp * (mat.Tnf - this.Tw) / (2 * lam * lam);   // 実効「潜熱」[J/kg]

    // ゲート・ベント
    this.gates = cond.gates.slice();
    for (i = 0; i < this.gates.length; i++) this.isGate[this.gates[i]] = 1;
    if (cond.perimeterVents !== false) for (i = 0; i < n; i++) if (grid.outer[i]) this.vent[i] = 1;
    var vr = Math.max(2, Math.round(2.5e-3 / dx));
    (cond.vents || []).forEach(function (c) {
      var ci = c % nx, cj = (c - ci) / nx;
      for (var dj = -vr; dj <= vr; dj++) for (var di = -vr; di <= vr; di++) {
        var ii = ci + di, jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || di * di + dj * dj > vr * vr) continue;
        if (grid.h[jj * nx + ii] > 0) this.vent[jj * nx + ii] = 1;
      }
    }, this);

    this.traps = [];
    this.trapMinVol = 2.0 * (Vtot / Math.max(1, countCavity(grid.h)));
    this.t = 0; this.P = 0; this.Q = 0; this.limited = false;
    this.steps = 0; this.stall = 0; this.done = false; this.status = 'running';
    this.cgIters = 0;
    this.hist = { t: [], P: [], Q: [], clamp: [], Tfront: [], filled: [] };
    this.snaps = []; this.snapDt = this.tEst / 90; this.lastSnap = -1;
    this.cav = [];
    for (i = 0; i < n; i++) if (grid.h[i] > 0) this.cav.push(i);
    this.cav = Int32Array.from(this.cav);
    this.started = false;
  }

  function countCavity(h) { var k = 0; for (var i = 0; i < h.length; i++) if (h[i] > 0) k++; return k; }

  FlowSim.prototype._start = function () {
    var nx = this.nx;
    for (var k = 0; k < this.gates.length; k++) {
      var c = this.gates[k];
      this.state[c] = FULL; this.F[c] = 1; this.T[c] = this.Tm; this.dl[c] = 0;
      this.tFill[c] = 0; this.Tfill[c] = this.Tm; this.gApp[c] = 1000;
    }
    for (k = 0; k < this.gates.length; k++) this._openNeighbors(this.gates[k]);
    this.started = true;
    this._snapshot(true);
  };

  FlowSim.prototype._openNeighbors = function (c) {
    var h = this.h, off = this.off;
    for (var d = 0; d < 4; d++) {
      var b = c + off[d];
      if (h[b] > 0 && this.state[b] === EMPTY) {
        this.state[b] = FRONT; this.F[b] = 0; this.front.push(b);
        this.T[b] = this.T[c]; this.dl[b] = 0; this.gApp[b] = this.gApp[c];
      }
    }
  };

  /* 流動度 S = h_m³/(12 η_eff) を更新 */
  FlowSim.prototype._updateFluidity = function () {
    var m = this.mat, cav = this.cav, Tnf = m.Tnf;
    for (var k = 0; k < cav.length; k++) {
      var c = cav[k], st = this.state[c];
      if (st === EMPTY || (st === FRONT && this.F[c] <= 0)) { this.S[c] = 0; continue; }
      var hm = this.h[c] - 2 * this.dl[c];
      var T = this.T[c];
      if (hm <= this.h[c] * 0.02 || T <= Tnf + 0.05) { this.S[c] = 0; continue; }
      var Tv = Tnf + W_VISC * (T - Tnf);
      var ga = this.gApp[c] > 1 ? this.gApp[c] : 1;
      var e0 = RH.eta0(m, Tv);
      var x = Math.pow(e0 * ga / m.tau, 1 - m.n);
      var np = 1 - (1 - m.n) * x / (1 + x);           // 局所べき指数
      var fac = (2 * np + 1) / (3 * np);               // Rabinowitsch 補正（壁面せん断速度＝見かけ×fac）
      var eta = e0 / (1 + x * Math.pow(fac, 1 - m.n)) * fac;
      this.S[c] = hm * hm * hm / (12 * eta);
    }
  };

  /* ゲートから、流動可能な充填済みセルを通ってつながる領域を求める */
  FlowSim.prototype._reachability = function () {
    var st = ++this.stamp, off = this.off, stk = this.stk, sp = 0;
    var state = this.state, reach = this.reach, S = this.S;
    for (var k = 0; k < this.gates.length; k++) { reach[this.gates[k]] = st; stk[sp++] = this.gates[k]; }
    while (sp > 0) {
      var c = stk[--sp];
      for (var d = 0; d < 4; d++) {
        var b = c + off[d];
        if (state[b] === FULL && reach[b] !== st && S[b] > 0) { reach[b] = st; stk[sp++] = b; }
      }
    }
    this.reachStamp = st;
  };

  FlowSim.prototype._frontP = function (b) {
    var id = this.trapId[b];
    return id >= 0 ? this.traps[id].p : 0;
  };
  /* セル a（充填済み／ゲート）から先端セル b への流れのコンダクタンス */
  FlowSim.prototype._gFront = function (a, b) {
    var Sa = this.S[a];
    var Sb = this.F[b] > 0 ? this.S[b] : Sa;
    if (Sa <= 0 || Sb <= 0) return 0;
    return 2 * Sa * Sb / (Sa + Sb);
  };

  /* 未知数の番号付けと係数行列の組み立て */
  FlowSim.prototype._assemble = function () {
    var st = this.reachStamp, off = this.off, nu = 0, uidx = this.uidx, ucell = this.ucell;
    var fo = this.filledOrder, nf = this.nFilled, k, c;
    for (k = 0; k < nf; k++) { uidx[fo[k]] = -1; }
    for (k = 0; k < nf; k++) {
      c = fo[k];
      if (this.reach[c] === st) { uidx[c] = nu; ucell[nu++] = c; }
    }
    this.nu = nu;
    var S = this.S, state = this.state, isGate = this.isGate, reach = this.reach;
    var nbU = this.nbU, gU = this.gU, cnt = this.cnt, nlo = this.nlo;
    this.hasTrapFront = false;
    for (var i = 0; i < nu; i++) {
      c = ucell[i];
      var Sc = S[c], dg = 0, r1 = 0, r0 = 0, base = i * 4, nl = 0, nh = 0;
      var hiI0 = -1, hiI1 = -1, hiI2 = -1, hiI3 = -1, hiG0 = 0, hiG1 = 0, hiG2 = 0, hiG3 = 0;
      for (var d = 0; d < 4; d++) {
        var b = c + off[d], sb = state[b], G;
        if (sb === FULL) {
          if (isGate[b]) {
            var Sg = S[b]; G = (Sc > 0 && Sg > 0) ? 2 * Sc * Sg / (Sc + Sg) : 0;
            dg += G; r1 += G;
          } else if (uidx[b] >= 0 && reach[b] === st) {
            var Sn = S[b]; G = (Sc > 0 && Sn > 0) ? 2 * Sc * Sn / (Sc + Sn) : 0;
            if (G > 0) {
              dg += G;
              var j = uidx[b];
              if (j < i) { nbU[base + nl] = j; gU[base + nl] = G; nl++; }
              else {
                if (nh === 0) { hiI0 = j; hiG0 = G; } else if (nh === 1) { hiI1 = j; hiG1 = G; }
                else if (nh === 2) { hiI2 = j; hiG2 = G; } else { hiI3 = j; hiG3 = G; }
                nh++;
              }
            }
          }
        } else if (sb === FRONT) {
          G = this._gFront(c, b);
          dg += G;
          var pf = this._frontP(b);
          if (pf !== 0) { r0 += G * pf; this.hasTrapFront = true; }
        }
      }
      // 下三角（先に充填された隣接）を前に、上三角を後ろに詰めて格納
      var q = base + nl;
      if (nh > 0) { nbU[q] = hiI0; gU[q] = hiG0; q++; }
      if (nh > 1) { nbU[q] = hiI1; gU[q] = hiG1; q++; }
      if (nh > 2) { nbU[q] = hiI2; gU[q] = hiG2; q++; }
      if (nh > 3) { nbU[q] = hiI3; gU[q] = hiG3; q++; }
      nlo[i] = nl; cnt[i] = nl + nh;
      this.diag[i] = dg > 0 ? dg : 1e-300; this.rhs1[i] = r1; this.rhs0[i] = r0;
    }
    // 修正不完全コレスキー MIC(0) のピボット（充填順＝下三角は先に充填された隣接セル）
    // 切り捨てたフィルインを対角へ戻すことで、長い流路でも反復回数が増えにくい
    var piv = this.piv, ipiv = this.ipiv, Uj = this.Uj, OM = 0.97, g, e;
    for (i = 0; i < nu; i++) {
      var u = 0; base = i * 4; e = base + cnt[i];
      for (q = base + nlo[i]; q < e; q++) u += gU[q];
      Uj[i] = u;
    }
    for (i = 0; i < nu; i++) {
      var dd = this.diag[i]; base = i * 4; e = base + nlo[i];
      for (q = base; q < e; q++) { j = nbU[q]; g = gU[q]; dd -= g / piv[j] * ((1 - OM) * g + OM * Uj[j]); }
      var lo = this.diag[i] * 0.05;
      piv[i] = dd > lo ? dd : lo;
      ipiv[i] = 1 / piv[i];
    }
  };

  FlowSim.prototype._matvec = function (x, y) {
    var nu = this.nu, nbU = this.nbU, gU = this.gU, diag = this.diag, cnt = this.cnt;
    for (var i = 0; i < nu; i++) {
      var s = diag[i] * x[i], base = i * 4, e = base + cnt[i];
      for (var q = base; q < e; q++) s -= gU[q] * x[nbU[q]];
      y[i] = s;
    }
  };

  FlowSim.prototype._precond = function (r, z) {
    var nu = this.nu, nbU = this.nbU, gU = this.gU, ipiv = this.ipiv, cnt = this.cnt, nlo = this.nlo, i, q, base, e;
    for (i = 0; i < nu; i++) {
      var s = r[i]; base = i * 4; e = base + nlo[i];
      for (q = base; q < e; q++) s += gU[q] * z[nbU[q]];
      z[i] = s * ipiv[i];
    }
    for (i = nu - 1; i >= 0; i--) {
      var t = 0; base = i * 4; e = base + cnt[i];
      for (q = base + nlo[i]; q < e; q++) t += gU[q] * z[nbU[q]];
      z[i] += t * ipiv[i];
    }
  };

  /* ---- デフレーション（2 レベル前処理）----
   * 未知数を充填順に B 個ずつ束ねた「集約」を粗い空間 Z とし、E = ZᵀAZ を密行列で直接解く。
   * 充填順の束は流れに沿った帯になるため、圧力の「流れ方向のゆるやかな変化」を粗い空間が一気に解き、
   * 局所的な誤差は MIC(0) が消す。長い流路（スパイラル）で反復回数が大きく減る。
   */
  FlowSim.prototype._setupDeflation = function () {
    var nu = this.nu, B = Math.max(10, Math.ceil(nu / this.MC)), m = Math.ceil(nu / B), i, q, k;
    this.B = B; this.m = m;
    var E = this.E, azJ = this.azJ, azV = this.azV, azN = this.azN, nbU = this.nbU, gU = this.gU, cnt = this.cnt, aggOf = this.aggOf;
    for (i = 0; i < nu; i++) aggOf[i] = (i / B) | 0;
    for (k = 0; k < m * m; k++) E[k] = 0;
    for (i = 0; i < nu; i++) {
      var I = aggOf[i], base = i * 5, nn = 1;
      azJ[base] = I; azV[base] = this.diag[i];
      var b4 = i * 4, e = b4 + cnt[i];
      for (q = b4; q < e; q++) {
        var J = aggOf[nbU[q]], g = gU[q], found = false;
        for (k = 0; k < nn; k++) if (azJ[base + k] === J) { azV[base + k] -= g; found = true; break; }
        if (!found) { azJ[base + nn] = J; azV[base + nn] = -g; nn++; }
      }
      azN[i] = nn;
      for (k = 0; k < nn; k++) E[I * m + azJ[base + k]] += azV[base + k];
    }
    // 密行列のコレスキー分解（下三角を E に上書き）
    for (var jj = 0; jj < m; jj++) {
      var d = E[jj * m + jj];
      for (k = 0; k < jj; k++) d -= E[jj * m + k] * E[jj * m + k];
      d = d > 1e-300 ? Math.sqrt(d) : 1e-150;
      E[jj * m + jj] = d;
      for (var ii = jj + 1; ii < m; ii++) {
        var sv = E[ii * m + jj];
        for (k = 0; k < jj; k++) sv -= E[ii * m + k] * E[jj * m + k];
        E[ii * m + jj] = sv / d;
      }
    }
  };
  FlowSim.prototype._coarseSolve = function (v) {      // v ← E⁻¹ v（v は長さ m）
    var m = this.m, E = this.E, i, k, s;
    for (i = 0; i < m; i++) { s = v[i]; for (k = 0; k < i; k++) s -= E[i * m + k] * v[k]; v[i] = s / E[i * m + i]; }
    for (i = m - 1; i >= 0; i--) { s = v[i]; for (k = i + 1; k < m; k++) s -= E[k * m + i] * v[k]; v[i] = s / E[i * m + i]; }
  };
  FlowSim.prototype._applyP = function (w) {           // w ← (I − A Z E⁻¹ Zᵀ) w
    var nu = this.nu, m = this.m, cs = this.cs, aggOf = this.aggOf, i, k;
    for (k = 0; k < m; k++) cs[k] = 0;
    for (i = 0; i < nu; i++) cs[aggOf[i]] += w[i];
    this._coarseSolve(cs);
    var azJ = this.azJ, azV = this.azV, azN = this.azN;
    for (i = 0; i < nu; i++) {
      var base = i * 5, s = 0;
      for (k = 0; k < azN[i]; k++) s += azV[base + k] * cs[azJ[base + k]];
      w[i] -= s;
    }
  };

  /* デフレーション付き MIC(0) 前処理共役勾配法（DPCG）
   * P A x̃ = P b を解き、x = Q b + Pᵀ x̃ で元の解に戻す（Q = Z E⁻¹ Zᵀ, P = I − A Q）。 */
  FlowSim.prototype._pcg = function (b, x, tol, maxIt) {
    var nu = this.nu, r = this.w_r, z = this.w_z, p = this.w_p, Ap = this.w_Ap, i, k;
    if (nu === 0) return 0;
    var bn = 0; for (i = 0; i < nu; i++) bn += b[i] * b[i];
    bn = Math.sqrt(bn);
    if (bn === 0) { for (i = 0; i < nu; i++) x[i] = 0; return 0; }
    var defl = this.defl;
    // r = P (b − A x̃)
    this._matvec(x, Ap);
    for (i = 0; i < nu; i++) r[i] = b[i] - Ap[i];
    if (defl) this._applyP(r);
    var rn = 0; for (i = 0; i < nu; i++) rn += r[i] * r[i];
    var it = 0;
    if (Math.sqrt(rn) > tol * bn) {
      this._precond(r, z);
      var rz = 0; for (i = 0; i < nu; i++) { p[i] = z[i]; rz += r[i] * z[i]; }
      for (it = 1; it <= maxIt; it++) {
        this._matvec(p, Ap);
        if (defl) this._applyP(Ap);
        var pAp = 0; for (i = 0; i < nu; i++) pAp += p[i] * Ap[i];
        if (!(pAp > 0)) break;
        var al = rz / pAp; rn = 0;
        for (i = 0; i < nu; i++) { x[i] += al * p[i]; r[i] -= al * Ap[i]; rn += r[i] * r[i]; }
        if (Math.sqrt(rn) <= tol * bn) break;
        this._precond(r, z);
        var rz2 = 0; for (i = 0; i < nu; i++) rz2 += r[i] * z[i];
        var be = rz2 / rz; rz = rz2;
        for (i = 0; i < nu; i++) p[i] = z[i] + be * p[i];
      }
    }
    if (defl) {
      // x = Q b + Pᵀ x̃ = x̃ + Z E⁻¹ Zᵀ (b − A x̃)
      var cs = this.cs, m = this.m, aggOf = this.aggOf;
      this._matvec(x, Ap);
      for (k = 0; k < m; k++) cs[k] = 0;
      for (i = 0; i < nu; i++) cs[aggOf[i]] += b[i] - Ap[i];
      this._coarseSolve(cs);
      for (i = 0; i < nu; i++) x[i] += cs[aggOf[i]];
    }
    return it;
  };

  FlowSim.prototype._solve = function () {
    var nu = this.nu, ucell = this.ucell, i;
    // 前ステップの反復が多かった（細長い流路など）ときだけ 2 レベル前処理を使う
    this.defl = nu > 80 && this.lastIters > 28;
    if (this.defl) this._setupDeflation();
    // 空気背圧の解はトラップ圧に比例するので、前回の解を圧力比でスケールして初期値にする
    var pt = 0; for (i = 0; i < this.traps.length; i++) pt = Math.max(pt, this.traps[i].p);
    var solve0 = this.hasTrapFront && pt > 50;
    var scale0 = (solve0 && this.lastTrapP > 0 && this.traps.length === 1) ? pt / this.lastTrapP : 1;
    for (i = 0; i < nu; i++) { this.x1[i] = this.p1[ucell[i]]; this.x0[i] = solve0 ? this.p0[ucell[i]] * scale0 : 0; }
    var it = this._pcg(this.rhs1, this.x1, 1e-6, 1500);
    this.cgIters += it;
    this.lastIters = this.defl ? Math.max(29, it) : it;
    if (this.defl && it < 10) this.lastIters = 0;        // 十分速く収束するなら次は単独 MIC で試す
    if (solve0) this.cgIters += this._pcg(this.rhs0, this.x0, 1e-5, 1500);
    this.lastTrapP = solve0 ? pt : 0;
    for (i = 0; i < nu; i++) { this.p1[ucell[i]] = this.x1[i]; this.p0[ucell[i]] = this.x0[i]; }
  };

  /* ゲート圧を決め、圧力場と先端への流入量を求める */
  FlowSim.prototype._pressure = function () {
    var off = this.off, gates = this.gates, state = this.state, uidx = this.uidx, S = this.S;
    var st = this.reachStamp, reach = this.reach, x1 = this.x1, x0 = this.x0;
    var Q1 = 0, Q0 = 0, k, d, c, b, G;
    for (k = 0; k < gates.length; k++) {
      c = gates[k];
      for (d = 0; d < 4; d++) {
        b = c + off[d];
        if (state[b] === FULL) {
          if (!this.isGate[b] && uidx[b] >= 0 && reach[b] === st) {
            G = (S[c] > 0 && S[b] > 0) ? 2 * S[c] * S[b] / (S[c] + S[b]) : 0;
            Q1 += G * (1 - x1[uidx[b]]);
            Q0 -= G * x0[uidx[b]];
          }
        } else if (state[b] === FRONT) {
          G = this._gFront(c, b);
          Q1 += G; Q0 -= G * this._frontP(b);
        }
      }
    }
    var P = Q1 > 0 ? (this.Qset - Q0) / Q1 : this.Pmax;
    this.limited = false;
    if (this.vpDone) P = this.Ppack;                      // 保圧：切替時の圧力で押し切る
    if (!(P <= this.Pmax)) { P = this.Pmax; this.limited = true; }
    if (P < 0) P = 0;
    this.P = P;
    this.Q = Math.max(0, P * Q1 + Q0);

    var p = this.p;
    for (k = 0; k < gates.length; k++) p[gates[k]] = P;
    for (var i = 0; i < this.nu; i++) p[this.ucell[i]] = P * x1[i] + x0[i];
    for (k = 0; k < this.nFilled; k++) { c = this.filledOrder[k]; if (reach[c] !== st) p[c] = 0; }
    var fr = this.front;
    for (k = 0; k < fr.length; k++) p[fr[k]] = this._frontP(fr[k]);

    // 先端セルへの流入量と流入方向
    for (k = 0; k < fr.length; k++) {
      b = fr[k];
      var q = 0, vx = 0, vy = 0, fmax = 0, amax = -1;
      for (d = 0; d < 4; d++) {
        var a = b + off[d];
        if (state[a] !== FULL || reach[a] !== st) continue;
        G = this._gFront(a, b);
        var f = G * (p[a] - p[b]);
        if (f > 0) { q += f; vx -= f * DX[d]; vy -= f * DY[d]; if (f > fmax) { fmax = f; amax = a; } }
      }
      this.Qin[b] = q; this.inX[b] = vx; this.inY[b] = vy;
      if (amax >= 0) this.upc[b] = amax;
    }
  };

  /* 現在の圧力場から見かけのせん断速度を評価（粘度の再計算用） */
  FlowSim.prototype._shearRates = function () {
    var off = this.off, state = this.state, p = this.p, S = this.S, st = this.reachStamp, reach = this.reach;
    var cav = this.cav;
    for (var k = 0; k < cav.length; k++) {
      var c = cav[k], sc = state[c];
      if (sc === EMPTY || this.isGate[c]) continue;
      if (sc === FULL && reach[c] !== st) continue;
      if (sc === FRONT && !(this.F[c] > 0)) continue;
      var vx = 0, vy = 0;
      for (var d = 0; d < 4; d++) {
        var a = c + off[d], sa = state[a], G;
        if (sa === EMPTY) continue;
        if (sc === FRONT) { if (sa !== FULL || reach[a] !== st) continue; G = this._gFront(a, c); }
        else if (sa === FRONT) G = this._gFront(c, a);
        else { if (reach[a] !== st) continue; G = (S[c] > 0 && S[a] > 0) ? 2 * S[c] * S[a] / (S[c] + S[a]) : 0; }
        var f = G * (p[a] - p[c]);
        vx -= f * DX[d]; vy -= f * DY[d];
      }
      var hm = this.h[c] - 2 * this.dl[c];
      if (hm > 1e-6) {
        var q = 0.5 * Math.sqrt(vx * vx + vy * vy) / this.dx;
        this.gApp[c] = 6 * q / (hm * hm);
      }
    }
  };

  FlowSim.prototype._markFull = function (c, tf) {
    if (this.up[c] < 0) this.up[c] = this.upc[c];
    this.depth[c] = this.up[c] >= 0 ? this.depth[this.up[c]] + 1 : 0;
    this.state[c] = FULL; this.F[c] = 1;
    this.tFill[c] = tf; this.Tfill[c] = this.T[c];
    this.filledOrder[this.nFilled++] = c;
    this._openNeighbors(c);
  };

  /* 時間を進める：温度・固化層の更新と、充填率の前進（あふれは下流へ受け渡して質量保存） */
  FlowSim.prototype._advance = function () {
    var fr = this.front, V = this.V, nf = fr.length, k, b, d;
    // 時間刻み：最速の先端が約 ADVANCE セル分進む時間（ほぼ満杯のセルに引きずられないよう、
    // 残り体積ではなく「1 セルを満たす時間」で評価する）
    var tauMin = Infinity, m = 0;
    for (k = 0; k < nf; k++) {
      b = fr[k];
      if (this.Qin[b] > 0) { m++; var tau = V[b] / this.Qin[b]; if (tau < tauMin) tauMin = tau; }
    }
    var dtMax = Math.max(this.dtMax, 0.015 * this.t);
    var dt = dtMax;
    if (m > 0) dt = Math.min(dtMax, this.advance * tauMin);
    if (this.traps.length) {
      var qTrap = new Float64Array(this.traps.length);
      for (k = 0; k < nf; k++) { b = fr[k]; if (this.trapId[b] >= 0 && this.Qin[b] > 0) qTrap[this.trapId[b]] += this.Qin[b]; }
      for (k = 0; k < this.traps.length; k++) if (qTrap[k] > 0) dt = Math.min(dt, 0.2 * this.traps[k].V / qTrap[k]);
    }
    if (dt < 1e-7) dt = 1e-7;
    this.dt = dt;
    this.anyFlow = m > 0;

    this._thermal(dt);

    // 1) 先端セル自身の流入で前進
    var t = this.t, qc = this.qc, qt = this.qt, qr = this.qr, qv = this.qv, qn = 0;
    var inq = this.inq || (this.inq = new Uint8Array(this.n));
    for (k = 0; k < nf; k++) {
      b = fr[k];
      var Qb = this.Qin[b];
      if (Qb <= 0) continue;
      var need = (1 - this.F[b]) * V[b], got = Qb * dt;
      if (got >= need - FILL_EPS * V[b]) {
        qc[qn] = b; qt[qn] = t + Math.min(dt, need / Qb); qr[qn] = Qb; qv[qn] = Math.max(0, got - need); qn++;
        inq[b] = 1; this.F[b] = 1;
        var mag = Math.sqrt(this.inX[b] * this.inX[b] + this.inY[b] * this.inY[b]);
        if (mag > 0.35 * Qb) { this.dirX[b] = this.inX[b] / mag; this.dirY[b] = this.inY[b] / mag; }
        else { this.meet[b] = 1; this.dirX[b] = 0; this.dirY[b] = 0; }
      } else {
        this.F[b] += got / V[b];
      }
    }
    // 2) あふれた体積を下流へ（厚いほど・流れの向きに沿うほど多く配分）
    var off = this.off, state = this.state, h = this.h, qh = 0;
    var w = [0, 0, 0, 0];
    while (qh < qn) {
      var c = qc[qh], tf = qt[qh], rate = qr[qh], vo = qv[qh]; qh++;
      inq[c] = 0;
      this._markFull(c, tf);
      if (vo <= V[c] * 1e-6) continue;
      var dxc = this.dirX[c], dyc = this.dirY[c], wsum = 0;
      for (d = 0; d < 4; d++) {
        var nb = c + off[d]; w[d] = 0;
        if (!(h[nb] > 0) || state[nb] === FULL || inq[nb] || this.trapId[nb] >= 0) continue;
        var dot = this.meet[c] ? 1 : dxc * DX[d] + dyc * DY[d];
        if (dot > 0.05) { var hh = h[nb] * 1e3; w[d] = dot * hh * hh * hh; wsum += w[d]; }
      }
      if (wsum <= 0) {
        for (d = 0; d < 4; d++) {
          nb = c + off[d];
          if (h[nb] > 0 && state[nb] !== FULL && !inq[nb] && this.trapId[nb] < 0) { hh = h[nb] * 1e3; w[d] = hh * hh * hh; wsum += w[d]; }
        }
      }
      if (wsum <= 0) continue;
      for (d = 0; d < 4; d++) {
        if (w[d] <= 0) continue;
        nb = c + off[d];
        var add = vo * w[d] / wsum, r = rate * w[d] / wsum;
        var Vold = this.F[nb] * V[nb];
        this.T[nb] = (Vold * this.T[nb] + add * this.T[c]) / (Vold + add);
        need = (1 - this.F[nb]) * V[nb];
        if (add >= need - FILL_EPS * V[nb]) {
          this.F[nb] = 1; inq[nb] = 1; this.up[nb] = c;
          this.dirX[nb] = DX[d]; this.dirY[nb] = DY[d];
          qc[qn] = nb; qt[qn] = tf + (r > 0 ? need / r : 0); qr[qn] = r; qv[qn] = Math.max(0, add - need); qn++;
        } else {
          this.F[nb] += add / V[nb];
        }
      }
    }
    // 先端リストを更新
    var keep = [];
    for (k = 0; k < this.front.length; k++) {
      b = this.front[k];
      if (state[b] === FRONT) keep.push(b);
    }
    this.front = dedupe(keep, this.dedupeMark || (this.dedupeMark = new Int32Array(this.n)), ++this.dedupeStamp);
    this.t = t + dt;
    this.steps++;
  };

  function dedupe(list, mark, st) {
    var out = [];
    for (var i = 0; i < list.length; i++) if (mark[list[i]] !== st) { mark[list[i]] = st; out.push(list[i]); }
    return out;
  }

  /* 熱の計算（風上順の陰的移流＋せん断発熱＋固化界面への熱損失＋固化層の成長） */
  FlowSim.prototype._thermal = function (dt) {
    var m = this.mat, off = this.off, state = this.state, p = this.p, S = this.S, st = this.reachStamp, reach = this.reach;
    var Tnf = m.Tnf, rhoCp = m.rho * m.cp, alpha = m.alpha, kth = m.k;
    var ord = this.thOrder, inTh = this.inTh, k, c, i, j;
    // 溶融樹脂を持つセルを順序リストに追加
    var fo = this.filledOrder;
    for (k = 0; k < this.nFilled; k++) { c = fo[k]; if (!inTh[c]) { inTh[c] = 1; ord[this.nTh++] = c; } }
    var fr = this.front;
    for (k = 0; k < fr.length; k++) { c = fr[k]; if (!inTh[c] && (this.F[c] > 0 || this.Qin[c] > 0)) { inTh[c] = 1; ord[this.nTh++] = c; } }
    var nTh = this.nTh;
    // 圧力の高い順（＝上流から）に挿入ソート。前ステップの順序をほぼ保つので安価
    for (i = 1; i < nTh; i++) {
      c = ord[i]; var pc = p[c]; j = i - 1;
      while (j >= 0 && p[ord[j]] < pc) { ord[j + 1] = ord[j]; j--; }
      ord[j + 1] = c;
    }
    var qvx = this.qvx, qvy = this.qvy;
    for (k = 0; k < nTh; k++) {
      c = ord[k];
      var sc = state[c];
      var connected = sc === FRONT || reach[c] === st;
      var inV = 0, inH = 0, diss = 0, vx = 0, vy = 0;
      if (connected) {
        for (var d = 0; d < 4; d++) {
          var a = c + off[d], sa = state[a];
          if (sa === EMPTY) continue;
          var G;
          if (sc === FRONT) {
            if (sa !== FULL || reach[a] !== st) continue;
            G = this._gFront(a, c);
          } else if (sa === FRONT) {
            G = this._gFront(c, a);
          } else {
            if (reach[a] !== st) continue;
            G = (S[c] > 0 && S[a] > 0) ? 2 * S[c] * S[a] / (S[c] + S[a]) : 0;
          }
          if (G <= 0) continue;
          var dp = p[a] - p[c], f = G * dp;          // f>0：a から c へ流入
          vx -= f * DX[d]; vy -= f * DY[d];
          diss += 0.5 * (f * dp > 0 ? f * dp : -f * dp);
          if (f > 0) { inV += f * dt; inH += f * dt * this.T[a]; }
        }
      }
      var Vm = this.F[c] * this.V[c];
      if (Vm + inV > 0) this.T[c] = (Vm * this.T[c] + inH + diss * dt / rhoCp) / (Vm + inV);
      qvx[c] = vx * 0.5; qvy[c] = vy * 0.5;

      var hc0 = this.h[c];
      var hmid = hc0 - 2 * this.dl[c];
      if (hmid < hc0 * 0.02) hmid = hc0 * 0.02;
      // 固化界面への熱損失（コア温度は Tnf に向かって指数的に下がる）
      if (this.T[c] > Tnf) this.T[c] = Tnf + (this.T[c] - Tnf) * Math.exp(-dt * NU * alpha / (hmid * hmid));
      // 固化層の成長（陰解法：ρL*(δ−δ0)/dt = k(Tnf−Tw)/δ − hc(T−Tnf)）
      var hcv = NU * kth / (2 * hmid);
      var qin = this.T[c] > Tnf ? hcv * (this.T[c] - Tnf) : 0;
      var A = m.rho * this.Lstar, B = A * this.dl[c] - qin * dt, C = kth * (Tnf - this.Tw) * dt;
      var dl = (B + Math.sqrt(B * B + 4 * A * C)) / (2 * A);
      if (dl > hc0 / 2) dl = hc0 / 2;
      this.dl[c] = dl;
      // 見かけのせん断速度（次ステップの粘度評価に使う）
      var hm2 = hc0 - 2 * dl;
      if (hm2 > 1e-6 && connected) {
        var q = Math.sqrt(qvx[c] * qvx[c] + qvy[c] * qvy[c]) / this.dx;
        var g = 6 * q / (hm2 * hm2);
        this.gApp[c] = this.gApp[c] > 0 ? 0.5 * this.gApp[c] + 0.5 * g : g;
      }
    }
  };

  /* エアトラップ判定：外周（PL）やベントにつながらない未充填領域
   * 閉じ込められた瞬間の空気量 V0 を保持し、以後は現在の体積 V との比で断熱圧縮させる。
   * 1 つのトラップが複数に分かれた場合は、V0 を各部分の現在体積の比で配分する。
   */
  FlowSim.prototype._traps = function () {
    var nx = this.nx, cav = this.cav, state = this.state, off = this.off, h = this.h;
    var mark = this.trapMark || (this.trapMark = new Int32Array(this.n));
    var st = ++this.trapStamp;
    var buf = this.stk, nb = 0, comps = [], oldTraps = this.traps, q, k;
    for (k = 0; k < cav.length; k++) {
      var c0 = cav[k];
      if (state[c0] === FULL || mark[c0] === st) continue;
      var start = nb, head = nb, vented = false, vol = 0, parent = -1;
      mark[c0] = st; buf[nb++] = c0;
      while (head < nb) {
        var c = buf[head++];
        if (this.vent[c]) vented = true;
        vol += (1 - this.F[c]) * this.V[c];
        if (parent < 0 && this.trapId[c] >= 0) parent = this.trapId[c];
        for (var d = 0; d < 4; d++) {
          var b = c + off[d];
          if (h[b] > 0 && state[b] !== FULL && mark[b] !== st) { mark[b] = st; buf[nb++] = b; }
        }
      }
      comps.push({ start: start, end: nb, vented: vented, vol: vol, parent: parent });
    }
    // 親トラップごとの子の体積合計
    var sumByParent = {};
    comps.forEach(function (cp) { if (!cp.vented && cp.parent >= 0) sumByParent[cp.parent] = (sumByParent[cp.parent] || 0) + cp.vol; });
    var newTraps = [];
    for (k = 0; k < comps.length; k++) {
      var cp = comps[k], id = -1;
      if (!cp.vented) {
        var V0 = cp.vol, born = this.t, par = cp.parent >= 0 ? oldTraps[cp.parent] : null;
        if (par) { V0 = par.V0 * cp.vol / Math.max(sumByParent[cp.parent], 1e-30); born = par.born; }
        if (V0 >= this.trapMinVol) {
          id = newTraps.length;
          var Vc = Math.max(cp.vol, V0 * 1e-4), cr = V0 / Vc;
          var sx = 0, sy = 0, sw = 0;
          for (q = cp.start; q < cp.end; q++) {
            var wgt = 1 - this.F[buf[q]] + 1e-6, ci = buf[q] % nx;
            sx += wgt * ci; sy += wgt * ((buf[q] - ci) / nx); sw += wgt;
          }
          newTraps.push({
            V0: V0, V: Vc, p: P_ATM * (Math.pow(cr, GAMMA) - 1),
            Tair: (T_AIR0 + 273.15) * Math.pow(cr, GAMMA - 1) - 273.15,
            cx: sx / sw, cy: sy / sw, cells: cp.end - cp.start, born: born
          });
        }
      }
      for (q = cp.start; q < cp.end; q++) this.trapId[buf[q]] = id;
    }
    this.traps = newTraps;
    if (!this.trapLog) this.trapLog = [];
    for (k = 0; k < newTraps.length; k++) {
      var tr = newTraps[k], found = null;
      for (var j = 0; j < this.trapLog.length; j++) {
        var L = this.trapLog[j];
        if (L.born === tr.born && Math.abs(L.cx - tr.cx) + Math.abs(L.cy - tr.cy) < 12) { found = L; break; }
      }
      if (found) { found.cx = tr.cx; found.cy = tr.cy; found.Tair = Math.max(found.Tair, tr.Tair); found.p = Math.max(found.p, tr.p); found.V = tr.V; found.V0 = tr.V0; }
      else this.trapLog.push({ born: tr.born, cx: tr.cx, cy: tr.cy, Tair: tr.Tair, p: tr.p, V: tr.V, V0: tr.V0 });
    }
  };

  FlowSim.prototype._record = function () {
    var clamp = 0, A = this.dx * this.dx, k, Tmin = Infinity;
    for (k = 0; k < this.gates.length; k++) clamp += this.P * A;
    for (k = 0; k < this.nu; k++) clamp += Math.max(0, this.p[this.ucell[k]]) * A;
    for (k = 0; k < this.front.length; k++) { var b = this.front[k]; if (this.F[b] > 0 && this.T[b] < Tmin) Tmin = this.T[b]; }
    var H = this.hist;
    H.t.push(this.t); H.P.push(this.P); H.Q.push(this.Q); H.clamp.push(clamp);
    H.Tfront.push(isFinite(Tmin) ? Tmin : this.Tm);
    var fr = this.filledVolume() / this.Vtot;
    H.filled.push(fr);
    if (!this.vpDone && fr >= this.vpAt) { this.vpDone = true; this.vpT = this.t; this.Ppack = this.P; }
    this._snapshot(false);
  };

  FlowSim.prototype.filledVolume = function () {
    var v = 0, cav = this.cav;
    for (var k = 0; k < cav.length; k++) v += this.F[cav[k]] * this.V[cav[k]];
    return v;
  };

  FlowSim.prototype._snapshot = function (force) {
    if (!force && this.t - this.lastSnap < this.snapDt) return;
    var cav = this.cav, nc = cav.length;
    var s = { t: this.t, F: new Uint8Array(nc), p: new Float32Array(nc), T: new Float32Array(nc), fz: new Uint8Array(nc) };
    for (var k = 0; k < nc; k++) {
      var c = cav[k];
      s.F[k] = Math.round(Math.min(1, this.F[c]) * 255);
      s.p[k] = this.p[c];
      s.T[k] = this.T[c];
      s.fz[k] = Math.round(Math.min(1, 2 * this.dl[c] / this.h[c]) * 255);
    }
    this.snaps.push(s);
    this.lastSnap = this.t;
    if (this.snaps.length > 180) {                 // 間引いて保存間隔を倍に
      var kept = [];
      for (k = 0; k < this.snaps.length; k++) if (k % 2 === 0 || k === this.snaps.length - 1) kept.push(this.snaps[k]);
      this.snaps = kept; this.snapDt *= 2;
    }
  };

  FlowSim.prototype._checkEnd = function () {
    var remaining = 0, cav = this.cav;
    for (var k = 0; k < cav.length; k++) {
      var c = cav[k];
      if (this.state[c] !== FULL && this.trapId[c] < 0) { remaining++; break; }
    }
    var flowing = this.anyFlow && this.Q > this.Qset * 2e-3;
    if (!remaining) {
      // ベントに通じる部分はすべて充填完了
      if (this.fillEndT == null) { this.fillEndT = this.t; this.fillEndStep = this.hist.t.length; }
      if (!this.traps.length) { this._finish('full'); return; }
      // 閉じ込めた空気を圧縮しながら充填を続ける（空気の背圧とつり合えば終了）
      this.stall = this.Q > this.Qset * 0.02 ? 0 : this.stall + 1;
      if (this.stall > 6 || this.t > this.fillEndT + 0.3 * this.tEst + 0.05) this._finish('full');
      return;
    }
    this.stall = flowing ? 0 : this.stall + 1;
    if (this.stall > 14 || this.t > this.tLimit) this._finish('short');
  };

  FlowSim.prototype._finish = function (status) {
    this.done = true; this.status = status;
    this._snapshot(true);
    this.result = this.summarize();
  };

  /* 1 ステップ */
  FlowSim.prototype.step = function () {
    if (this.done) return;
    if (!this.started) this._start();
    var Pprev = this.P;
    this._updateFluidity();
    this._reachability();
    this._assemble();
    this._solve();
    this._pressure();
    // 流れが急変した（ゲート圧が大きく動いた）ステップは、粘度をその場で再評価して解き直す
    for (var it = 0; it < 3 && Pprev > 0 && Math.abs(this.P - Pprev) > 0.05 * Pprev; it++) {
      var Pit = this.P;
      this._shearRates();
      this._updateFluidity();
      this._assemble();
      this._solve();
      this._pressure();
      if (Math.abs(this.P - Pit) < 0.01 * Pit) break;
    }
    this._advance();
    if (this.traps.length || this.steps % 2 === 0 || this.front.length < 6) this._traps();
    this._record();
    this._checkEnd();
  };

  /* 指定時間（ミリ秒）だけ計算を進める。完了したら true */
  FlowSim.prototype.run = function (budgetMs) {
    var t0 = now();
    while (!this.done && now() - t0 < budgetMs) this.step();
    return this.done;
  };
  function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }

  /* ---------------- 結果の解釈 ---------------- */
  /* ウェルドライン検出
   * (1) 流動の木：各セルに樹脂を送り込んだ上流セルをたどると、ゲートまでの経路になる。
   *     隣り合う 2 セルの経路が「かなり上流まで遡らないと合流しない」なら、障害物の両側などを
   *     別々に回ってきた流動先端どうしが出会った場所である。
   * (2) 流動先端の向き u = ∇t/|∇t|（3×3 平滑化した充填時刻の勾配）が互いに相手を向いていること。
   * 合流角（u のなす角）135° 以上をウェルドライン、それ未満をメルドラインと呼び分ける。
   */
  FlowSim.prototype.computeWelds = function (tUpTo) {
    var nx = this.nx, n = this.n, tF = this.tFill, lim = tUpTo == null ? Infinity : tUpTo, self = this;
    var valid = new Uint8Array(n), ts = new Float64Array(n), ux = new Float32Array(n), uy = new Float32Array(n);
    var cav = this.cav, k, c, up = this.up, depth = this.depth;
    for (k = 0; k < cav.length; k++) {
      c = cav[k];
      if (this.state[c] === FULL && !this.isGate[c] && tF[c] <= lim) valid[c] = 1;
    }
    var W = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (k = 0; k < cav.length; k++) {
      c = cav[k]; if (!valid[c]) continue;
      var sum = 0, sw = 0, q = 0;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++, q++) {
        var b = c + dj * nx + di;
        if (valid[b]) { sum += W[q] * tF[b]; sw += W[q]; }
      }
      ts[c] = sum / sw;
    }
    for (k = 0; k < cav.length; k++) {
      c = cav[k]; if (!valid[c]) continue;
      var gx = 0, gy = 0;
      if (valid[c + 1] && valid[c - 1]) gx = (ts[c + 1] - ts[c - 1]) / 2;
      else if (valid[c + 1]) gx = ts[c + 1] - ts[c]; else if (valid[c - 1]) gx = ts[c] - ts[c - 1];
      if (valid[c + nx] && valid[c - nx]) gy = (ts[c + nx] - ts[c - nx]) / 2;
      else if (valid[c + nx]) gy = ts[c + nx] - ts[c]; else if (valid[c - nx]) gy = ts[c] - ts[c - nx];
      var m = Math.sqrt(gx * gx + gy * gy);
      if (m > 0) { ux[c] = gx / m; uy[c] = gy / m; }     // 流れは充填時刻が増える向き
    }
    // 2 セルの経路が合流するまでの距離（セル数）。上限を超えたら打ち切り
    var LMIN = Math.max(6, Math.round(7e-3 / this.dx)), CAP = 4000;
    function divergence(a, b) {
      var da = depth[a], db = depth[b], x = a, y = b, steps = 0, run = 0;
      while (da > db && steps < CAP) { x = up[x]; da--; steps++; run++; if (x < 0) return CAP; }
      while (db > da && steps < CAP) { y = up[y]; db--; steps++; if (y < 0) return CAP; }
      while (x !== y && steps < CAP) { x = up[x]; y = up[y]; run++; steps++; if (x < 0 || y < 0) return CAP; }
      return run;
    }
    // 縦・横・斜めの 4 方向の隣接ペアを調べる（斜めに折れ曲がって合流する場合も拾う）
    var PAIRS = [[1, 0], [0, 1], [1, 1], [-1, 1]];
    var segs = [];
    for (k = 0; k < cav.length; k++) {
      c = cav[k]; if (!valid[c]) continue;
      var i = c % nx, j = (c - i) / nx;
      for (var pi = 0; pi < 4; pi++) {
        var ddx = PAIRS[pi][0], ddy = PAIRS[pi][1];
        var bb = c + ddy * nx + ddx;
        if (!valid[bb]) continue;
        var inv = 1 / Math.sqrt(ddx * ddx + ddy * ddy);
        var nX = ddx * inv, nY = ddy * inv;                        // c → bb の向き
        var towardA = ux[c] * nX + uy[c] * nY;                     // c の流れが bb を向く
        var towardB = -(ux[bb] * nX + uy[bb] * nY);                // bb の流れが c を向く
        if (towardA < 0.05 || towardB < 0.05) continue;
        var dot = ux[c] * ux[bb] + uy[c] * uy[bb];
        var ang = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        if (ang < 30) continue;
        if (divergence(c, bb) < LMIN) continue;
        var mx = i + 0.5 + ddx / 2, my = j + 0.5 + ddy / 2, half = pi < 2 ? 0.5 : 0.36;
        segs.push({
          x1: mx - nY * half, y1: my + nX * half, x2: mx + nY * half, y2: my - nX * half, mx: mx, my: my,
          T: Math.min(this.Tfill[c], this.Tfill[bb]), t: Math.max(tF[c], tF[bb]), ang: ang
        });
      }
    }
    // 近い線分（中点間 1.6 セル以内）をまとめて 1 本のラインにする
    var parent = segs.map(function (_, q) { return q; });
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    var bucket = new Map();
    segs.forEach(function (sg, idx) {
      var bx = Math.floor(sg.mx), by = Math.floor(sg.my);
      for (var ox = -2; ox <= 2; ox++) for (var oy = -2; oy <= 2; oy++) {
        var list = bucket.get((bx + ox) + ',' + (by + oy));
        if (!list) continue;
        for (var q = 0; q < list.length; q++) {
          var o = segs[list[q]], ex = o.mx - sg.mx, ey = o.my - sg.my;
          if (ex * ex + ey * ey <= 1.6 * 1.6) { var r1 = find(idx), r2 = find(list[q]); if (r1 !== r2) parent[r1] = r2; }
        }
      }
      var key = bx + ',' + by;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push(idx);
    });
    var groups = new Map();
    segs.forEach(function (sg, idx) {
      var r = find(idx);
      if (!groups.has(r)) groups.set(r, { segs: [], Tmin: Infinity, t: 0, sx: 0, sy: 0, angMax: 0 });
      var g = groups.get(r);
      g.segs.push(sg); g.Tmin = Math.min(g.Tmin, sg.T); g.t = Math.max(g.t, sg.t);
      g.sx += sg.mx; g.sy += sg.my;
      g.angMax = Math.max(g.angMax, sg.ang);
    });
    var lines = [], minLenMM = 4.5;
    groups.forEach(function (g) {
      // 長さ＝線分中点の広がり（最も離れた 2 点の距離）
      var L = 0, a0 = g.segs[0];
      var far = a0, fd = 0;
      g.segs.forEach(function (sg) { var d2 = (sg.mx - a0.mx) * (sg.mx - a0.mx) + (sg.my - a0.my) * (sg.my - a0.my); if (d2 > fd) { fd = d2; far = sg; } });
      g.segs.forEach(function (sg) { var d2 = (sg.mx - far.mx) * (sg.mx - far.mx) + (sg.my - far.my) * (sg.my - far.my); if (d2 > L) L = d2; });
      var lenMM = (Math.sqrt(L) + 1) * self.dx * 1e3;
      if (lenMM < minLenMM || g.segs.length < 3) return;
      lines.push({ segs: g.segs, Tmin: g.Tmin, t: g.t, cx: g.sx / g.segs.length, cy: g.sy / g.segs.length,
        len: g.segs.length, lenMM: lenMM, angle: g.angMax, kind: g.angMax >= 135 ? 'weld' : 'meld' });
    });
    lines.sort(function (a, b) { return b.lenMM - a.lenMM; });
    return lines;
  };

  FlowSim.prototype.summarize = function () {
    var H = this.hist, Pm = 0, Cm = 0, k, kEnd = this.fillEndStep != null ? this.fillEndStep : H.P.length;
    for (k = 0; k < kEnd; k++) { if (H.P[k] > Pm) Pm = H.P[k]; if (H.clamp[k] > Cm) Cm = H.clamp[k]; }
    var filledV = this.filledVolume();
    var TfMin = Infinity, TfLoc = -1;
    for (k = 0; k < this.cav.length; k++) {
      var c = this.cav[k];
      if (this.state[c] === FULL && !this.isGate[c] && this.Tfill[c] < TfMin) { TfMin = this.Tfill[c]; TfLoc = c; }
    }
    var flowLen = 0;
    if (this.grid.arc) for (k = 0; k < this.cav.length; k++) {
      c = this.cav[k];
      if (this.F[c] > 0.5 && this.grid.arc[c] > flowLen) flowLen = this.grid.arc[c];
    }
    var welds = this.computeWelds();
    var traps = (this.trapLog || []).filter(function (t) { return t.V0 > 0; });
    var frozenAvg = 0, nfz = 0;
    for (k = 0; k < this.cav.length; k++) { c = this.cav[k]; if (this.state[c] === FULL) { frozenAvg += 2 * this.dl[c] / this.h[c]; nfz++; } }
    return {
      status: this.status,
      fillTime: this.fillEndT != null ? this.fillEndT : this.t,
      endTime: this.t,
      Pmax: Pm,
      clampMax: Cm,
      limited: Pm >= this.Pmax * 0.999,
      vpT: this.vpT, Ppack: this.Ppack,
      filledRatio: filledV / this.Vtot,
      TfrontMin: TfMin, TfrontLoc: TfLoc,
      welds: welds,
      traps: traps,
      flowLength: flowLen,
      frozenAvg: nfz ? frozenAvg / nfz : 0,
      steps: this.steps, cgIters: this.cgIters
    };
  };

  /* 表示用：時刻 t における状態に最も近いスナップショット */
  FlowSim.prototype.snapshotAt = function (t) {
    var s = this.snaps, lo = 0, hi = s.length - 1;
    if (!s.length) return null;
    if (t <= s[0].t) return s[0];
    if (t >= s[hi].t) return s[hi];
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid; }
    return s[lo];
  };

  K.FlowSim = FlowSim;
  K.FlowSim.EMPTY = EMPTY; K.FlowSim.FRONT = FRONT; K.FlowSim.FULL = FULL;
})(typeof window !== 'undefined' ? window : globalThis);
