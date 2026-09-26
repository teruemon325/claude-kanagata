/* 軽量 SVG 折れ線グラフ（ホバーでクロスヘア＋ツールチップ、再生位置の縦線、注記線）
 * 色はすべて CSS 変数から（--series-1/2, --chart-grid, --chart-axis, --text, --text-muted）。
 */
(function (root) {
  'use strict';
  var K = root.KANAGATA = root.KANAGATA || {};
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceStep(range, target) {
    var raw = range / Math.max(1, target), mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
  }
  function fmtNum(v, step) {
    var d = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
    return v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  /* opts: { series:[{name, color, points:[[x,y]...], dots}], xLabel, yLabel, xUnit, yUnit,
   *         xMin, xMax, yMin, yMax, xLog, xTicks:[...], height, markers:[{x,label}], highlight:{x,y,label},
   *         annotations:[{x,y,label}] , ariaLabel } */
  function lineChart(host, opts) {
    host.innerHTML = '';
    host.classList.add('chart');
    if (opts.series.length > 1 && opts.legend !== false) {
      var lg = document.createElement('div'); lg.className = 'chart-legend';
      opts.series.forEach(function (s) {
        var it = document.createElement('span'), sw = document.createElement('i');
        sw.style.background = s.color; it.appendChild(sw); it.appendChild(document.createTextNode(s.name)); lg.appendChild(it);
      });
      host.appendChild(lg);
    }
    var W = Math.max(280, host.clientWidth || 480), H = opts.height || 190;
    var m = { l: 46, r: 16, t: opts.yLabel ? 22 : 14, b: 38 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, role: 'img', 'aria-label': opts.ariaLabel || '' }, host);

    var all = [];
    opts.series.forEach(function (s) { s.points.forEach(function (p) { all.push(p); }); });
    var xMin = opts.xMin != null ? opts.xMin : Math.min.apply(null, all.map(function (p) { return p[0]; }));
    var xMax = opts.xMax != null ? opts.xMax : Math.max.apply(null, all.map(function (p) { return p[0]; }));
    var yMin = opts.yMin != null ? opts.yMin : 0;
    var yMaxRaw = opts.yMax != null ? opts.yMax : Math.max.apply(null, all.map(function (p) { return p[1]; }).concat([1e-9]));
    var ly = !!opts.yLog;
    var yStep = ly ? 1 : niceStep(yMaxRaw - yMin, 4), yMax = ly ? yMaxRaw : (Math.ceil(yMaxRaw / yStep) * yStep || yStep);
    if (!(xMax > xMin)) xMax = xMin + 1;
    var lx = opts.xLog;
    function X(v) {
      if (lx) return m.l + (Math.log(v) - Math.log(xMin)) / (Math.log(xMax) - Math.log(xMin)) * pw;
      return m.l + (v - xMin) / (xMax - xMin) * pw;
    }
    function Y(v) {
      if (ly) return m.t + ph - (Math.log(Math.max(v, yMin)) - Math.log(yMin)) / (Math.log(yMax) - Math.log(yMin)) * ph;
      return m.t + ph - (v - yMin) / (yMax - yMin) * ph;
    }

    // グリッドと目盛り
    var g = el('g', {}, svg);
    var yTicks = opts.yTicks;
    if (!yTicks) { yTicks = []; for (var yv = yMin; yv <= yMax + yStep * 0.001; yv += yStep) yTicks.push(yv); }
    yTicks.forEach(function (yv, i) {
      el('line', { x1: m.l, x2: m.l + pw, y1: Y(yv), y2: Y(yv), class: i === 0 ? 'c-axis' : 'c-grid' }, g);
      var ty = el('text', { x: m.l - 6, y: Y(yv) + 4, 'text-anchor': 'end', class: 'c-tick' }, g);
      ty.textContent = opts.yTickFmt ? opts.yTickFmt(yv) : fmtNum(yv, yStep);
    });
    var xt = opts.xTicks;
    if (!xt) { var xs = niceStep(xMax - xMin, 5); xt = []; for (var xv = Math.ceil(xMin / xs) * xs; xv <= xMax + xs * 0.001; xv += xs) xt.push(+xv.toFixed(10)); opts._xs = xs; }
    xt.forEach(function (v) {
      var tx = el('text', { x: X(v), y: m.t + ph + 16, 'text-anchor': 'middle', class: 'c-tick' }, g);
      tx.textContent = opts.xFmt ? opts.xFmt(v) : fmtNum(v, opts._xs || 0.1);
    });
    var xl = el('text', { x: m.l + pw, y: H - 4, 'text-anchor': 'end', class: 'c-label' }, g); xl.textContent = opts.xLabel || '';
    var yl = el('text', { x: 4, y: 10, 'text-anchor': 'start', class: 'c-label' }, g); yl.textContent = opts.yLabel || '';
    host.setAttribute('data-ylabel', opts.yLabel || '');

    // 注記線（V/P 切替など）。ラベルが前の注記と近いときは段をずらす
    var lastX = -1e9, row = 0;
    (opts.markers || []).forEach(function (mk) {
      if (mk.x == null || mk.x < xMin || mk.x > xMax) return;
      el('line', { x1: X(mk.x), x2: X(mk.x), y1: m.t, y2: m.t + ph, class: 'c-marker' }, g);
      var nearRight = X(mk.x) > m.l + pw - 60;
      row = X(mk.x) - lastX < 16 + mk.label.length * 10.5 ? row + 1 : 0;
      lastX = X(mk.x);
      var t = el('text', { x: X(mk.x) + (nearRight ? -4 : 4), y: m.t + 11 + row * 13, 'text-anchor': nearRight ? 'end' : 'start', class: 'c-marker-label' }, g); t.textContent = mk.label;
    });

    // 系列
    opts.series.forEach(function (s) {
      if (!s.points.length) return;
      var d = s.points.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('');
      if (s.area) {
        el('path', { d: d + 'L' + X(s.points[s.points.length - 1][0]).toFixed(1) + ' ' + Y(yMin) + 'L' + X(s.points[0][0]).toFixed(1) + ' ' + Y(yMin) + 'Z', fill: s.color, opacity: 0.1 }, g);
      }
      el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      if (s.dots) s.points.forEach(function (p, i) {
        var bad = s.bad && s.bad[i];
        el('circle', { cx: X(p[0]), cy: Y(p[1]), r: bad ? 5 : 4.5, fill: bad ? 'var(--surface)' : s.color, stroke: bad ? s.color : 'var(--surface)', 'stroke-width': 2 }, g);
      });
      if (s.endLabel) {
        var last = s.points[s.points.length - 1];
        var lt = el('text', { x: Math.min(X(last[0]) + 6, m.l + pw - 2), y: Y(last[1]) - 6, 'text-anchor': X(last[0]) > m.l + pw - 60 ? 'end' : 'start', class: 'c-direct' }, g);
        lt.textContent = s.endLabel;
      }
    });
    if (opts.highlight) {
      var hl = opts.highlight;
      el('circle', { cx: X(hl.x), cy: Y(hl.y), r: 7, fill: 'none', stroke: 'var(--text)', 'stroke-width': 1.5 }, g);
      var ht = el('text', { x: X(hl.x), y: Y(hl.y) - 12, 'text-anchor': 'middle', class: 'c-direct' }, g); ht.textContent = hl.label;
    }

    // 再生位置
    var play = el('line', { x1: -10, x2: -10, y1: m.t, y2: m.t + ph, class: 'c-play', visibility: 'hidden' }, svg);
    // ホバー層
    var cross = el('line', { x1: -10, x2: -10, y1: m.t, y2: m.t + ph, class: 'c-cross', visibility: 'hidden' }, svg);
    var dots = opts.series.map(function (s) { return el('circle', { r: 4.5, cx: -10, cy: -10, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg); });
    var hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent', tabindex: 0 }, svg);
    var tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true; host.appendChild(tip);

    function nearest(s, xv) {
      var best = null, bd = Infinity;
      s.points.forEach(function (p) { var d = Math.abs((lx ? Math.log(p[0]) - Math.log(xv) : p[0] - xv)); if (d < bd) { bd = d; best = p; } });
      return best;
    }
    function show(px) {
      var xv = lx ? Math.exp(Math.log(xMin) + (px - m.l) / pw * (Math.log(xMax) - Math.log(xMin))) : xMin + (px - m.l) / pw * (xMax - xMin);
      var rows = [], ref = null;
      opts.series.forEach(function (s, i) {
        var p = nearest(s, xv);
        if (!p) return;
        ref = ref || p;
        dots[i].setAttribute('cx', X(p[0])); dots[i].setAttribute('cy', Y(p[1])); dots[i].setAttribute('visibility', 'visible');
        rows.push({ s: s, p: p, i: i });
      });
      if (!ref) return;
      cross.setAttribute('x1', X(ref[0])); cross.setAttribute('x2', X(ref[0])); cross.setAttribute('visibility', 'visible');
      tip.innerHTML = '';
      var head = document.createElement('div'); head.className = 'chart-tip-x';
      head.textContent = (opts.xName ? opts.xName + ' ' : '') + (opts.xFmt ? opts.xFmt(ref[0]) : fmtNum(ref[0], 0.001)) + (opts.xUnit || '');
      tip.appendChild(head);
      rows.forEach(function (r) {
        var row = document.createElement('div'); row.className = 'chart-tip-row';
        var key = document.createElement('span'); key.className = 'chart-tip-key'; key.style.background = r.s.color;
        var val = document.createElement('b'); val.textContent = (opts.yFmt ? opts.yFmt(r.p[1]) : fmtNum(r.p[1], yStep / 10)) + (opts.yUnit || '');
        var nm = document.createElement('span'); nm.className = 'chart-tip-name'; nm.textContent = r.s.name + (r.s.note && r.s.note(r.p) ? '（' + r.s.note(r.p) + '）' : '');
        row.appendChild(key); row.appendChild(val); row.appendChild(nm);
        tip.appendChild(row);
      });
      tip.hidden = false;
      var tx = X(ref[0]) / W * host.clientWidth;
      tip.style.left = Math.min(Math.max(4, tx + 12), host.clientWidth - tip.offsetWidth - 4) + 'px';
      tip.style.top = '6px';
    }
    function hide() { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); }
    hit.addEventListener('pointermove', function (e) {
      var r = svg.getBoundingClientRect();
      show((e.clientX - r.left) / r.width * W);
    });
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', function () { show(m.l + pw); });
    hit.addEventListener('blur', hide);

    return {
      setPlayhead: function (xv) {
        if (xv == null || xv < xMin || xv > xMax) { play.setAttribute('visibility', 'hidden'); return; }
        play.setAttribute('x1', X(xv)); play.setAttribute('x2', X(xv)); play.setAttribute('visibility', 'visible');
      }
    };
  }

  K.charts = { line: lineChart, niceStep: niceStep, fmtNum: fmtNum };
})(typeof window !== 'undefined' ? window : globalThis);
