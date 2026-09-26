/* 「射出成形のしくみ」ページ（アニメーション・粘度曲線つき） */
(function (K) {
  'use strict';

  function fmt(v, d) { return (+v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function coolTime(hmm, mat, Tm, Tw) {       // 平板の冷却時間（中心温度が取出し温度になるまで）
    var h = hmm * 1e-3, a = mat.alpha;
    return h * h / (Math.PI * Math.PI * a) * Math.log(8 / (Math.PI * Math.PI) * (Tm - Tw) / (mat.Teject - Tw));
  }

  function html() {
    var pp = K.materialById('PP');
    var coolRows = [1, 1.5, 2, 3, 4].map(function (h) {
      return '<tr><td class="num">' + fmt(h, 1) + ' mm</td><td class="num">' + fmt(coolTime(h, pp, pp.Tm, pp.Tw), 1) + ' 秒</td></tr>';
    }).join('');
    var matOpts = K.materials.map(function (m) { return '<option value="' + m.id + '">' + m.name + '（' + m.full + '）</option>'; }).join('');
    return '' +
    '<div class="page-head"><span class="eyebrow">射出成形ラボ ｜ しくみ</span><h1>射出成形のしくみ</h1>' +
    '<p class="lead">成形機は1サイクルの中で何をしているのか。溶けた樹脂は金型の中でどう流れ、どう固まるのか。動きと数値で理解して、成形条件の意味がわかるようになることを目指します。</p></div>' +
    '<nav class="toc"><h2>このページの内容</h2><ol>' +
    ['射出成形機の構造', '1サイクルを動かして見る', '圧力の波形を読む', '溶けた樹脂の流れにくさ（粘度）', '流動先端で起きていること（噴水流）', '冷却時間の見積もり', '条件出しの基本手順', 'シミュレーターで確かめる']
      .map(function (t, i) { return '<li><a href="#/molding#m' + (i + 1) + '" data-anchor="m' + (i + 1) + '">' + t + '</a></li>'; }).join('') +
    '</ol></nav>' +

    '<h2 id="m1">射出成形機の構造</h2>' +
    '<p>射出成形機は、樹脂を溶かして押し出す<b>射出ユニット</b>と、金型を開け閉めして締め付ける<b>型締ユニット</b>の2つでできています。成形機の大きさは、金型を締め付ける力＝<b>型締力（トン）</b>で「100トン機」のように呼びます。</p>' +
    '<div class="grid cols-2">' +
    '<div class="card"><h3 style="margin-top:0">射出ユニット</h3><ul>' +
    '<li><b>ホッパ</b>：ペレット（粒状の樹脂）を入れる投入口。</li>' +
    '<li><b>加熱シリンダ（バレル）</b>：外周のヒーターで加熱する筒。後ろから前へ温度を上げていく。</li>' +
    '<li><b>スクリュー</b>：回転してペレットを前へ送りながら溶かし（可塑化）、前進して射出する。溝が深い<b>供給部</b>、溝が浅くなって樹脂を圧縮・溶融する<b>圧縮部</b>、溶融樹脂を均一にする<b>計量部</b>の3区間がある。</li>' +
    '<li><b>逆流防止リング（チェックリング）</b>：スクリュー先端の弁。計量中は開いて樹脂を前へ通し、射出中は閉じて逆流を防ぐ。摩耗するとクッション量が安定しなくなる。</li>' +
    '<li><b>ノズル</b>：金型のスプルーブッシュに押し当てて樹脂を送り込む。</li></ul></div>' +
    '<div class="card"><h3 style="margin-top:0">型締ユニット</h3><ul>' +
    '<li><b>固定盤・可動盤</b>：金型の固定側・可動側を取り付ける厚い板。</li>' +
    '<li><b>タイバー</b>：型締力を受け止める4本の柱。型締中はわずかに伸びている。</li>' +
    '<li><b>トグル機構</b>：リンクを伸び切らせる「てこ」で、小さな力から大きな型締力を得る方式。高速で電動機に多い。油圧シリンダで直接締める<b>直圧式</b>もある。</li>' +
    '<li><b>エジェクタ（突き出し）</b>：可動盤側から製品を押し出す機構。</li></ul></div></div>' +
    '<div class="table-wrap"><table><thead><tr><th>駆動方式</th><th>特徴</th><th>向いている用途</th></tr></thead><tbody>' +
    '<tr><td>電動式</td><td>サーボモーター駆動。位置・速度の再現性が高く、省エネで静か。</td><td>精密部品、医療・電子部品、クリーン環境</td></tr>' +
    '<tr><td>油圧式</td><td>大きな力を出しやすく、保圧を長く保つのが得意。構造が単純。</td><td>大型品、厚肉品、長時間の保圧</td></tr>' +
    '<tr><td>ハイブリッド</td><td>射出は電動、型締は油圧など、両方の長所を組み合わせる。</td><td>中〜大型で精度も求める部品</td></tr>' +
    '</tbody></table></div>' +
    '<div class="note"><span class="note-title">成形機選びの目安</span><ul>' +
    '<li><b>型締力</b>：（製品＋ランナーの投影面積）×（キャビティ内の平均圧力）＋余裕。<a href="#/tools">計算ツール</a>で概算できます。</li>' +
    '<li><b>射出容量</b>：1ショットの重量が、射出容量の<b>20〜80%程度</b>に収まる機械を選ぶ。小さすぎると計量が不安定、大きすぎると樹脂がシリンダ内に長く滞留して熱劣化する。</li>' +
    '<li><b>金型の取付寸法</b>：タイバー間隔、型厚の範囲、型開きストローク、ロケートリング径、突き出しストローク。</li></ul></div>' +

    '<h2 id="m2">1サイクルを動かして見る</h2>' +
    '<p>下のアニメーションは、小型部品（肉厚2 mm程度）を成形する典型的な1サイクル（約15秒）です。工程名をクリックするとその場面へ移動し、スライダーで時間を前後できます。下のグラフは、同じ時刻の<b>樹脂圧力</b>と<b>スクリュー位置</b>です。</p>' +
    '<div id="cycleHost"></div>' +
    '<div class="table-wrap"><table><thead><tr><th>工程</th><th class="num">時間の例</th><th>主な設定条件</th><th>設定を誤ると</th></tr></thead><tbody>' +
    '<tr><td>型閉じ・型締め</td><td class="num">1〜2 秒</td><td>型閉じ速度、金型保護の圧力・位置、型締力</td><td>異物のかみ込みで金型破損、型締力不足でバリ</td></tr>' +
    '<tr><td>射出（充填）</td><td class="num">0.3〜3 秒</td><td>射出速度（多段設定）、V/P切替位置、射出圧力の上限</td><td>速すぎ：焼け・バリ・ジェッティング／遅すぎ：ショート・フローマーク・ウェルド強度低下</td></tr>' +
    '<tr><td>保圧</td><td class="num">2〜10 秒</td><td>保圧（多段）、保圧時間</td><td>低すぎ・短すぎ：ヒケ・ボイド・寸法小／高すぎ：バリ・残留応力・離型不良</td></tr>' +
    '<tr><td>冷却（計量）</td><td class="num">5〜30 秒</td><td>冷却時間、金型温度、スクリュー回転数、背圧、計量値</td><td>冷却不足：突き出し変形・そり／背圧不足：気泡・色ムラ</td></tr>' +
    '<tr><td>型開き・突き出し</td><td class="num">1〜3 秒</td><td>型開き速度、突き出し速度・ストローク</td><td>突き出し変形・白化、製品の落下不良</td></tr>' +
    '</tbody></table></div>' +

    '<h2 id="m3">圧力の波形を読む</h2>' +
    '<p>成形の良し悪しは、圧力の波形にはっきり現れます。上のグラフの2本の線は、次のように読みます。</p>' +
    '<ul><li><b>射出圧力（青）</b>：スクリュー前方の樹脂の圧力。充填が進んで流動長が伸びるほど上がり、V/P切替で保圧の設定値に下がる。計量中に小さく出ているのは<b>背圧</b>。</li>' +
    '<li><b>キャビティ内圧（オレンジ）</b>：金型内のセンサーの値。樹脂がセンサーに届いてから立ち上がり、充填の最後に一気に上がる（圧縮）。保圧中は冷えて縮むぶんだけ緩やかに下がり、<b>ゲートシール</b>後は樹脂が補給されないので急に下がる。</li></ul>' +
    '<p>射出圧力とキャビティ内圧の差は、ノズル・スプルー・ランナー・ゲートでの<b>圧力損失</b>です。細いゲートほど損失が大きく、キャビティに伝わる保圧が小さくなります。</p>' +
    '<div class="grid cols-2">' +
    '<div class="card"><h3 style="margin-top:0">V/P切替の位置</h3><p>切替が<b>早すぎる</b>と、残りを低い保圧で押すことになりショートやヒケが出やすい。<b>遅すぎる</b>と、充填の最後に速度制御のまま圧力が跳ね上がり、バリや過充填、金型へのダメージの原因になる。充填率で95〜99%を狙います。</p></div>' +
    '<div class="card"><h3 style="margin-top:0">クッション量</h3><p>保圧が終わったときスクリューの前に残っている樹脂の量。毎ショット一定であることが安定成形の条件です。<b>0になる</b>と保圧が伝わらずヒケが出ます。ばらつくときは、逆流防止リングの摩耗や計量不良を疑います。</p></div>' +
    '<div class="card"><h3 style="margin-top:0">ゲートシール試験</h3><p>保圧時間を少しずつ延ばして成形し、製品の重さを測ります。ある時間から重さが増えなくなる点がゲートシール時間です。保圧時間はこれより少し長く設定します。</p></div>' +
    '<div class="card"><h3 style="margin-top:0">キャビティ内圧センサー</h3><p>金型内の圧力を毎ショット監視すると、ショート・バリ・寸法不良を成形中に検知できます。波形のピーク値と積分値が品質の指標として使われます。</p></div></div>' +

    '<h2 id="m4">溶けた樹脂の流れにくさ（粘度）</h2>' +
    '<p>溶けた樹脂は水の数千〜数万倍もねばる液体ですが、その粘度は一定ではありません。<b>速く流すほど粘度が下がる</b>（せん断流動化）性質と、<b>温度が下がると急に粘度が上がる</b>性質をもちます。下のグラフは、シミュレーターと同じ Cross-WLF モデルで計算した粘度曲線です。</p>' +
    '<div class="anim-card"><div class="anim-controls" style="margin-top:0"><label class="fs-label" for="viscMat" style="align-self:center">材料</label><select id="viscMat" class="fs-select">' + matOpts + '</select></div>' +
    '<figure class="fs-chart" style="margin-top:10px"><figcaption>粘度とせん断速度（両対数目盛）</figcaption><div id="viscChart"></div></figure>' +
    '<p class="fs-sub" id="viscNote"></p></div>' +
    '<ul><li><b>せん断速度</b>は「流路の断面のなかで、速さがどれだけ急に変わるか」。成形中の目安は、キャビティで 10²〜10³ s⁻¹、ランナーで 10³〜10⁴ s⁻¹、細いゲートで 10⁴〜10⁵ s⁻¹。</li>' +
    '<li>材料ごとに<b>許容せん断速度</b>の上限があり、ゲートが細すぎて超えると分子が切れて焼けや物性低下（せん断焼け）が起こる。</li>' +
    '<li>カタログの <b>MFR（メルトフローレート）</b>は、低いせん断速度で測る値。成形中の粘度とは条件が違うので、MFRが同じでも流れやすさが違うことがある。</li></ul>' +

    '<h2 id="m5">流動先端で起きていること（噴水流）</h2>' +
    '<p>肉厚方向の断面で見ると、樹脂は中心ほど速く流れ、壁際はほとんど動きません。中心を流れてきた樹脂は流動先端に追いつくと、<b>噴水のように壁の方へ押し広げられ</b>、冷たい金型に触れた瞬間に固まって<b>固化層（スキン層）</b>になります。これを<b>ファウンテンフロー（噴水流）</b>と呼びます。</p>' +
    '<div id="fountainHost"></div>' +
    '<div class="grid cols-2">' +
    '<div class="card"><h3 style="margin-top:0">製品の表面は「先端にいた樹脂」</h3><p>製品の表面は、流動先端で伸ばされながら壁に押し付けられた樹脂でできています。だから先端の温度や速度が外観を決めます。先端が冷えすぎると<b>フローマーク</b>、ゲートから噴き出して壁に触れずに蛇行すると<b>ジェッティング</b>になります。</p></div>' +
    '<div class="card"><h3 style="margin-top:0">固化層は流れるほど厚くなる</h3><p>固化層は、先端が通過してからの時間とともに育ちます。ゲートから遠く、ゆっくり流れた場所ほど固化層が厚く、流路が狭くなります。流れが止まると（ためらい）一気に固化が進み、ショートの原因になります。</p></div>' +
    '<div class="card"><h3 style="margin-top:0">スキン・コア構造</h3><p>表面の固化層では分子（ガラス繊維入りなら繊維）が流れの向きにそろい、中心部は比較的ランダムになります。この層構造が、流れ方向と直角方向で収縮率が違う（異方性）原因で、<b>そり</b>につながります。</p></div>' +
    '<div class="card"><h3 style="margin-top:0">保圧で補う</h3><p>樹脂は冷えると体積が数%縮みます。保圧は、固化層の内側にまだ残っている溶融したコアへ樹脂を押し込み、この収縮を補う工程です。コアが固まる前にゲートが先に固まると、厚肉部にヒケやボイドが出ます。</p></div></div>' +

    '<h2 id="m6">冷却時間の見積もり</h2>' +
    '<p>サイクルタイムの大半を占める冷却時間は、平板の熱伝導の式で見積もれます。製品中心の温度が取出し温度まで下がる時間は</p>' +
    '<p class="fs-eq">t<sub>c</sub> = h² / (π² α) × ln{ (8/π²) × (T<sub>m</sub> − T<sub>w</sub>) / (T<sub>e</sub> − T<sub>w</sub>) }</p>' +
    '<p>（h：肉厚、α：熱拡散率、T<sub>m</sub>：樹脂温度、T<sub>w</sub>：金型温度、T<sub>e</sub>：取出し温度）。<b>冷却時間は肉厚の2乗に比例</b>するので、肉厚が2倍になると冷却時間は約4倍です。PP（樹脂温度' + pp.Tm + '℃・金型温度' + pp.Tw + '℃・取出し温度' + pp.Teject + '℃）の例：</p>' +
    '<div class="table-wrap" style="max-width:420px"><table><thead><tr><th class="num">肉厚</th><th class="num">冷却時間の目安</th></tr></thead><tbody>' + coolRows + '</tbody></table></div>' +
    '<p>材料・温度を変えた計算は<a href="#/tools">計算ツール</a>の「冷却時間」でできます。厚肉部だけを冷やす<b>ベリリウム銅の入子</b>や、形状に沿った<b>コンフォーマル冷却</b>（<a href="#/types/am">3Dプリンタの活用</a>）は、この式の h が大きい場所への対策です。</p>' +

    '<h2 id="m7">条件出しの基本手順</h2>' +
    '<ol class="steps">' +
    '<li><h3>材料を乾燥する</h3><p>PA・PC・PBT・PET・ABS など吸湿する材料は、メーカー指定の温度・時間で乾燥します。乾燥不足はシルバーストリークや強度低下の原因で、条件では直せません。</p></li>' +
    '<li><h3>温度を決める</h3><p>樹脂温度・金型温度を材料メーカー推奨範囲の中央に設定し、実測で確認します（設定値と実際の温度は違うことが多い）。</p></li>' +
    '<li><h3>計量値とV/P切替位置を決める（ショートショット法）</h3><p>保圧をかけずに充填だけで成形し、わざとショートの状態から少しずつ計量を増やして、充填率95〜98%になる位置をV/P切替位置にします。</p></li>' +
    '<li><h3>射出速度を決める</h3><p>外観（フローマーク・ジェッティング・焼け）、ウェルドの見え方、バリを見ながら決めます。ゲート付近だけ遅くするなど多段で設定することも多い。</p></li>' +
    '<li><h3>保圧と保圧時間を決める</h3><p>ヒケと寸法が安定する保圧を探し、保圧時間はゲートシール試験で決めます。</p></li>' +
    '<li><h3>冷却時間を詰める</h3><p>突き出しで変形・白化しない範囲で、できるだけ短くします。</p></li>' +
    '<li><h3>条件幅を確認して記録する</h3><p>各条件を上下に振っても良品が出るか（プロセスウィンドウ）を確認し、最終条件を記録します。条件幅が狭いと、材料ロットや季節の変化で不良が再発します。</p></li></ol>' +

    '<h2 id="m8">シミュレーターで確かめる</h2>' +
    '<div class="grid cols-3">' +
    '<a class="tile" href="#/flowsim"><h3><span class="tile-ico">🌊</span>樹脂流動シミュレーター</h3><p>ゲート位置・材料・条件を変えて、ウェルドライン、エアトラップ、ショートショットを3D表示と断面図で確かめる。</p></a>' +
    '<a class="tile" href="#/types/injection"><h3><span class="tile-ico">💧</span>射出成形金型（図鑑）</h3><p>金型の構造・ゲートの種類・不良と対策の一覧。</p></a>' +
    '<a class="tile" href="#/trouble"><h3><span class="tile-ico">🛠️</span>不良とトラブル対応</h3><p>ヒケ・ショート・バリ・そり・焼けの見た目と原因・対策をイラストで。</p></a></div>';
  }

  function viscChart(host) {
    var sel = host.querySelector('#viscMat'), box = host.querySelector('#viscChart'), note = host.querySelector('#viscNote');
    function drawIt() {
      var m = K.materialById(sel.value);
      var temps = [m.Tm - 20, m.Tm, m.Tm + 20];
      var cols = ['var(--t-lo)', 'var(--t-mid)', 'var(--t-hi)'];
      var series = temps.map(function (T, i) {
        var pts = [];
        for (var e = 1; e <= 5.0001; e += 0.05) { var g = Math.pow(10, e); pts.push([g, K.rheology.viscosity(m, T, g)]); }
        return { name: '樹脂温度 ' + T + '℃', color: cols[i], points: pts };
      });
      K.charts.line(box, {
        series: series, xLog: true, yLog: true, xMin: 10, xMax: 1e5, yMin: 1, yMax: 3e4,
        xTicks: [10, 100, 1000, 1e4, 1e5], xFmt: function (v) { return v >= 1000 ? (v / 1000) + 'k' : String(v); },
        yTicks: [1, 10, 100, 1000, 1e4], yTickFmt: function (v) { return v.toLocaleString('ja-JP'); },
        xLabel: 'せん断速度 [1/s]（対数）', yLabel: 'Pa·s', yUnit: ' Pa·s', xUnit: ' /s', xName: 'せん断速度',
        yFmt: function (v) { return v.toLocaleString('ja-JP', { maximumFractionDigits: v < 100 ? 1 : 0 }); },
        markers: [{ x: 300, label: 'キャビティ' }, { x: 3000, label: 'ランナー' }, { x: 30000, label: 'ゲート' }],
        height: 250, ariaLabel: m.name + 'の粘度曲線'
      });
      var r = K.rheology.viscosity(m, m.Tm - 10, 1000) / K.rheology.viscosity(m, m.Tm, 1000);
      var sh = K.rheology.viscosity(m, m.Tm, 100) / K.rheology.viscosity(m, m.Tm, 10000);
      note.textContent = m.name + '：樹脂温度を10℃下げると粘度は約' + fmt((r - 1) * 100, 0) + '%上がり、せん断速度が100 s⁻¹から10,000 s⁻¹に上がると粘度は約1/' + fmt(sh, 0) + 'になります。' + m.note;
    }
    sel.addEventListener('change', drawIt);
    drawIt();
  }

  K.renderMolding = function (main) {
    main.innerHTML = html();
    var destroyers = [];
    destroyers.push(K.cycleAnim.mount(main.querySelector('#cycleHost')));
    destroyers.push(K.fountainAnim.mount(main.querySelector('#fountainHost')));
    viscChart(main);
    Array.prototype.forEach.call(main.querySelectorAll('[data-anchor]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var el = document.getElementById(a.getAttribute('data-anchor'));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    K.pageCleanup = function () { destroyers.forEach(function (d) { try { d(); } catch (e) { } }); };
  };
  K.coolTime = coolTime;
})(window.KANAGATA);
