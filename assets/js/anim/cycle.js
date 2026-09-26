/* 射出成形の 1 サイクル・アニメーション（Canvas 2D）
 * 工程の時間配分・圧力波形・スクリュー位置は、小型部品（PP・肉厚2mm程度）の典型例。
 */
(function (K) {
  'use strict';

  var T_CYCLE = 15.0;
  var PHASES = [
    { id: 'close', short: '型閉じ', name: '型閉じ・型締め', t0: 0.0, t1: 1.2,
      text: '可動盤が前進して金型を閉じます。はじめは高速で近づき、金型が触れる直前で減速して低圧で合わせ（異物をはさんだときに金型を守る「金型保護」）、最後にトグル機構が伸び切って大きな型締力を発生させます。' },
    { id: 'inject', short: '射出', name: '射出（充填）', t0: 1.2, t1: 2.2,
      text: 'スクリューが回転せずに前進し、計量しておいた溶融樹脂をノズル→スプルー→ゲート→キャビティへ押し込みます。ここは「速度」で制御する工程で、流動長が伸びるほど必要な圧力が上がっていきます。逆流防止リングは後ろへ下がって閉じ、樹脂がスクリュー側へ逆流するのを防ぎます。' },
    { id: 'pack', short: '保圧', name: '保圧', t0: 2.2, t1: 5.2,
      text: '充填率が95〜99%に達したところで速度制御から圧力制御へ切り替え（V/P切替）、一定の圧力で押し続けます。冷えて縮む分の樹脂を補ってヒケを防ぐ工程です。ゲートが固まる（ゲートシール）と、もう樹脂は入らず、キャビティ内圧は下がり始めます。スクリューの前に少し残る樹脂が「クッション」です。' },
    { id: 'cool', short: '冷却（並行して計量）', name: '冷却（並行して計量）', t0: 5.2, t1: 13.2,
      text: '製品が取り出せる温度まで金型の中で冷やします。サイクルの半分以上を占めることが多い工程です。この間にスクリューは回転しながら後退し、ホッパのペレットを溶かしながら前方へ送って次のショット分をためます（計量・可塑化）。後退に抵抗をかける「背圧」で、溶融樹脂の密度と温度を均一にします。' },
    { id: 'open', short: '型開き', name: '型開き', t0: 13.2, t1: 14.2,
      text: '可動盤が後退して金型が開きます。製品は抜き勾配と収縮による抱きつきで、突き出し機構のある可動側（コア側）に残るよう設計されています。' },
    { id: 'eject', short: '突出し', name: '突き出し', t0: 14.2, t1: 15.0,
      text: 'エジェクタピンが前進して製品をコアから押し出します。実際の量産では取出しロボットがつかんで取り出すことも多く、次のサイクルの型閉じがすぐに始まります。' }
  ];
  var INJ0 = 1.2, VP = 2.2, PACK1 = 5.2, SEAL = 4.6, MET0 = 5.4, MET1 = 9.4, SUCK1 = 9.7, OPEN0 = 13.2, OPEN1 = 14.2;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function lerp(a, b, x) { return a + (b - a) * x; }

  /* ---------- 時刻 t の状態（すべて決定的） ---------- */
  function state(t) {
    var s = {};
    // 型の開き（0=閉, 1=全開）
    if (t < 1.0) s.gap = 1 - ease(t / 1.0) * 0.92;
    else if (t < 1.2) s.gap = 0.08 * (1 - ease((t - 1.0) / 0.2));
    else if (t < OPEN0) s.gap = 0;
    else if (t < OPEN1) s.gap = ease((t - OPEN0) / (OPEN1 - OPEN0));
    else s.gap = 1;
    // 型締力 [t]
    s.clamp = t < 1.05 ? 0 : t < 1.2 ? 80 * ease((t - 1.05) / 0.15) : t < OPEN0 - 0.1 ? 80 : t < OPEN0 ? 80 * (1 - ease((t - (OPEN0 - 0.1)) / 0.1)) : 0;
    // スクリュー位置 [mm]（0=最前進）
    var inj = clamp((t - INJ0) / (VP - INJ0), 0, 1);
    if (t < INJ0) s.screw = 42;
    else if (t < VP) s.screw = lerp(42, 6.5, 1 - Math.pow(1 - inj, 1.35));
    else if (t < PACK1) s.screw = 5 + 1.5 * Math.exp(-(t - VP) / 0.9);
    else if (t < MET0) s.screw = 5 + 1.5 * Math.exp(-(PACK1 - VP) / 0.9);
    else if (t < MET1) s.screw = lerp(5.1, 40, ease((t - MET0) / (MET1 - MET0)) * 0.15 + (t - MET0) / (MET1 - MET0) * 0.85);
    else if (t < SUCK1) s.screw = 40 + 2 * ease((t - MET1) / (SUCK1 - MET1));
    else s.screw = 42;
    // スクリュー回転 [rpm]
    s.rpm = t > MET0 && t < MET1 ? 120 * Math.min(1, (t - MET0) / 0.2, (MET1 - t) / 0.2) : 0;
    // 射出圧力（ノズル部の樹脂圧）[MPa]
    if (t < INJ0) s.pInj = 0;
    else if (t < VP) s.pInj = 8 + 62 * Math.pow(inj, 1.6);
    else if (t < VP + 0.08) s.pInj = lerp(70, 45, (t - VP) / 0.08);
    else if (t < PACK1) s.pInj = 45;
    else if (t < PACK1 + 0.08) s.pInj = lerp(45, 0, (t - PACK1) / 0.08);
    else if (t > MET0 && t < MET1) s.pInj = 8 * Math.min(1, (t - MET0) / 0.2, (MET1 - t) / 0.15);
    else s.pInj = 0;
    // キャビティ内圧（ゲート近くのセンサー）[MPa]
    var fill = t < INJ0 ? 0 : t < VP ? 0.98 * Math.pow(inj, 1.05) : t < VP + 0.25 ? lerp(0.98, 1, (t - VP) / 0.25) : 1;
    if (t >= OPEN0) fill = 1;
    s.fill = fill;
    if (t < INJ0 || fill < 0.35) s.pCav = 0;
    else if (t < VP) s.pCav = 22 * Math.pow((fill - 0.35) / 0.63, 1.8);
    else if (t < VP + 0.12) s.pCav = lerp(22, 48, (t - VP) / 0.12);
    else if (t < SEAL) s.pCav = 48 - 10 * (t - VP - 0.12) / (SEAL - VP - 0.12);
    else s.pCav = 38 * Math.exp(-(t - SEAL) / 0.9);
    if (t >= OPEN0) s.pCav = 0;
    // 製品温度 [℃]
    var tf = VP;
    s.Tpart = t < INJ0 ? null : t < tf ? 230 : 40 + 190 * Math.exp(-(t - tf) / 5.0);
    if (t > 14.95) s.Tpart = 40 + 190 * Math.exp(-(15 - tf) / 5.0);
    // 突き出し
    s.eject = t < 14.2 ? 0 : t < 14.55 ? ease((t - 14.2) / 0.35) : t < 14.9 ? 1 - ease((t - 14.55) / 0.35) : 0;
    s.drop = t < 14.5 ? 0 : (t - 14.5);
    // 逆流防止リング：計量中は開く
    s.ringOpen = t > MET0 && t < MET1 ? Math.min(1, (t - MET0) / 0.15, (MET1 - t) / 0.1) : 0;
    s.metering = t > MET0 && t < MET1;
    s.sealed = t >= SEAL && t < OPEN0;
    return s;
  }
  function phaseAt(t) { for (var i = 0; i < PHASES.length; i++) if (t < PHASES[i].t1) return PHASES[i]; return PHASES[PHASES.length - 1]; }

  /* スクリューの回転角は、回転していた時間の積分 */
  function screwAngle(t) {
    var a = 0, dt = 0.02;
    for (var x = MET0; x < Math.min(t, MET1); x += dt) a += state(x).rpm / 60 * 2 * Math.PI * dt;
    return a;
  }

  /* ---------- 描画 ---------- */
  function heat(T) {       // 温度 → 熱ランプの色
    var r = K.colormap.ramp('temp', false), x = clamp((T - 40) / (250 - 40), 0, 1), i = Math.round(x * 255) * 3;
    return 'rgb(' + r.lut[i] + ',' + r.lut[i + 1] + ',' + r.lut[i + 2] + ')';
  }

  function draw(ctx, W, H, t, dark, font) {
    var s = state(t), g = s.gap * 90;
    var C = dark ? {
      bg: '#1a222c', steel: '#566474', steel2: '#445263', edge: '#8a9aac', text: '#e6ecf3', muted: '#a1b0c0', bore: '#141b23', bed: '#2e3a48', pellet: '#dfe6ee', part: '#9fb7cf'
    } : {
      bg: '#ffffff', steel: '#c3ccd6', steel2: '#a9b5c2', edge: '#5b6876', text: '#1b2430', muted: '#5b6876', bore: '#f3f5f8', bed: '#d8dee6', pellet: '#ffffff', part: '#7c9cbf'
    };
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    var sc = W / 1000; ctx.scale(sc, sc);
    ctx.lineJoin = 'round';
    function label(x, y, txt, align, col) {
      ctx.font = '600 11.5px ' + font; ctx.fillStyle = col || C.muted; ctx.textAlign = align || 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(txt, x, y);
    }
    function leader(x1, y1, x2, y2) { ctx.strokeStyle = C.muted; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

    // ベッド
    ctx.fillStyle = C.bed; ctx.fillRect(10, 292, 980, 12);

    // ---- 射出ユニット ----
    var cy = 150, bx0 = 92, bx1 = 560, R = 34, r = 22;
    ctx.lineWidth = 1.2;
    // バレル外形
    ctx.fillStyle = C.steel; ctx.fillRect(bx0, cy - R, bx1 - bx0, 2 * R); ctx.strokeRect(bx0, cy - R, bx1 - bx0, 2 * R);
    // ヒーターバンド（ゾーン温度）
    var zones = [[196, 250, 200, '後部'], [276, 330, 220, '中部'], [356, 410, 230, '前部'], [436, 490, 230, '前部'], [508, 548, 235, 'ノズル側']];
    zones.forEach(function (z) {
      ctx.fillStyle = heat(z[2]); ctx.globalAlpha = 0.9;
      ctx.fillRect(z[0], cy - R - 5, z[1] - z[0], 2 * R + 10); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.edge; ctx.strokeRect(z[0], cy - R - 5, z[1] - z[0], 2 * R + 10);
    });
    label(273, cy - R - 12, 'ヒーター（200〜235℃）', 'center');
    // ボア
    ctx.fillStyle = C.bore; ctx.fillRect(bx0, cy - r, bx1 - bx0, 2 * r);
    // ホッパ
    ctx.fillStyle = C.steel; ctx.strokeStyle = C.edge;
    ctx.beginPath(); ctx.moveTo(112, 36); ctx.lineTo(186, 36); ctx.lineTo(160, 104); ctx.lineTo(138, 104); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(138, 104, 22, cy - r - 104); ctx.strokeRect(138, 104, 22, cy - r - 104);
    // ペレット
    ctx.fillStyle = C.pellet; ctx.strokeStyle = C.edge; ctx.lineWidth = 0.7;
    for (var pi = 0; pi < 42; pi++) {
      var px = 122 + (pi * 37 % 58), py = 44 + Math.floor(pi / 6) * 8.5;
      if (px > 176 - (py - 36) * 0.28 || px < 122 + (py - 36) * 0.24) continue;
      ctx.beginPath(); ctx.ellipse(px, py, 3.2, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (s.metering) {           // 落ちていくペレット
      for (var k = 0; k < 5; k++) {
        var yy = 104 + ((t * 60 + k * 9) % (cy - r - 104 + 8));
        ctx.beginPath(); ctx.ellipse(149 + (k % 2 ? 4 : -4), yy, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    label(149, 28, 'ホッパ（ペレット）', 'center');

    // スクリュー
    var tip = 548 - s.screw * 3, len = 404, sx0 = tip - len;
    var ang = screwAngle(t), pitch = 24, phase = (ang / (2 * Math.PI)) % 1 * pitch;
    ctx.save(); ctx.beginPath(); ctx.rect(bx0, cy - r, bx1 - bx0, 2 * r); ctx.clip();
    // 溝の中の樹脂：供給部はペレット、圧縮部で溶け、計量部は溶融
    for (var x = Math.max(bx0, sx0); x < tip - 2; x += 2) {
      var f = (x - sx0) / len;          // 0=後端, 1=先端
      var root = f < 0.4 ? 9 : f < 0.75 ? lerp(9, 16, (f - 0.4) / 0.35) : 16;
      var col = f < 0.38 ? null : heat(lerp(160, 228, clamp((f - 0.38) / 0.4, 0, 1)));
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, cy - r + 1, 2, r - root - 1); ctx.fillRect(x, cy + root, 2, r - root - 1); }
    }
    // 供給部のペレット粒
    ctx.fillStyle = C.pellet; ctx.strokeStyle = C.edge; ctx.lineWidth = 0.6;
    for (x = Math.max(bx0 + 8, sx0 + 8); x < sx0 + len * 0.4; x += 8) {
      var ox = (x - phase) ;
      ctx.beginPath(); ctx.ellipse(ox, cy - 15, 2.6, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(ox + 4, cy + 15, 2.6, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // スクリュー本体（谷径）
    ctx.fillStyle = dark ? '#8796a6' : '#8a97a5'; ctx.strokeStyle = C.edge; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.max(20, sx0 - 70), cy - 9); ctx.lineTo(sx0 + len * 0.4, cy - 9); ctx.lineTo(sx0 + len * 0.75, cy - 16); ctx.lineTo(tip - 14, cy - 16);
    ctx.lineTo(tip, cy); ctx.lineTo(tip - 14, cy + 16); ctx.lineTo(sx0 + len * 0.75, cy + 16); ctx.lineTo(sx0 + len * 0.4, cy + 9); ctx.lineTo(Math.max(20, sx0 - 70), cy + 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // フライト（回転すると模様が流れる）
    ctx.fillStyle = dark ? '#a9b6c3' : '#6e7b89';
    for (var fx = sx0 - pitch + phase; fx < tip - 22; fx += pitch) {
      if (fx < sx0 + 4) continue;
      ctx.beginPath();
      ctx.moveTo(fx, cy - r + 1); ctx.lineTo(fx + 4, cy - r + 1); ctx.lineTo(fx + 4 + 12, cy + r - 1); ctx.lineTo(fx + 12, cy + r - 1); ctx.closePath();
      ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    // 駆動部（スクリューの軸はここへ入っていく）
    ctx.fillStyle = C.steel2; ctx.strokeStyle = C.edge; ctx.lineWidth = 1.2;
    ctx.fillRect(18, cy - 46, 58, 92); ctx.strokeRect(18, cy - 46, 58, 92);
    ctx.fillStyle = C.steel; ctx.fillRect(76, cy - 14, bx0 - 76, 28); ctx.strokeRect(76, cy - 14, bx0 - 76, 28);
    label(47, cy + 66, '駆動部', 'center');
    // 逆流防止リング
    var ringX = tip - 20 + s.ringOpen * 6;
    ctx.fillStyle = dark ? '#c6d1dc' : '#5b6876';
    ctx.fillRect(ringX, cy - r + 1, 7, 6); ctx.fillRect(ringX, cy + r - 7, 7, 6);
    // スクリュー前方の溶融樹脂（計量した分）
    ctx.fillStyle = heat(230);
    ctx.fillRect(tip + 1, cy - r + 1, 548 - tip, 2 * r - 2);
    // ノズル
    ctx.fillStyle = C.steel; ctx.strokeStyle = C.edge;
    ctx.beginPath(); ctx.moveTo(bx1, cy - 24); ctx.lineTo(600, cy - 9); ctx.lineTo(600, cy + 9); ctx.lineTo(bx1, cy + 24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = heat(232); ctx.fillRect(548, cy - 4, 52, 8);
    // 引出線
    leader(sx0 + len * 0.2, cy + r + 2, sx0 + len * 0.2, cy + 70); label(sx0 + len * 0.2, cy + 82, '供給部', 'center');
    leader(sx0 + len * 0.58, cy + r + 2, sx0 + len * 0.58, cy + 70); label(sx0 + len * 0.58, cy + 82, '圧縮部（溶ける）', 'center');
    leader(sx0 + len * 0.88, cy + r + 2, sx0 + len * 0.88, cy + 70); label(sx0 + len * 0.88, cy + 82, '計量部', 'center');
    leader(ringX + 3, cy - r + 2, ringX - 20, cy - 70); label(ringX - 20, cy - 76, '逆流防止リング', 'center');
    label(582, cy + 44, 'ノズル', 'center');

    // ---- 型締ユニット ----
    var fp0 = 600, fp1 = 640, mh0 = 640, pl = 700, mh1 = 760, mp0 = 760 + g, mp1 = 800 + g, rp0 = 940, rp1 = 980;
    // タイバー
    ctx.strokeStyle = C.edge; ctx.lineWidth = 3;
    [74, 266].forEach(function (y) { ctx.beginPath(); ctx.moveTo(fp0, y); ctx.lineTo(rp1, y); ctx.stroke(); });
    ctx.lineWidth = 1.2;
    // 固定盤・リア盤
    ctx.fillStyle = C.steel2; ctx.strokeStyle = C.edge;
    ctx.fillRect(fp0, 52, fp1 - fp0, 238); ctx.strokeRect(fp0, 52, fp1 - fp0, 238);
    ctx.fillRect(rp0, 52, rp1 - rp0, 238); ctx.strokeRect(rp0, 52, rp1 - rp0, 238);
    // 金型（固定側）
    ctx.fillStyle = C.steel; ctx.fillRect(mh0, 84, pl - mh0, 172); ctx.strokeRect(mh0, 84, pl - mh0, 172);
    // スプルーの穴（固定側）
    ctx.fillStyle = C.bore;
    ctx.beginPath(); ctx.moveTo(600, cy - 4); ctx.lineTo(686, cy - 7); ctx.lineTo(686, cy + 7); ctx.lineTo(600, cy + 4); ctx.closePath(); ctx.fill();
    // 金型（可動側：コアつき）
    var mx = g;
    ctx.fillStyle = C.steel;
    ctx.beginPath();
    ctx.moveTo(pl + mx, 84); ctx.lineTo(mh1 + mx, 84); ctx.lineTo(mh1 + mx, 256); ctx.lineTo(pl + mx, 256); ctx.lineTo(pl + mx, 200);
    ctx.lineTo(pl + mx, 200); ctx.lineTo(pl + mx - 6, 200); ctx.lineTo(pl + mx - 6, 192); ctx.lineTo(pl + mx - 6, 192);
    ctx.lineTo(694 + mx, 192); ctx.lineTo(694 + mx, 108); ctx.lineTo(pl + mx - 6, 108); ctx.lineTo(pl + mx - 6, 100); ctx.lineTo(pl + mx, 100);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // キャビティ（カップ形の製品）：固定側の凹み
    ctx.fillStyle = C.bore;
    ctx.fillRect(686, 100, 14, 100);
    // 製品（樹脂）を描く：充填率に応じてゲート（中央）から上下へ、次に側壁へ
    var partOn = s.fill > 0 && t < 14.5 + 0.7;
    if (partOn) {
      var partX = s.eject > 0 || t >= OPEN0 ? mx - s.eject * 26 : 0;
      var fallY = s.drop > 0 ? 0.5 * 900 * s.drop * s.drop : 0;
      var alpha = s.drop > 0 ? clamp(1 - s.drop / 0.6, 0, 1) : 1;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(partX, fallY);
      var colP = heat(s.Tpart || 230);
      var reach = s.fill * 86;            // 片側の流動長（px）
      ctx.fillStyle = colP;
      // スプルー（製品とつながったまま一緒に抜ける）
      ctx.beginPath(); ctx.moveTo(600, cy - 4); ctx.lineTo(686, cy - 7); ctx.lineTo(686, cy + 7); ctx.lineTo(600, cy + 4); ctx.closePath(); ctx.fill();
      var up = Math.min(50, reach), side = Math.max(0, reach - 50);
      ctx.fillRect(686, 150 - up, 8, up * 2);
      if (side > 0) { ctx.fillRect(694, 100, Math.min(36, side) * 1, 8); ctx.fillRect(694, 192, Math.min(36, side), 8); }
      if (up >= 50) { ctx.fillRect(686, 100, 8, 8); ctx.fillRect(686, 192, 8, 8); }
      // 流動先端の丸み
      if (s.fill < 1 && s.fill > 0) {
        ctx.beginPath();
        if (up < 50) { ctx.arc(690, 150 - up, 4, Math.PI, 0); ctx.arc(690, 150 + up, 4, 0, Math.PI); }
        else { ctx.arc(694 + Math.min(36, side), 104, 4, -Math.PI / 2, Math.PI / 2); ctx.arc(694 + Math.min(36, side), 196, 4, -Math.PI / 2, Math.PI / 2); }
        ctx.fill();
      }
      ctx.restore();
    }
    // エジェクタピン
    ctx.fillStyle = dark ? '#c6d1dc' : '#6e7b89';
    [128, 172].forEach(function (y) { ctx.fillRect(694 + mx - s.eject * 26, y - 3, mp0 - (694 + mx) + s.eject * 26, 6); });
    // 可動盤
    ctx.fillStyle = C.steel2; ctx.strokeStyle = C.edge;
    ctx.fillRect(mp0, 52, mp1 - mp0, 238); ctx.strokeRect(mp0, 52, mp1 - mp0, 238);
    // トグル機構：型が閉じると伸び切る
    var jointDy = 38 * clamp(s.gap * 1.15, 0, 1);
    ctx.strokeStyle = dark ? '#c6d1dc' : '#5b6876'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    [[110, 1], [230, -1]].forEach(function (a) {
      var y = a[0], jx = (mp1 + rp0) / 2, jy = y + a[1] * jointDy;
      ctx.beginPath(); ctx.moveTo(mp1, y); ctx.lineTo(jx, jy); ctx.lineTo(rp0, y); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(jx, 170 + a[1] * -20 * (1 - s.gap)); ctx.stroke(); ctx.lineWidth = 6;
    });
    ctx.lineCap = 'butt'; ctx.lineWidth = 1.2;
    // 締付け表示
    if (s.clamp > 1) { ctx.fillStyle = C.text; label(870, 320, '型締力 ' + Math.round(s.clamp) + ' t', 'center', C.text); }
    // ラベル
    label(620, 44, '固定盤', 'center');
    label(670, 98, '固定側', 'center'); label(730 + mx, 98, '可動側', 'center');
    label((mp0 + mp1) / 2, 44, '可動盤', 'center'); label(960, 44, 'リア盤', 'center');
    label(958, 287, 'トグル機構', 'center');
    label(pl + mx * 0.5, 287, 'PL', 'center');
    ctx.strokeStyle = C.muted; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pl + mx * 0.5, 84); ctx.lineTo(pl + mx * 0.5, 262); ctx.stroke(); ctx.setLineDash([]);
    if (s.sealed && t < PACK1) label(640, 128, 'ゲートシール', 'end', C.text);
    ctx.restore();
  }

  /* ---------- ページ部品 ---------- */
  function mount(host) {
    var fmt = function (v, d) { return (+v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }); };
    var segs = PHASES.map(function (p) {
      return '<button type="button" class="cy-seg" data-t="' + p.t0 + '" style="flex:' + (p.t1 - p.t0) + '" title="' + p.name + '">' + p.short + '</button>';
    }).join('');
    host.innerHTML =
      '<div class="anim-card">' +
      '<div class="anim-canvas anim-scroll"><canvas id="cyCanvas" role="img" aria-label="射出成形機の1サイクルのアニメーション"></canvas></div>' +
      '<p class="anim-hint" id="cyScrollHint" hidden>図は左右にスクロールできます</p>' +
      '<div class="cy-timeline" id="cyTimeline">' + segs + '<span class="cy-head" id="cyHead"></span></div>' +
      '<div class="anim-controls">' +
      '<button type="button" class="btn" id="cyPlay">❚❚ 停止</button>' +
      '<input type="range" id="cyScrub" min="0" max="1500" value="0" aria-label="サイクル内の時刻">' +
      '<span class="fs-time" id="cyTime"></span>' +
      '<select id="cySpeed" aria-label="再生速度"><option value="0.5">0.5倍</option><option value="1" selected>等倍</option><option value="2">2倍</option></select>' +
      '</div>' +
      '<div class="cy-info"><div class="cy-phase" id="cyPhase"></div><dl class="cy-read" id="cyRead"></dl></div>' +
      '<div class="fs-charts"><figure class="fs-chart"><figcaption>樹脂圧力：射出圧力（ノズル部）とキャビティ内圧（ゲート近く）</figcaption><div id="cyChartP"></div></figure>' +
      '<figure class="fs-chart"><figcaption>スクリュー位置（0 = 最前進）</figcaption><div id="cyChartS"></div></figure></div>' +
      '</div>';

    var cvs = host.querySelector('#cyCanvas'), ctx = cvs.getContext('2d');
    var st = { t: 1.75, playing: true, speed: 1, last: 0, raf: 0, visible: true };
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) st.playing = false;
    var font = getComputedStyle(document.documentElement).getPropertyValue('--font');

    // 波形（静的）
    var pI = [], pC = [], pS = [];
    for (var x = 0; x <= T_CYCLE + 1e-9; x += 0.02) { var s = state(x); pI.push([x, s.pInj]); pC.push([x, s.pCav]); pS.push([x, s.screw]); }
    var markers = [{ x: VP, label: 'V/P切替' }, { x: SEAL, label: 'ゲートシール' }];
    var charts = [
      K.charts.line(host.querySelector('#cyChartP'), { series: [{ name: '射出圧力', color: 'var(--series-1)', points: pI, endLabel: '' }, { name: 'キャビティ内圧', color: 'var(--series-2)', points: pC }],
        xMin: 0, xMax: T_CYCLE, yMax: 80, xLabel: '時間 [s]', yLabel: 'MPa', yUnit: ' MPa', xUnit: ' s', xName: '時刻', markers: markers, ariaLabel: '射出圧力とキャビティ内圧の時間変化', legend: true }),
      K.charts.line(host.querySelector('#cyChartS'), { series: [{ name: 'スクリュー位置', color: 'var(--series-1)', points: pS }],
        xMin: 0, xMax: T_CYCLE, yMax: 50, xLabel: '時間 [s]', yLabel: 'mm', yUnit: ' mm', xUnit: ' s', xName: '時刻', markers: [{ x: MET0, label: '計量開始' }], ariaLabel: 'スクリュー位置の時間変化' })
    ];

    function size() {
      var avail = cvs.parentNode.clientWidth, w = Math.max(avail, 760), h = w * 0.34, dpr = Math.min(2, window.devicePixelRatio || 1);
      host.querySelector('#cyScrollHint').hidden = avail >= 760;
      cvs.style.width = w + 'px'; cvs.style.height = h + 'px';
      cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
      st.dpr = dpr; st.w = w; st.h = h;
    }
    function isDark() { var m = getComputedStyle(document.body).backgroundColor.match(/\d+/g); return m && (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) < 110; }
    function render() {
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      draw(ctx, st.w, st.h, st.t, isDark(), font);
      var s = state(st.t), ph = phaseAt(st.t);
      host.querySelector('#cyScrub').value = Math.round(st.t * 100);
      host.querySelector('#cyTime').textContent = fmt(st.t, 1) + ' / ' + fmt(T_CYCLE, 1) + ' s';
      host.querySelector('#cyHead').style.left = (st.t / T_CYCLE * 100) + '%';
      Array.prototype.forEach.call(host.querySelectorAll('.cy-seg'), function (b) { b.classList.toggle('active', +b.getAttribute('data-t') === ph.t0); });
      if (st.phase !== ph.id) {
        st.phase = ph.id;
        host.querySelector('#cyPhase').innerHTML = '<span class="cy-phase-name">' + ph.name + '</span><p>' + ph.text + '</p>';
      }
      host.querySelector('#cyRead').innerHTML =
        '<dt>型締力</dt><dd>' + fmt(s.clamp, 0) + ' t</dd>' +
        '<dt>射出圧力</dt><dd>' + fmt(s.pInj, 1) + ' MPa</dd>' +
        '<dt>キャビティ内圧</dt><dd>' + fmt(s.pCav, 1) + ' MPa</dd>' +
        '<dt>スクリュー位置</dt><dd>' + fmt(s.screw, 1) + ' mm</dd>' +
        '<dt>スクリュー回転</dt><dd>' + fmt(s.rpm, 0) + ' rpm</dd>' +
        '<dt>製品温度</dt><dd>' + (s.Tpart == null ? '—' : fmt(s.Tpart, 0) + ' ℃') + '</dd>';
      charts.forEach(function (c) { c.setPlayhead(st.t); });
    }
    function loop(now) {
      if (!st.playing) return;
      var dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
      if (st.visible) { st.t = (st.t + dt * st.speed) % T_CYCLE; render(); }
      st.raf = requestAnimationFrame(loop);
    }
    function setPlaying(on) {
      st.playing = on;
      host.querySelector('#cyPlay').textContent = on ? '❚❚ 停止' : '▶ 再生';
      if (on) { st.last = performance.now(); st.raf = requestAnimationFrame(loop); } else cancelAnimationFrame(st.raf);
    }
    host.querySelector('#cyPlay').addEventListener('click', function () { setPlaying(!st.playing); });
    host.querySelector('#cySpeed').addEventListener('change', function (e) { st.speed = +e.target.value; });
    host.querySelector('#cyScrub').addEventListener('input', function (e) { setPlaying(false); st.t = +e.target.value / 100; render(); });
    Array.prototype.forEach.call(host.querySelectorAll('.cy-seg'), function (b) {
      b.addEventListener('click', function () { st.t = +b.getAttribute('data-t') + 0.01; render(); });
    });
    var onResize = function () { size(); render(); };
    window.addEventListener('resize', onResize);
    var onTheme = function () { render(); };
    document.addEventListener('kanagata:theme', onTheme);
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { st.visible = es[0].isIntersecting; }) : null;
    if (io) io.observe(cvs);
    size(); render();
    setPlaying(st.playing);
    return function destroy() {
      cancelAnimationFrame(st.raf); window.removeEventListener('resize', onResize); document.removeEventListener('kanagata:theme', onTheme);
      if (io) io.disconnect();
    };
  }

  K.cycleAnim = { mount: mount, state: state, PHASES: PHASES, T: T_CYCLE };
})(window.KANAGATA);
