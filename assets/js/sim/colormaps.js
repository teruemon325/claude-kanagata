/* 解析結果の色：量（大きさ）は単一色相の明→暗ランプ、温度だけは「熱」を表す多色ランプ。
 * ダークテーマでは単一色相ランプの明暗を反転（背景に近い暗い側が小さい値）。
 * 色は OKLCH で定義して sRGB に変換し、256 段の参照表にしておく。
 */
(function (root) {
  'use strict';
  var K = root.KANAGATA = root.KANAGATA || {};

  function oklchToRgb(L, C, h) {
    var hr = h * Math.PI / 180, a = C * Math.cos(hr), b = C * Math.sin(hr);
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    var r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    var bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return [r, g, bb];
  }
  function inGamut(c) { return c[0] >= -1e-4 && c[0] <= 1.0001 && c[1] >= -1e-4 && c[1] <= 1.0001 && c[2] >= -1e-4 && c[2] <= 1.0001; }
  function enc(x) { x = Math.max(0, Math.min(1, x)); return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)); }
  /* 色域外なら彩度を下げて収める */
  function oklch(L, C, h) {
    var c = oklchToRgb(L, C, h), lo = 0, hi = C;
    if (!inGamut(c)) {
      for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (inGamut(oklchToRgb(L, mid, h))) lo = mid; else hi = mid; }
      c = oklchToRgb(L, lo, h);
    }
    return [enc(c[0]), enc(c[1]), enc(c[2])];
  }
  function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function toHex(c) { return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }

  /* 停止点の配列から 256 段の参照表を作る */
  function lut(stops) {
    var out = new Uint8Array(256 * 3), n = stops.length - 1;
    for (var i = 0; i < 256; i++) {
      var x = i / 255 * n, k = Math.min(n - 1, Math.floor(x)), f = x - k;
      for (var ch = 0; ch < 3; ch++) out[i * 3 + ch] = Math.round(stops[k][ch] * (1 - f) + stops[k + 1][ch] * f);
    }
    return out;
  }
  function hueRamp(h, cMax, L0, L1, steps) {
    var s = [];
    for (var i = 0; i < steps; i++) {
      var t = i / (steps - 1), L = L0 + (L1 - L0) * t;
      var C = cMax * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)));
      s.push(oklch(L, C, h));
    }
    return s;
  }

  // 充填時間：データ可視化の標準パレットの青ランプ（100→700）
  var BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'].map(hexToRgb);
  var VIOLET = hueRamp(295, 0.16, 0.93, 0.30, 11);   // 圧力
  var TEAL = hueRamp(195, 0.11, 0.94, 0.32, 11);      // 固化層
  var SLATE = hueRamp(250, 0.045, 0.93, 0.36, 9);     // 肉厚
  // 温度：黒体放射に近い「熱」のランプ（冷たい＝暗い紫、熱い＝明るい黄）。明暗は両テーマ共通
  var HEAT = [[0.26, 0.10, 305], [0.34, 0.15, 330], [0.43, 0.18, 12], [0.53, 0.19, 30], [0.64, 0.18, 48], [0.76, 0.16, 70], [0.87, 0.14, 95], [0.95, 0.09, 105]]
    .map(function (p) { return oklch(p[0], p[1], p[2]); });

  var cache = {};
  function ramp(name, dark) {
    var key = name + (dark ? ':d' : ':l');
    if (cache[key]) return cache[key];
    var stops = { fill: BLUE, pressure: VIOLET, frozen: TEAL, thickness: SLATE, temp: HEAT }[name];
    if (dark && name !== 'temp') stops = stops.slice().reverse();
    var r = { lut: lut(stops), stops: stops.map(toHex) };
    cache[key] = r;
    return r;
  }
  function gradientCSS(name, dark) {
    var st = ramp(name, dark).stops;
    return 'linear-gradient(90deg,' + st.map(function (c, i) { return c + ' ' + (i / (st.length - 1) * 100).toFixed(1) + '%'; }).join(',') + ')';
  }

  K.colormap = { ramp: ramp, gradientCSS: gradientCSS, oklch: oklch, toHex: toHex };
})(typeof window !== 'undefined' ? window : globalThis);
