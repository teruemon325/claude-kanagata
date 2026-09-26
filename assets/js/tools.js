/* 実務計算ツール */
(function (K) {
  'use strict';

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function field(parent, id, label, hint, value, extra) {
    var wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', { for: id }, label + (hint ? '<small>' + hint + '</small>' : '')));
    var input;
    if (extra && extra.options) {
      input = el('select', { id: id });
      extra.options.forEach(function (o, i) {
        var op = el('option', { value: o[1] }, o[0]);
        if (i === (extra.selected || 0)) op.selected = true;
        input.appendChild(op);
      });
    } else {
      input = el('input', { id: id, type: 'number', step: (extra && extra.step) || 'any', value: value });
    }
    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function fmt(n, dp) {
    if (!isFinite(n)) return '—';
    return n.toLocaleString('ja-JP', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  K.tools = [

    /* ---------------- 1. 工法比較・損益分岐点 ---------------- */
    {
      id: 'breakeven',
      title: '工法比較・損益分岐点',
      desc: '「型を作るべきか、切削で流すべきか」。イニシャル費用と単価から、どちらが得になる数量を求めます。営業の提案資料にそのまま使える計算です。',
      render: function (root) {
        var box = el('div', { class: 'tool' });
        var g = el('div', { class: 'grid cols-2' });
        var a = el('div', { class: 'card' }, '<h4 style="margin-top:0">案A（例：量産金型）</h4>');
        var b = el('div', { class: 'card' }, '<h4 style="margin-top:0">案B（例：切削・簡易型）</h4>');
        var ia = field(a, 'be-ia', 'イニシャル費用', '型費など（円）', 6000000);
        var ua = field(a, 'be-ua', '部品単価', '（円／個）', 80);
        var ib = field(b, 'be-ib', 'イニシャル費用', '型費など（円）', 150000);
        var ub = field(b, 'be-ub', '部品単価', '（円／個）', 1200);
        g.appendChild(a); g.appendChild(b);
        box.appendChild(g);
        var qty = field(box, 'be-q', '想定生産数', '（個）', 100000);
        var out = el('div', { class: 'tool-out' });
        box.appendChild(out);

        function calc() {
          var IA = num(ia.value, 0), UA = num(ua.value, 0), IB = num(ib.value, 0), UB = num(ub.value, 0), Q = num(qty.value, 0);
          var tA = IA + UA * Q, tB = IB + UB * Q;
          var bp = (UB - UA) !== 0 ? (IA - IB) / (UB - UA) : NaN;
          var win = tA < tB ? '案A' : (tB < tA ? '案B' : '同額');
          var html = '';
          if (isFinite(bp) && bp > 0) {
            html += '<span class="big">' + fmt(Math.ceil(bp), 0) + ' 個</span>';
            html += '<span class="sub">この数量を超えると、単価の安い案（通常は金型側）が総額で有利になります。</span>';
          } else {
            html += '<span class="big">分岐点なし</span><span class="sub">どの数量でも一方が有利です（単価の大小関係を確認してください）。</span>';
          }
          html += '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>案</th><th class="num">総額</th><th class="num">1個あたり総コスト</th></tr></thead><tbody>' +
            '<tr><td>案A</td><td class="num">' + fmt(tA, 0) + ' 円</td><td class="num">' + (Q > 0 ? fmt(tA / Q, 1) + ' 円' : '—') + '</td></tr>' +
            '<tr><td>案B</td><td class="num">' + fmt(tB, 0) + ' 円</td><td class="num">' + (Q > 0 ? fmt(tB / Q, 1) + ' 円' : '—') + '</td></tr>' +
            '</tbody></table></div>';
          html += '<span class="sub">想定生産数 ' + fmt(Q, 0) + ' 個では <b>' + win + '</b> が有利（差額 ' + fmt(Math.abs(tA - tB), 0) + ' 円）。</span>';
          out.innerHTML = html;
        }
        [ia, ua, ib, ub, qty].forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        root.appendChild(box);
      }
    },

    /* ---------------- 2. 成形収縮率から型寸法 ---------------- */
    {
      id: 'shrink',
      title: '成形収縮率から型寸法を求める',
      desc: '樹脂は冷えると縮むため、金型は製品図面より大きく作ります。樹脂を選ぶと収縮率の範囲から型寸法の目安を計算します。',
      render: function (root) {
        var box = el('div', { class: 'tool' });
        var opts = K.shrinkage.map(function (r, i) { return [r[1] + '（' + r[0] + '）  ' + r[2] + '〜' + r[3] + '%', i]; });
        var sel = field(box, 'sh-mat', '樹脂', '成形収縮率の目安を自動セット', null, { options: opts, selected: 3 });
        var dim = field(box, 'sh-dim', '製品の寸法', '図面値（mm）', 100);
        var out = el('div', { class: 'tool-out' });
        box.appendChild(out);

        function calc() {
          var row = K.shrinkage[parseInt(sel.value, 10)];
          var D = num(dim.value, 0);
          var lo = row[2], hi = row[3], mid = (lo + hi) / 2;
          var f = function (s) { return D * (1 + s / 100); };
          out.innerHTML =
            '<span class="big">' + fmt(f(mid), 3) + ' mm</span>' +
            '<span class="sub">収縮率 ' + mid.toFixed(2) + '%（中央値）で計算した型寸法。実際は下表の範囲で振れます。</span>' +
            '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>収縮率</th><th class="num">型寸法</th><th class="num">製品との差</th></tr></thead><tbody>' +
            '<tr><td>下限 ' + lo + '%</td><td class="num">' + fmt(f(lo), 3) + ' mm</td><td class="num">+' + fmt(f(lo) - D, 3) + '</td></tr>' +
            '<tr><td>中央 ' + mid.toFixed(2) + '%</td><td class="num">' + fmt(f(mid), 3) + ' mm</td><td class="num">+' + fmt(f(mid) - D, 3) + '</td></tr>' +
            '<tr><td>上限 ' + hi + '%</td><td class="num">' + fmt(f(hi), 3) + ' mm</td><td class="num">+' + fmt(f(hi) - D, 3) + '</td></tr>' +
            '</tbody></table></div>' +
            '<span class="sub"><b>' + row[1] + '</b>：' + row[4] + '</span>' +
            '<span class="sub">※ 収縮率は肉厚・成形条件・ゲート位置・繊維配向で変わります。重要寸法は<b>トライの実測値でフィードバック</b>して型を修正するのが前提です。</span>';
        }
        sel.addEventListener('change', calc); dim.addEventListener('input', calc);
        calc();
        root.appendChild(box);
      }
    },

    /* ---------------- 3. プレスのクリアランス ---------------- */
    {
      id: 'clearance',
      title: 'プレス：せん断クリアランス',
      desc: '板厚と材質から、パンチとダイの片側クリアランスの目安を計算します。打ち抜き（穴あけ）と外形抜きでは、寸法を持たせる側が逆になる点も示します。',
      render: function (root) {
        var box = el('div', { class: 'tool' });
        var opts = K.clearanceRates.map(function (r, i) { return [r[0] + '  ' + r[1] + '〜' + r[2] + '%', i]; });
        var sel = field(box, 'cl-mat', '材質', '推奨クリアランス率', null, { options: opts, selected: 0 });
        var t = field(box, 'cl-t', '板厚 t', '（mm）', 1.0);
        var d = field(box, 'cl-d', '狙いの穴径／外形寸法', '（mm）', 10.0);
        var out = el('div', { class: 'tool-out' });
        box.appendChild(out);

        function calc() {
          var row = K.clearanceRates[parseInt(sel.value, 10)];
          var T = num(t.value, 0), D = num(d.value, 0);
          var lo = T * row[1] / 100, hi = T * row[2] / 100, mid = (lo + hi) / 2;
          out.innerHTML =
            '<span class="big">' + fmt(mid, 3) + ' mm <small style="font-size:14px;color:var(--text-muted)">（片側）</small></span>' +
            '<span class="sub">' + row[0] + '：板厚の ' + row[1] + '〜' + row[2] + '%　→　片側 ' + fmt(lo, 3) + '〜' + fmt(hi, 3) + ' mm（両側合計 ' + fmt(lo * 2, 3) + '〜' + fmt(hi * 2, 3) + ' mm）</span>' +
            '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>加工</th><th>寸法を決める側</th><th class="num">パンチ径</th><th class="num">ダイ穴径</th></tr></thead><tbody>' +
            '<tr><td>穴あけ（穴の寸法が重要）</td><td>パンチ</td><td class="num">' + fmt(D, 3) + '</td><td class="num">' + fmt(D + 2 * mid, 3) + '</td></tr>' +
            '<tr><td>外形抜き（製品外形が重要）</td><td>ダイ</td><td class="num">' + fmt(D - 2 * mid, 3) + '</td><td class="num">' + fmt(D, 3) + '</td></tr>' +
            '</tbody></table></div>' +
            '<span class="sub">穴はパンチの寸法が、抜き落とした製品の外形はダイの寸法がほぼそのまま出ます。<b>「精度が欲しい側の刃で寸法を決め、逆側にクリアランスを逃がす」</b>のが原則です。</span>';
        }
        sel.addEventListener('change', calc); [t, d].forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        root.appendChild(box);
      }
    },

    /* ---------------- 4. 曲げ展開長 ---------------- */
    {
      id: 'bend',
      title: 'プレス：90°曲げの展開長',
      desc: '曲げた板を平らに戻したときの長さ（ブランク寸法）を求めます。曲げると材料が伸びるため、単純な足し算にはなりません。',
      render: function (root) {
        var box = el('div', { class: 'tool' });
        var a = field(box, 'bd-a', '辺A（外寸）', '（mm）', 50);
        var b = field(box, 'bd-b', '辺B（外寸）', '（mm）', 30);
        var t = field(box, 'bd-t', '板厚 t', '（mm）', 2.0);
        var r = field(box, 'bd-r', '曲げ内側半径 R', '（mm）', 2.0);
        var k = field(box, 'bd-k', '中立軸係数 K', '一般に0.33〜0.50。R が小さいほど小さい値', 0.42);
        var out = el('div', { class: 'tool-out' });
        box.appendChild(out);

        function calc() {
          var A = num(a.value, 0), B = num(b.value, 0), T = num(t.value, 0), R = num(r.value, 0), Kf = num(k.value, 0.42);
          var ba = (Math.PI / 2) * (R + Kf * T);          // 90度の曲げ伸び（中立軸の円弧長）
          var flat = (A - (R + T)) + (B - (R + T)) + ba;
          var naive = A + B;
          out.innerHTML =
            '<span class="big">' + fmt(flat, 2) + ' mm</span>' +
            '<span class="sub">展開長（ブランク寸法）。単純に辺を足した ' + fmt(naive, 2) + ' mm より <b>' + fmt(naive - flat, 2) + ' mm 短く</b>なります。</span>' +
            '<div class="table-wrap" style="margin-top:12px"><table><tbody>' +
            '<tr><td>直線部A</td><td class="num">' + fmt(A - (R + T), 2) + ' mm</td></tr>' +
            '<tr><td>直線部B</td><td class="num">' + fmt(B - (R + T), 2) + ' mm</td></tr>' +
            '<tr><td>曲げ部の伸び（BA）</td><td class="num">' + fmt(ba, 2) + ' mm</td></tr>' +
            '</tbody></table></div>' +
            '<span class="sub">計算式：<code>展開長 ＝ (A−(R+t)) ＋ (B−(R+t)) ＋ (π/2)×(R＋K·t)</code></span>' +
            '<span class="sub">※ K値は材質・曲げ条件で変わるため、<b>社内の実測値を使うのが最も正確</b>です。またスプリングバック分は別途見込む必要があります。</span>';
        }
        [a, b, t, r, k].forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        root.appendChild(box);
      }
    },

    /* ---------------- 5. 型締力の概算 ---------------- */
    {
      id: 'clamp',
      title: '射出成形：必要な型締力',
      desc: '投影面積とキャビティ内圧から、成形機に必要な型締力（トン数）を概算します。型締力が足りないとバリが出ます。',
      render: function (root) {
        var box = el('div', { class: 'tool' });
        var area = field(box, 'cf-a', '製品の投影面積（合計）', '型開き方向から見た面積。ランナーも含める（cm²）', 150);
        var cav = field(box, 'cf-n', 'キャビティ数', '（個取り）', 1, { step: 1 });
        var press = field(box, 'cf-p', 'キャビティ内圧', '一般樹脂30〜40、エンプラ・GF入り50〜70（MPa）', 40);
        var sf = field(box, 'cf-s', '安全率', '通常1.1〜1.3', 1.2);
        var out = el('div', { class: 'tool-out' });
        box.appendChild(out);

        function calc() {
          var A = num(area.value, 0), N = num(cav.value, 1), P = num(press.value, 40), S = num(sf.value, 1.2);
          var total = A * N;
          var kN = P * total * 100 / 1000;     // MPa(N/mm²) × mm² → N → kN
          var tonf = kN / 9.80665 * S;
          var kNs = kN * S;
          out.innerHTML =
            '<span class="big">' + fmt(tonf, 0) + ' tonf <small style="font-size:14px;color:var(--text-muted)">（約 ' + fmt(kNs, 0) + ' kN）</small></span>' +
            '<span class="sub">投影面積 合計 ' + fmt(total, 1) + ' cm²、内圧 ' + fmt(P, 0) + ' MPa、安全率 ' + S + ' のときに必要な型締力。</span>' +
            '<span class="sub">この値<b>以上</b>の型締力をもつ成形機を選びます（例：' + fmt(tonf, 0) + ' tonf → 一般的には ' + fmt(Math.ceil(tonf / 50) * 50, 0) + ' t クラス以上の機種）。</span>' +
            '<span class="sub">※ 内圧は樹脂の流動性、肉厚、流動長／肉厚比で大きく変わります。薄肉・長流動の製品では内圧が上がるため、CAE解析での確認を推奨します。</span>';
        }
        [area, cav, press, sf].forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        root.appendChild(box);
      }
    },

    /* ---------------- 冷却時間 ---------------- */
    {
      id: 'cooling',
      title: '射出成形：冷却時間の目安',
      desc: '製品の中心温度が取出し温度まで下がる時間を、平板の熱伝導の式で求めます。サイクルタイムの大半を占める冷却時間が、肉厚の2乗に比例することを確かめられます。',
      render: function (root) {
        var box = el('div', { class: 'tool' });
        var mats = K.materials || [];
        var sel = field(box, 'ct-mat', '樹脂', '熱拡散率と標準温度を自動セット', null, { options: mats.map(function (m, i) { return [m.name + '（' + m.full + '）', i]; }), selected: 0 });
        var th = field(box, 'ct-h', '肉厚 h', '最も厚い部分（mm）', 2.0);
        var tm = field(box, 'ct-tm', '樹脂温度 Tm', '（℃）', mats.length ? mats[0].Tm : 230);
        var tw = field(box, 'ct-tw', '金型温度 Tw', '（℃）', mats.length ? mats[0].Tw : 40);
        var te = field(box, 'ct-te', '取出し温度 Te', '突き出しで変形しない温度（℃）', mats.length ? mats[0].Teject : 95);
        var out = el('div', { class: 'tool-out' });
        box.appendChild(out);
        function tc(hmm, a, Tm, Tw, Te) {
          var h = hmm * 1e-3, r = 8 / (Math.PI * Math.PI) * (Tm - Tw) / (Te - Tw);
          return r > 1 ? h * h / (Math.PI * Math.PI * a) * Math.log(r) : 0;
        }
        function calc() {
          var m = mats[parseInt(sel.value, 10)] || { alpha: 8e-8 };
          var H = num(th.value, 2), Tm = num(tm.value, 230), Tw = num(tw.value, 40), Te = num(te.value, 95);
          if (!(Te > Tw && Tm > Te)) { out.innerHTML = '<span class="sub">温度は 金型温度 ＜ 取出し温度 ＜ 樹脂温度 となるように入力してください。</span>'; return; }
          var t = tc(H, m.alpha, Tm, Tw, Te);
          var rows = [0.5, 1, 1.5, 2].map(function (k) {
            return '<tr><td class="num">' + fmt(H * k, 2) + ' mm</td><td class="num">' + fmt(tc(H * k, m.alpha, Tm, Tw, Te), 1) + ' 秒</td></tr>';
          }).join('');
          out.innerHTML =
            '<span class="big">' + fmt(t, 1) + ' 秒</span>' +
            '<span class="sub">熱拡散率 α = ' + (m.alpha * 1e8).toFixed(1) + '×10⁻⁸ m²/s で計算。金型温度を10℃下げると ' + fmt(tc(H, m.alpha, Tm, Tw - 10, Te), 1) + ' 秒、取出し温度を10℃上げられれば ' + fmt(tc(H, m.alpha, Tm, Tw, Te + 10), 1) + ' 秒になります。</span>' +
            '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th class="num">肉厚</th><th class="num">冷却時間</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<span class="sub">計算式：<code>t = h²/(π²α) × ln{(8/π²)(Tm−Tw)/(Te−Tw)}</code>。肉厚が2倍になると冷却時間は約4倍です。</span>' +
            '<span class="sub">※ 平板・両面冷却・金型表面温度一定の理想条件です。リブの根元やボスなど局所的な厚肉部、冷却回路から遠い部分は、これより長くかかります。</span>';
        }
        sel.addEventListener('change', function () {
          var m = mats[parseInt(sel.value, 10)];
          if (m) { tm.value = m.Tm; tw.value = m.Tw; te.value = m.Teject; }
          calc();
        });
        [th, tm, tw, te].forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        root.appendChild(box);
      }
    },

    /* ---------------- 6. 抜き勾配とシボ ---------------- */
    {
      id: 'draft',
      title: '抜き勾配とシボの影響',
      desc: '抜き勾配を付けると、製品の上下で寸法が変わります。またシボ（表面模様）を入れると追加の勾配が必要です。その量を確認します。',
      render: function (root) {
        var box = el('div', { class: 'tool' });
        var h = field(box, 'df-h', '抜き方向の高さ', '（mm）', 40);
        var ang = field(box, 'df-a', '基本の抜き勾配', '片側（度）', 1.0);
        var sb = field(box, 'df-s', 'シボの深さ', 'シボなしは0（mm）', 0.05);
        var out = el('div', { class: 'tool-out' });
        box.appendChild(out);

        function calc() {
          var H = num(h.value, 0), A = num(ang.value, 0), S = num(sb.value, 0);
          var add = S / 0.025 * 1.0;                 // シボ深さ0.025mmにつき約1°
          var total = A + add;
          var rad = total * Math.PI / 180;
          var diff = H * Math.tan(rad);
          out.innerHTML =
            '<span class="big">' + fmt(total, 2) + '°</span>' +
            '<span class="sub">推奨する片側勾配（基本 ' + fmt(A, 2) + '° ＋ シボ分 ' + fmt(add, 2) + '°）。</span>' +
            '<div class="table-wrap" style="margin-top:12px"><table><tbody>' +
            '<tr><td>片側の寸法差（根元→先端）</td><td class="num">' + fmt(diff, 3) + ' mm</td></tr>' +
            '<tr><td>両側合計の寸法差</td><td class="num">' + fmt(diff * 2, 3) + ' mm</td></tr>' +
            '<tr><td>肉厚が一定なら、先端側の肉が</td><td class="num">' + fmt(diff, 3) + ' mm 薄くなる</td></tr>' +
            '</tbody></table></div>' +
            '<span class="sub">※ シボ分は「深さ0.025mmあたり約1°」という一般的な目安で計算しています。実際はシボの型番ごとにメーカー推奨値があるため、必ず確認してください。</span>' +
            '<span class="sub">※ 高さが大きい製品ほど勾配による寸法差が効きます。図面公差との整合を必ず確認しましょう。</span>';
        }
        [h, ang, sb].forEach(function (i) { i.addEventListener('input', calc); });
        calc();
        root.appendChild(box);
      }
    }
  ];
})(window.KANAGATA);
