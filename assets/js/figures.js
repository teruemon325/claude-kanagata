/* SVG 図版（番号コールアウト＋凡例リストで説明する方式） */
window.KANAGATA = window.KANAGATA || {};

function co(x, y, n) {
  return '<g><circle cx="' + x + '" cy="' + y + '" r="11" fill="var(--accent)"/>' +
         '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="sans-serif">' + n + '</text></g>';
}
function lead(x1, y1, x2, y2) {
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="svg-dim" stroke-dasharray="3 2"/>';
}

window.KANAGATA.figures = {

  /* ---------- プレス金型の基本構造（断面） ---------- */
  pressDie: {
    title: 'プレス金型の基本構造（打ち抜き型の断面）',
    caption: '上型が下降し、パンチとダイの刃で材料を切り離す瞬間。上型と下型はガイドポストで芯を保つ。',
    svg:
      '<svg viewBox="0 0 620 300" role="img" aria-label="プレス金型の断面構造図">' +
      // 上型ホルダ
      '<rect x="70" y="20" width="460" height="26" class="svg-fill-1"/>' +
      '<rect x="120" y="46" width="360" height="10" class="svg-fill-1"/>' +
      '<rect x="120" y="56" width="360" height="26" class="svg-fill-1"/>' +
      // ストリッパ
      '<rect x="120" y="118" width="90" height="32" class="svg-fill-1"/>' +
      '<rect x="246" y="118" width="94" height="32" class="svg-fill-1"/>' +
      '<rect x="360" y="118" width="120" height="32" class="svg-fill-1"/>' +
      // 材料
      '<rect x="110" y="150" width="380" height="10" class="svg-fill-2"/>' +
      // パンチ
      '<rect x="210" y="82" width="36" height="80" class="svg-fill-3"/>' +
      '<rect x="340" y="82" width="20" height="80" class="svg-fill-3"/>' +
      // ダイプレート
      '<rect x="120" y="160" width="88" height="46" class="svg-fill-1"/>' +
      '<rect x="248" y="160" width="90" height="46" class="svg-fill-1"/>' +
      '<rect x="362" y="160" width="118" height="46" class="svg-fill-1"/>' +
      // ダイホルダ
      '<rect x="70" y="206" width="460" height="28" class="svg-fill-1"/>' +
      // ガイドポスト
      '<rect x="88" y="46" width="14" height="160" class="svg-fill-3"/>' +
      '<rect x="498" y="46" width="14" height="160" class="svg-fill-3"/>' +
      // 材料送り矢印
      '<path d="M30 155 H100" class="svg-dim" stroke-width="2"/>' +
      '<path d="M100 155 l-9 -4 v8 z" fill="var(--accent)"/>' +
      '<text x="30" y="143" class="svg-label-sm">材料送り</text>' +
      // プレス下降矢印
      '<text x="540" y="36" class="svg-label-sm">上型</text>' +
      '<text x="540" y="228" class="svg-label-sm">下型</text>' +
      // コールアウト
      co(500, 33, 1) + co(228, 100, 2) + co(165, 134, 3) + co(140, 155, 4) +
      co(180, 183, 5) + co(500, 220, 6) + co(95, 100, 7) +
      lead(292, 248, 252, 178) + co(300, 255, 8) +
      '</svg>',
    legend: [
      'パンチホルダ（上型ダイセット）— パンチ側の土台。プレス機のスライドに取り付ける。',
      'パンチ — 材料を打ち抜く凸の刃。消耗品として交換・再研磨する。',
      'ストリッパ — パンチに食いついた材料を掻き落とし、加工中は材料を押さえる。',
      '材料（板材・コイル材）— 一定ピッチで送られる。',
      'ダイ（ダイプレート）— 受け側の凹の刃。下に抜きカスが落ちる逃げ穴がある。',
      'ダイホルダ（下型ダイセット）— プレス機のボルスタに固定する土台。',
      'ガイドポスト／ブッシュ — 上下型の芯を精密に案内する。',
      'クリアランス — パンチとダイの刃の隙間。板厚の5〜10%（片側）が目安で、品質を左右する最重要値。'
    ]
  },

  /* ---------- 射出成形金型の基本構造（断面） ---------- */
  injectionMold: {
    title: '射出成形金型の基本構造（型閉じ状態の断面）',
    caption: '左の成形機ノズルから溶けた樹脂が入り、キャビティを満たして冷え固まる。型が開いたらエジェクタピンで押し出す。',
    svg:
      '<svg viewBox="0 0 640 330" role="img" aria-label="射出成形金型の断面構造図">' +
      // ノズル
      '<path d="M18 148 H52 L60 155 L60 165 L52 172 H18 Z" class="svg-fill-3"/>' +
      // 固定側
      '<rect x="60" y="45" width="28" height="230" class="svg-fill-1"/>' +
      '<rect x="88" y="45" width="162" height="230" class="svg-fill-1"/>' +
      // 可動側
      '<rect x="250" y="45" width="150" height="230" class="svg-fill-1"/>' +
      '<rect x="400" y="45" width="80" height="70" class="svg-fill-1"/>' +
      '<rect x="400" y="205" width="80" height="70" class="svg-fill-1"/>' +
      '<rect x="480" y="45" width="28" height="230" class="svg-fill-1"/>' +
      // キャビティ（製品）とコア
      '<rect x="185" y="105" width="65" height="110" class="svg-fill-2"/>' +
      '<rect x="198" y="118" width="52" height="84" class="svg-fill-1"/>' +
      // スプルー
      '<polygon points="60,152 185,157 185,163 60,168" class="svg-fill-3"/>' +
      // エジェクタプレート＆ピン
      '<rect x="410" y="130" width="45" height="60" class="svg-fill-1"/>' +
      '<rect x="198" y="126" width="257" height="5" fill="var(--accent)"/>' +
      '<rect x="198" y="189" width="257" height="5" fill="var(--accent)"/>' +
      // 冷却回路
      '<circle cx="140" cy="88" r="10" class="svg-fill-2"/>' +
      '<circle cx="140" cy="240" r="10" class="svg-fill-2"/>' +
      '<circle cx="330" cy="88" r="10" class="svg-fill-2"/>' +
      '<circle cx="330" cy="240" r="10" class="svg-fill-2"/>' +
      // PL
      '<line x1="250" y1="32" x2="250" y2="300" class="svg-dim" stroke-dasharray="6 4"/>' +
      // 型開き方向
      '<path d="M520 160 H600" class="svg-dim" stroke-width="2"/>' +
      '<path d="M600 160 l-9 -4 v8 z" fill="var(--accent)"/>' +
      '<text x="520" y="148" class="svg-label-sm">型開き方向</text>' +
      '<text x="96" y="38" class="svg-label-sm">固定側（キャビティ側）</text>' +
      '<text x="300" y="38" class="svg-label-sm">可動側（コア側）</text>' +
      // コールアウト
      co(140, 62, 1) + co(340, 62, 2) + co(120, 160, 3) +
      lead(166, 108, 190, 112) + co(158, 103, 4) +
      co(224, 160, 5) +
      lead(118, 240, 130, 240) + co(108, 240, 6) +
      co(432, 160, 7) +
      lead(300, 112, 300, 124) + co(300, 103, 8) +
      co(250, 310, 9) + co(440, 80, 10) +
      '</svg>',
    legend: [
      '固定側型板（キャビティ側）— 成形機の固定盤に付く側。製品の外側の面を作ることが多い。',
      '可動側型板（コア側）— 型開き時に動く側。製品が残るようにコア側へ「抱きつかせる」設計にする。',
      'スプルー — ノズルから樹脂が最初に入る通路。抜けやすいようテーパが付く。',
      'キャビティ（製品になる空間）— ここに樹脂が満たされる。収縮率を見込んで製品より大きく作る。',
      'コア — 製品の内側をかたちづくる凸部。',
      '冷却回路（水管）— 型温を一定に保つ。成形サイクルの半分以上は冷却時間。',
      'エジェクタプレート — 突き出し板。型が開いた後に前進してピンを押す。',
      'エジェクタピン（突き出しピン）— 製品を型から押し出す。製品にピン跡が残る。',
      'パーティングライン（PL）— 固定側と可動側の合わせ面。製品に必ず線が残る。',
      'スペーサブロック — エジェクタプレートが動くための空間をつくる。'
    ]
  },

  /* ---------- せん断面とクリアランス ---------- */
  shearFace: {
    title: 'せん断加工の切り口とクリアランス',
    caption: '打ち抜いた断面は4つの領域に分かれる。クリアランスが適正なら上下の亀裂がきれいにつながり、過大だとかえり（バリ）が伸びる。',
    svg:
      '<svg viewBox="0 0 620 280" role="img" aria-label="せん断面の構成とクリアランスを示す図">' +
      '<rect x="120" y="20" width="160" height="70" class="svg-fill-3"/>' +
      '<text x="200" y="60" text-anchor="middle" class="svg-label">パンチ</text>' +
      '<rect x="290" y="150" width="210" height="70" class="svg-fill-1"/>' +
      '<text x="395" y="192" text-anchor="middle" class="svg-label">ダイ</text>' +
      '<rect x="60" y="90" width="220" height="60" class="svg-fill-2"/>' +
      '<rect x="290" y="90" width="210" height="60" class="svg-fill-2"/>' +
      '<text x="150" y="126" class="svg-label">材料（製品側）</text>' +
      // 切り口プロファイル
      '<path d="M272 90 Q284 92 284 102 L284 124 L292 146 L294 158" class="svg-line" stroke-width="2"/>' +
      // クリアランス寸法
      '<line x1="280" y1="238" x2="280" y2="152" class="svg-dim" stroke-dasharray="3 3"/>' +
      '<line x1="290" y1="238" x2="290" y2="152" class="svg-dim" stroke-dasharray="3 3"/>' +
      '<path d="M250 232 H280 M290 232 H320" class="svg-dim" stroke-width="1.5"/>' +
      '<text x="285" y="258" text-anchor="middle" class="svg-label-sm">クリアランス c（片側）＝ 板厚の 5〜10%</text>' +
      co(258, 88, 1) + co(310, 112, 2) + co(316, 140, 3) + co(318, 166, 4) +
      lead(300, 112, 286, 112) + lead(306, 140, 290, 138) + lead(308, 166, 296, 156) +
      '</svg>',
    legend: [
      'だれ（ロールオーバー）— 刃が食い込む前に材料が引き込まれて丸くなる部分。',
      'せん断面（バニッシュ面）— 刃が材料をこすりながら押し切った、光沢のあるなめらかな面。品質の指標になる。',
      '破断面 — 亀裂が進んで割れた、ざらついた傾斜面。',
      'かえり（バリ）— 最後に引きちぎられて残る出っ張り。クリアランス過大や刃の摩耗で大きくなる。'
    ]
  }
};
