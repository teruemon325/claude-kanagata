/* 解析モデルの 3D 表示（WebGL・ライブラリなし）
 *
 * 2.5D 解析のモデルは「平面形状＋肉厚分布」なので、片面を平らにして肉厚ぶん持ち上げた
 * 高さ場として立体化する（厚みは誇張率 k 倍で表示）。
 * 流動先端・等時間線・未充填部の斜線はフラグメントシェーダで画素ごとに判定するため、
 * 再生中は uniform（時刻）を変えるだけで滑らかに動き、手前の形状に隠れる部分も正しく隠れる。
 * ゲートやウェルドなどの記号は、3D 座標を画面へ投影して上に重ねた 2D キャンバスに描く。
 */
(function (K) {
  'use strict';

  /* ---------- 4×4 行列（列優先） ---------- */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(e, c, u) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    var xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx, xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function invert(m) {
    var a = m, o = new Array(16);
    var b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4],
      b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6],
      b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12],
      b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return o;
  }
  function xform(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
  }

  /* ---------- シェーダ ---------- */
  var VS = [
    'attribute vec3 aPos; attribute vec2 aGrad; attribute float aFill; attribute float aVal;',
    'uniform mat4 uMVP; uniform float uK; uniform vec3 uL; uniform float uTop;',
    'varying float vFill; varying float vVal; varying float vShade;',
    'void main(){',
    '  vec3 n = normalize(vec3(-uK * aGrad.x, -uK * aGrad.y, 1.0));',
    '  vShade = clamp((0.60 + 0.40 * max(dot(n, uL), 0.0)) / uTop, 0.5, 1.08);',
    '  vFill = aFill; vVal = aVal;',
    '  gl_Position = uMVP * vec4(aPos.xy, aPos.z * uK, 1.0);',
    '}'].join('\n');
  function fsSource(deriv) {
    return [
      deriv ? '#extension GL_OES_standard_derivatives : enable' : '',
      '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
      'varying float vFill; varying float vVal; varying float vShade;',
      'uniform sampler2D uLut; uniform float uTime; uniform float uMode; uniform float uV0; uniform float uSpan;',
      'uniform float uIso; uniform float uIsoStep; uniform float uIsoA; uniform float uHatch; uniform float uDpr; uniform vec3 uEmpty; uniform vec3 uInk;',
      'void main(){',
      '  bool filled = uMode < 0.5 ? (vFill <= uTime) : (vFill >= 0.5);',
      '  vec3 col;',
      '  if (filled) {',
      '    float x = clamp((vVal - uV0) / uSpan, 0.0, 1.0);',
      '    col = texture2D(uLut, vec2(0.002 + 0.996 * x, 0.5)).rgb;',
      deriv ? '    if (uIso > 0.5) { float q = vFill / uIsoStep; float d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), 1e-4); col = mix(col, uInk, (1.0 - clamp(d, 0.0, 1.0)) * uIsoA); }' : '',
      '  } else {',
      '    col = uEmpty;',
      '    if (uHatch > 0.5 && mod((gl_FragCoord.x + gl_FragCoord.y) / uDpr, 9.0) < 1.6) col = mix(col, uInk, 0.16);',
      '  }',
      '  gl_FragColor = vec4(col * vShade, 1.0);',
      '}'].join('\n');
  }
  var VS_LINE = 'attribute vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position = uMVP * vec4(aPos, 1.0); }';
  var FS_LINE = 'precision mediump float; uniform vec4 uCol; void main(){ gl_FragColor = uCol; }';

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function View3D(glCanvas, ovCanvas, opts) {
    opts = opts || {};
    var attrs = { antialias: opts.antialias !== false, preserveDrawingBuffer: false };
    var gl = glCanvas.getContext('webgl', attrs) || glCanvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGL を利用できません');
    this.gl = gl; this.cv = glCanvas; this.ov = ovCanvas; this.octx = ovCanvas.getContext('2d');
    this.u32 = !!gl.getExtension('OES_element_index_uint');
    this.deriv = !!gl.getExtension('OES_standard_derivatives');
    this.prog = program(gl, VS, fsSource(this.deriv));
    this.lprog = program(gl, VS_LINE, FS_LINE);
    var P = this.prog;
    this.loc = {
      aPos: gl.getAttribLocation(P, 'aPos'), aGrad: gl.getAttribLocation(P, 'aGrad'), aFill: gl.getAttribLocation(P, 'aFill'), aVal: gl.getAttribLocation(P, 'aVal'),
      uMVP: gl.getUniformLocation(P, 'uMVP'), uK: gl.getUniformLocation(P, 'uK'), uL: gl.getUniformLocation(P, 'uL'), uTop: gl.getUniformLocation(P, 'uTop'),
      uLut: gl.getUniformLocation(P, 'uLut'), uTime: gl.getUniformLocation(P, 'uTime'), uMode: gl.getUniformLocation(P, 'uMode'),
      uV0: gl.getUniformLocation(P, 'uV0'), uSpan: gl.getUniformLocation(P, 'uSpan'), uIso: gl.getUniformLocation(P, 'uIso'),
      uIsoStep: gl.getUniformLocation(P, 'uIsoStep'), uIsoA: gl.getUniformLocation(P, 'uIsoA'), uDpr: gl.getUniformLocation(P, 'uDpr'), uHatch: gl.getUniformLocation(P, 'uHatch'), uEmpty: gl.getUniformLocation(P, 'uEmpty'), uInk: gl.getUniformLocation(P, 'uInk'),
      laPos: gl.getAttribLocation(this.lprog, 'aPos'), luMVP: gl.getUniformLocation(this.lprog, 'uMVP'), luCol: gl.getUniformLocation(this.lprog, 'uCol')
    };
    this.lut = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.k = 4; this.cam = { az: -118, el: 38, zoom: 1 }; this.fitDist = 1; this.dpr = 1;
    this.u = { time: 0, mode: 1, v0: 0, span: 1, iso: 0, isoStep: 1, isoA: 0.45, hatch: 0, empty: [0.93, 0.95, 0.97], ink: [0.1, 0.14, 0.2], bg: [1, 1, 1, 1], grid: [0, 0, 0, 0.1] };
    this.buf = {};
  }
  /* WebGL が使えるか、GPU を使わないソフトウェア描画（SwiftShader など）かを一度だけ調べる */
  View3D.probe = function () {
    if (View3D._probe) return View3D._probe;
    var r = { ok: false, soft: false };
    try {
      var c = document.createElement('canvas'), gl = window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'));
      if (gl) {
        r.ok = true;
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        r.renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
        r.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r.renderer);
        var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
      }
    } catch (e) { r.ok = false; }
    return (View3D._probe = r);
  };
  View3D.supported = function () { return View3D.probe().ok; };

  /* モデルからメッシュを作る。grid は解析格子（結果の補間と頂点数の見積もりに使う）
   * 上面：細かい正方格子の高さ場（肉厚）。キャビティの輪郭はマーチングスクエアで格子を切り、
   *       輪郭の位置は形状関数の二分探索で求める（丸穴やスパイラルの縁が階段状にならない）。
   * 側面：輪郭に沿って上面から床まで垂直な壁を立てる（法線は隣り合う辺で平均して滑らかに）。
   */
  View3D.prototype.setModel = function (model, grid) {
    var gl = this.gl, W = model.size[0], H = model.size[1];
    // 頂点数の予算から格子間隔を決める：上面 ≈ 面積/d²、輪郭と壁 ≈ 3 × 周長/d
    var M = Math.min(this.u32 ? 90000 : 60000, this.maxV || 1e9) * 0.85, A = 0, Pm = 0, gh = grid.h, gnx = grid.nx;
    for (var k = 0; k < gh.length; k++) {
      if (!(gh[k] > 0)) continue;
      A++;
      if (!(gh[k + 1] > 0)) Pm++; if (!(gh[k - 1] > 0)) Pm++; if (!(gh[k + gnx] > 0)) Pm++; if (!(gh[k - gnx] > 0)) Pm++;
    }
    A *= grid.cellMM * grid.cellMM; Pm *= grid.cellMM * 0.8;
    var uinv = (-3 * Pm + Math.sqrt(9 * Pm * Pm + 4 * A * M)) / (2 * A);
    var d = Math.max(0.3, 1 / uinv);
    var nx = Math.ceil(W / d) + 3, ny = Math.ceil(H / d) + 3, x0 = -d, y0 = -d, n = nx * ny;
    var th = new Float32Array(n), inside = new Uint8Array(n), i, j, q;
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      var t = model.thick(x0 + i * d, y0 + j * d);
      q = j * nx + i; th[q] = t > 0 ? t : 0; inside[q] = t > 0 ? 1 : 0;
    }
    // 陰影用の法線：キャビティ内の点だけで肉厚をぼかした面から求める（縁の上面は平らなまま、段差は丸く見える）
    var sm = new Float32Array(n), tmp = new Float32Array(n), K5 = [1, 4, 6, 4, 1], o, acc, ws;
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      q = j * nx + i; if (!inside[q]) continue;
      acc = 0; ws = 0;
      for (o = -2; o <= 2; o++) { var ii = i + o; if (ii < 0 || ii >= nx || !inside[q + o]) continue; acc += K5[o + 2] * th[q + o]; ws += K5[o + 2]; }
      tmp[q] = acc / ws;
    }
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      q = j * nx + i; if (!inside[q]) continue;
      acc = 0; ws = 0;
      for (o = -2; o <= 2; o++) { var jj = j + o, qq = q + o * nx; if (jj < 0 || jj >= ny || !inside[qq]) continue; acc += K5[o + 2] * tmp[qq]; ws += K5[o + 2]; }
      sm[q] = acc / ws;
    }
    function gradAt(q) {                         // [∂z/∂X, ∂z/∂Y]（X＝x、Y＝−y）。外側の隣は片側差分で代用
      var i = q % nx, l = i > 0 && inside[q - 1], r = i < nx - 1 && inside[q + 1], u = q >= nx && inside[q - nx], dn = q + nx < n && inside[q + nx];
      var gx = l && r ? (sm[q + 1] - sm[q - 1]) / (2 * d) : r ? (sm[q + 1] - sm[q]) / d : l ? (sm[q] - sm[q - 1]) / d : 0;
      var gy = u && dn ? (sm[q + nx] - sm[q - nx]) / (2 * d) : dn ? (sm[q + nx] - sm[q]) / d : u ? (sm[q] - sm[q - nx]) / d : 0;
      return [gx, -gy];
    }
    var P = [], G = [], VT = [], SRC = [], XM = [], YM = [], tris = [], cx = W / 2, cy = H / 2;
    function addV(x, y, z, g, src, tz) {
      var v = VT.length;
      P.push(x - cx, -(y - cy), z); G.push(g[0], g[1]); VT.push(tz == null ? z : tz); SRC.push(src == null ? v : src); XM.push(x); YM.push(y);
      return v;
    }
    var gv = new Int32Array(n).fill(-1);
    function gridV(q) { if (gv[q] < 0) gv[q] = addV(x0 + (q % nx) * d, y0 + Math.floor(q / nx) * d, th[q], gradAt(q)); return gv[q]; }
    // 格子の辺と輪郭の交点（辺ごとに 1 つ。隣のセルと共有して上面に隙間を作らない）
    var ev = new Int32Array(2 * n).fill(-1), wn = [];
    function cross(qa, qb) {                      // qa：内側、qb：外側
      var key = Math.min(qa, qb) * 2 + (Math.abs(qa - qb) === 1 ? 0 : 1);
      if (ev[key] >= 0) return ev[key];
      var xa = x0 + (qa % nx) * d, ya = y0 + Math.floor(qa / nx) * d, xb = x0 + (qb % nx) * d, yb = y0 + Math.floor(qb / nx) * d, lo = 0, hi = 1;
      for (var it = 0; it < 12; it++) { var mid = (lo + hi) / 2; if (model.thick(xa + (xb - xa) * mid, ya + (yb - ya) * mid) > 0) lo = mid; else hi = mid; }
      var x = xa + (xb - xa) * lo, y = ya + (yb - ya) * lo, z = model.thick(x, y);
      var v = addV(x, y, z > 0 ? z : th[qa], gradAt(qa));
      ev[key] = v; wn[v] = [0, 0];
      return v;
    }
    var walls = [];
    function wall(c1, c2, ox, oy) {               // c1–c2 の輪郭に壁。(ox, oy) は外側の点
      var dx = XM[c2] - XM[c1], dy = YM[c2] - YM[c1], L = Math.hypot(dx, dy);
      if (!(L > 1e-9)) return;
      var nxm = dy / L, nym = -dx / L, mx = (XM[c1] + XM[c2]) / 2, my = (YM[c1] + YM[c2]) / 2;
      if (nxm * (ox - mx) + nym * (oy - my) < 0) { nxm = -nxm; nym = -nym; }
      wn[c1][0] += nxm * L; wn[c1][1] += nym * L; wn[c2][0] += nxm * L; wn[c2][1] += nym * L;
      walls.push(c1, c2);
    }
    function px(q) { return x0 + (q % nx) * d; }
    function py(q) { return y0 + Math.floor(q / nx) * d; }
    for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      var a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;            // a 左上、b 右上、e 右下、c 左下
      var ia = inside[a], ib = inside[b], ie = inside[e], ic = inside[c], cnt = ia + ib + ie + ic;
      if (!cnt) continue;
      if (cnt === 4) {
        // 対角線は「両端が高い方」で結ぶ（段差の縁が欠けないように）
        if (Math.min(th[a], th[e]) > Math.min(th[b], th[c])) tris.push(gridV(a), gridV(c), gridV(e), gridV(a), gridV(e), gridV(b));
        else tris.push(gridV(a), gridV(c), gridV(b), gridV(b), gridV(c), gridV(e));
        continue;
      }
      var cs = [a, b, e, c], ins = [ia, ib, ie, ic];
      if (cnt === 2 && ins[0] === ins[2]) {        // 対角の 2 点だけが内側：角ごとに別の三角形
        for (k = 0; k < 4; k++) {
          if (!ins[k]) continue;
          var p0 = cs[k], pn = cs[(k + 1) % 4], pp = cs[(k + 3) % 4], c1 = cross(p0, pn), c2 = cross(p0, pp);
          tris.push(gridV(p0), c1, c2);
          wall(c1, c2, (px(pn) + px(pp)) / 2, (py(pn) + py(pp)) / 2);
        }
        continue;
      }
      var poly = [], crs = [], ox = 0, oy = 0, on = 0;
      for (k = 0; k < 4; k++) {
        var P0 = cs[k], P1 = cs[(k + 1) % 4];
        if (ins[k]) poly.push(gridV(P0)); else { ox += px(P0); oy += py(P0); on++; }
        if (ins[k] !== ins[(k + 1) % 4]) { var cv = ins[k] ? cross(P0, P1) : cross(P1, P0); poly.push(cv); crs.push(cv); }
      }
      for (k = 1; k + 1 < poly.length; k++) tris.push(poly[0], poly[k], poly[k + 1]);
      if (crs.length === 2) wall(crs[0], crs[1], ox / on, oy / on);
    }
    // 壁の頂点：輪郭の交点ごとに上端と下端（法線は水平。傾きを大きくして表す）
    var wTop = {}, wBot = {};
    for (k = 0; k < walls.length; k += 2) {
      [walls[k], walls[k + 1]].forEach(function (cv) {
        if (wTop[cv] != null) return;
        var w = wn[cv], L = Math.hypot(w[0], w[1]) || 1, g = [-w[0] / L * 1e4, w[1] / L * 1e4];
        wTop[cv] = addV(XM[cv], YM[cv], P[cv * 3 + 2], g, cv);
        wBot[cv] = addV(XM[cv], YM[cv], 0, g, cv, VT[cv]);
      });
      var t1 = wTop[walls[k]], t2 = wTop[walls[k + 1]], b1 = wBot[walls[k]], b2 = wBot[walls[k + 1]];
      tris.push(t1, t2, b1, t2, b2, b1);
    }
    var nv = VT.length;
    if (!this.u32 && nv > 65535) throw new Error('頂点数が多すぎます');
    // 解析格子への補間係数
    var vc00 = new Int32Array(nv), vfx = new Float32Array(nv), vfy = new Float32Array(nv);
    for (var v = 0; v < nv; v++) {
      var uu = (XM[v] + grid.margin) / grid.cellMM - 0.5, ww = (YM[v] + grid.margin) / grid.cellMM - 0.5;
      var i0 = Math.max(0, Math.min(grid.nx - 2, Math.floor(uu))), j0 = Math.max(0, Math.min(grid.ny - 2, Math.floor(ww)));
      vc00[v] = j0 * grid.nx + i0; vfx[v] = Math.min(1, Math.max(0, uu - i0)); vfy[v] = Math.min(1, Math.max(0, ww - j0));
    }
    var idx = this.u32 ? new Uint32Array(tris) : new Uint16Array(tris);
    this._del();
    this.buf.pos = this._vbo(new Float32Array(P)); this.buf.grad = this._vbo(new Float32Array(G));
    this.aFill = new Float32Array(nv); this.aVal = new Float32Array(nv);
    this.buf.fill = this._vbo(this.aFill, true); this.buf.val = this._vbo(this.aVal, true);
    this.buf.idx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.nIdx = idx.length;
    // 床の格子（10 mm 間隔）
    var lines = [], step = W > 200 || H > 200 ? 20 : 10, zG = -0.05;
    var gx0 = Math.floor(-cx / step) * step - step, gx1 = Math.ceil(cx / step) * step + step, gy0 = Math.floor(-cy / step) * step - step, gy1 = Math.ceil(cy / step) * step + step;
    for (var gx = gx0; gx <= gx1 + 1e-6; gx += step) lines.push(gx, gy0, zG, gx, gy1, zG);
    for (var gy = gy0; gy <= gy1 + 1e-6; gy += step) lines.push(gx0, gy, zG, gx1, gy, zG);
    this.buf.grid = this._vbo(new Float32Array(lines)); this.nGrid = lines.length / 3;
    this.gridStep = step;
    // nearIn：値をコピーする元の頂点（壁の頂点は輪郭上の上面の頂点と同じ色にする）
    this.mesh = { nv: nv, d: d, nx: nx, ny: ny, x0: x0, y0: y0, th: th, cx: cx, cy: cy, W: W, H: H, vth: new Float32Array(VT), nearIn: Int32Array.from(SRC),
      vc00: vc00, vfx: vfx, vfy: vfy, model: model };
    var hmax = 0; for (q = 0; q < n; q++) if (th[q] > hmax) hmax = th[q];
    this.hmax = hmax;
    this.fit();
  };
  View3D.prototype._vbo = function (arr, dyn) {
    var gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return b;
  };
  View3D.prototype._del = function () {
    var gl = this.gl, self = this;
    Object.keys(this.buf).forEach(function (k) { gl.deleteBuffer(self.buf[k]); });
    this.buf = {};
  };
  /* 頂点ごとの値（充填の判定用 aFill と、色づけ用 aVal）を転送 */
  View3D.prototype.upload = function (which) {
    var gl = this.gl;
    if (which !== 'val') { gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.fill); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.aFill); }
    if (which !== 'fill') { gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.val); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.aVal); }
  };
  View3D.prototype.setLut = function (lut) {
    var gl = this.gl, data = new Uint8Array(256 * 4);
    for (var i = 0; i < 256; i++) { data[i * 4] = lut[i * 3]; data[i * 4 + 1] = lut[i * 3 + 1]; data[i * 4 + 2] = lut[i * 3 + 2]; data[i * 4 + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  };

  View3D.prototype.resize = function (cssW, cssH, dpr) {
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    [this.cv, this.ov].forEach(function (c) { c.style.width = cssW + 'px'; c.style.height = cssH + 'px'; c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr); });
  };
  /* 視点のプリセット [方位角, 仰角]。方位 −90° は平面図の下側（手前）から見る向き */
  View3D.PRESETS = { oblique: [-118, 38], top: [-90, 89.5], front: [-90, 10], side: [0, 10] };
  View3D.prototype.setView = function (preset) {
    var P = View3D.PRESETS[preset] || View3D.PRESETS.oblique;
    this.cam.az = P[0]; this.cam.el = P[1]; this.cam.zoom = 1;
    this.fit();
  };
  /* 今の向きで、モデルの外接箱が画面に収まるカメラ距離を求める（回転中は変えない） */
  View3D.prototype.fit = function () {
    var m = this.mesh;
    if (!m || !this.cssW) return;
    var hz = this.hmax * this.k, D = Math.hypot(m.W, m.H, hz) / 2 / Math.sin(15 * Math.PI / 180), corners = [];
    [-m.W / 2, m.W / 2].forEach(function (X) { [-m.H / 2, m.H / 2].forEach(function (Y) { corners.push([X, Y, 0], [X, Y, hz]); }); });
    for (var it = 0; it < 10; it++) {
      var vp = this._build(D), ex = 0;
      corners.forEach(function (c) {
        var p = xform(vp, c[0], c[1], c[2]);
        if (p[3] > 0) ex = Math.max(ex, Math.abs(p[0] / p[3]), Math.abs(p[1] / p[3]));
      });
      if (!(ex > 0)) break;
      var nd = D * Math.pow(ex / 0.84, 0.9);
      if (Math.abs(nd - D) < D * 1e-3) { D = nd; break; }
      D = nd;
    }
    this.fitDist = D;
  };
  View3D.prototype._build = function (D) {
    var c = this.cam, az = c.az * Math.PI / 180, el = c.el * Math.PI / 180;
    var tz = this.hmax * this.k * 0.4, tg = [0, 0, tz];
    var eye = [D * Math.cos(el) * Math.cos(az), D * Math.cos(el) * Math.sin(az), tz + D * Math.sin(el)];
    // 真上付近では「奥」の水平方向を上にして、仰角を変えても画面が回転しないようにする
    var up = c.el > 89 ? [-Math.cos(az), -Math.sin(az), 0] : [0, 0, 1];
    var view = lookAt(eye, tg, up);
    var proj = perspective(30 * Math.PI / 180, this.cssW / this.cssH, D * 0.05, D * 6);
    this.eye = eye;
    this.basis = [[view[0], view[4], view[8]], [view[1], view[5], view[9]], [view[2], view[6], view[10]]];   // 画面の右・上・手前（ワールド座標）
    return mul(proj, view);
  };
  View3D.prototype._matrices = function () {
    this.vp = this._build(this.fitDist * this.cam.zoom); this.ivp = invert(this.vp);
    return this.vp;
  };
  /* モデル座標（mm、z は実寸の肉厚方向）→ 画面座標（CSS px） */
  View3D.prototype.project = function (xmm, ymm, zmm) {
    var m = this.mesh, p = xform(this.vp, xmm - m.cx, -(ymm - m.cy), zmm * this.k);
    if (p[3] <= 0) return null;
    return [(p[0] / p[3] * 0.5 + 0.5) * this.cssW, (1 - (p[1] / p[3] * 0.5 + 0.5)) * this.cssH, p[2] / p[3]];
  };
  View3D.prototype.heightAt = function (xmm, ymm) {        // 実寸の肉厚（mm）。メッシュ格子から双線形補間
    var m = this.mesh, u = (xmm - m.x0) / m.d, v = (ymm - m.y0) / m.d, i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || j < 0 || i >= m.nx - 1 || j >= m.ny - 1) return 0;
    var fx = u - i, fy = v - j, q = j * m.nx + i, t = m.th;
    return (t[q] * (1 - fx) + t[q + 1] * fx) * (1 - fy) + (t[q + m.nx] * (1 - fx) + t[q + m.nx + 1] * fx) * fy;
  };
  /* 画面上の点から視線を飛ばし、モデル表面との交点（mm）を求める */
  View3D.prototype.pick = function (sx, sy) {
    if (!this.ivp) return null;
    var nx = sx / this.cssW * 2 - 1, ny = 1 - sy / this.cssH * 2, a = xform(this.ivp, nx, ny, -1), b = xform(this.ivp, nx, ny, 1);
    var p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    var dir = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(dir[0], dir[1], dir[2]);
    dir = [dir[0] / L, dir[1] / L, dir[2] / L];
    var m = this.mesh, zTop = this.hmax * this.k + 0.01, s0, s1;
    if (Math.abs(dir[2]) < 1e-6) return null;
    s0 = (zTop - p0[2]) / dir[2]; s1 = (0 - p0[2]) / dir[2];
    if (s1 < s0) { var tmp = s0; s0 = s1; s1 = tmp; }
    s0 = Math.max(0, s0);
    var ds = m.d * 0.5 * Math.max(0.25, Math.abs(dir[2]) < 0.2 ? 0.5 : 1), prev = s0;
    for (var s = s0; s <= s1 + ds; s += ds) {
      var X = p0[0] + dir[0] * s, Y = p0[1] + dir[1] * s, Z = p0[2] + dir[2] * s;
      var xm = X + m.cx, ym = -Y + m.cy, hz = this.heightAt(xm, ym) * this.k;
      if (hz > 0 && Z <= hz) {
        var lo = prev, hi = s;                     // 二分法で表面を詰める
        for (var it = 0; it < 12; it++) {
          var mid = (lo + hi) / 2, Xm = p0[0] + dir[0] * mid, Ym = p0[1] + dir[1] * mid, Zm = p0[2] + dir[2] * mid;
          if (Zm <= this.heightAt(Xm + m.cx, -Ym + m.cy) * this.k) hi = mid; else lo = mid;
        }
        return [p0[0] + dir[0] * hi + m.cx, -(p0[1] + dir[1] * hi) + m.cy];
      }
      prev = s;
    }
    return null;
  };

  View3D.prototype.render = function () {
    var gl = this.gl, L = this.loc, u = this.u;
    if (!this.mesh) return;
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clearColor(u.bg[0], u.bg[1], u.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    var vp = this._matrices();
    // 床の格子
    gl.useProgram(this.lprog);
    gl.uniformMatrix4fv(L.luMVP, false, vp); gl.uniform4fv(L.luCol, u.grid);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf.grid); gl.enableVertexAttribArray(L.laPos); gl.vertexAttribPointer(L.laPos, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, this.nGrid);
    gl.disableVertexAttribArray(L.laPos);
    gl.disable(gl.BLEND);
    // 製品
    gl.useProgram(this.prog);
    // 光はカメラから見て左上手前から当てる（回転しても陰影の付き方が変わらない）。
    // 上面の明るさで割って、上面には色の参照表どおりの色が出るようにする
    var B = this.basis, Lv = [0, 1, 2].map(function (i) { return -0.45 * B[0][i] + 0.65 * B[1][i] + 0.6 * B[2][i]; });
    var Ll = Math.hypot(Lv[0], Lv[1], Lv[2]); Lv = [Lv[0] / Ll, Lv[1] / Ll, Lv[2] / Ll];
    gl.uniformMatrix4fv(L.uMVP, false, vp); gl.uniform1f(L.uK, this.k); gl.uniform3fv(L.uL, Lv); gl.uniform1f(L.uTop, 0.60 + 0.40 * Math.max(0, Lv[2]));
    gl.uniform1f(L.uTime, u.time); gl.uniform1f(L.uMode, u.mode); gl.uniform1f(L.uV0, u.v0); gl.uniform1f(L.uSpan, u.span || 1);
    gl.uniform1f(L.uIso, u.iso && this.deriv ? 1 : 0); gl.uniform1f(L.uIsoStep, u.isoStep || 1); gl.uniform1f(L.uIsoA, u.isoA); gl.uniform1f(L.uHatch, u.hatch);
    gl.uniform1f(L.uDpr, this.dpr || 1);
    gl.uniform3fv(L.uEmpty, u.empty); gl.uniform3fv(L.uInk, u.ink);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.lut); gl.uniform1i(L.uLut, 0);
    [[this.buf.pos, L.aPos, 3], [this.buf.grad, L.aGrad, 2], [this.buf.fill, L.aFill, 1], [this.buf.val, L.aVal, 1]].forEach(function (a) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a[0]); gl.enableVertexAttribArray(a[1]); gl.vertexAttribPointer(a[1], a[2], gl.FLOAT, false, 0, 0);
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buf.idx);
    gl.drawElements(gl.TRIANGLES, this.nIdx, this.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    [L.aPos, L.aGrad, L.aFill, L.aVal].forEach(function (a) { gl.disableVertexAttribArray(a); });
    // 重ね描き用キャンバスを準備
    var o = this.octx; o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, this.ov.width, this.ov.height); o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return o;
  };

  /* マウス・タッチ操作：ドラッグで回転、ピンチ／ホイールで拡大、動かさずに離すとクリック。
   * ホイールは、図を一度操作した（フォーカスがある）か Ctrl／⌘ を押しているときだけ使い、
   * それ以外はページのスクロールを妨げない。 */
  View3D.prototype.bind = function (handlers) {
    var cv = this.cv, self = this, pts = new Map(), start = null, moved = false, pinch0 = 0, zoom0 = 1;
    function zoomTo(z) { self.cam.zoom = Math.max(0.3, Math.min(3, z)); handlers.change('zoom'); }
    function onDown(e) {
      if (e.button != null && e.button > 0) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { }
      if (document.activeElement !== cv) cv.focus({ preventScroll: true });
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { start = [e.clientX, e.clientY, self.cam.az, self.cam.el]; moved = false; }
      if (pts.size === 2) { var a = Array.from(pts.values()); pinch0 = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); zoom0 = self.cam.zoom; moved = true; }
    }
    function onMove(e) {
      if (!pts.has(e.pointerId)) { if (handlers.hover) handlers.hover(e); return; }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        var a = Array.from(pts.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        if (pinch0 > 0 && d > 0) zoomTo(zoom0 * pinch0 / d);
        return;
      }
      if (!start) return;
      var dx = e.clientX - start[0], dy = e.clientY - start[1];
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      self.cam.az = start[2] - dx * 0.4;
      self.cam.el = Math.max(4, Math.min(89.5, start[3] + dy * 0.3));
      if (handlers.leave) handlers.leave();
      handlers.change('rotate');
    }
    function onUp(e, cancel) {
      var wasTap = !cancel && pts.size === 1 && pts.has(e.pointerId) && !moved;
      pts.delete(e.pointerId);
      if (pts.size === 0) start = null;
      if (wasTap && handlers.click) handlers.click(e);
    }
    function onWheel(e) {
      if (!(e.ctrlKey || e.metaKey || document.activeElement === cv)) return;
      e.preventDefault();
      zoomTo(self.cam.zoom * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)));
    }
    function onKey(e) {
      var c = self.cam, kind = 'rotate';
      if (e.key === 'ArrowLeft') c.az -= 8; else if (e.key === 'ArrowRight') c.az += 8;
      else if (e.key === 'ArrowUp') c.el = Math.min(89.5, c.el + 5); else if (e.key === 'ArrowDown') c.el = Math.max(4, c.el - 5);
      else if (e.key === '+' || e.key === '=') { c.zoom = Math.max(0.3, c.zoom * 0.9); kind = 'zoom'; }
      else if (e.key === '-') { c.zoom = Math.min(3, c.zoom * 1.1); kind = 'zoom'; }
      else return;
      e.preventDefault(); handlers.change(kind);
    }
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', function (e) { onUp(e, false); });
    cv.addEventListener('pointercancel', function (e) { onUp(e, true); });
    cv.addEventListener('pointerleave', function () { if (!pts.size && handlers.leave) handlers.leave(); });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('keydown', onKey);
    cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (!self.dead && handlers.lost) handlers.lost(); });
  };

  View3D.prototype.destroy = function () {
    this.dead = true;
    try { this._del(); this.gl.deleteTexture(this.lut); var ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { }
  };

  K.View3D = View3D;
})(window.KANAGATA);
