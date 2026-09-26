/* 流動解析用の製品モデル（2.5D：平面形状＋肉厚分布）
 * thick(x, y) は mm 単位の座標を受け取り、肉厚 [mm] を返す（0 は金型の鋼材部）。
 * 座標系は左上原点、x 右向き・y 下向き。
 */
(function (root) {
  'use strict';
  var K = root.KANAGATA = root.KANAGATA || {};

  function inRect(x, y, x0, y0, x1, y1) { return x >= x0 && x <= x1 && y >= y0 && y <= y1; }
  function inCircle(x, y, cx, cy, r) { var dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r; }

  /* ---------- スパイラル（アルキメデス渦巻き）の幾何 ---------- */
  var SP = { cx: 66, cy: 66, r0: 9, pitch: 8, w: 5, turns: 6.4, hub: 5.5 };
  SP.b = SP.pitch / (2 * Math.PI);
  SP.thetaMax = SP.turns * 2 * Math.PI;
  function spiralArc(theta) {            // 中心線 r = r0 + bθ の弧長（θ=0 から）
    var b = SP.b;
    function F(phi) { return 0.5 * b * (phi * Math.sqrt(1 + phi * phi) + Math.asinh(phi)); }
    var p0 = SP.r0 / b;
    return F(p0 + theta) - F(p0);
  }
  /* 点 (x,y) がスパイラル流路内なら中心線上の弧長 [mm] を、流路外なら -1 を返す */
  function spiralLocate(x, y) {
    var dx = x - SP.cx, dy = y - SP.cy;
    var r = Math.sqrt(dx * dx + dy * dy);
    if (r <= SP.hub) return 0;
    var th = Math.atan2(dy, dx);
    if (th < 0) th += 2 * Math.PI;
    var best = -1, bestD = 1e9;
    for (var k = 0; k <= Math.ceil(SP.turns) + 1; k++) {
      var t = th + 2 * Math.PI * k;
      if (t > SP.thetaMax) break;
      var d = Math.abs(r - (SP.r0 + SP.b * t));
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best >= 0 && bestD <= SP.w / 2) return spiralArc(best);
    // 中央のスプルー部から流路の入口へつなぐ短い導入部
    if (th < 0.9 && r <= SP.r0 + SP.w / 2 && Math.abs(dy) <= SP.w / 2 + 0.01 && dx > 0) return 0;
    return -1;
  }

  var models = [
    {
      id: 'plate', name: '平板（基本）', size: [120, 80], cell: 1.25,
      desc: '厚さ2.0mmの平板に、短辺中央からゲートで充填します。流動先端が扇状に広がり、ゲートから遠い角が最後に充填されるのが基本形です。',
      gates: [[1.2, 40]], fillTime: 1.0,
      thick: function (x, y) { return inRect(x, y, 0, 0, 120, 80) ? 2.0 : 0; }
    },
    {
      id: 'holes', name: '穴あき平板（ウェルドライン）', size: [120, 80], cell: 1.25,
      desc: '丸穴2つと長穴1つがある平板。流れが穴で分かれ、穴の後ろで再び合流する位置にウェルドラインができます。ゲート位置を動かすと、ウェルドラインの位置と合流時の温度が変わります。',
      gates: [[1.2, 40]], fillTime: 1.0,
      thick: function (x, y) {
        if (!inRect(x, y, 0, 0, 120, 80)) return 0;
        if (inCircle(x, y, 44, 24, 8.5) || inCircle(x, y, 44, 56, 8.5)) return 0;
        if (inRect(x, y, 84, 30, 98, 50)) return 0;
        return 2.0;
      }
    },
    {
      id: 'lid', name: '厚肉リム付きふた（エアトラップ）', size: [120, 90], cell: 1.5,
      desc: '外周に幅8mm・厚さ3.2mmのリム（縁）、中央は厚さ1.2mmの薄いパネル。樹脂は流れやすい厚肉リムを先回りし（レーストラッキング）、薄いパネルを外側から包囲して中央に空気を閉じ込めます。',
      gates: [[60, 1.2]], fillTime: 1.2,
      thick: function (x, y) {
        if (!inRect(x, y, 0, 0, 120, 90)) return 0;
        if (x < 8 || x > 112 || y < 8 || y > 82) return 3.2;
        return 1.2;
      }
    },
    {
      id: 'tabs', name: '薄肉ツメ付き（ためらい現象）', size: [110, 72], cell: 1.25,
      desc: '厚さ2.2mmの本体に、厚さ0.6mmの薄いツメが2つ。ゲートに近いツメでは樹脂が入口で立ち止まる「ためらい（ヘジテーション）」が起き、その間に固まって充填不足になりやすくなります。',
      gates: [[1.0, 25]], fillTime: 1.5,
      regions: [['ゲート側のツメ', 14, 50.5, 26, 72], ['奥のツメ', 84, 50.5, 96, 72]],
      thick: function (x, y) {
        if (inRect(x, y, 0, 0, 110, 50)) return 2.2;
        if (inRect(x, y, 14, 50, 26, 72)) return 0.6;
        if (inRect(x, y, 84, 50, 96, 72)) return 0.6;
        return 0;
      }
    },
    {
      id: 'runner-fish', name: '4個取り：直列ランナー（アンバランス）', size: [150, 100], cell: 1.0,
      desc: '同じ形の製品4個を1つの型で成形します。スプルー（注入口）が左端にあり、近い2個と遠い2個でランナーの長さが違うため、近い側が先に満ちます。',
      gates: [[6, 50]], fillTime: 1.4, runner: true,
      cavities: [['近い側 上', 8, 6, 42, 32], ['近い側 下', 8, 68, 42, 94], ['遠い側 上', 108, 6, 142, 32], ['遠い側 下', 108, 68, 142, 94]],
      thick: function (x, y) { return runnerThick(x, y, false); }
    },
    {
      id: 'runner-h', name: '4個取り：H型ランナー（バランス）', size: [150, 100], cell: 1.0,
      desc: '製品とゲートは直列ランナーと同じで、スプルーを中央に置いてH型に分岐させたもの。4個までの流動距離が等しいため、同時に充填が完了します。',
      gates: [[75, 50]], fillTime: 1.4, runner: true,
      cavities: [['左上', 8, 6, 42, 32], ['左下', 8, 68, 42, 94], ['右上', 108, 6, 142, 32], ['右下', 108, 68, 142, 94]],
      thick: function (x, y) { return runnerThick(x, y, true); }
    },
    {
      id: 'spiral', name: 'スパイラルフロー試験', size: [132, 132], cell: 1.25,
      desc: '幅5mm・厚さ2.0mmの渦巻き状の長い流路に、一定の圧力で樹脂を押し込みます。樹脂が固まって止まるまでに流れた長さ（流動長）で「材料の流れやすさ」を比較する、材料メーカーの標準的な評価方法です。',
      gates: [[SP.cx, SP.cy]], fillTime: 0.6, pressureTest: true, defaultPmax: 80, advance: 3,
      thick: function (x, y) { return spiralLocate(x, y) >= 0 ? 2.0 : 0; },
      arc: spiralLocate
    }
  ];

  /* 4個取りの共通形状。balanced=true で H 型（スプルー中央）、false で直列（スプルー左端） */
  function runnerThick(x, y, balanced) {
    var cav = [[8, 6, 42, 32], [8, 68, 42, 94], [108, 6, 142, 32], [108, 68, 142, 94]];
    for (var i = 0; i < 4; i++) if (inRect(x, y, cav[i][0], cav[i][1], cav[i][2], cav[i][3])) return 1.8;
    // ゲート（ランナー端とキャビティの間の絞り）
    if (inRect(x, y, 23, 32, 27, 36) || inRect(x, y, 23, 64, 27, 68) ||
        inRect(x, y, 123, 32, 127, 36) || inRect(x, y, 123, 64, 127, 68)) return 1.0;
    // 縦ランナー（左右）
    if (inRect(x, y, 22, 36, 28, 64) || inRect(x, y, 122, 36, 128, 64)) return 4.5;
    // 横ランナー
    if (balanced) { if (inRect(x, y, 22, 47, 128, 53)) return 4.5; }
    else { if (inRect(x, y, 3, 47, 128, 53)) return 4.5; }
    // スプルー受け部
    if (balanced ? inCircle(x, y, 75, 50, 4.5) : inCircle(x, y, 6, 50, 4.5)) return 4.5;
    return 0;
  }

  /* モデルを格子に展開する。margin は周囲に残す鋼材部の幅 [mm] */
  function rasterize(model, margin) {
    margin = margin == null ? 3 : margin;
    var cell = model.cell;
    var W = model.size[0] + margin * 2, H = model.size[1] + margin * 2;
    var nx = Math.round(W / cell), ny = Math.round(H / cell);
    var n = nx * ny;
    var h = new Float64Array(n);              // 肉厚 [m]
    var arc = model.arc ? new Float32Array(n) : null;
    for (var j = 0; j < ny; j++) {
      for (var i = 0; i < nx; i++) {
        var x = (i + 0.5) * cell - margin, y = (j + 0.5) * cell - margin;
        var t = model.thick(x, y);
        h[j * nx + i] = t > 0 ? t * 1e-3 : 0;
        if (arc) arc[j * nx + i] = t > 0 ? model.arc(x, y) : -1;
      }
    }
    // 外周（パーティングライン）に面したセル＝ベント可能。外部の鋼材を格子の外周から塗りつぶして判定
    var exterior = new Uint8Array(n), stack = [];
    function push(c) { if (!exterior[c] && h[c] === 0) { exterior[c] = 1; stack.push(c); } }
    for (i = 0; i < nx; i++) { push(i); push((ny - 1) * nx + i); }
    for (j = 0; j < ny; j++) { push(j * nx); push(j * nx + nx - 1); }
    while (stack.length) {
      var c = stack.pop(), ci = c % nx, cj = (c - ci) / nx;
      if (ci > 0) push(c - 1); if (ci < nx - 1) push(c + 1);
      if (cj > 0) push(c - nx); if (cj < ny - 1) push(c + nx);
    }
    var outer = new Uint8Array(n);
    for (c = 0; c < n; c++) {
      if (h[c] === 0) continue;
      ci = c % nx; cj = (c - ci) / nx;
      if (ci === 0 || cj === 0 || ci === nx - 1 || cj === ny - 1 ||
          exterior[c - 1] || exterior[c + 1] || exterior[c - nx] || exterior[c + nx]) outer[c] = 1;
    }
    return { model: model, nx: nx, ny: ny, dx: cell * 1e-3, cellMM: cell, margin: margin, h: h, outer: outer, arc: arc };
  }

  /* mm 座標 → 最寄りのキャビティセル（なければ -1） */
  function cellAt(grid, xmm, ymm, radius) {
    var i = Math.floor((xmm + grid.margin) / grid.cellMM), j = Math.floor((ymm + grid.margin) / grid.cellMM);
    var best = -1, bd = 1e9, R = radius == null ? 3 : radius;
    for (var dj = -R; dj <= R; dj++) for (var di = -R; di <= R; di++) {
      var ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= grid.nx || jj >= grid.ny) continue;
      var c = jj * grid.nx + ii;
      if (grid.h[c] > 0 && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = c; }
    }
    return best;
  }

  K.flowModels = models;
  K.flowModelById = function (id) {
    for (var i = 0; i < models.length; i++) if (models[i].id === id) return models[i];
    return models[0];
  };
  K.rasterizeModel = rasterize;
  K.cellAt = cellAt;
  K.spiralInfo = SP;
})(typeof window !== 'undefined' ? window : globalThis);
