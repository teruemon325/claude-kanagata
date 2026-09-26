/* 樹脂流動シミュレーター：3D 表示と断面図（A–A）
 *
 * 3D：K.View3D（WebGL）のメッシュ頂点に、解析格子の値を双線形補間して渡す。
 *     充填の判定（いつ樹脂が来たか）と色づけの値を別々に持たせ、再生中は時刻だけを変える。
 * 断面図：平面図上の切断線に沿って、金型（鋼材）・キャビティ・流れ込んだ樹脂・固化層を
 *     製図の断面図のように描く。厚さ方向は読み取れるように拡大し、倍率を明記する。
 */
(function (K) {
  'use strict';
  var U = K._flowUI, S = U.S, $ = U.$, fmt = U.fmt;

  var CAMS = [['oblique', '斜め'], ['top', '真上'], ['front', '正面'], ['side', '右側面']];
  var NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50];

  function viewDef() { return U.VIEWS.filter(function (v) { return v.id === S.view; })[0]; }
  function rgbOf(css) { var m = String(css).match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [238, 241, 245]; }
  function font(w, px) { return w + ' ' + px + 'px ' + U.cssVar('--font'); }
  function cutLen(m) { return S.cutDir === 'x' ? m.size[0] : m.size[1]; }        // 断面の長さ（切断線の方向）
  function cutSpan(m) { return S.cutDir === 'x' ? m.size[1] : m.size[0]; }       // 切る位置を動かせる範囲
  function cutPoint(s) { return S.cutDir === 'x' ? [s, S.cutPos] : [S.cutPos, s]; }
  function requestDraw() {
    var R = U.getR();
    if (!R || R.drawRaf) return;
    R.drawRaf = requestAnimationFrame(function () { var r = U.getR(); if (!r) return; r.drawRaf = 0; U.draw(); });
  }

  /* ================= 部品の HTML ================= */
  function stageBar() {
    return '<div class="fs-toolbar fs-stagebar">' +
      '<div class="seg" id="fsStage" role="radiogroup" aria-label="図の種類">' +
      '<button type="button" class="seg-btn" role="radio" data-stage="3d">3D</button>' +
      '<button type="button" class="seg-btn" role="radio" data-stage="plan">平面図</button></div>' +
      '<div class="fs-3dctl" id="fs3dCtl">' +
      '<div class="seg seg-sm" id="fsCams" role="group" aria-label="視点">' +
      CAMS.map(function (c) { return '<button type="button" class="seg-btn" data-cam="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="fs-exag"><label for="fsExag">厚みの誇張</label><input type="range" id="fsExag" min="1" max="10" step="0.5"><output id="fsExagV" for="fsExag"></output></div>' +
      '</div></div>';
  }
  function stage3D() {
    return '<div class="fs-3d" id="fs3d" hidden>' +
      '<canvas id="fsGL" tabindex="0" aria-label="解析モデルの3D表示。ドラッグまたは矢印キーで回転、ピンチまたはプラス・マイナスキーで拡大縮小、クリックでゲートを配置します"></canvas>' +
      '<canvas id="fsGLov" aria-hidden="true"></canvas></div>';
  }
  function cutPanel() {
    return '<div class="fs-cut" id="fsCut">' +
      '<div class="fs-cut-head"><h3 class="fs-cut-title">断面図 <span class="fs-cut-aa">A–A</span></h3>' +
      '<div class="seg seg-sm" id="fsCutDir" role="radiogroup" aria-label="切る向き">' +
      '<button type="button" class="seg-btn" role="radio" data-dir="x">横に切る</button>' +
      '<button type="button" class="seg-btn" role="radio" data-dir="y">縦に切る</button></div>' +
      '<div class="fs-cut-pos"><label for="fsCutPos">切る位置</label><input type="range" id="fsCutPos"><output id="fsCutPosV" for="fsCutPos"></output></div></div>' +
      '<div class="fs-cut-wrap" id="fsCutWrap"><canvas id="fsCutCv" role="img" aria-label="切断線 A–A に沿った断面図。金型、キャビティ、流れ込んだ樹脂、固化層を示します"></canvas>' +
      '<div class="fs-tip" id="fsCutTip" hidden></div></div>' +
      '<div class="fs-cut-keys" id="fsCutKeys"></div>' +
      '<p class="fs-cut-note">上の図の切断線 <b>A–A</b>（一点鎖線）で金型ごと切ったときの断面です。樹脂は鋼材のすき間（キャビティ）を流れ、金型に触れた外側から固まっていきます（固化層）。</p>' +
      '</div>';
  }

  /* ================= 画面の状態の反映 ================= */
  function syncViews() {
    var R = U.getR(), has3 = !!(R && R.v3), m = U.model();
    if (!has3 && S.stage === '3d') S.stage = 'plan';
    Array.prototype.forEach.call(document.querySelectorAll('#fsStage .seg-btn'), function (b) {
      var st = b.getAttribute('data-stage'), on = st === S.stage;
      b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      if (st === '3d') { b.disabled = !has3; b.title = has3 ? '' : 'この環境では WebGL（3D 描画）を利用できません'; }
    });
    $('fs3dCtl').hidden = S.stage !== '3d';
    Array.prototype.forEach.call(document.querySelectorAll('#fsCams .seg-btn'), function (b) {
      b.classList.toggle('active', !!R && R.camActive === b.getAttribute('data-cam'));
    });
    $('fsExag').value = S.exag; $('fsExagV').textContent = '×' + fmt(S.exag, S.exag % 1 ? 1 : 0);
    Array.prototype.forEach.call(document.querySelectorAll('#fsCutDir .seg-btn'), function (b) {
      var on = b.getAttribute('data-dir') === S.cutDir;
      b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var span = cutSpan(m), el = $('fsCutPos');
    S.cutPos = Math.max(0, Math.min(span, S.cutPos));
    el.min = 0; el.max = span; el.step = 0.5; el.value = S.cutPos;
    showCutPos();
    var hint = $('fsHint');
    hint.textContent = (hint.dataset.base || '') + (S.stage === '3d' ? '3D図はドラッグで回転、ピンチまたは Ctrl＋ホイールで拡大・縮小します。' : '');
  }
  function showCutPos() { $('fsCutPosV').textContent = (S.cutDir === 'x' ? 'y = ' : 'x = ') + fmt(S.cutPos, 1) + ' mm'; }

  /* ================= 表示用の値（3D と断面図で共用） ================= */
  function fields() {
    var R = U.getR(), sim = R.sim;
    if (!sim) return null;
    var g = U.grid(), n = g.nx * g.ny, view = S.view, live = !sim.done;
    var snap = live ? null : sim.snapshotAt(R.t), sk = snap ? snap.t : -1;
    var fillKey = live ? 'L' + R.runId + ':' + sim.steps : 'F' + R.runId + (R.tFs ? 's' : 'r');
    var valKey = fillKey + ':' + view + (live || view === 'fill' ? '' : ':' + sk);
    var key = valKey + ':' + sk;
    if (R.fd && R.fd.key === key && R.fd.n === n) return R.fd;
    var fd = R.fd && R.fd.n === n ? R.fd : { n: n, fill: new Float32Array(n), val: new Float32Array(n), has: new Uint8Array(n), fz: new Float32Array(n) };
    fd.key = key; fd.fillKey = fillKey; fd.valKey = valKey; fd.live = live;
    var cav = sim.cav, F = sim.F, h = g.h, nx = g.nx, k, c;
    fd.has.fill(0);
    if (live) {
      for (k = 0; k < cav.length; k++) {
        c = cav[k];
        var sF = 4 * F[c], sw = 4;
        if (h[c + 1] > 0) { sF += F[c + 1]; sw++; } if (h[c - 1] > 0) { sF += F[c - 1]; sw++; }
        if (h[c + nx] > 0) { sF += F[c + nx]; sw++; } if (h[c - nx] > 0) { sF += F[c - nx]; sw++; }
        fd.fill[c] = F[c] >= 1 ? 1 : sF / sw;
        var z = Math.min(1, 2 * sim.dl[c] / sim.h[c]);
        fd.fz[c] = F[c] > 0 ? z : 0;
        if (!(F[c] > 0)) continue;
        fd.has[c] = 1;
        fd.val[c] = view === 'fill' ? (isFinite(sim.tFill[c]) ? sim.tFill[c] : sim.t) : view === 'pressure' ? sim.p[c] / 1e6 : view === 'temp' ? sim.T[c] : z * 100;
      }
      fd.big = 0;
      return (R.fd = fd);
    }
    var tEnd = R.tEnd != null ? R.tEnd : sim.t, big = tEnd * 1.4 + 0.01, tf = R.tFs || sim.tFill;
    fd.big = big;
    for (k = 0; k < cav.length; k++) {
      c = cav[k];
      var t1 = tf[c], on = !!snap && snap.F[k] > 0;
      fd.fill[c] = isFinite(t1) ? t1 : (F[c] > 0.5 ? tEnd : big);
      fd.fz[c] = on ? snap.fz[k] / 255 : 0;
      if (view === 'fill') { if (isFinite(t1)) { fd.has[c] = 1; fd.val[c] = t1; } continue; }
      if (!on) continue;
      fd.has[c] = 1;
      fd.val[c] = view === 'pressure' ? snap.p[k] / 1e6 : view === 'temp' ? snap.T[k] : snap.fz[k] / 255 * 100;
    }
    return (R.fd = fd);
  }
  /* 格子の値を 1 点へ双線形補間（キャビティ外のセルは除く）。out = [充填の値, 表示値, 固化層, 値あり] */
  function sampleAt(fd, c, a, b, v0, out) {
    var g = U.grid(), h = g.h, nx = g.nx, c1 = c + 1, c2 = c + nx, c3 = c2 + 1;
    var w0 = h[c] > 0 ? (1 - a) * (1 - b) : 0, w1 = h[c1] > 0 ? a * (1 - b) : 0, w2 = h[c2] > 0 ? (1 - a) * b : 0, w3 = h[c3] > 0 ? a * b : 0;
    var ws = w0 + w1 + w2 + w3;
    out[0] = ws > 0 ? (w0 * fd.fill[c] + w1 * fd.fill[c1] + w2 * fd.fill[c2] + w3 * fd.fill[c3]) / ws : fd.big;
    var hs = fd.has;
    if (!hs[c]) w0 = 0; if (!hs[c1]) w1 = 0; if (!hs[c2]) w2 = 0; if (!hs[c3]) w3 = 0;
    var us = w0 + w1 + w2 + w3;
    out[1] = us > 0 ? (w0 * fd.val[c] + w1 * fd.val[c1] + w2 * fd.val[c2] + w3 * fd.val[c3]) / us : v0;
    out[2] = us > 0 ? (w0 * fd.fz[c] + w1 * fd.fz[c1] + w2 * fd.fz[c2] + w3 * fd.fz[c3]) / us : 0;
    out[3] = us > 0 ? 1 : 0;
    return out;
  }

  /* ================= 3D ================= */
  function init3D() {
    var R = U.getR();
    R.v3 = null;
    if (!K.View3D || !K.View3D.supported()) return false;
    // GPU を使わない描画環境では、アンチエイリアスを切り、メッシュを粗くして軽くする
    var soft = K.View3D.probe().soft;
    try { R.v3 = new K.View3D($('fsGL'), $('fsGLov'), { antialias: !soft }); }
    catch (e) { R.v3 = null; return false; }
    R.v3.maxV = soft ? 30000 : 90000;
    R.v3.k = S.exag;
    R.camActive = S.cam;
    R.v3.bind({
      change: function (kind) {
        var r = U.getR(); if (!r) return;
        if (kind === 'rotate' && r.camActive) { r.camActive = null; syncViews(); }
        requestDraw();
      },
      hover: function (e) { var mm = pick3D(e); if (mm) U.onHover(e, mm); else $('fsTip').hidden = true; },
      leave: function () { $('fsTip').hidden = true; },
      click: function (e) { var mm = pick3D(e); if (mm) U.onClick(e, mm); },
      lost: function () {          // GPU のリセットなどで 3D が使えなくなったら平面図に戻す
        var r = U.getR(); if (!r) return;
        r.v3 = null; S.stage = 'plan'; U.syncControls(); U.setupCanvas(); U.draw();
      }
    });
    return true;
  }
  function pick3D(e) {
    var R = U.getR();
    if (!R || !R.v3) return null;
    var r = $('fsGL').getBoundingClientRect();
    return R.v3.pick(e.clientX - r.left, e.clientY - r.top);
  }
  function setup3D() {
    var R = U.getR(), v3 = R.v3, g = U.grid(), wrap = $('fsWrap');
    var w = Math.floor(wrap.clientWidth || 600);
    var h = Math.round(Math.max(260, Math.min(560, w * 0.64)));
    if (window.innerHeight > 560) h = Math.min(h, Math.round(window.innerHeight * 0.7));
    var dpr = Math.min(2, window.devicePixelRatio || 1), box = $('fs3d');
    box.style.width = w + 'px'; box.style.height = h + 'px';
    var sized = v3.cssW !== w || v3.cssH !== h || v3.dpr !== dpr;
    if (sized) v3.resize(w, h, dpr);
    v3.k = S.exag;
    if (R.v3model !== g.model.id) {
      v3.setModel(g.model, g);
      R.v3model = g.model.id; R.v3fk = R.v3vk = null;
      v3.setView(S.cam); R.camActive = S.cam;
    } else if (sized) v3.fit();
  }

  function draw3D(dark) {
    var R = U.getR(), v3 = R.v3, sim = R.sim, view = S.view, vd = viewDef(), u = v3.u, m = v3.mesh, v;
    var vr = U.viewRange();
    var lk = vd.ramp + (dark ? ':d' : ':l');
    if (R.v3lut !== lk) { v3.setLut(K.colormap.ramp(vd.ramp, dark).lut); R.v3lut = lk; }
    u.bg = rgbOf(getComputedStyle($('fsWrap')).backgroundColor).map(function (x) { return x / 255; });
    u.empty = dark ? [0.25, 0.30, 0.37] : [1, 1, 1];
    u.ink = dark ? [0.93, 0.95, 0.98] : [0.07, 0.1, 0.14];
    u.grid = dark ? [0.75, 0.82, 0.9, 0.14] : [0.1, 0.16, 0.24, 0.13];
    u.v0 = vr[0]; u.span = (vr[1] - vr[0]) || 1;
    var done = !!(sim && sim.done);
    u.iso = S.iso && done && R.iso && view !== 'thickness' ? 1 : 0;
    u.isoStep = R.isoStep || 1; u.isoA = view === 'fill' ? 0.5 : 0.32;
    u.hatch = done && sim.status === 'short' && view !== 'thickness' && R.t >= R.tEnd - 1e-9 ? 1 : 0;
    u.time = R.t;
    var fd = view === 'thickness' ? null : fields();
    if (!fd) {
      var key = view === 'thickness' ? 'thick' : 'none';
      u.mode = 1;
      if (R.v3fk !== key || R.v3vk !== key) {
        for (v = 0; v < m.nv; v++) { v3.aFill[v] = key === 'thick' ? 1 : 0; v3.aVal[v] = m.vth[m.nearIn[v]]; }
        v3.upload(null); R.v3fk = R.v3vk = key;
      }
    } else {
      u.mode = fd.live ? 1 : 0;
      attrs3D(v3, fd, vr[0]);
    }
    v3.k = S.exag;
    var o = v3.render();
    overlays3D(o, dark);
    return vr;
  }
  function attrs3D(v3, fd, v0) {
    var R = U.getR(), m = v3.mesh, nv = m.nv, aF = v3.aFill, aV = v3.aVal, v;
    var doF = R.v3fk !== fd.fillKey, doV = R.v3vk !== fd.valKey;
    if (!doF && !doV) return;
    var out = [0, 0, 0, 0];
    for (v = 0; v < nv; v++) {
      sampleAt(fd, m.vc00[v], m.vfx[v], m.vfy[v], v0, out);
      if (doF) aF[v] = out[0];
      if (doV) aV[v] = out[1];
    }
    // 側面（キャビティ外の頂点）は、隣のキャビティ内の頂点と同じ値にして縁の色がにじまないようにする
    for (v = 0; v < nv; v++) { var q = m.nearIn[v]; if (q !== v) { if (doF) aF[v] = aF[q]; if (doV) aV[v] = aV[q]; } }
    v3.upload(doF && doV ? null : doF ? 'fill' : 'val');
    R.v3fk = fd.fillKey; R.v3vk = fd.valKey;
  }

  /* 3D 図の上に重ねる記号（ゲート・ベント・ウェルド・エアトラップ・断面線など） */
  function overlays3D(o, dark) {
    var R = U.getR(), v3 = R.v3, g = U.grid(), sim = R.sim, t = R.t, res = R.res;
    var showRes = !!(sim && sim.done && res) && S.view !== 'thickness';
    var ink = dark ? 'rgba(236,241,247,' : 'rgba(18,26,36,', halo = dark ? 'rgba(18,24,31,0.9)' : 'rgba(255,255,255,0.95)';
    function P(mm, lift) { return v3.project(mm[0], mm[1], v3.heightAt(mm[0], mm[1]) + (lift || 0)); }
    function cellMM(x, y) { return [x * g.cellMM - g.margin, y * g.cellMM - g.margin]; }
    drawCutLine3D(o, dark);
    if (S.weld && showRes) res.welds.forEach(function (w) {
      if (w.t > t + 1e-9) return;
      var pts = (w.path || []).filter(function (p) { return p[2] <= t + 1e-9; }).map(function (p) { return P(cellMM(p[0], p[1])); }).filter(Boolean);
      if (pts.length < 2) return;
      [[halo, 5.5], [w.kind === 'weld' ? ink + '0.95)' : ink + '0.75)', 2.4]].forEach(function (st, pass) {
        o.strokeStyle = st[0]; o.lineWidth = st[1]; o.lineCap = 'round'; o.lineJoin = 'round';
        o.setLineDash(w.kind === 'meld' && pass === 1 ? [5, 4] : []);
        o.beginPath();
        pts.forEach(function (p, i) { if (i) o.lineTo(p[0], p[1]); else o.moveTo(p[0], p[1]); });
        o.stroke();
      });
      o.setLineDash([]);
    });
    if (S.trap && showRes) res.traps.forEach(function (tr) {
      if (tr.born > t + 1e-9) return;
      var p = P(cellMM(tr.cx + 0.5, tr.cy + 0.5)); if (!p) return;
      o.beginPath(); o.arc(p[0], p[1], 11, 0, Math.PI * 2);
      o.fillStyle = dark ? 'rgba(18,24,31,0.85)' : 'rgba(255,255,255,0.9)'; o.fill();
      o.lineWidth = 2.5; o.strokeStyle = '#d03b3b'; o.stroke();
      o.fillStyle = '#d03b3b'; o.font = font(700, 13); o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillText('!', p[0], p[1] + 0.5);
    });
    S.vents.forEach(function (vp) {
      var c = U.mmToCell(g, vp); if (c < 0) return;
      var p = P(U.cellToMM(g, c)); if (!p) return;
      o.fillStyle = dark ? '#6ee7a8' : '#1e6f42'; o.strokeStyle = halo; o.lineWidth = 2;
      o.beginPath(); o.rect(p[0] - 6, p[1] - 6, 12, 12); o.fill(); o.stroke();
      o.fillStyle = dark ? '#12181f' : '#fff'; o.font = font(700, 9); o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillText('V', p[0], p[1] + 0.5);
    });
    // ゲート：樹脂が入る点を先端にした逆三角形（ノズルから差し込むイメージ）
    (S.gates || []).forEach(function (gp) {
      var c = U.mmToCell(g, gp); if (c < 0) return;
      var p = P(U.cellToMM(g, c)); if (!p) return;
      o.beginPath(); o.moveTo(p[0], p[1]); o.lineTo(p[0] - 8, p[1] - 16); o.lineTo(p[0] + 8, p[1] - 16); o.closePath();
      o.fillStyle = U.cssVar('--accent'); o.fill();
      o.lineWidth = 2; o.strokeStyle = halo; o.stroke();
      o.fillStyle = dark ? '#12181f' : '#fff'; o.font = font(700, 9); o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillText('G', p[0], p[1] - 10.5);
    });
    if (showRes && res.flowLength > 0 && R.flowTipCell >= 0) {
      var fp = P(U.cellToMM(g, R.flowTipCell));
      if (fp) {
        var label = '流動長 ' + fmt(res.flowLength, 0) + ' mm';
        o.font = font(700, 12);
        var tw = o.measureText(label).width + 12, bx = Math.min(Math.max(4, fp[0] - tw / 2), v3.cssW - tw - 4), by = Math.max(4, fp[1] - 32);
        o.fillStyle = dark ? 'rgba(18,24,31,0.92)' : 'rgba(255,255,255,0.95)'; o.fillRect(bx, by, tw, 20);
        o.fillStyle = dark ? '#e6ecf3' : '#1b2430'; o.textAlign = 'left'; o.textBaseline = 'middle';
        o.fillText(label, bx + 6, by + 10.5);
      }
    }
    if (R.probe) { var pp = P(R.probe); if (pp) drawProbe(o, dark, pp); }
    // 倍率の注記（画像だけ切り出しても誤解されないように）
    var note = '厚み方向 ×' + fmt(S.exag, S.exag % 1 ? 1 : 0) + ' で表示　床の格子 ' + v3.gridStep + ' mm';
    o.font = font(400, 11.5); o.textAlign = 'left'; o.textBaseline = 'middle';
    var nw = o.measureText(note).width + 14, ny = v3.cssH - 26;
    o.fillStyle = dark ? 'rgba(18,24,31,0.78)' : 'rgba(255,255,255,0.85)'; o.fillRect(8, ny, nw, 19);
    o.fillStyle = dark ? '#a1b0c0' : '#5b6876'; o.fillText(note, 15, ny + 10);
  }

  /* ================= 断面線（平面図・3D 図） ================= */
  function badge(o, x, y, text, dark) {
    o.beginPath(); o.arc(x, y, 8, 0, Math.PI * 2);
    o.fillStyle = dark ? '#12181f' : '#fff'; o.fill();
    o.lineWidth = 1.5; o.strokeStyle = U.cssVar('--accent'); o.stroke();
    o.fillStyle = dark ? '#e6ecf3' : '#1b2430'; o.font = font(700, 10.5); o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText(text, x, y + 0.5);
  }
  function strokeCut(o, pts, dark) {
    o.lineCap = 'round'; o.lineJoin = 'round';
    o.strokeStyle = dark ? 'rgba(18,24,31,0.85)' : 'rgba(255,255,255,0.9)'; o.lineWidth = 4; o.setLineDash([]);
    o.beginPath(); pts.forEach(function (p, i) { if (i) o.lineTo(p[0], p[1]); else o.moveTo(p[0], p[1]); }); o.stroke();
    o.strokeStyle = U.cssVar('--accent'); o.lineWidth = 1.6; o.setLineDash([8, 4, 2, 4]);      // 一点鎖線（製図の切断線）
    o.beginPath(); pts.forEach(function (p, i) { if (i) o.lineTo(p[0], p[1]); else o.moveTo(p[0], p[1]); }); o.stroke();
    o.setLineDash([]);
  }
  /* 平面図用。toPx は mm → キャンバス座標 */
  function drawCutLine(ctx, dark, toPx) {
    var m = U.model(), L = cutLen(m);
    var a = toPx(cutPoint(-1.5)), b = toPx(cutPoint(L + 1.5));
    strokeCut(ctx, [a, b], dark);
    badge(ctx, a[0], a[1], 'A', dark); badge(ctx, b[0], b[1], 'A', dark);
  }
  function drawCutLine3D(o, dark) {
    var R = U.getR(), v3 = R.v3, m = U.model(), L = cutLen(m), n = Math.max(40, Math.min(600, Math.round(L / 0.4))), pts = [];
    // 製品の上面に沿って引き、穴や鋼材の部分では線を切る
    for (var i = 0; i <= n; i++) {
      var q = cutPoint(i / n * L), z = m.thick(q[0], q[1]), p = z > 0 ? v3.project(q[0], q[1], z) : null;
      if (p) { pts.push(p); continue; }
      if (pts.length > 1) strokeCut(o, pts, dark);
      pts = [];
    }
    if (pts.length > 1) strokeCut(o, pts, dark);
    var a = cutPoint(-5), b = cutPoint(L + 5), pa = v3.project(a[0], a[1], 0), pb = v3.project(b[0], b[1], 0);
    if (pa) badge(o, pa[0], pa[1], 'A', dark);
    if (pb) badge(o, pb[0], pb[1], 'A', dark);
  }
  function drawProbe(o, dark, p) {
    o.beginPath(); o.arc(p[0], p[1], 7, 0, Math.PI * 2);
    o.lineWidth = 4; o.strokeStyle = dark ? 'rgba(18,24,31,0.85)' : 'rgba(255,255,255,0.9)'; o.stroke();
    o.lineWidth = 2; o.strokeStyle = U.cssVar('--accent'); o.stroke();
  }

  /* ================= 断面図 ================= */
  function setupCut() {
    var R = U.getR(), g = U.grid(), m = g.model, wrap = $('fsCutWrap'), cv = $('fsCutCv');
    var W = Math.floor(wrap.clientWidth || 600), dpr = Math.min(2, window.devicePixelRatio || 1);
    var key = [m.id, S.cutDir, S.cutPos, W, dpr].join('|');
    if (R.cut && R.cut.key === key) return;
    var L = cutLen(m), padL = 34, padR = 34, n = Math.max(20, W - padL - padR), hs = n / L;
    // 厚さ方向の倍率：最も厚い部分がおよそ avail px になる「きりのよい」倍率
    var avail = W < 520 ? 72 : 96, N = 1;
    NICE.forEach(function (x) { if (g.tmax * hs * x <= avail) N = x; });
    var vs = hs * N, steelT = 20, steelB = 20, top = 16, cavH = g.tmax * vs, base = top + steelT + cavH, H = Math.round(base + steelB + 28);
    cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var th = new Float32Array(n), xm = new Float32Array(n), ym = new Float32Array(n), c00 = new Int32Array(n), fx = new Float32Array(n), fy = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      var p = cutPoint((k + 0.5) / n * L), t = m.thick(p[0], p[1]);
      th[k] = t > 0 ? t : 0; xm[k] = p[0]; ym[k] = p[1];
      var uu = (p[0] + g.margin) / g.cellMM - 0.5, ww = (p[1] + g.margin) / g.cellMM - 0.5;
      var i0 = Math.max(0, Math.min(g.nx - 2, Math.floor(uu))), j0 = Math.max(0, Math.min(g.ny - 2, Math.floor(ww)));
      c00[k] = j0 * g.nx + i0; fx[k] = Math.min(1, Math.max(0, uu - i0)); fy[k] = Math.min(1, Math.max(0, ww - j0));
    }
    // 同じ肉厚が続く区間（寸法の記入に使う）
    var runs = [], r0 = -1;
    for (k = 0; k <= n; k++) {
      var same = k < n && r0 >= 0 && th[k] > 0 && Math.abs(th[k] - th[r0]) < 0.01;
      if (same) continue;
      if (r0 >= 0 && th[r0] > 0) runs.push([r0, k - 1, th[r0]]);
      r0 = k < n ? k : -1;
    }
    R.cut = { key: key, W: W, H: H, dpr: dpr, padL: padL, padR: padR, n: n, L: L, hs: hs, vs: vs, N: N, top: top, steelT: steelT, steelB: steelB, base: base,
      th: th, xm: xm, ym: ym, c00: c00, fx: fx, fy: fy, runs: runs };
    R.cutKeys = null;
  }

  function drawCut(dark) {
    var R = U.getR(), C = R.cut;
    if (!C) return;
    var cv = $('fsCutCv'), o = cv.getContext('2d'), g = U.grid(), sim = R.sim, t = R.t, view = S.view, vd = viewDef();
    var vr = U.viewRange(), v0 = vr[0], span = (vr[1] - vr[0]) || 1, lut = K.colormap.ramp(vd.ramp, dark).lut;
    var col = dark
      ? { steel: '#2c3642', hatch: 'rgba(170,186,206,0.30)', empty: '#11161c', ink: '#d5dee8', text: '#e6ecf3', muted: '#a1b0c0', pill: 'rgba(26,34,44,0.94)' }
      : { steel: '#d6dce4', hatch: 'rgba(52,68,90,0.34)', empty: '#ffffff', ink: '#26303c', text: '#1b2430', muted: '#5b6876', pill: 'rgba(255,255,255,0.95)' };
    var frozenC = U.cssVar('--cut-frozen') || '#9a9386';
    o.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
    o.clearRect(0, 0, C.W, C.H);
    var x0 = C.padL, dx = 1, yA = C.top, yB = C.base + C.steelB, sx0 = x0 - 12, sx1 = x0 + C.n + 12;
    // 金型（鋼材）：断面のハッチング
    o.fillStyle = col.steel; o.fillRect(sx0, yA, sx1 - sx0, yB - yA);
    o.save(); o.beginPath(); o.rect(sx0, yA, sx1 - sx0, yB - yA); o.clip();
    o.strokeStyle = col.hatch; o.lineWidth = 1; o.beginPath();
    for (var hx = sx0 - (yB - yA); hx < sx1; hx += 7) { o.moveTo(hx, yB); o.lineTo(hx + (yB - yA), yA); }
    o.stroke(); o.restore();
    // キャビティ：列ごとに（未充填／樹脂＋固化層）
    var fd = view === 'thickness' ? null : fields(), out = [0, 0, 0, 0], k;
    var filledCols = new Uint8Array(C.n);
    for (k = 0; k < C.n; k++) {
      var th = C.th[k];
      if (!(th > 0)) continue;
      var hp = th * C.vs, yT = C.base - hp, x = x0 + k * dx, idx = -1, fz = 0;
      if (view === 'thickness') idx = Math.round(Math.max(0, Math.min(1, (th - v0) / span)) * 255);
      else if (fd) {
        sampleAt(fd, C.c00[k], C.fx[k], C.fy[k], v0, out);
        var filled = fd.live ? out[0] >= 0.5 : out[0] <= t + 1e-9;
        if (filled) { idx = Math.round(Math.max(0, Math.min(1, (out[1] - v0) / span)) * 255); fz = Math.min(1, out[2]); filledCols[k] = 1; }
      }
      if (idx < 0) { o.fillStyle = col.empty; o.fillRect(x, yT, dx + 0.5, hp); continue; }
      o.fillStyle = 'rgb(' + lut[idx * 3] + ',' + lut[idx * 3 + 1] + ',' + lut[idx * 3 + 2] + ')';
      o.fillRect(x, yT, dx + 0.5, hp);
      if (fz > 0.004) {                          // 固化層は上下の金型面から同じ厚さで育つ
        var b = Math.max(0.6, fz * hp / 2);
        o.fillStyle = frozenC; o.fillRect(x, yT, dx + 0.5, b); o.fillRect(x, C.base - b, dx + 0.5, b);
      }
    }
    // 未充填部の斜線（ショートショットの最終状態）
    if (sim && sim.done && sim.status === 'short' && view !== 'thickness' && t >= R.tEnd - 1e-9) {
      o.save(); o.beginPath();
      for (k = 0; k < C.n; k++) if (C.th[k] > 0 && !filledCols[k]) o.rect(x0 + k, C.base - C.th[k] * C.vs, 1.5, C.th[k] * C.vs);
      // 金型のハッチングと見分けられるように、向きを逆にして間隔も変える
      o.clip(); o.strokeStyle = dark ? 'rgba(236,241,247,0.30)' : 'rgba(18,26,36,0.18)'; o.lineWidth = 1; o.beginPath();
      for (hx = x0 - 200; hx < x0 + C.n; hx += 5) { o.moveTo(hx, C.base - 200); o.lineTo(hx + 200, C.base); }
      o.stroke(); o.restore();
    }
    // キャビティの輪郭（製品の断面形状）
    o.strokeStyle = col.ink; o.lineWidth = 1.3; o.lineJoin = 'miter';
    o.beginPath();
    k = 0;
    while (k < C.n) {
      if (!(C.th[k] > 0)) { k++; continue; }
      var ks = k;
      o.moveTo(x0 + ks, C.base); o.lineTo(x0 + ks, C.base - C.th[ks] * C.vs);
      while (k < C.n && C.th[k] > 0) {
        var yk = C.base - C.th[k] * C.vs;
        o.lineTo(x0 + k, yk); o.lineTo(x0 + k + 1, yk);
        k++;
      }
      o.lineTo(x0 + k, C.base); o.lineTo(x0 + ks, C.base);
    }
    o.stroke();
    var res = R.res, showRes = !!(sim && sim.done && res) && view !== 'thickness';
    function sx(s) { return x0 + s / C.L * C.n; }
    function colTop(xp) { var kk = Math.max(0, Math.min(C.n - 1, Math.floor(xp - x0))); return C.base - C.th[kk] * C.vs; }
    // ウェルドが断面を横切る位置
    if (S.weld && showRes) res.welds.forEach(function (w) {
      if (w.t > t + 1e-9) return;
      var pts = (w.path || []).filter(function (p) { return p[2] <= t + 1e-9; }).map(function (p) { return [p[0] * g.cellMM - g.margin, p[1] * g.cellMM - g.margin]; });
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i], ia = S.cutDir === 'x' ? 1 : 0, ib = 1 - ia;
        var da = a[ia] - S.cutPos, db = b[ia] - S.cutPos;
        if (da * db > 0 || da === db) continue;
        var s = a[ib] + (b[ib] - a[ib]) * da / (da - db), xp = sx(s);
        if (xp < x0 || xp > x0 + C.n) continue;
        var yt = colTop(xp);
        if (!(yt < C.base - 0.5)) continue;
        [[dark ? 'rgba(18,24,31,0.9)' : 'rgba(255,255,255,0.95)', 4.5], [col.ink, 2]].forEach(function (st, pass) {
          o.strokeStyle = st[0]; o.lineWidth = st[1]; o.setLineDash(w.kind === 'meld' && pass === 1 ? [3, 3] : []);
          o.beginPath(); o.moveTo(xp, yt); o.lineTo(xp, C.base); o.stroke();
        });
        o.setLineDash([]);
        pill(o, xp, C.base + C.steelB / 2, w.kind === 'weld' ? 'ウェルド' : 'メルド', col);
        break;
      }
    });
    // エアトラップ（切断線から 3 mm 以内）
    if (S.trap && showRes) res.traps.forEach(function (tr) {
      if (tr.born > t + 1e-9) return;
      var p = [(tr.cx + 0.5) * g.cellMM - g.margin, (tr.cy + 0.5) * g.cellMM - g.margin];
      var d = S.cutDir === 'x' ? Math.abs(p[1] - S.cutPos) : Math.abs(p[0] - S.cutPos);
      if (d > 3) return;
      var xp = sx(S.cutDir === 'x' ? p[0] : p[1]), yt = colTop(xp), yc = (yt + C.base) / 2;
      o.beginPath(); o.arc(xp, yc, 8, 0, Math.PI * 2);
      o.fillStyle = col.pill; o.fill(); o.lineWidth = 2; o.strokeStyle = '#d03b3b'; o.stroke();
      o.fillStyle = '#d03b3b'; o.font = font(700, 11); o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('!', xp, yc + 0.5);
    });
    // ゲート（切断線の近く）の位置
    var gateXs = [];
    (S.gates || []).forEach(function (gp) {
      var c = U.mmToCell(g, gp); if (c < 0) return;
      var p = U.cellToMM(g, c), d = S.cutDir === 'x' ? Math.abs(p[1] - S.cutPos) : Math.abs(p[0] - S.cutPos);
      if (d <= Math.max(2.5, g.cellMM * 1.2)) gateXs.push(sx(S.cutDir === 'x' ? p[0] : p[1]));
    });
    // 肉厚の記入（t＝板厚）。狭い区間と、近くに同じ値がある区間は省く
    var placed = [];
    o.font = font(700, 11);
    C.runs.forEach(function (r) {
      var w = r[1] - r[0] + 1, label = 't' + fmt(r[2], 1), tw = o.measureText(label).width + 10;
      if (w < tw + 4) return;
      var xc = x0 + (r[0] + r[1] + 1) / 2;
      if (placed.some(function (q) { return Math.abs(q[0] - xc) < (q[1] + tw) / 2 + 6 || (q[2] === label && Math.abs(q[0] - xc) < 170); })) return;
      if (gateXs.some(function (gx) { return Math.abs(gx - xc) < tw / 2 + 10; })) {       // ゲートの記号と重なるなら横へずらす
        var alt = [x0 + r[0] + tw / 2 + 4, x0 + r[1] + 1 - tw / 2 - 4].filter(function (xx) { return !gateXs.some(function (gx) { return Math.abs(gx - xx) < tw / 2 + 10; }); });
        if (!alt.length || w < tw + 30) return;
        xc = alt[0];
      }
      placed.push([xc, tw, label]);
      pill(o, xc, C.base - r[2] * C.vs - 10, label, col, true);
    });
    // ゲートの記号：樹脂が入る位置を上から指す
    gateXs.forEach(function (xp) {
      var yt = colTop(xp);
      o.beginPath(); o.moveTo(xp, yt - 1); o.lineTo(xp - 7, yt - 15); o.lineTo(xp + 7, yt - 15); o.closePath();
      o.fillStyle = U.cssVar('--accent'); o.fill(); o.lineWidth = 1.5; o.strokeStyle = col.pill; o.stroke();
      o.fillStyle = dark ? '#12181f' : '#fff'; o.font = font(700, 8.5); o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('G', xp, yt - 10.5);
    });
    // 断面図でポイントしている位置
    if (R.probeK != null && R.probeK >= 0 && R.probeK < C.n) {
      var xq = x0 + R.probeK + 0.5;
      o.strokeStyle = U.cssVar('--accent'); o.lineWidth = 1.5; o.setLineDash([3, 3]);
      o.beginPath(); o.moveTo(xq, yA); o.lineTo(xq, yB); o.stroke(); o.setLineDash([]);
    }
    // 目盛り（切断線に沿った位置）
    var step = K.charts.niceStep(C.L, C.W < 520 ? 4 : 8), ya = yB + 4;
    o.strokeStyle = col.muted; o.lineWidth = 1; o.fillStyle = col.muted; o.font = font(400, 11); o.textAlign = 'center'; o.textBaseline = 'top';
    o.beginPath();
    for (var sv = 0; sv <= C.L + 1e-6; sv += step) { var tx = sx(sv); o.moveTo(tx, yB); o.lineTo(tx, yB + 4); }
    o.stroke();
    for (sv = 0; sv <= C.L + 1e-6; sv += step) {
      var last = sv + step > C.L + 1e-6;
      o.fillText(fmt(sv, 0) + (last ? ' mm' : ''), sx(sv), ya + 2);
    }
    o.textAlign = 'left'; o.fillText(S.cutDir === 'x' ? 'x →' : 'y →', 4, ya + 2);
    // A–A の記号
    var ym = (yA + yB) / 2;
    [[x0 - 23, ym], [x0 + C.n + 23, ym]].forEach(function (p) {
      o.fillStyle = col.text; o.font = font(700, 14); o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText('A', p[0], p[1]);
    });
    cutKeys(dark, vd, C);
  }
  function pill(o, x, y, text, col, strong) {
    o.font = font(strong ? 700 : 600, strong ? 11 : 10.5);
    var tw = o.measureText(text).width + 10;
    o.fillStyle = col.pill; o.fillRect(x - tw / 2, y - 8, tw, 16);
    o.fillStyle = col.text; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillText(text, x, y + 0.5);
  }
  function cutKeys(dark, vd, C) {
    var R = U.getR(), key = [S.view, dark, C.N].join('|');
    if (R.cutKeys === key) return;
    R.cutKeys = key;
    var melt = S.view === 'thickness'
      ? '<span class="fs-key"><i class="k-melt" style="background:' + K.colormap.gradientCSS(vd.ramp, dark) + '"></i>キャビティ（色は肉厚）</span>'
      : '<span class="fs-key"><i class="k-melt" style="background:' + K.colormap.gradientCSS(vd.ramp, dark) + '"></i>流れている樹脂（色は上の図と同じ「' + vd.name + '」）</span>' +
        '<span class="fs-key"><i class="k-frozen"></i>固化層</span>' +
        '<span class="fs-key"><i class="k-empty"></i>未充填（空気）</span>';
    $('fsCutKeys').innerHTML = melt + '<span class="fs-key"><i class="k-steel"></i>金型（鋼材）</span>' +
      '<span class="fs-cut-scale">厚さ方向を ×' + fmt(C.N, C.N % 1 ? 1 : 0) + ' に拡大して表示</span>';
  }

  /* 断面図のポイント：位置・肉厚・状態を表示し、上の図にも印を出す */
  function cutHover(e) {
    var R = U.getR(), C = R && R.cut;
    if (!C) return;
    var r = $('fsCutCv').getBoundingClientRect(), k = Math.floor(e.clientX - r.left - C.padL);
    var tip = $('fsCutTip');
    if (k < 0 || k >= C.n) { cutLeave(); return; }
    R.probeK = k; R.probe = [C.xm[k], C.ym[k]];
    var th = C.th[k], rows = [['位置', 'x ' + fmt(C.xm[k], 1) + ' , y ' + fmt(C.ym[k], 1) + ' mm']];
    if (!(th > 0)) rows.push(['ここは', '金型（鋼材）']);
    else {
      rows.push(['肉厚', fmt(th, 1) + ' mm']);
      var sim = R.sim, fd = S.view === 'thickness' ? null : fields();
      if (sim && fd) {
        var out = sampleAt(fd, C.c00[k], C.fx[k], C.fy[k], 0, [0, 0, 0, 0]);
        var filled = fd.live ? out[0] >= 0.5 : out[0] <= R.t + 1e-9;
        rows.push(['状態', filled ? '樹脂が充填済み' : '未充填（空気）']);
        if (filled) {
          if (!fd.live) rows.push(['充填時刻', fmt(out[0], 3) + ' s']);
          if (S.view !== 'fill' && out[3]) rows.push([viewDef().name.replace(/（.*）/, ''), fmt(out[1], S.view === 'pressure' ? 1 : 0) + ' ' + viewDef().unit]);
          if (out[3]) rows.push(['固化層', fmt(Math.min(1, out[2]) * 100, 0) + ' %（片側 ' + fmt(Math.min(1, out[2]) * th / 2, 2) + ' mm）']);
        }
      }
    }
    tip.innerHTML = rows.map(function (rw) { return '<div><span>' + rw[0] + '</span><b>' + rw[1] + '</b></div>'; }).join('');
    tip.hidden = false;
    var wr = $('fsCutWrap').getBoundingClientRect(), x = e.clientX - wr.left + 14, y = e.clientY - wr.top + 12;
    if (x + tip.offsetWidth > wr.width - 4) x = e.clientX - wr.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > wr.height - 4) y = Math.max(4, wr.height - tip.offsetHeight - 4);
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
    requestDraw();
  }
  function cutLeave() {
    var R = U.getR();
    $('fsCutTip').hidden = true;
    if (R && (R.probe || R.probeK != null)) { R.probe = null; R.probeK = null; requestDraw(); }
  }

  /* ================= 操作 ================= */
  function bindViews() {
    Array.prototype.forEach.call(document.querySelectorAll('#fsStage .seg-btn'), function (b) {
      b.addEventListener('click', function () {
        var R = U.getR(), st = b.getAttribute('data-stage');
        if (st === '3d' && !R.v3) return;
        S.stage = st; $('fsTip').hidden = true;
        U.syncControls(); U.setupCanvas(); U.draw();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fsCams .seg-btn'), function (b) {
      b.addEventListener('click', function () {
        var R = U.getR(); if (!R.v3) return;
        S.cam = b.getAttribute('data-cam'); R.v3.setView(S.cam); R.camActive = S.cam;
        syncViews(); U.draw();
      });
    });
    $('fsExag').addEventListener('input', function (e) {
      var R = U.getR(); S.exag = +e.target.value;
      $('fsExagV').textContent = '×' + fmt(S.exag, S.exag % 1 ? 1 : 0);
      if (R.v3) R.v3.k = S.exag;
      requestDraw();
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fsCutDir .seg-btn'), function (b) {
      b.addEventListener('click', function () {
        var m = U.model(), dir = b.getAttribute('data-dir');
        if (dir === S.cutDir) return;
        S.cutDir = dir;
        S.cutPos = m.section && m.section[0] === dir ? m.section[1] : Math.round(cutSpan(m) / 2);
        syncViews(); U.setupCanvas(); U.draw();
      });
    });
    $('fsCutPos').addEventListener('input', function (e) {
      S.cutPos = +e.target.value; showCutPos();
      U.getR().cut = null; setupCut(); requestDraw();
    });
    var cv = $('fsCutCv');
    cv.addEventListener('pointermove', cutHover);
    cv.addEventListener('pointerleave', cutLeave);
  }
  function teardownViews() {
    var R = U.getR();
    if (!R) return;
    cancelAnimationFrame(R.drawRaf); R.drawRaf = 0;
    if (R.v3) { R.v3.destroy(); R.v3 = null; }
  }

  U.stageBar = stageBar; U.stage3D = stage3D; U.cutPanel = cutPanel;
  U.syncViews = syncViews; U.init3D = init3D; U.setup3D = setup3D; U.draw3D = draw3D;
  U.setupCut = setupCut; U.drawCut = drawCut; U.drawCutLine = drawCutLine; U.drawProbe = drawProbe;
  U.bindViews = bindViews; U.teardownViews = teardownViews; U.requestDraw = requestDraw;
})(window.KANAGATA);
