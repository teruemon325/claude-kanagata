/* 樹脂流動シミュレーター：画面（描画・操作・結果の読み解き） */
(function (K) {
  'use strict';

  /* ---------------- 状態 ---------------- */
  var S = {
    modelId: 'holes', matId: 'PP', Tm: null, Tw: null, fillTime: null, Pmax: 150, vp: 98,
    gates: null, vents: [], plVent: true,
    view: 'fill', iso: true, weld: true, trap: true, mode: 'move', speed: 4
  };
  var R = null;             // 実行時オブジェクト（ページ離脱で破棄）
  var gridCache = {};

  var VIEWS = [
    { id: 'fill', label: '充填パターン', ramp: 'fill', unit: 's', name: '充填時刻' },
    { id: 'pressure', label: '圧力', ramp: 'pressure', unit: 'MPa', name: '圧力' },
    { id: 'temp', label: '樹脂温度', ramp: 'temp', unit: '℃', name: '樹脂温度（流動層）' },
    { id: 'frozen', label: '固化層', ramp: 'frozen', unit: '%', name: '固化層の割合（肉厚比）' },
    { id: 'thickness', label: '肉厚', ramp: 'thickness', unit: 'mm', name: '肉厚' }
  ];

  var EXERCISES = [
    { id: 'weld', title: 'ウェルドラインを動かす', model: 'holes', tag: 'ウェルド',
      text: '穴の後ろにできるウェルドライン。ゲートを上辺中央や右端に動かすと、位置と「合流したときの樹脂温度」がどう変わるか比べましょう。' },
    { id: 'trap', title: 'エアトラップを消す', model: 'lid', tag: 'エアトラップ',
      text: '厚肉リムを樹脂が先回りし、薄いパネル中央に空気が閉じ込められます。ゲートをパネル中央へ移すか、トラップ位置にベントを置いて消しましょう。' },
    { id: 'hesitation', title: 'ためらい現象を解決する', model: 'tabs', tag: 'ショート',
      text: 'ゲート近くの薄いツメが充填不足に。樹脂温度・射出時間・ゲート位置のうち、どれが一番効くか試しましょう。' },
    { id: 'runner', title: 'ランナーバランスを比べる', model: 'runner-fish', tag: '多数個取り',
      text: '直列ランナーでは近いキャビティが先に満ちます。モデルを「H型ランナー」に切り替え、充填完了時間の差と必要圧力を比べましょう。' },
    { id: 'spiral', title: '材料の流れやすさを比べる', model: 'spiral', tag: '材料',
      text: '同じ圧力で押したときに固まるまで流れる長さ（流動長）を、PP・ABS・PC・PA66・POMで比べましょう。樹脂温度を上げると？' },
    { id: 'window', title: '最適な射出時間を探す', model: 'plate', tag: '成形条件',
      text: '下の「成形ウィンドウ」で射出時間を振ると、必要圧力が最小になる速さが見つかります。材料をPCに変えると窓がどう狭くなるか確認しましょう。' }
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function fmt(v, d) { return (+v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function isDark() {
    var bg = getComputedStyle(document.body).backgroundColor, m = bg.match(/\d+/g);
    if (!m) return false;
    return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) < 110;
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function model() { return K.flowModelById(S.modelId); }
  function mat() { return K.materialById(S.matId); }
  function grid() {
    var m = model();
    if (!gridCache[m.id]) gridCache[m.id] = K.rasterizeModel(m);
    return gridCache[m.id];
  }
  function mmToCell(g, p) { return K.cellAt(g, p[0], p[1], 4); }
  function cellToMM(g, c) { var i = c % g.nx, j = (c - i) / g.nx; return [(i + 0.5) * g.cellMM - g.margin, (j + 0.5) * g.cellMM - g.margin]; }

  /* ---------------- 画面 ---------------- */
  function template() {
    var mOpts = K.flowModels.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('');
    var matOpts = K.materials.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name + '（' + m.full + '）') + '</option>'; }).join('');
    var views = VIEWS.map(function (v) { return '<button type="button" class="seg-btn" role="tab" data-view="' + v.id + '">' + v.label + '</button>'; }).join('');
    var ex = EXERCISES.map(function (e, i) {
      return '<button type="button" class="fs-ex" data-ex="' + e.id + '"><span class="fs-ex-no">演習 ' + (i + 1) + '</span>' +
        '<b>' + esc(e.title) + '</b><span class="fs-ex-text">' + esc(e.text) + '</span><span class="badge">' + esc(e.tag) + '</span></button>';
    }).join('');
    return '' +
      '<div class="page-head"><span class="eyebrow">射出成形 ｜ シミュレーター</span>' +
      '<h1>樹脂流動シミュレーター</h1>' +
      '<p class="lead">金型の中を溶けた樹脂がどう流れ、どこで合流し、どこに空気が残るのか。ゲート位置・材料・成形条件を変えながら、市販の流動解析（CAE）と同じ考え方で確かめられます。計算はすべてこのブラウザの中で行います。</p></div>' +

      '<section class="fs-main" aria-label="シミュレーター">' +
      '<div class="fs-stage">' +
      '<div class="fs-toolbar"><div class="seg" role="tablist" aria-label="表示する結果" id="fsViews">' + views + '</div>' +
      '<div class="fs-toggles">' +
      '<label><input type="checkbox" id="fsIso" checked> 等時間線</label>' +
      '<label><input type="checkbox" id="fsWeld" checked> ウェルド</label>' +
      '<label><input type="checkbox" id="fsTrap" checked> エアトラップ</label></div></div>' +
      '<div class="fs-canvas-wrap" id="fsWrap"><canvas id="fsCanvas" tabindex="0" aria-label="解析結果の図。矢印キーではなくクリックでゲートを配置します"></canvas>' +
      '<div class="fs-tip" id="fsTip" hidden></div>' +
      '<div class="fs-busy" id="fsBusy" hidden><span class="fs-spin" aria-hidden="true"></span><span id="fsBusyText">解析中</span></div></div>' +
      '<div class="fs-legend" id="fsLegend"></div>' +
      '<div class="fs-player">' +
      '<button type="button" class="btn" id="fsPlay" aria-label="充填の様子を再生">▶ 再生</button>' +
      '<input type="range" id="fsScrub" min="0" max="1000" value="1000" aria-label="表示する時刻">' +
      '<span class="fs-time" id="fsTime">—</span>' +
      '<select id="fsSpeed" aria-label="再生速度"><option value="8">ゆっくり</option><option value="4" selected>標準</option><option value="2">速い</option></select>' +
      '</div>' +
      '<p class="fs-hint" id="fsHint"></p>' +
      '</div>' +

      '<aside class="fs-panel" aria-label="解析条件">' +
      '<div class="fs-group"><label class="fs-label" for="fsModel">解析モデル</label><select id="fsModel">' + mOpts + '</select><p class="fs-desc" id="fsModelDesc"></p></div>' +
      '<div class="fs-group"><label class="fs-label" for="fsMat">樹脂材料</label><select id="fsMat">' + matOpts + '</select><p class="fs-desc" id="fsMatDesc"></p></div>' +
      '<div class="fs-group"><h3 class="fs-gh">成形条件</h3>' +
      slider('fsTm', '樹脂温度', '℃') + slider('fsTw', '金型温度', '℃') + slider('fsFill', '射出時間（目標）', 's') +
      slider('fsPmax', '射出圧力の上限', 'MPa') + slider('fsVP', 'V/P切替（充填率）', '%') + '</div>' +
      '<div class="fs-group"><h3 class="fs-gh">ゲート・ベント</h3>' +
      '<div class="seg seg-sm" id="fsModes" role="radiogroup" aria-label="クリックしたときの操作">' +
      '<button type="button" class="seg-btn" data-mode="move" role="radio">ゲート移動</button>' +
      '<button type="button" class="seg-btn" data-mode="add" role="radio">ゲート追加</button>' +
      '<button type="button" class="seg-btn" data-mode="vent" role="radio">ベント</button></div>' +
      '<label class="fs-check"><input type="checkbox" id="fsPL" checked> 外周（パーティング面）から空気が抜ける</label>' +
      '<button type="button" class="btn fs-reset" id="fsReset">ゲート・ベントを初期配置に戻す</button></div>' +
      '<button type="button" class="btn primary fs-run" id="fsRun">解析を実行</button>' +
      '</aside></section>' +

      '<section class="fs-results" id="fsResults" aria-live="polite"></section>' +

      '<section class="fs-section"><h2>演習</h2><p class="fs-sub">クリックするとモデルと条件が読み込まれます。結果の「所見」を読みながら、どの操作が何に効くのかを確かめてください。</p>' +
      '<div class="fs-ex-grid">' + ex + '</div></section>' +

      '<section class="fs-section" id="fsSweepSec"><h2>成形ウィンドウ：射出時間と必要圧力</h2>' +
      '<p class="fs-sub">同じモデル・材料・温度のまま射出時間だけを8通りに振って、充填に必要な圧力を比べます。速すぎると流速が上がって粘性抵抗で圧力が上がり、遅すぎると流れている間に固化層が育って流路が狭まり、やはり圧力が上がります。その間の「谷」が狙うべき条件です。（計算を速くするため、格子を2倍に粗くしています）</p>' +
      '<div class="btn-row"><button type="button" class="btn" id="fsSweep">成形ウィンドウを計算する</button><span class="fs-sweep-status" id="fsSweepStatus"></span></div>' +
      '<div id="fsSweepOut"></div></section>' +

      K._flowUI.method();
  }
  function slider(id, label, unit) {
    return '<div class="fs-slider"><label for="' + id + '">' + label + '</label><output id="' + id + 'V" for="' + id + '"></output>' +
      '<input type="range" id="' + id + '" aria-describedby="' + id + 'V"><span class="fs-unit" hidden>' + unit + '</span></div>';
  }

  /* ---------------- 条件の反映 ---------------- */
  function applyModelDefaults(keepMaterial) {
    var m = model(), mt = mat();
    S.gates = m.gates.map(function (g) { return g.slice(); });
    S.vents = [];
    S.fillTime = m.fillTime;
    S.Pmax = m.defaultPmax || 150;
    S.vp = m.pressureTest ? 100 : 98;
    if (!keepMaterial || S.Tm == null) { S.Tm = mt.Tm; S.Tw = mt.Tw; }
  }
  function applyMaterialDefaults() { var mt = mat(); S.Tm = mt.Tm; S.Tw = mt.Tw; }

  function syncControls() {
    var m = model(), mt = mat();
    $('fsModel').value = S.modelId; $('fsMat').value = S.matId;
    $('fsModelDesc').textContent = m.desc;
    var e1000 = K.rheology.viscosity(mt, S.Tm, 1000);
    $('fsMatDesc').innerHTML = esc(mt.kind + '。' + mt.note) + '<br><span class="fs-mini">粘度 ' + fmt(e1000, 0) + ' Pa·s（' + S.Tm + '℃・せん断速度1000 s⁻¹）／ノーフロー温度 ' + mt.Tnf + '℃</span>';
    setSlider('fsTm', S.Tm, mt.TmRange[0], mt.TmRange[1], 5, function (v) { return v + ' ℃'; });
    setSlider('fsTw', S.Tw, mt.TwRange[0], mt.TwRange[1], 5, function (v) { return v + ' ℃'; });
    setSlider('fsFill', S.fillTime, 0.1, 6, 0.05, function (v) { return fmt(v, 2) + ' s'; });
    setSlider('fsPmax', S.Pmax, 40, 250, 5, function (v) { return v + ' MPa'; });
    setSlider('fsVP', S.vp, 90, 100, 1, function (v) { return v + ' %'; });
    $('fsFill').disabled = false;
    Array.prototype.forEach.call(document.querySelectorAll('#fsViews .seg-btn'), function (b) {
      var on = b.getAttribute('data-view') === S.view;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fsModes .seg-btn'), function (b) {
      var on = b.getAttribute('data-mode') === S.mode;
      b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('fsPL').checked = S.plVent;
    $('fsIso').checked = S.iso; $('fsWeld').checked = S.weld; $('fsTrap').checked = S.trap;
    $('fsHint').textContent = {
      move: 'キャビティ（製品部）をクリックすると、そこへゲートを移動して再解析します。',
      add: 'クリックでゲートを追加します（最大3点）。複数のゲートは同じ圧力の溶融樹脂でつながっている（ホットランナー相当）とみなします。',
      vent: 'クリックでベント（空気の逃げ道）を追加し、もう一度クリックすると取り除きます。エアトラップの位置に置いてみましょう。'
    }[S.mode];
    $('fsSweepSec').hidden = !!m.pressureTest;
  }
  function setSlider(id, val, min, max, step, show) {
    var el = $(id);
    el.min = min; el.max = max; el.step = step; el.value = val;
    $(id + 'V').textContent = show(val);
    el._show = show;
  }

  /* ---------------- キャンバス ---------------- */
  function setupCanvas() {
    var g = grid(), wrap = $('fsWrap'), cvs = $('fsCanvas');
    var maxW = wrap.clientWidth || 600;
    var aspect = g.ny / g.nx;
    var maxH = Math.max(300, Math.min(620, window.innerHeight * 0.72));
    var cssW = Math.min(maxW, maxH / aspect), cssH = cssW * aspect;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cvs.style.width = cssW + 'px'; cvs.style.height = cssH + 'px';
    cvs.width = Math.round(cssW * dpr); cvs.height = Math.round(cssH * dpr);
    R.cssW = cssW; R.cssH = cssH; R.dpr = dpr; R.scale = cssW / g.nx;
    var Sx = Math.max(3, Math.min(8, Math.round(cssW * dpr / g.nx)));
    if (!R.pm || R.pm.S !== Sx || R.pm.model !== g.model.id) buildPixelMap(Sx);
  }
  /* 表示用の高解像度マスクと、各画素の補間に使うセル・重みを前計算 */
  function buildPixelMap(Sx) {
    var g = grid(), m = g.model, W = g.nx * Sx, H = g.ny * Sx, n = W * H;
    var mask = new Uint8Array(n), c00 = new Int32Array(n), fx = new Float32Array(n), fy = new Float32Array(n), th = new Float32Array(n);
    for (var py = 0; py < H; py++) {
      var v = (py + 0.5) / Sx, ymm = v * g.cellMM - g.margin, vv = v - 0.5, j0 = Math.max(0, Math.min(g.ny - 2, Math.floor(vv)));
      for (var px = 0; px < W; px++) {
        var u = (px + 0.5) / Sx, p = py * W + px;
        var t = m.thick(u * g.cellMM - g.margin, ymm);
        if (!(t > 0)) continue;
        mask[p] = 1; th[p] = t;
        var uu = u - 0.5, i0 = Math.max(0, Math.min(g.nx - 2, Math.floor(uu)));
        c00[p] = j0 * g.nx + i0; fx[p] = uu - i0; fy[p] = vv - j0;
      }
    }
    // 肉厚が変わる境界（段差）の画素：図に薄い線で示す
    var edge = new Uint8Array(n);
    for (py = 1; py < H - 1; py++) for (px = 1; px < W - 1; px++) {
      p = py * W + px;
      if (!mask[p]) continue;
      var t0 = th[p];
      if ((mask[p + 1] && Math.abs(th[p + 1] - t0) > 0.05) || (mask[p + W] && Math.abs(th[p + W] - t0) > 0.05)) edge[p] = 1;
    }
    var off = document.createElement('canvas'); off.width = W; off.height = H;
    var octx = off.getContext('2d');
    var tmin = Infinity, tmax = 0;
    for (var k = 0; k < g.h.length; k++) if (g.h[k] > 0) { tmin = Math.min(tmin, g.h[k] * 1e3); tmax = Math.max(tmax, g.h[k] * 1e3); }
    R.pm = { S: Sx, W: W, H: H, mask: mask, edge: edge, c00: c00, fx: fx, fy: fy, th: th, off: off, octx: octx, img: octx.createImageData(W, H), model: m.id, tmin: tmin, tmax: tmax };
  }

  /* 時刻 t における各セルの値（表示用）を用意 */
  function cellFields(t) {
    var g = grid(), n = g.nx * g.ny, sim = R.sim, view = S.view;
    if (!R.cf || R.cf.n !== n) R.cf = { n: n, fill: new Float32Array(n), val: new Float32Array(n), ok: new Uint8Array(n) };
    var cf = R.cf, k, c, cav = sim ? sim.cav : null;
    var live = sim && !sim.done;
    cf.mode = live ? 'F' : 'T';
    cf.ok.fill(0);
    if (!sim) return cf;
    if (live) {
      var F = sim.F, h = g.h, nx = g.nx;
      for (k = 0; k < cav.length; k++) {
        c = cav[k];
        var sF = 4 * F[c], sw = 4;
        if (h[c + 1] > 0) { sF += F[c + 1]; sw++; } if (h[c - 1] > 0) { sF += F[c - 1]; sw++; }
        if (h[c + nx] > 0) { sF += F[c + nx]; sw++; } if (h[c - nx] > 0) { sF += F[c - nx]; sw++; }
        cf.fill[c] = F[c] >= 1 ? 1 : sF / sw;
        if (sim.F[c] <= 0) continue;
        cf.ok[c] = 1;
        cf.val[c] = view === 'fill' ? (isFinite(sim.tFill[c]) ? sim.tFill[c] : sim.t)
          : view === 'pressure' ? sim.p[c] / 1e6 : view === 'temp' ? sim.T[c] : 2 * sim.dl[c] / sim.h[c] * 100;
      }
      return cf;
    }
    var tEnd = sim.t, big = tEnd * 1.4 + 0.01, snap = sim.snapshotAt(t);
    for (k = 0; k < cav.length; k++) {
      c = cav[k];
      var tf = sim.tFill[c];
      cf.fill[c] = isFinite(tf) ? tf : (sim.F[c] > 0.5 ? tEnd : big);
      if (view === 'fill') { if (isFinite(tf) && tf <= t) { cf.ok[c] = 1; cf.val[c] = tf; } continue; }
      if (!snap || !(snap.F[k] > 0)) continue;
      cf.ok[c] = 1;
      cf.val[c] = view === 'pressure' ? snap.p[k] / 1e6 : view === 'temp' ? snap.T[k] : snap.fz[k] / 255 * 100;
    }
    return cf;
  }

  function viewRange() {
    var sim = R.sim, mt = mat(), v = S.view;
    if (v === 'fill') {
      if (!sim) return [0, 1];
      if (!sim.done) return [0, Math.max(1e-3, sim.t)];
      if (R.tfMax == null) { var mx = 0; for (var k = 0; k < sim.cav.length; k++) { var tf = sim.tFill[sim.cav[k]]; if (isFinite(tf) && tf > mx) mx = tf; } R.tfMax = mx; }
      return [0, Math.max(1e-3, R.tfMax)];
    }
    if (v === 'pressure') { var pm = 0; if (sim) sim.hist.P.forEach(function (x) { if (x > pm) pm = x; }); return [0, Math.max(0.5, pm / 1e6)]; }
    if (v === 'temp') return [mt.Tnf, S.Tm + 10];
    if (v === 'frozen') {
      if (!sim || !sim.done) return [0, 100];
      if (R.fzMax == null) {
        var fm = 0; sim.snaps.forEach(function (sn) { for (var q = 0; q < sn.fz.length; q++) if (sn.fz[q] > fm) fm = sn.fz[q]; });
        R.fzMax = Math.min(100, Math.max(10, Math.ceil(fm / 255 * 100 / 10) * 10));
      }
      return [0, R.fzMax];
    }
    return [R.pm.tmin, R.pm.tmax];
  }

  function draw() {
    if (!R || !R.pm) return;
    var g = grid(), pm = R.pm, img = pm.img.data, dark = isDark();
    var t = R.t, cf = cellFields(t), view = S.view;
    var vr = viewRange(), v0 = vr[0], span = vr[1] - vr[0] || 1;
    var lut = K.colormap.ramp(VIEWS.filter(function (x) { return x.id === view; })[0].ramp, dark).lut;
    var steel = dark ? [43, 53, 65] : [205, 212, 221], empty = dark ? [22, 29, 37] : [246, 248, 251];
    var h = g.h, nx = g.nx, fillArr = cf.fill, val = cf.ok, V = cf.val, isF = cf.mode === 'F';
    var hasSim = !!R.sim, pmW = pm.W;
    // ショートショットの未充填部は斜線でも示す（色だけに頼らない）
    var hatch = hasSim && R.sim.done && R.sim.status === 'short' && S.view !== 'thickness' && R.t >= R.tEnd - 1e-9;
    var hcol = dark ? [58, 70, 84] : [214, 220, 228], edgeC = dark ? 230 : 20;
    for (var p = 0, n = pm.W * pm.H; p < n; p++) {
      var o = p * 4;
      if (!pm.mask[p]) { img[o] = steel[0]; img[o + 1] = steel[1]; img[o + 2] = steel[2]; img[o + 3] = 255; continue; }
      var col = empty, idx = -1;
      if (view === 'thickness') {
        idx = Math.round(Math.max(0, Math.min(1, (pm.th[p] - v0) / span)) * 255);
      } else if (hasSim) {
        var c = pm.c00[p], a = pm.fx[p], b = pm.fy[p];
        var w0 = (1 - a) * (1 - b), w1 = a * (1 - b), w2 = (1 - a) * b, w3 = a * b;
        var c1 = c + 1, c2 = c + nx, c3 = c + nx + 1;
        if (!(h[c] > 0)) w0 = 0; if (!(h[c1] > 0)) w1 = 0; if (!(h[c2] > 0)) w2 = 0; if (!(h[c3] > 0)) w3 = 0;
        var ws = w0 + w1 + w2 + w3;
        if (ws > 0) {
          var fv = (w0 * fillArr[c] + w1 * fillArr[c1] + w2 * fillArr[c2] + w3 * fillArr[c3]) / ws;
          var filled = isF ? fv >= 0.5 : fv <= t;
          if (filled) {
            var u0 = val[c] ? w0 : 0, u1 = val[c1] ? w1 : 0, u2 = val[c2] ? w2 : 0, u3 = val[c3] ? w3 : 0, us = u0 + u1 + u2 + u3;
            var x = us > 0 ? (u0 * V[c] + u1 * V[c1] + u2 * V[c2] + u3 * V[c3]) / us : v0;
            idx = Math.round(Math.max(0, Math.min(1, (x - v0) / span)) * 255);
          }
        }
      }
      if (idx >= 0) { img[o] = lut[idx * 3]; img[o + 1] = lut[idx * 3 + 1]; img[o + 2] = lut[idx * 3 + 2]; }
      else if (hatch && ((p % pmW) + ((p / pmW) | 0)) % 9 < 2) { img[o] = hcol[0]; img[o + 1] = hcol[1]; img[o + 2] = hcol[2]; }
      else { img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; }
      if (pm.edge[p] && view !== 'thickness') { img[o] = img[o] * 0.72 + edgeC * 0.28; img[o + 1] = img[o + 1] * 0.72 + edgeC * 0.28; img[o + 2] = img[o + 2] * 0.72 + edgeC * 0.28; }
      img[o + 3] = 255;
    }
    pm.octx.putImageData(pm.img, 0, 0);
    var ctx = $('fsCanvas').getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pm.off, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    drawOverlays(ctx, dark);
    drawLegend(dark, vr);
  }

  function drawOverlays(ctx, dark) {
    var g = grid(), sc = R.scale, sim = R.sim, t = R.t, done = sim && sim.done;
    var ink = dark ? 'rgba(236,241,247,' : 'rgba(18,26,36,';
    // 等時間線
    if (S.iso && done && R.iso && S.view !== 'thickness') {
      ctx.lineWidth = 1; ctx.strokeStyle = ink + (S.view === 'fill' ? '0.45)' : '0.28)');
      ctx.beginPath();
      R.iso.forEach(function (lv) {
        if (lv.level > t) return;
        var s = lv.segs;
        for (var k = 0; k < s.length; k += 4) { ctx.moveTo((s[k] + 0.5) * sc, (s[k + 1] + 0.5) * sc); ctx.lineTo((s[k + 2] + 0.5) * sc, (s[k + 3] + 0.5) * sc); }
      });
      ctx.stroke();
    }
    // ウェルドライン
    if (S.weld && done && R.res && S.view !== 'thickness') {
      R.res.welds.forEach(function (w) {
        if (w.t > t + 1e-9) return;
        var pts = (w.path || []).filter(function (p) { return p[2] <= t + 1e-9; });
        if (pts.length < 2) return;
        [[dark ? 'rgba(18,24,31,0.9)' : 'rgba(255,255,255,0.95)', 6], [w.kind === 'weld' ? ink + '0.95)' : ink + '0.75)', 2.6]].forEach(function (st, pass) {
          ctx.strokeStyle = st[0]; ctx.lineWidth = st[1]; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          if (w.kind === 'meld' && pass === 1) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
          ctx.beginPath();
          pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0] * sc, p[1] * sc); else ctx.moveTo(p[0] * sc, p[1] * sc); });
          ctx.stroke();
        });
        ctx.setLineDash([]);
      });
    }
    // エアトラップ
    if (S.trap && done && R.res && S.view !== 'thickness') {
      R.res.traps.forEach(function (tr) {
        if (tr.born > t + 1e-9) return;
        var x = (tr.cx + 0.5) * sc, y = (tr.cy + 0.5) * sc;
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = dark ? 'rgba(18,24,31,0.85)' : 'rgba(255,255,255,0.9)'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = '#d03b3b'; ctx.stroke();
        ctx.fillStyle = '#d03b3b'; ctx.font = '700 13px ' + cssVar('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', x, y + 0.5);
      });
    }
    // ベント
    S.vents.forEach(function (v) {
      var c = mmToCell(g, v); if (c < 0) return;
      var i = c % g.nx, j = (c - i) / g.nx, x = (i + 0.5) * sc, y = (j + 0.5) * sc;
      ctx.fillStyle = dark ? '#6ee7a8' : '#1e6f42';
      ctx.strokeStyle = dark ? 'rgba(18,24,31,0.9)' : '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(x - 6, y - 6, 12, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark ? '#12181f' : '#fff'; ctx.font = '700 9px ' + cssVar('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('V', x, y + 0.5);
    });
    // ゲート
    (S.gates || []).forEach(function (gp, gi) {
      var c = mmToCell(g, gp); if (c < 0) return;
      var i = c % g.nx, j = (c - i) / g.nx, x = (i + 0.5) * sc, y = (j + 0.5) * sc;
      ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.lineTo(x - 8, y - 6); ctx.lineTo(x + 8, y - 6); ctx.closePath();
      ctx.fillStyle = cssVar('--accent'); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = dark ? '#12181f' : '#fff'; ctx.stroke();
      ctx.fillStyle = dark ? '#12181f' : '#fff'; ctx.font = '700 9px ' + cssVar('--font'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('G', x, y - 1.5);
    });
    // スパイラルの流動長
    if (done && R.res && R.res.flowLength > 0 && S.view !== 'thickness') {
      var fc = R.flowTipCell;
      if (fc >= 0) {
        var ii = fc % g.nx, jj = (fc - ii) / g.nx, fx = (ii + 0.5) * sc, fy = (jj + 0.5) * sc;
        var label = '流動長 ' + fmt(R.res.flowLength, 0) + ' mm';
        ctx.font = '700 12px ' + cssVar('--font');
        var tw = ctx.measureText(label).width + 12, bx = Math.min(Math.max(4, fx - tw / 2), R.cssW - tw - 4), by = Math.max(4, fy - 30);
        ctx.fillStyle = dark ? 'rgba(18,24,31,0.92)' : 'rgba(255,255,255,0.95)';
        ctx.fillRect(bx, by, tw, 20);
        ctx.fillStyle = dark ? '#e6ecf3' : '#1b2430'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 6, by + 10.5);
      }
    }
  }

  function drawLegend(dark, vr) {
    var v = VIEWS.filter(function (x) { return x.id === S.view; })[0];
    var d = S.view === 'fill' || S.view === 'thickness' ? 2 : (S.view === 'pressure' ? 1 : 0);
    var key = S.view + dark + vr[0].toFixed(3) + vr[1].toFixed(3) + S.iso + S.weld + S.trap + (R.res ? 1 : 0);
    if (R.legendKey === key) return;
    R.legendKey = key;
    var extra = '';
    if (S.view !== 'thickness') {
      if (S.iso && R.iso && R.isoStep) extra += '<span class="fs-key"><i class="k-iso"></i>等時間線（' + fmt(R.isoStep, R.isoStep < 0.1 ? 2 : 1) + ' s ごと）</span>';
      if (S.weld) extra += '<span class="fs-key"><i class="k-weld"></i>ウェルド</span><span class="fs-key"><i class="k-meld"></i>メルド</span>';
      if (S.trap) extra += '<span class="fs-key"><i class="k-trap">!</i>エアトラップ</span>';
    }
    extra += '<span class="fs-key"><i class="k-gate"></i>ゲート</span>';
    if (S.vents.length) extra += '<span class="fs-key"><i class="k-vent">V</i>ベント</span>';
    $('fsLegend').innerHTML =
      '<div class="fs-scale"><span class="fs-scale-name">' + esc(v.name) + '</span>' +
      '<span class="fs-scale-min">' + fmt(vr[0], d) + '</span>' +
      '<span class="fs-bar" style="background:' + K.colormap.gradientCSS(v.ramp, dark) + '"></span>' +
      '<span class="fs-scale-max">' + fmt(vr[1], d) + ' ' + v.unit + '</span></div>' +
      '<div class="fs-keys">' + extra + '</div>';
  }

  /* 等時間線（マーチングスクエア） */
  function buildIsolines() {
    var sim = R.sim, g = grid(), nx = g.nx, ny = g.ny, tEnd = sim.fillEndT || sim.t;
    // 離散化によるゆらぎを消すため、充填済みセルだけで 3×3 平滑化してから等値線を引く
    var raw = sim.tFill, tF = new Float64Array(raw.length).fill(Infinity), Wt = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (var jj = 1; jj < ny - 1; jj++) for (var ii = 1; ii < nx - 1; ii++) {
      var cc = jj * nx + ii; if (!isFinite(raw[cc])) continue;
      var sum = 0, sw = 0, q = 0;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++, q++) { var bb = cc + dj * nx + di; if (isFinite(raw[bb])) { sum += Wt[q] * raw[bb]; sw += Wt[q]; } }
      tF[cc] = sum / sw;
    }
    var step = K.charts.niceStep(tEnd, 12), levels = [];
    for (var L = step; L < tEnd; L += step) levels.push(L);
    R.isoStep = step;
    R.iso = levels.map(function (L) {
      var segs = [];
      for (var j = 0; j < ny - 1; j++) for (var i = 0; i < nx - 1; i++) {
        var c = j * nx + i, a = tF[c], b = tF[c + 1], d = tF[c + nx + 1], e = tF[c + nx];
        if (!(isFinite(a) && isFinite(b) && isFinite(d) && isFinite(e))) continue;
        var code = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (d > L ? 4 : 0) | (e > L ? 8 : 0);
        if (code === 0 || code === 15) continue;
        var pts = [];
        function edge(v1, v2, x1, y1, x2, y2) { var f = (L - v1) / (v2 - v1); pts.push(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f); }
        if ((a > L) !== (b > L)) edge(a, b, i, j, i + 1, j);
        if ((b > L) !== (d > L)) edge(b, d, i + 1, j, i + 1, j + 1);
        if ((d > L) !== (e > L)) edge(d, e, i + 1, j + 1, i, j + 1);
        if ((e > L) !== (a > L)) edge(e, a, i, j + 1, i, j);
        for (var q = 0; q + 3 < pts.length; q += 4) segs.push(pts[q], pts[q + 1], pts[q + 2], pts[q + 3]);
      }
      return { level: L, segs: segs };
    });
  }

  /* ---------------- 解析の実行 ---------------- */
  function startRun() {
    if (!R) return;
    cancelAnimationFrame(R.raf); R.raf = 0; stopPlay();
    var g = grid(), m = model(), mt = mat();
    var gates = [];
    (S.gates || []).forEach(function (p) { var c = mmToCell(g, p); if (c >= 0 && gates.indexOf(c) < 0) gates.push(c); });
    if (!gates.length) { gates = [mmToCell(g, m.gates[0])]; S.gates = [m.gates[0].slice()]; }
    var vents = S.vents.map(function (p) { return mmToCell(g, p); }).filter(function (c) { return c >= 0; });
    R.sim = new K.FlowSim(g, mt, {
      Tm: S.Tm, Tw: S.Tw, fillTime: S.fillTime, Pmax: S.Pmax * 1e6, vp: S.vp / 100,
      gates: gates, vents: vents, perimeterVents: S.plVent, advance: m.advance
    });
    R.res = null; R.iso = null; R.flowTipCell = -1; R.legendKey = null; R.tfMax = null; R.fzMax = null;
    R.t = 0;
    $('fsBusy').hidden = false;
    $('fsRun').disabled = true;
    $('fsPlay').disabled = true; $('fsScrub').disabled = true;
    var t0 = performance.now(), lastDraw = 0;
    function tick() {
      if (!R || !R.sim) return;
      var sim = R.sim;
      sim.run(24);
      R.t = sim.t;
      var now = performance.now();
      if (now - lastDraw > 45 || sim.done) {          // 描画は間引いて計算に時間を回す
        lastDraw = now;
        var fr = sim.hist.filled.length ? sim.hist.filled[sim.hist.filled.length - 1] : 0;
        $('fsBusyText').textContent = '解析中　充填 ' + fmt(fr * 100, 0) + '%　t = ' + fmt(sim.t, 2) + ' s';
        $('fsTime').textContent = fmt(sim.t, 2) + ' s';
        draw();
      }
      if (!sim.done) { R.raf = requestAnimationFrame(tick); return; }
      R.elapsed = performance.now() - t0;
      finishRun();
    }
    R.raf = requestAnimationFrame(tick);
  }

  /* ウェルドの線分群を、主軸方向に並べた滑らかな折れ線にする */
  function weldPaths(welds) {
    welds.forEach(function (w) {
      var pts = w.segs.map(function (s) { return [s.mx, s.my, s.t]; });
      var mx = 0, my = 0; pts.forEach(function (p) { mx += p[0]; my += p[1]; }); mx /= pts.length; my /= pts.length;
      var sxx = 0, sxy = 0, syy = 0;
      pts.forEach(function (p) { var dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; });
      var ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
      pts.forEach(function (p) { p.push((p[0] - mx) * ux + (p[1] - my) * uy); });
      pts.sort(function (a, b) { return a[3] - b[3]; });
      // 主軸方向に 0.8 セル間隔でまとめ、垂直方向は平均して 1 本にする
      var bins = [], cur = null;
      pts.forEach(function (p) {
        if (!cur || p[3] - cur.s0 > 0.8) { cur = { s0: p[3], x: 0, y: 0, n: 0, t: 0 }; bins.push(cur); }
        cur.x += p[0]; cur.y += p[1]; cur.n++; cur.t = Math.max(cur.t, p[2]);
      });
      var path = bins.map(function (b) { return [b.x / b.n, b.y / b.n, b.t]; });
      // 移動平均で軽くならす
      w.path = path.map(function (p, i) {
        if (i === 0 || i === path.length - 1) return p;
        return [(path[i - 1][0] + 2 * p[0] + path[i + 1][0]) / 4, (path[i - 1][1] + 2 * p[1] + path[i + 1][1]) / 4, p[2]];
      });
    });
  }

  function finishRun() {
    var sim = R.sim, g = grid();
    R.res = sim.result;
    weldPaths(R.res.welds);
    buildIsolines();
    if (R.res.flowLength > 0) {
      var best = -1, bl = -1;
      for (var k = 0; k < sim.cav.length; k++) { var c = sim.cav[k]; if (sim.F[c] > 0.5 && g.arc[c] > bl) { bl = g.arc[c]; best = c; } }
      R.flowTipCell = best;
    }
    R.tEnd = sim.t;
    R.t = sim.t;
    $('fsBusy').hidden = true;
    $('fsRun').disabled = false;
    $('fsPlay').disabled = false; $('fsScrub').disabled = false;
    $('fsScrub').value = 1000;
    $('fsTime').textContent = fmt(R.t, 2) + ' / ' + fmt(R.tEnd, 2) + ' s';
    R.legendKey = null;
    draw();
    K._flowUI.renderResults();
  }

  /* ---------------- 再生 ---------------- */
  function togglePlay() {
    if (!R || !R.sim || !R.sim.done) return;
    if (R.playing) { stopPlay(); return; }
    if (R.t >= R.tEnd - 1e-9) R.t = 0;
    R.playing = true; R.last = performance.now();
    $('fsPlay').textContent = '❚❚ 停止'; $('fsPlay').setAttribute('aria-label', '再生を止める');
    function step(now) {
      if (!R || !R.playing) return;
      var dtReal = (now - R.last) / 1000; R.last = now;
      R.t = Math.min(R.tEnd, R.t + dtReal * R.tEnd / S.speed);
      setTimeUI(); draw();
      if (R.t >= R.tEnd) { stopPlay(); return; }
      R.playRaf = requestAnimationFrame(step);
    }
    R.playRaf = requestAnimationFrame(step);
  }
  function stopPlay() {
    if (!R) return;
    R.playing = false; cancelAnimationFrame(R.playRaf);
    var b = $('fsPlay'); if (b) { b.textContent = '▶ 再生'; b.setAttribute('aria-label', '充填の様子を再生'); }
  }
  function setTimeUI() {
    $('fsScrub').value = Math.round(R.t / R.tEnd * 1000);
    $('fsTime').textContent = fmt(R.t, 2) + ' / ' + fmt(R.tEnd, 2) + ' s';
    (R.charts || []).forEach(function (ch) { ch.setPlayhead(R.t); });
  }

  /* ---------------- マウス操作 ---------------- */
  function eventCell(e) {
    var r = $('fsCanvas').getBoundingClientRect(), g = grid();
    var x = (e.clientX - r.left) / r.width * g.nx, y = (e.clientY - r.top) / r.height * g.ny;
    return { u: x, v: y, mm: [x * g.cellMM - g.margin, y * g.cellMM - g.margin], c: Math.floor(y) * g.nx + Math.floor(x) };
  }
  function onClick(e) {
    var g = grid(), p = eventCell(e), c = K.cellAt(g, p.mm[0], p.mm[1], 3);
    if (c < 0) return;
    var mm = cellToMM(g, c);
    if (S.mode === 'move') S.gates = [mm];
    else if (S.mode === 'add') { S.gates = (S.gates || []).concat([mm]).slice(-3); }
    else {
      var hit = -1;
      S.vents.forEach(function (v, i) { if (Math.abs(v[0] - mm[0]) + Math.abs(v[1] - mm[1]) < 5) hit = i; });
      if (hit >= 0) S.vents.splice(hit, 1); else if (S.vents.length < 6) S.vents.push(mm);
    }
    startRun();
  }
  function onHover(e) {
    var tip = $('fsTip'), g = grid(), p = eventCell(e), c = p.c;
    if (!(c >= 0 && c < g.h.length && g.h[c] > 0)) { tip.hidden = true; return; }
    var sim = R.sim, rows = [['位置', fmt(p.mm[0], 0) + ', ' + fmt(p.mm[1], 0) + ' mm'], ['肉厚', fmt(g.h[c] * 1e3, 1) + ' mm']];
    if (sim) {
      var tf = sim.tFill[c], filled = sim.done ? (isFinite(tf) && tf <= R.t + 1e-9) : sim.F[c] >= 0.999;
      if (sim.done) {
        var snap = sim.snapshotAt(R.t), k = cavIndex(c);
        rows.push(['充填時刻', isFinite(tf) ? fmt(tf, 3) + ' s' : '未充填']);
        if (filled && snap && k >= 0) {
          rows.push(['圧力', fmt(snap.p[k] / 1e6, 1) + ' MPa']);
          rows.push(['樹脂温度', fmt(snap.T[k], 0) + ' ℃']);
          rows.push(['固化層', fmt(snap.fz[k] / 255 * 100, 0) + ' %']);
        }
      } else if (sim.F[c] > 0) {
        rows.push(['圧力', fmt(sim.p[c] / 1e6, 1) + ' MPa'], ['樹脂温度', fmt(sim.T[c], 0) + ' ℃']);
      }
    }
    tip.innerHTML = rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
    tip.hidden = false;
    var wr = $('fsWrap').getBoundingClientRect();
    var x = e.clientX - wr.left + 14, y = e.clientY - wr.top + 14;
    if (x + tip.offsetWidth > wr.width - 4) x = e.clientX - wr.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > wr.height - 4) y = e.clientY - wr.top - tip.offsetHeight - 14;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function cavIndex(c) {
    var cav = R.sim.cav, lo = 0, hi = cav.length - 1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (cav[mid] === c) return mid; if (cav[mid] < c) lo = mid + 1; else hi = mid - 1; }
    return -1;
  }

  K._flowUI = { S: S, VIEWS: VIEWS, EXERCISES: EXERCISES, template: template, syncControls: syncControls, setupCanvas: setupCanvas,
    draw: draw, startRun: startRun, togglePlay: togglePlay, stopPlay: stopPlay, setTimeUI: setTimeUI, onClick: onClick, onHover: onHover,
    applyModelDefaults: applyModelDefaults, applyMaterialDefaults: applyMaterialDefaults, getR: function () { return R; }, setR: function (r) { R = r; },
    model: model, mat: mat, grid: grid, fmt: fmt, esc: esc, $: $, isDark: isDark, cellToMM: cellToMM, mmToCell: mmToCell };
})(window.KANAGATA);
