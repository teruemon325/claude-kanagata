/* 樹脂流動シミュレーター：結果の読み解き・成形ウィンドウ・ページ組み立て */
(function (K) {
  'use strict';
  var U = K._flowUI, S = U.S, $ = U.$, fmt = U.fmt, esc = U.esc;

  /* ---------------- 所見（結果の解釈） ---------------- */
  function findings(res, sim) {
    var m = U.model(), mt = U.mat(), g = U.grid(), out = [];
    var tons = res.clampMax / 9806.65;
    // 判定
    if (m.pressureTest) {
      out.push({ lv: 'info', t: '流動長 ' + fmt(res.flowLength, 0) + ' mm',
        d: mt.name + '・樹脂温度' + S.Tm + '℃・金型温度' + S.Tw + '℃で、' + S.Pmax + ' MPaの圧力をかけたときに固化して止まるまでの長さです。材料を変えて比べると「流れやすさ」の違いがはっきりします。数値が大きいほど、薄く長い製品を成形しやすい材料です。' });
    } else if (res.status === 'full') {
      out.push({ lv: 'ok', t: '充填完了（' + fmt(res.fillTime, 2) + ' 秒）',
        d: '設定した射出時間 ' + fmt(S.fillTime, 2) + ' 秒に対して、キャビティ全体が満たされました。' + (res.vpT ? 'V/P切替（' + S.vp + '%）は ' + fmt(res.vpT, 2) + ' 秒で、以降は ' + fmt(res.Ppack / 1e6, 1) + ' MPaの保圧で押し切っています。' : '') });
    } else {
      var why = res.limited ? '射出圧力が上限（' + S.Pmax + ' MPa）に達し、それ以上押せませんでした。' :
        '流動末端で樹脂がノーフロー温度（' + mt.Tnf + '℃）まで冷え、固化層が流路をふさいで流れが止まりました。';
      out.push({ lv: 'bad', t: 'ショートショット（充填不足）：体積の ' + fmt((1 - res.filledRatio) * 100, 1) + '% が未充填',
        d: why + '対策の候補：樹脂温度・金型温度を上げる、射出時間を短く（速く）する、ゲートを充填不足の部位に近づける、または肉厚を見直す。' });
    }
    // 圧力
    var pr = res.Pmax / 1e6;
    if (!m.pressureTest) {
      var ratio = pr / S.Pmax;
      out.push({ lv: ratio > 0.8 ? 'warn' : 'info', t: '最大射出圧力 ' + fmt(pr, 1) + ' MPa（上限の ' + fmt(ratio * 100, 0) + '%）',
        d: ratio > 0.8 ? '上限に対する余裕が少なく、材料ロットや温度のばらつきでショートになるおそれがあります。' : '一般に、成形機の能力の7〜8割以内に収まる条件が量産では安心です。' });
    }
    // 型締力
    out.push({ lv: 'info', t: '型締力の目安 ' + fmt(tons, 1) + ' t（充填完了時）',
      d: 'キャビティ内の圧力を投影面積で積分した値です。保圧中はさらに高くなるため、成形機は余裕をみて ' + fmt(Math.max(5, Math.ceil(tons * 1.5 / 5) * 5), 0) + ' t クラス以上を目安にします。型締力が足りないと、パーティング面が開いてバリが出ます。' });
    // ランナーバランス
    if (m.cavities) {
      var ends = m.cavities.map(function (cv) {
        var tmax = 0, n = 0, nf = 0;
        for (var k = 0; k < sim.cav.length; k++) {
          var c = sim.cav[k], xy = U.cellToMM(g, c);
          if (xy[0] < cv[1] || xy[0] > cv[3] || xy[1] < cv[2] || xy[1] > cv[4]) continue;
          n++; if (isFinite(sim.tFill[c])) { nf++; tmax = Math.max(tmax, sim.tFill[c]); }
        }
        return { name: cv[0], t: tmax, full: nf >= n * 0.999 };
      });
      var tmn = Math.min.apply(null, ends.map(function (e) { return e.t; })), tmx = Math.max.apply(null, ends.map(function (e) { return e.t; }));
      var spread = tmx - tmn;
      out.push({ lv: spread > 0.06 * res.fillTime ? 'warn' : 'ok',
        t: 'キャビティ間の充填完了時間の差 ' + fmt(spread, 2) + ' 秒',
        d: ends.map(function (e) { return e.name + ' ' + fmt(e.t, 2) + ' 秒'; }).join('、') + '。' +
          (spread > 0.06 * res.fillTime ? '先に満ちたキャビティには、残りが満ちるまで圧力がかかり続けるため、過充填（バリ・寸法の大きめ）と、遅いキャビティの充填不足が同時に起きやすくなります。ランナーの長さ・太さをそろえる（バランスさせる）のが基本です。'
            : '4個がほぼ同時に満たされており、ランナーバランスは良好です。') });
    }
    // 領域（ツメなど）
    if (m.regions) {
      m.regions.forEach(function (rg) {
        var n = 0, nf = 0, Tmin = Infinity;
        for (var k = 0; k < sim.cav.length; k++) {
          var c = sim.cav[k], xy = U.cellToMM(g, c);
          if (xy[0] < rg[1] || xy[0] > rg[3] || xy[1] < rg[2] || xy[1] > rg[4]) continue;
          n++; if (sim.F[c] > 0.99) { nf++; Tmin = Math.min(Tmin, sim.Tfill[c]); }
        }
        var ratio = n ? nf / n : 0;
        out.push({ lv: ratio < 0.99 ? 'bad' : (Tmin - mt.Tnf < 20 ? 'warn' : 'ok'),
          t: rg[0] + '：充填率 ' + fmt(ratio * 100, 0) + '%',
          d: ratio < 0.99 ? '薄い部分の入口で樹脂が立ち止まり（ためらい現象）、その間に冷えて固まりました。厚い部分が先に満ちて圧力が上がるころには、もう流れ込めません。'
            : '充填できていますが、末端の樹脂温度は ' + fmt(Tmin, 0) + '℃（ノーフロー温度＋' + fmt(Tmin - mt.Tnf, 0) + '℃）です。' + (Tmin - mt.Tnf < 20 ? '固化寸前で、転写不良や強度低下が出やすい状態です。' : '') });
      });
    }
    // ウェルド・メルド
    var welds = res.welds.filter(function (w) { return w.kind === 'weld'; }), melds = res.welds.filter(function (w) { return w.kind === 'meld'; });
    if (res.welds.length) {
      var worst = res.welds.slice().sort(function (a, b) { return a.Tmin - b.Tmin; })[0];
      var dT = S.Tm - worst.Tmin;
      out.push({ lv: dT > 35 ? 'warn' : 'info', t: 'ウェルドライン ' + welds.length + ' 本・メルドライン ' + melds.length + ' 本',
        d: '2つの流動先端が出会った線です。正面から出会う（合流角135°以上）ものをウェルド、斜めに合流して並走するものをメルドと呼びます。最も温度の低い合流部は ' + fmt(worst.Tmin, 0) + '℃（樹脂温度より ' + fmt(dT, 0) + '℃低い）' +
          (dT > 35 ? 'で、樹脂どうしが溶け合いにくく、強度低下や外観の筋が目立ちやすい状態です。ゲート位置を変えて合流部を「見えない・力のかからない」場所へ移すか、樹脂温度・金型温度を上げると改善します。' : 'で、比較的高温のうちに合流しているため、融着は良好と見込めます。') });
    } else if (!m.pressureTest) {
      out.push({ lv: 'ok', t: 'ウェルドラインなし', d: '流動先端どうしが出会う場所はありませんでした。' });
    }
    // エアトラップ
    if (res.traps.length) {
      var Tair = Math.max.apply(null, res.traps.map(function (t) { return t.Tair; }));
      out.push({ lv: 'bad', t: 'エアトラップ ' + res.traps.length + ' か所',
        d: '流動先端に囲まれて逃げ場を失った空気が、樹脂に押されて断熱圧縮されます。理論上の空気温度は約 ' + fmt(Tair, 0) + '℃に達し（実際は熱が逃げるため低くなるが、樹脂の分解温度を大きく超える）、焼け（ディーゼル効果）や未充填の原因になります。トラップの位置にベントを追加するか、ゲート位置を変えて最後に満たされる場所を外周（パーティング面）へ移しましょう。' });
    } else if (!m.pressureTest) {
      out.push({ lv: 'ok', t: 'エアトラップなし', d: '空気は外周' + (S.vents.length ? 'やベント' : '') + 'から抜けています。' });
    }
    // 流動先端温度
    if (isFinite(res.TfrontMin) && !m.regions) {
      var margin = res.TfrontMin - mt.Tnf;
      out.push({ lv: margin < 20 ? 'warn' : 'info', t: '流動先端の最低温度 ' + fmt(res.TfrontMin, 0) + '℃',
        d: 'ノーフロー温度（' + mt.Tnf + '℃）まであと ' + fmt(margin, 0) + '℃。' + (margin < 20 ? '流動末端で固化寸前です。フローマークや転写不良、ショートショットに注意が必要です。' : '十分な余裕があります。') });
    }
    return out;
  }

  var ICON = { ok: '✓', warn: '!', bad: '✕', info: 'i' };
  var LVNAME = { ok: '良好', warn: '注意', bad: '要対策', info: '参考' };

  function renderResults() {
    var R = U.getR(), res = R.res, sim = R.sim, m = U.model();
    var tons = res.clampMax / 9806.65;
    var tiles = [];
    if (m.pressureTest) tiles.push(['流動長', fmt(res.flowLength, 0), 'mm']);
    else tiles.push(['充填時間', res.status === 'full' ? fmt(res.fillTime, 2) : '—', res.status === 'full' ? 's' : 'ショート']);
    tiles.push(['最大射出圧力', fmt(res.Pmax / 1e6, 1), 'MPa']);
    tiles.push(['型締力（充填完了時）', fmt(tons, 1), 't']);
    tiles.push(['流動先端の最低温度', isFinite(res.TfrontMin) ? fmt(res.TfrontMin, 0) : '—', '℃']);
    if (!m.pressureTest) {
      tiles.push(['ウェルド／メルド', res.welds.filter(function (w) { return w.kind === 'weld'; }).length + ' / ' + res.welds.filter(function (w) { return w.kind === 'meld'; }).length, '本']);
      tiles.push(['エアトラップ', String(res.traps.length), 'か所']);
    }
    var list = findings(res, sim);
    var verdict = list[0];
    var html = '<div class="fs-verdict lv-' + verdict.lv + '"><span class="fs-ico" aria-hidden="true">' + ICON[verdict.lv] + '</span>' +
      '<div><span class="fs-lv">' + LVNAME[verdict.lv] + '</span><b>' + esc(verdict.t) + '</b><p>' + esc(verdict.d) + '</p></div></div>' +
      '<div class="fs-tiles">' + tiles.map(function (t) { return '<div class="fs-tile"><span class="fs-tile-l">' + t[0] + '</span><span class="fs-tile-v">' + t[1] + '<small>' + t[2] + '</small></span></div>'; }).join('') + '</div>' +
      '<h2>所見</h2><ul class="fs-findings">' + list.slice(1).map(function (f) {
        return '<li class="lv-' + f.lv + '"><span class="fs-ico" aria-hidden="true">' + ICON[f.lv] + '</span><div><span class="fs-lv">' + LVNAME[f.lv] + '</span><b>' + esc(f.t) + '</b><p>' + esc(f.d) + '</p></div></li>';
      }).join('') + '</ul>' +
      '<h2>充填中の圧力と型締力</h2><p class="fs-sub">ゲート位置の樹脂圧力は、流動長が伸びるほど上がっていきます。縦線はV/P切替（ここから保圧で押し切る）と、上の図で表示している時刻です。</p>' +
      '<div class="fs-charts"><figure class="fs-chart"><figcaption>射出圧力（ゲート部）</figcaption><div id="fsChartP"></div></figure>' +
      '<figure class="fs-chart"><figcaption>型締力（キャビティ内圧×投影面積）</figcaption><div id="fsChartC"></div></figure></div>' +
      '<details class="fs-table"><summary>数値を表で見る</summary><div class="table-wrap" id="fsTable"></div></details>' +
      '<p class="fs-meta">計算：' + sim.steps + ' ステップ・格子 ' + U.grid().nx + '×' + U.grid().ny + '（' + U.grid().cellMM + ' mm）・' + fmt(R.elapsed / 1000, 1) + ' 秒</p>';
    $('fsResults').innerHTML = html;

    var H = sim.hist, n = H.t.length, stepN = Math.max(1, Math.floor(n / 260)), pP = [], pC = [], rows = [];
    for (var k = 0; k < n; k += stepN) { pP.push([H.t[k], H.P[k] / 1e6]); pC.push([H.t[k], H.clamp[k] / 9806.65]); }
    pP.push([H.t[n - 1], H.P[n - 1] / 1e6]); pC.push([H.t[n - 1], H.clamp[n - 1] / 9806.65]);
    var markers = res.vpT ? [{ x: res.vpT, label: 'V/P切替' }] : [];
    var s1 = 'var(--series-1)';
    R.charts = [
      K.charts.line($('fsChartP'), { series: [{ name: '射出圧力', color: s1, points: pP, area: true }], xLabel: '時間 [s]', yLabel: 'MPa', yUnit: ' MPa', xUnit: ' s', xName: '時刻', markers: markers, xMin: 0, xMax: R.tEnd, ariaLabel: '射出圧力の時間変化' }),
      K.charts.line($('fsChartC'), { series: [{ name: '型締力', color: s1, points: pC, area: true }], xLabel: '時間 [s]', yLabel: 't（トン）', yUnit: ' t', xUnit: ' s', xName: '時刻', markers: markers, xMin: 0, xMax: R.tEnd, ariaLabel: '型締力の時間変化' })
    ];
    R.charts.forEach(function (c) { c.setPlayhead(R.t); });
    var tr = '<table><thead><tr><th class="num">時刻 [s]</th><th class="num">射出圧力 [MPa]</th><th class="num">型締力 [t]</th><th class="num">充填率 [%]</th></tr></thead><tbody>';
    var st2 = Math.max(1, Math.floor(n / 20));
    for (k = 0; k < n; k += st2) tr += '<tr><td class="num">' + fmt(H.t[k], 3) + '</td><td class="num">' + fmt(H.P[k] / 1e6, 1) + '</td><td class="num">' + fmt(H.clamp[k] / 9806.65, 1) + '</td><td class="num">' + fmt(H.filled[k] * 100, 1) + '</td></tr>';
    $('fsTable').innerHTML = tr + '</tbody></table>';
  }

  /* ---------------- 成形ウィンドウ（射出時間スイープ） ---------------- */
  function runSweep() {
    var R = U.getR(); if (!R) return;
    var m = U.model(), mt = U.mat();
    if (m.pressureTest) return;
    var coarse = Object.assign({}, m, { cell: m.cell * 2 });
    var g = K.rasterizeModel(coarse);
    var gates = (S.gates || m.gates).map(function (p) { return K.cellAt(g, p[0], p[1], 3); }).filter(function (c) { return c >= 0; });
    var vents = S.vents.map(function (p) { return K.cellAt(g, p[0], p[1], 3); }).filter(function (c) { return c >= 0; });
    var base = m.fillTime, factors = [0.12, 0.2, 0.35, 0.6, 1, 1.6, 2.6, 4.2];
    var times = factors.map(function (f) { return +(base * f).toPrecision(2); });
    var results = [], i = 0, sim = null;
    var btn = $('fsSweep'); btn.disabled = true;
    var cond = { Tm: S.Tm, Tw: S.Tw, Pmax: S.Pmax * 1e6, gates: gates, vents: vents, perimeterVents: S.plVent, vp: S.vp / 100 };
    function tick() {
      if (!U.getR()) return;
      var t0 = performance.now();
      while (performance.now() - t0 < 30) {
        if (!sim) sim = new K.FlowSim(g, mt, Object.assign({ fillTime: times[i] }, cond));
        sim.run(10);
        if (sim.done) {
          results.push({ ft: times[i], P: sim.result.Pmax / 1e6, short: sim.result.status === 'short', clamp: sim.result.clampMax / 9806.65 });
          sim = null; i++;
          if (i >= times.length) break;
        }
      }
      $('fsSweepStatus').textContent = i < times.length ? '計算中 ' + i + ' / ' + times.length : '';
      if (i < times.length) { U.getR().sweepRaf = requestAnimationFrame(tick); return; }
      btn.disabled = false;
      drawSweep(results, mt);
    }
    U.getR().sweepRaf = requestAnimationFrame(tick);
  }
  function drawSweep(results, mt) {
    var ok = results.filter(function (r) { return !r.short; });
    var best = ok.length ? ok.reduce(function (a, b) { return a.P <= b.P ? a : b; }) : null;
    var out = $('fsSweepOut');
    out.innerHTML = '<figure class="fs-chart fs-chart-wide"><figcaption>必要な射出圧力（' + esc(mt.name) + '・樹脂温度 ' + S.Tm + '℃・金型温度 ' + S.Tw + '℃）</figcaption><div id="fsChartU"></div></figure>' +
      '<p class="fs-sweep-note">' + (best ? '必要圧力が最も低いのは射出時間 <b>' + fmt(best.ft, 2) + ' 秒</b>付近（' + fmt(best.P, 1) + ' MPa）です。' : '') +
      (results.some(function (r) { return r.short; }) ? ' 白抜きの点はショートショット（遅すぎて固化、または圧力上限）です。' : '') +
      ' 谷が浅く広いほど条件のばらつきに強い材料・形状です。</p>' +
      '<details class="fs-table"><summary>数値を表で見る</summary><div class="table-wrap"><table><thead><tr><th class="num">射出時間 [s]</th><th class="num">必要圧力 [MPa]</th><th class="num">型締力 [t]</th><th>判定</th></tr></thead><tbody>' +
      results.map(function (r) { return '<tr><td class="num">' + fmt(r.ft, 2) + '</td><td class="num">' + fmt(r.P, 1) + '</td><td class="num">' + fmt(r.clamp, 1) + '</td><td>' + (r.short ? 'ショート' : '充填完了') + '</td></tr>'; }).join('') +
      '</tbody></table></div></details>';
    var pts = results.map(function (r) { return [r.ft, r.P]; });
    var xt = results.map(function (r) { return r.ft; });
    K.charts.line($('fsChartU'), {
      series: [{ name: '必要圧力', color: 'var(--series-1)', points: pts, dots: true, bad: results.map(function (r) { return r.short; }),
        note: function (p) { var r = results.filter(function (x) { return x.ft === p[0]; })[0]; return r && r.short ? 'ショート' : ''; } }],
      xLog: true, xTicks: xt, xFmt: function (v) { return fmt(v, v < 1 ? 2 : 1); }, xLabel: '射出時間 [s]（対数目盛）', yLabel: 'MPa', yUnit: ' MPa', xUnit: ' s', xName: '射出時間',
      highlight: best ? { x: best.ft, y: best.P, label: '最小 ' + fmt(best.P, 1) + ' MPa' } : null, height: 230, ariaLabel: '射出時間と必要圧力の関係'
    });
  }

  /* ---------------- 解説（計算の中身） ---------------- */
  function method() {
    var rows = K.materials.map(function (m) {
      return '<tr><td><b>' + m.name + '</b></td><td class="num">' + m.n.toFixed(2) + '</td><td class="num">' + fmt(m.tau / 1000, 0) + '</td><td class="num">' + fmt(K.rheology.viscosity(m, m.Tm, 1000), 0) + '</td><td class="num">' + m.Tnf + '</td><td class="num">' + m.TmRange[0] + '〜' + m.TmRange[1] + '</td><td class="num">' + m.TwRange[0] + '〜' + m.TwRange[1] + '</td></tr>';
    }).join('');
    return '<section class="fs-section fs-method"><h2>このシミュレーターの中身</h2>' +
      '<p>市販の流動解析ソフトの「2.5D（中立面）解析」と同じ枠組みを、学習用に簡潔にしたものです。製品を平面形状＋肉厚分布として扱い、各時刻でキャビティ内の圧力分布を解いて、流動先端を少しずつ前進させます。画面の3D図と断面図は、この平面形状と肉厚分布から立体を組み立てて描いたもので、厚み方向は見やすいように拡大しています（倍率は図中に表示）。</p>' +
      '<div class="grid cols-2">' +
      '<div class="card"><h3>1. 流れ：Hele-Shaw 近似</h3><p>肉厚が流動長に比べて十分薄い流れでは、厚さ方向に平均した流量が圧力勾配に比例します。</p><p class="fs-eq">q = −(h<sub>m</sub>³ / 12η) ∇p</p><p>溶融層の厚さ h<sub>m</sub> が<b>3乗</b>で効くため、肉厚が半分になると流れやすさは1/8。厚い部分を先回りする「レーストラッキング」や、薄い部分の「ためらい」はこの式から生まれます。</p></div>' +
      '<div class="card"><h3>2. 粘度：Cross-WLF モデル</h3><p>樹脂の粘度は、速く流すほど下がり（せん断流動化）、温度が下がると急上昇します。</p><p class="fs-eq">η = η₀(T) / (1 + (η₀ γ̇ / τ*)<sup>1−n</sup>)</p><p>η₀(T) は WLF 式で温度に依存。壁面せん断速度には Rabinowitsch 補正をかけています。</p></div>' +
      '<div class="card"><h3>3. 熱と固化層</h3><p>樹脂の温度は、上流からの移流、せん断発熱（流れの仕事＝Q·Δp）、金型への熱損失で決まります。金型に触れた外側は固化層となって育ち、流路を狭めます。固化層の成長は「壁へ逃げる熱」と「溶融コアから供給される熱」の収支で計算しています。</p></div>' +
      '<div class="card"><h3>4. ウェルド・エアトラップの判定</h3><p><b>ウェルド</b>：流動先端の進行方向が互いに向き合い、かつゲートからの経路がかなり上流まで遡らないと合流しない（＝別々の流れ）隣接セルの境界。<br><b>エアトラップ</b>：外周（パーティング面）にもベントにも通じていない未充填領域。閉じ込めた空気は断熱圧縮させて流動の背圧にしています。</p></div>' +
      '</div>' +
      '<h3>材料データ（Cross-WLF の代表値）</h3><div class="table-wrap"><table><thead><tr><th>材料</th><th class="num">n</th><th class="num">τ* [kPa]</th><th class="num">粘度 [Pa·s]<br><small>標準樹脂温度・1000 s⁻¹</small></th><th class="num">ノーフロー温度 [℃]</th><th class="num">樹脂温度 [℃]</th><th class="num">金型温度 [℃]</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="note warn"><span class="note-title">学習用モデルとしての限界</span>保圧・冷却・そり・繊維配向・結晶化の計算は含みません。圧縮性、厚さ方向の温度分布、ゲート近傍の3次元的な流れも簡略化しています。材料定数は汎用グレードを想定した代表値です。傾向をつかむためのツールとして使い、実際の金型設計では、材料メーカーの測定データを用いた専用の解析ソフトで確認してください。</div>' +
      '</section>';
  }

  /* ---------------- ページ組み立て ---------------- */
  function teardown() {
    var R = U.getR();
    if (!R) return;
    cancelAnimationFrame(R.raf); cancelAnimationFrame(R.playRaf); cancelAnimationFrame(R.sweepRaf);
    U.teardownViews();
    window.removeEventListener('resize', R.onResize);
    document.removeEventListener('kanagata:theme', R.onTheme);
    if (R.mq) R.mq.removeEventListener('change', R.onTheme);
    U.setR(null);
  }

  /* 演習の条件（モデル・材料・表示）を状態に読み込む */
  function prepareExercise(id) {
    var ex = U.EXERCISES.filter(function (e) { return e.id === id; })[0];
    if (!ex) return false;
    S.modelId = ex.model;
    if (ex.id === 'spiral') S.matId = 'PP';
    if (ex.id === 'window') S.matId = 'PP';
    U.applyModelDefaults(false);
    U.applyMaterialDefaults();
    S.view = 'fill'; S.mode = ex.id === 'trap' ? 'vent' : 'move';
    return true;
  }
  function loadExercise(id) {
    if (!prepareExercise(id)) return;
    onModelChanged();
    $('fsWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function onModelChanged() {
    var R = U.getR();
    U.stopPlay();
    R.pm = null; R.sim = null; R.res = null; R.iso = null; R.legendKey = null; R.cut = null; R.probe = null; R.probeK = null;
    $('fsTip').hidden = true; $('fsCutTip').hidden = true;
    $('fsResults').innerHTML = '';
    $('fsSweepOut').innerHTML = ''; $('fsSweepStatus').textContent = '';
    U.syncControls();
    U.setupCanvas();
    U.draw();
    U.startRun();
  }

  function bind() {
    var R = U.getR();
    $('fsModel').addEventListener('change', function (e) { S.modelId = e.target.value; U.applyModelDefaults(true); onModelChanged(); });
    $('fsMat').addEventListener('change', function (e) { S.matId = e.target.value; U.applyMaterialDefaults(); U.syncControls(); U.startRun(); $('fsSweepOut').innerHTML = ''; });
    [['fsTm', 'Tm'], ['fsTw', 'Tw'], ['fsFill', 'fillTime'], ['fsPmax', 'Pmax'], ['fsVP', 'vp']].forEach(function (p) {
      var el = $(p[0]);
      el.addEventListener('input', function () { $(p[0] + 'V').textContent = el._show(+el.value); });
      el.addEventListener('change', function () {
        S[p[1]] = +el.value;
        if (p[1] === 'Tm') U.syncControls();
        U.startRun();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fsViews .seg-btn'), function (b) {
      b.addEventListener('click', function () {
        S.view = b.getAttribute('data-view'); U.syncControls();
        var R2 = U.getR(); R2.legendKey = null;
        // 圧力は充填完了後（保圧中）には一様になるので、勾配が読み取れる V/P 切替の瞬間を表示する
        if (S.view === 'pressure' && R2.sim && R2.sim.done && R2.t >= R2.tEnd - 1e-9) {
          U.stopPlay(); R2.t = R2.res.vpT || R2.res.fillTime || R2.tEnd; U.setTimeUI();
        }
        U.draw();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fsModes .seg-btn'), function (b) {
      b.addEventListener('click', function () { S.mode = b.getAttribute('data-mode'); U.syncControls(); });
    });
    [['fsIso', 'iso'], ['fsWeld', 'weld'], ['fsTrap', 'trap']].forEach(function (p) {
      $(p[0]).addEventListener('change', function (e) { S[p[1]] = e.target.checked; U.getR().legendKey = null; U.draw(); });
    });
    $('fsPL').addEventListener('change', function (e) { S.plVent = e.target.checked; U.startRun(); });
    $('fsReset').addEventListener('click', function () { var m = U.model(); S.gates = m.gates.map(function (g) { return g.slice(); }); S.vents = []; U.startRun(); });
    $('fsRun').addEventListener('click', function () { U.startRun(); });
    $('fsPlay').addEventListener('click', U.togglePlay);
    $('fsSpeed').addEventListener('change', function (e) { S.speed = +e.target.value; });
    $('fsScrub').addEventListener('input', function (e) {
      var R2 = U.getR(); if (!R2 || !R2.sim || !R2.sim.done) return;
      U.stopPlay(); R2.t = +e.target.value / 1000 * R2.tEnd; U.setTimeUI(); U.draw();
    });
    var cvs = $('fsCanvas');
    cvs.addEventListener('click', U.onClick);
    cvs.addEventListener('pointermove', U.onHover);
    cvs.addEventListener('pointerleave', function () { $('fsTip').hidden = true; });
    $('fsSweep').addEventListener('click', runSweep);
    Array.prototype.forEach.call(document.querySelectorAll('.fs-ex'), function (b) {
      b.addEventListener('click', function () { loadExercise(b.getAttribute('data-ex')); });
    });
    U.bindViews();
    var rt = 0, lastW = 0;
    // 幅が変わったときだけ描き直す（スマートフォンでアドレスバーが出入りする高さの変化は無視）
    R.onResize = function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (!U.getR()) return;
        var w = $('fsWrap').clientWidth;
        if (w === lastW) return;
        lastW = w; U.setupCanvas(); U.draw();
      }, 150);
    };
    window.addEventListener('resize', R.onResize);
    R.onTheme = function () { var r = U.getR(); if (!r) return; r.legendKey = null; U.draw(); };
    document.addEventListener('kanagata:theme', R.onTheme);
    R.mq = window.matchMedia('(prefers-color-scheme: dark)');
    R.mq.addEventListener('change', R.onTheme);
  }

  /* exId を渡すと、その演習を読み込んだ状態で開く（例：#/flowsim/weld） */
  K.renderFlowSim = function (main, exId) {
    teardown();
    if (!(exId && prepareExercise(exId)) && S.gates == null) { U.applyModelDefaults(false); U.applyMaterialDefaults(); }
    U.setR({ t: 0 });
    main.innerHTML = U.template();
    U.init3D();
    bind();
    U.syncControls();
    U.setupCanvas();
    U.draw();
    U.startRun();
    K.pageCleanup = teardown;
  };

  U.renderResults = renderResults;
  U.method = method;
})(window.KANAGATA);
