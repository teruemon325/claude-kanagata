/* 樹脂材料データベース（流動解析用）
 * 粘度モデル: Cross-WLF
 *   η0(T) = D1·exp(−A1·(T−D2) / (A2 + T−D2))      [T: K]
 *   η(T, γ̇) = η0 / (1 + (η0·γ̇ / τ*)^(1−n))
 * D1 は「基準温度 Tref でのゼロせん断粘度 eta0ref」から逆算する。
 * 数値は代表的な汎用グレードを想定した教育用の目安値で、特定銘柄の値ではない。
 */
(function (root) {
  'use strict';
  var K = root.KANAGATA = root.KANAGATA || {};

  var list = [
    {
      id: 'PP', name: 'PP', full: 'ポリプロピレン', kind: '結晶性',
      Tm: 230, TmRange: [200, 270], Tw: 40, TwRange: [20, 80],
      n: 0.30, tau: 2.5e4, D2: 263.15, A1: 26.0, A2: 51.6, eta0ref: 2200, Tref: 230,
      k: 0.17, rho: 750, cp: 2800, Tnf: 130, Teject: 95,
      note: '流動性がよく安価。固化が比較的ゆっくりで成形しやすい。収縮が大きい。'
    },
    {
      id: 'ABS', name: 'ABS', full: 'ABS樹脂', kind: '非晶性',
      Tm: 240, TmRange: [210, 270], Tw: 60, TwRange: [30, 85],
      n: 0.28, tau: 4.5e4, D2: 373.15, A1: 27.0, A2: 51.6, eta0ref: 9000, Tref: 240,
      k: 0.17, rho: 960, cp: 2200, Tnf: 130, Teject: 90,
      note: '粘度はPPより高め。温度で粘度が大きく変わる。外観部品の定番。'
    },
    {
      id: 'PC', name: 'PC', full: 'ポリカーボネート', kind: '非晶性',
      Tm: 300, TmRange: [270, 330], Tw: 85, TwRange: [60, 120],
      n: 0.20, tau: 3.5e5, D2: 417.15, A1: 30.0, A2: 51.6, eta0ref: 900, Tref: 300,
      k: 0.20, rho: 1050, cp: 1900, Tnf: 165, Teject: 127,
      note: '高粘度で流れにくい。ガラス転移点が高く固化が早いので、高い樹脂温度・型温度が必要。'
    },
    {
      id: 'PA66', name: 'PA66', full: 'ナイロン66', kind: '結晶性',
      Tm: 290, TmRange: [275, 310], Tw: 80, TwRange: [40, 110],
      n: 0.60, tau: 1.5e5, D2: 323.15, A1: 28.0, A2: 51.6, eta0ref: 260, Tref: 285,
      k: 0.22, rho: 970, cp: 2800, Tnf: 245, Teject: 180,
      note: '溶融粘度は非常に低いが、結晶化が始まる温度が高く一気に固まる。高速射出が基本。'
    },
    {
      id: 'POM', name: 'POM', full: 'ポリアセタール', kind: '結晶性',
      Tm: 200, TmRange: [185, 220], Tw: 80, TwRange: [40, 110],
      n: 0.35, tau: 1.2e5, D2: 213.15, A1: 25.0, A2: 51.6, eta0ref: 1200, Tref: 200,
      k: 0.23, rho: 1150, cp: 2300, Tnf: 150, Teject: 125,
      note: '摺動部品の定番。成形温度域が狭く、滞留すると熱分解する。'
    }
  ];

  list.forEach(function (m) {
    var TrefK = m.Tref + 273.15;
    m.D1 = m.eta0ref / Math.exp(-m.A1 * (TrefK - m.D2) / (m.A2 + TrefK - m.D2));
    m.alpha = m.k / (m.rho * m.cp);
  });

  /* ゼロせん断粘度 [Pa·s] */
  function eta0(m, Tc) {
    var dT = Tc + 273.15 - m.D2;
    if (dT <= 1) dT = 1;
    return m.D1 * Math.exp(-m.A1 * dT / (m.A2 + dT));
  }
  /* Cross-WLF 粘度 [Pa·s] */
  function viscosity(m, Tc, gdot) {
    var e0 = eta0(m, Tc);
    return e0 / (1 + Math.pow(e0 * gdot / m.tau, 1 - m.n));
  }
  /* 局所べき指数 n' = d ln τ / d ln γ̇ */
  function localN(m, Tc, gdot) {
    var e0 = eta0(m, Tc);
    var x = Math.pow(e0 * gdot / m.tau, 1 - m.n);
    return 1 - (1 - m.n) * x / (1 + x);
  }

  K.materials = list;
  K.materialById = function (id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  };
  K.rheology = { eta0: eta0, viscosity: viscosity, localN: localN };
})(typeof window !== 'undefined' ? window : globalThis);
