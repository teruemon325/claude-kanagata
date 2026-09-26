/* 金型まなびラボ — ルーティングと描画 */
(function (K) {
  'use strict';

  var ROUTES = [
    { id: 'home',      label: 'ホーム',              ico: '🏠', group: 'はじめに' },
    { id: 'basics',    label: '金型とは何か',        ico: '📘', group: '基礎から学ぶ' },
    { id: 'structure', label: '金型の構造と部品',    ico: '🔩', group: '基礎から学ぶ' },
    { id: 'process',   label: '金型ができるまで',    ico: '🗓️', group: '基礎から学ぶ' },
    { id: 'types',     label: '金型図鑑',            ico: '📚', group: '深く知る' },
    { id: 'materials', label: '型材・熱処理・表面処理', ico: '🧱', group: '深く知る' },
    { id: 'machining', label: '金型を削る技術',      ico: '⚙️', group: '深く知る' },
    { id: 'molding',   label: '射出成形のしくみ',    ico: '🎞️', group: '射出成形ラボ' },
    { id: 'flowsim',   label: '樹脂流動シミュレーター', ico: '🌊', group: '射出成形ラボ' },
    { id: 'cost',      label: 'コスト・見積・納期',  ico: '💴', group: '仕事で使う' },
    { id: 'trouble',   label: '不良とトラブル対応',  ico: '🛠️', group: '仕事で使う' },
    { id: 'tools',     label: '計算ツール',          ico: '🧮', group: '仕事で使う' },
    { id: 'glossary',  label: '用語集',              ico: '🔎', group: '確かめる' },
    { id: 'quiz',      label: 'クイズ',              ico: '✅', group: '確かめる' }
  ];

  var main = document.getElementById('main');
  var sidenav = document.getElementById('sidenav');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function catOf(id) { for (var i = 0; i < K.categories.length; i++) if (K.categories[i].id === id) return K.categories[i]; return { label: id, cls: '' }; }
  function moldById(id) { for (var i = 0; i < K.molds.length; i++) if (K.molds[i].id === id) return K.molds[i]; return null; }

  /* ------------------------------ ナビ ------------------------------ */
  function buildNav() {
    var html = '', current = null;
    ROUTES.forEach(function (r) {
      if (r.group !== current) {
        if (current !== null) html += '</div>';
        html += '<div class="nav-group"><h2>' + esc(r.group) + '</h2>';
        current = r.group;
      }
      html += '<a class="nav-link" data-id="' + r.id + '" href="#/' + r.id + '"><span class="ico">' + r.ico + '</span>' + esc(r.label) + '</a>';
    });
    html += '</div>';
    sidenav.innerHTML = html;
  }
  function markNav(id) {
    Array.prototype.forEach.call(sidenav.querySelectorAll('.nav-link'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-id') === id);
    });
  }

  /* ---------------------------- 共通パーツ ---------------------------- */
  function figure(name) {
    var f = K.figures[name];
    if (!f) return '';
    var legend = f.legend.map(function (t, i) { return '<li>' + t + '</li>'; }).join('');
    return '<figure class="figure"><h4 style="margin:0 0 10px;color:var(--text)">' + esc(f.title) + '</h4>' + f.svg +
      '<ol style="font-size:13px;margin:14px 0 0;color:var(--text)">' + legend + '</ol>' +
      '<figcaption>' + esc(f.caption) + '</figcaption></figure>';
  }

  function troubleTable(ids) {
    var rows = '';
    ids.forEach(function (mid) {
      var m = moldById(mid);
      if (!m || !m.troubles) return;
      m.troubles.forEach(function (t) {
        rows += '<tr><td><b>' + esc(t[0]) + '</b></td><td>' + esc(t[1]) + '</td><td>' + esc(t[2]) + '</td>' +
          (ids.length > 1 ? '<td><span class="badge">' + esc(m.name.replace('金型', '')) + '</span></td>' : '') + '</tr>';
      });
    });
    return '<div class="table-wrap"><table><thead><tr><th>不良・症状</th><th>主な原因</th><th>対策</th>' +
      (ids.length > 1 ? '<th>工法</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function expand(html) {
    return html
      .replace(/\[\[fig:([a-zA-Z]+)\]\]/g, function (_, n) { return figure(n); })
      .replace(/\[\[table:trouble-injection\]\]/g, function () { return troubleTable(['injection']); })
      .replace(/\[\[table:trouble-press\]\]/g, function () { return troubleTable(['press']); })
      .replace(/\[\[table:trouble-cast\]\]/g, function () { return troubleTable(['diecast', 'sandcast', 'gravity']); })
      .replace(/\[\[table:trouble-forge\]\]/g, function () { return troubleTable(['forging', 'powder']); });
  }

  function pager(id) {
    var i = -1;
    ROUTES.forEach(function (r, n) { if (r.id === id) i = n; });
    if (i < 0) return '';
    var prev = ROUTES[i - 1], next = ROUTES[i + 1];
    return '<div class="pager">' +
      (prev ? '<a href="#/' + prev.id + '">← ' + esc(prev.label) + '</a>' : '<span></span>') +
      (next ? '<a href="#/' + next.id + '">' + esc(next.label) + ' →</a>' : '<span></span>') +
      '</div>';
  }

  /* ------------------------------ ホーム ------------------------------ */
  function renderHome() {
    var tiles = ROUTES.filter(function (r) { return r.id !== 'home'; }).map(function (r) {
      var desc = {
        basics: '金型が何をする道具なのか。切削や3Dプリンタとの使い分け、数量で決まる工法選択の考え方から。',
        structure: '図で見る金型の中身。プレス金型と射出成形金型の断面から、部品の役割を読み解きます。',
        process: '引合から量産立ち上げまでの全工程。どこに時間がかかり、どこでトラブルが起きるのか。',
        types: 'プレス・射出成形・ダイカスト・鍛造・砂型・樹脂型・3Dプリンタ型まで、12種類を横断比較。',
        materials: 'SKD11とSKD61は何が違うのか。鋼種の選び方、熱処理の役割、表面処理で寿命が変わる理由。',
        machining: '切削・放電・研削・磨きの役割分担。なぜ放電加工が必要で、5軸加工が納期を縮めるのか。',
        molding: '成形機が1サイクルで何をしているかをアニメーションで。スクリューの動き、圧力の波形、噴水流と固化層まで。',
        flowsim: 'ゲート位置・材料・条件を変えて、ウェルドライン、エアトラップ、ショートショットを自分で確かめる流動解析。',
        cost: '型費の構成比、価格を動かす7つの要因、型償却、引合で必ず聞くべき項目と契約の注意点。',
        trouble: 'ヒケ、バリ、そり、巣、ヒートチェック。症状から原因と対策を引ける一覧表。',
        tools: '損益分岐点、成形収縮、クリアランス、展開長、型締力、冷却時間、抜き勾配。その場で使える' + K.tools.length + 'つの計算。',
        glossary: '現場で飛び交う用語を' + K.glossary.length + '語収録。カテゴリ絞り込みとキーワード検索つき。',
        quiz: '全' + K.quiz.length + '問。カテゴリ別に出題して理解度を確認できます。解説つき。'
      }[r.id] || '';
      return '<a class="tile" href="#/' + r.id + '"><h3><span class="tile-ico">' + r.ico + '</span>' + esc(r.label) + '</h3><p>' + esc(desc) + '</p></a>';
    }).join('');

    main.innerHTML =
      '<div class="page-head">' +
      '<span class="eyebrow">KANAGATA LEARNING LAB</span>' +
      '<h1>製造業の「金型」を、体系的に学ぶ</h1>' +
      '<p class="lead">金型は、製品の形・精度・コストのすべてを決める「マザーツール」です。このサイトでは、はじめて金型に触れる方から、お客様と金額の話をする営業の方、現場で設計・製造に携わる実務者まで、それぞれが必要な深さで学べるように構成しています。</p>' +
      '</div>' +

      '<div class="grid cols-4" style="margin-bottom:26px">' +
      '<div class="card" style="text-align:center"><div style="font-size:28px;font-weight:700;color:var(--accent)">12</div><div style="font-size:12.5px;color:var(--text-muted)">種類の金型を図鑑で解説</div></div>' +
      '<div class="card" style="text-align:center"><div style="font-size:28px;font-weight:700;color:var(--accent)">' + K.glossary.length + '</div><div style="font-size:12.5px;color:var(--text-muted)">語の用語集</div></div>' +
      '<div class="card" style="text-align:center"><div style="font-size:28px;font-weight:700;color:var(--accent)">' + K.tools.length + '</div><div style="font-size:12.5px;color:var(--text-muted)">つの実務計算ツール</div></div>' +
      '<div class="card" style="text-align:center"><div style="font-size:28px;font-weight:700;color:var(--accent)">' + K.quiz.length + '</div><div style="font-size:12.5px;color:var(--text-muted)">問のクイズ</div></div>' +
      '</div>' +

      '<h2>どこから読むか</h2>' +
      '<div class="grid cols-3" style="margin-bottom:8px">' +
      '<div class="card"><h3 style="margin-top:0">🔰 はじめての方</h3><p style="font-size:13.5px;color:var(--text-muted)">「金型とは何か」→「構造と部品」→「金型ができるまで」の順に読めば、全体像がつかめます。最後にクイズで確認を。</p><div class="btn-row" style="margin-bottom:0"><a class="btn primary" href="#/basics">基礎から始める</a></div></div>' +
      '<div class="card"><h3 style="margin-top:0">💼 営業・非技術職の方</h3><p style="font-size:13.5px;color:var(--text-muted)">「金型とは何か」で工法の使い分けを押さえたら、「コスト・見積・納期」へ。引合で聞くべき項目の一覧が使えます。</p><div class="btn-row" style="margin-bottom:0"><a class="btn" href="#/cost">見積の話から</a></div></div>' +
      '<div class="card"><h3 style="margin-top:0">🔧 技術者・実務者の方</h3><p style="font-size:13.5px;color:var(--text-muted)">「金型図鑑」で各工法の設計要点を横断し、「型材」「加工技術」「トラブル対応」へ。射出成形は「樹脂流動シミュレーター」で条件を動かして確かめられます。</p><div class="btn-row" style="margin-bottom:0"><a class="btn" href="#/types">図鑑を見る</a><a class="btn" href="#/flowsim">シミュレーター</a></div></div>' +
      '</div>' +

      '<h2>すべてのコンテンツ</h2>' +
      '<div class="grid cols-3">' + tiles + '</div>' +

      '<div class="note" style="margin-top:32px"><span class="note-title">このサイトの数値の扱いについて</span>収縮率、クリアランス、型寿命、費用などの数値は、広く使われている<b>一般的な目安</b>です。実際の値は材料メーカー、設備、製品形状、社内標準によって変わります。設計・見積の根拠には、必ず一次情報（材料メーカーの技術資料、設備仕様、社内実績データ）をご確認ください。</div>';
  }

  /* --------------------------- 読み物セクション --------------------------- */
  function renderTopic(id) {
    var t = K.topics[id];
    if (!t) return renderNotFound();
    var toc = t.toc ? '<nav class="toc"><h2>このページの内容</h2><ol>' +
      t.toc.map(function (x, i) { return '<li><a href="#/' + id + '#s' + (i + 1) + '" data-anchor="s' + (i + 1) + '">' + esc(x) + '</a></li>'; }).join('') +
      '</ol></nav>' : '';
    main.innerHTML =
      '<div class="page-head"><span class="eyebrow">' + esc(t.eyebrow) + '</span><h1>' + esc(t.title) + '</h1>' +
      '<p class="lead">' + esc(t.lead) + '</p></div>' + toc + expand(t.html) + pager(id);
    bindAnchors();
  }

  function bindAnchors() {
    Array.prototype.forEach.call(main.querySelectorAll('[data-anchor]'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var el = document.getElementById(a.getAttribute('data-anchor'));
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ----------------------------- 金型図鑑 ----------------------------- */
  var typeFilter = 'all';
  function renderTypes() {
    var chips = '<div class="chip-filter"><button class="chip' + (typeFilter === 'all' ? ' active' : '') + '" data-cat="all">すべて（' + K.molds.length + '）</button>' +
      K.categories.map(function (c) {
        var n = K.molds.filter(function (m) { return m.cat === c.id; }).length;
        return '<button class="chip' + (typeFilter === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' + esc(c.label) + '（' + n + '）</button>';
      }).join('') + '</div>';

    var list = K.molds.filter(function (m) { return typeFilter === 'all' || m.cat === typeFilter; }).map(function (m) {
      var c = catOf(m.cat);
      return '<a class="tile" href="#/types/' + m.id + '">' +
        '<div class="badge-row"><span class="badge ' + c.cls + '">' + esc(c.label) + '</span></div>' +
        '<h3><span class="tile-ico">' + m.icon + '</span>' + esc(m.name) + '</h3>' +
        '<p style="font-size:11.5px;letter-spacing:.04em;color:var(--text-muted);margin-bottom:6px">' + esc(m.en) + '</p>' +
        '<p>' + esc(m.oneLine) + '</p></a>';
    }).join('');

    main.innerHTML =
      '<div class="page-head"><span class="eyebrow">STEP 4 ｜ 図鑑</span><h1>金型図鑑</h1>' +
      '<p class="lead">代表的な金型を12種類。それぞれの原理、構造、型材と寿命、費用と納期の目安、設計の勘所、代表的な不良までを同じ切り口で整理しています。工法を比較したいときは<a href="#/types/compare">比較表</a>もどうぞ。</p></div>' +
      chips +
      '<div class="btn-row" style="margin-top:0"><a class="btn" href="#/types/compare">📊 12種類を一覧比較する</a></div>' +
      '<div class="grid cols-3">' + list + '</div>' + pager('types');

    Array.prototype.forEach.call(main.querySelectorAll('.chip'), function (b) {
      b.addEventListener('click', function () { typeFilter = b.getAttribute('data-cat'); renderTypes(); window.scrollTo(0, 0); });
    });
  }

  function renderCompare() {
    var rows = K.molds.map(function (m) {
      var c = catOf(m.cat);
      return '<tr><td><a href="#/types/' + m.id + '"><b>' + esc(m.name) + '</b></a><br><span class="badge ' + c.cls + '">' + esc(c.label) + '</span></td>' +
        '<td>' + esc(m.products) + '</td>' +
        '<td>' + esc(m.spec['主な型材'] || m.spec['主な造形材'] || '—') + '</td>' +
        '<td>' + esc(m.spec['型寿命の目安'] || m.spec['効果の目安'] || '—') + '</td>' +
        '<td>' + esc(m.spec['製作期間の目安'] || '—') + '</td>' +
        '<td>' + esc(m.spec['型費の目安'] || m.spec['費用の目安'] || '—') + '</td></tr>';
    }).join('');
    main.innerHTML =
      '<div class="page-head"><span class="eyebrow">金型図鑑</span><h1>12種類の比較表</h1>' +
      '<p class="lead">工法の選択や見積の初期検討に。数値はいずれも一般的な目安であり、製品サイズ・精度・数量によって大きく変動します。</p></div>' +
      '<div class="table-wrap"><table style="min-width:900px"><thead><tr><th>金型</th><th>代表的な製品</th><th>主な型材</th><th>型寿命の目安</th><th>製作期間</th><th>型費の目安</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="btn-row"><a class="btn" href="#/types">← 図鑑一覧に戻る</a></div>';
  }

  function renderMold(id) {
    if (id === 'compare') return renderCompare();
    var m = moldById(id);
    if (!m) return renderNotFound();
    var c = catOf(m.cat);

    var spec = '<dl class="kv">' + Object.keys(m.spec).map(function (k) {
      return '<dt>' + esc(k) + '</dt><dd>' + esc(m.spec[k]) + '</dd>';
    }).join('') + '</dl>';

    var structure = '<div class="table-wrap"><table><thead><tr><th style="width:34%">主な構成部品</th><th>役割</th></tr></thead><tbody>' +
      m.structure.map(function (s) { return '<tr><td><b>' + esc(s[0]) + '</b></td><td>' + esc(s[1]) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';

    var points = '<ul>' + m.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';

    var troubles = '<div class="table-wrap"><table><thead><tr><th>不良・症状</th><th>主な原因</th><th>対策</th></tr></thead><tbody>' +
      m.troubles.map(function (t) { return '<tr><td><b>' + esc(t[0]) + '</b></td><td>' + esc(t[1]) + '</td><td>' + esc(t[2]) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';

    var idx = -1;
    K.molds.forEach(function (x, i) { if (x.id === id) idx = i; });
    var prev = K.molds[idx - 1], next = K.molds[idx + 1];

    main.innerHTML =
      '<div class="page-head">' +
      '<div class="badge-row"><span class="badge ' + c.cls + '">' + esc(c.label) + '</span><span class="badge">' + esc(m.en) + '</span></div>' +
      '<h1>' + m.icon + ' ' + esc(m.name) + '</h1>' +
      '<p class="lead">' + esc(m.oneLine) + '</p></div>' +
      '<div class="note"><span class="note-title">代表的な製品</span>' + esc(m.products) + '</div>' +
      (m.id === 'injection' ? '<div class="grid cols-2" style="margin:14px 0 4px">' +
        '<a class="tile" href="#/molding"><h3><span class="tile-ico">🎞️</span>射出成形のしくみ</h3><p>成形機の1サイクル、圧力波形、噴水流と固化層をアニメーションで。</p></a>' +
        '<a class="tile" href="#/flowsim"><h3><span class="tile-ico">🌊</span>樹脂流動シミュレーター</h3><p>ゲート位置や条件を変えて、ウェルドライン・エアトラップ・ショートを確かめる。</p></a></div>' : '') +
      '<h2>しくみと設計の考え方</h2>' + expand(m.summary) +
      (m.svg ? expand('[[fig:' + m.svg + ']]') : '') +
      '<h2>主な構成部品</h2>' + structure +
      '<h2>スペックの目安</h2>' + spec +
      '<h2>設計・運用の勘所</h2>' + points +
      '<h2>代表的な不良と対策</h2>' + troubles +
      '<div class="pager">' +
      (prev ? '<a href="#/types/' + prev.id + '">← ' + esc(prev.name) + '</a>' : '<a href="#/types">← 図鑑一覧</a>') +
      (next ? '<a href="#/types/' + next.id + '">' + esc(next.name) + ' →</a>' : '<a href="#/types">図鑑一覧 →</a>') +
      '</div>';
  }

  /* ----------------------------- 計算ツール ----------------------------- */
  function renderTools() {
    main.innerHTML =
      '<div class="page-head"><span class="eyebrow">STEP 8 ｜ ツール</span><h1>計算ツール</h1>' +
      '<p class="lead">実務でよく使う' + K.tools.length + 'つの計算をブラウザ上で。入力するとその場で結果が更新されます。いずれも一般的な目安式であり、最終判断は社内標準や実測値に基づいて行ってください。</p></div>' +
      '<div id="toolList"></div>' + pager('tools');
    var host = document.getElementById('toolList');
    K.tools.forEach(function (t) {
      var sec = document.createElement('section');
      sec.className = 'card';
      sec.style.marginBottom = '20px';
      sec.innerHTML = '<h3 style="margin-top:0">' + esc(t.title) + '</h3><p style="font-size:13.5px;color:var(--text-muted)">' + esc(t.desc) + '</p>';
      t.render(sec);
      host.appendChild(sec);
    });
  }

  /* ------------------------------ 用語集 ------------------------------ */
  var glCat = 'all', glQuery = '';
  function renderGlossary() {
    var cats = [];
    K.glossary.forEach(function (g) { if (cats.indexOf(g[2]) < 0) cats.push(g[2]); });
    main.innerHTML =
      '<div class="page-head"><span class="eyebrow">STEP 9 ｜ 用語</span><h1>用語集</h1>' +
      '<p class="lead">現場や打ち合わせで飛び交う金型用語を' + K.glossary.length + '語収録。カテゴリで絞り込むか、キーワードで検索してください。</p></div>' +
      '<div class="tool" style="margin-top:0"><div class="field" style="grid-template-columns:1fr">' +
      '<input type="search" id="glSearch" placeholder="用語・英語・説明文から検索" style="width:100%;max-width:none" value="' + esc(glQuery) + '"></div></div>' +
      '<div class="chip-filter" id="glChips"><button class="chip' + (glCat === 'all' ? ' active' : '') + '" data-c="all">すべて</button>' +
      cats.map(function (c) { return '<button class="chip' + (glCat === c ? ' active' : '') + '" data-c="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
      '<div class="card" id="glList"></div>' + pager('glossary');

    var listEl = document.getElementById('glList');
    var input = document.getElementById('glSearch');

    function draw() {
      var q = glQuery.trim().toLowerCase();
      var items = K.glossary.filter(function (g) {
        if (glCat !== 'all' && g[2] !== glCat) return false;
        if (!q) return true;
        return (g[0] + ' ' + g[1] + ' ' + g[3]).toLowerCase().indexOf(q) >= 0;
      });
      listEl.innerHTML = '<p class="gl-count">' + items.length + ' 件を表示</p>' +
        (items.length ? items.map(function (g) {
          return '<div class="gl-item"><div class="gl-term">' + esc(g[0]) +
            '<span class="gl-en">' + esc(g[1]) + '</span><span class="badge">' + esc(g[2]) + '</span></div>' +
            '<p class="gl-def">' + esc(g[3]) + '</p></div>';
        }).join('') : '<p style="color:var(--text-muted)">該当する用語がありません。別のキーワードをお試しください。</p>');
    }
    input.addEventListener('input', function () { glQuery = input.value; draw(); });
    Array.prototype.forEach.call(document.querySelectorAll('#glChips .chip'), function (b) {
      b.addEventListener('click', function () {
        glCat = b.getAttribute('data-c');
        Array.prototype.forEach.call(document.querySelectorAll('#glChips .chip'), function (x) { x.classList.toggle('active', x === b); });
        draw();
      });
    });
    draw();
  }

  /* ------------------------------- クイズ ------------------------------- */
  var quizState = null;
  function renderQuiz() {
    var cats = [];
    K.quiz.forEach(function (q) { if (cats.indexOf(q.c) < 0) cats.push(q.c); });
    main.innerHTML =
      '<div class="page-head"><span class="eyebrow">STEP 10 ｜ 演習</span><h1>クイズ</h1>' +
      '<p class="lead">全' + K.quiz.length + '問。カテゴリを選んで出題します。解答するとその場で解説が表示されます。</p></div>' +
      '<div id="quizHost"></div>' + pager('quiz');
    quizStart(cats);
  }

  function quizStart(cats) {
    var host = document.getElementById('quizHost');
    host.innerHTML =
      '<div class="card"><h3 style="margin-top:0">出題カテゴリを選ぶ</h3>' +
      '<div class="chip-filter" id="qzChips">' +
      '<button class="chip active" data-c="all">すべて（' + K.quiz.length + '問からランダム10問）</button>' +
      cats.map(function (c) {
        var n = K.quiz.filter(function (q) { return q.c === c; }).length;
        return '<button class="chip" data-c="' + esc(c) + '">' + esc(c) + '（' + n + '問）</button>';
      }).join('') + '</div>' +
      '<div class="btn-row" style="margin-bottom:0"><button class="btn primary" id="qzStart">スタート</button></div></div>';

    var chosen = 'all';
    Array.prototype.forEach.call(document.querySelectorAll('#qzChips .chip'), function (b) {
      b.addEventListener('click', function () {
        chosen = b.getAttribute('data-c');
        Array.prototype.forEach.call(document.querySelectorAll('#qzChips .chip'), function (x) { x.classList.toggle('active', x === b); });
      });
    });
    document.getElementById('qzStart').addEventListener('click', function () {
      var pool = K.quiz.filter(function (q) { return chosen === 'all' || q.c === chosen; }).slice();
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      if (chosen === 'all') pool = pool.slice(0, 10);
      quizState = { pool: pool, i: 0, score: 0, wrong: [], cats: cats };
      quizQuestion();
    });
  }

  function quizQuestion() {
    var host = document.getElementById('quizHost');
    var s = quizState;
    if (s.i >= s.pool.length) return quizResult();
    var q = s.pool[s.i];
    var pct = Math.round(s.i / s.pool.length * 100);
    host.innerHTML =
      '<div class="card">' +
      '<div class="quiz-meta"><span>第 ' + (s.i + 1) + ' 問 / ' + s.pool.length + ' 問</span><span class="badge">' + esc(q.c) + '</span><span>正解 ' + s.score + '</span></div>' +
      '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
      '<h3 class="quiz-q" style="margin-top:0">' + esc(q.q) + '</h3>' +
      '<ul class="quiz-choices">' + q.a.map(function (a, i) {
        return '<li><button class="choice" data-i="' + i + '">' + esc(a) + '</button></li>';
      }).join('') + '</ul>' +
      '<div id="qzFeedback"></div></div>';

    Array.prototype.forEach.call(host.querySelectorAll('.choice'), function (btn) {
      btn.addEventListener('click', function () {
        var pick = parseInt(btn.getAttribute('data-i'), 10);
        var ok = pick === q.i;
        if (ok) s.score++; else s.wrong.push(q);
        Array.prototype.forEach.call(host.querySelectorAll('.choice'), function (b, i) {
          b.disabled = true;
          if (i === q.i) b.classList.add('correct');
          else if (i === pick) b.classList.add('wrong');
        });
        document.getElementById('qzFeedback').innerHTML =
          '<div class="note ' + (ok ? 'sales' : 'danger') + '"><span class="note-title">' + (ok ? '正解' : '不正解') + '</span>' + esc(q.e) + '</div>' +
          '<div class="btn-row" style="margin-bottom:0"><button class="btn primary" id="qzNext">' +
          (s.i + 1 >= s.pool.length ? '結果を見る' : '次の問題へ') + '</button></div>';
        document.getElementById('qzNext').addEventListener('click', function () { s.i++; quizQuestion(); });
      });
    });
  }

  function quizResult() {
    var s = quizState;
    var host = document.getElementById('quizHost');
    var pct = Math.round(s.score / s.pool.length * 100);
    var msg = pct === 100 ? '完璧です。実務でもすぐ使える理解度です。'
      : pct >= 80 ? 'よく理解できています。間違えた問題の解説だけ確認しておきましょう。'
        : pct >= 50 ? '基本は押さえられています。該当するセクションを読み返すとさらに定着します。'
          : 'まずは「金型とは何か」と「金型の構造と部品」を読み直してみてください。';
    var wrong = s.wrong.length ? '<h3>間違えた問題の復習</h3>' + s.wrong.map(function (q) {
      return '<div class="note warn"><span class="note-title">' + esc(q.q) + '</span><b>正解：</b>' + esc(q.a[q.i]) + '<br>' + esc(q.e) + '</div>';
    }).join('') : '';
    host.innerHTML =
      '<div class="card" style="text-align:center"><p style="margin:0;color:var(--text-muted);font-size:13px">スコア</p>' +
      '<div class="score">' + s.score + ' / ' + s.pool.length + '</div>' +
      '<p style="font-size:14px">正答率 ' + pct + '%　—　' + esc(msg) + '</p>' +
      '<div class="btn-row" style="justify-content:center;margin-bottom:0">' +
      '<button class="btn primary" id="qzAgain">もう一度挑戦する</button>' +
      '<a class="btn" href="#/glossary">用語集で確認する</a></div></div>' + wrong;
    document.getElementById('qzAgain').addEventListener('click', function () { quizStart(s.cats); window.scrollTo(0, 0); });
  }

  /* ------------------------------ 検索 ------------------------------ */
  var searchIndex = [];
  function buildSearchIndex() {
    var extra = {
      molding: '射出成形機 スクリュー 保圧 V/P切替 計量 背圧 冷却時間 ファウンテンフロー 固化層 アニメーション',
      flowsim: '流動解析 CAE シミュレーション ウェルドライン エアトラップ ショートショット ゲート ランナーバランス スパイラルフロー 成形ウィンドウ'
    };
    ROUTES.forEach(function (r) {
      var t = K.topics[r.id];
      searchIndex.push({ kind: 'ページ', title: r.label, sub: t ? t.lead : (extra[r.id] || ''), href: '#/' + r.id, text: r.label + ' ' + (t ? t.lead + ' ' + (t.toc || []).join(' ') : '') + ' ' + (extra[r.id] || '') });
    });
    K.molds.forEach(function (m) {
      searchIndex.push({ kind: '金型図鑑', title: m.name, sub: m.oneLine, href: '#/types/' + m.id, text: m.name + ' ' + m.en + ' ' + m.oneLine + ' ' + m.products });
    });
    K.glossary.forEach(function (g) {
      searchIndex.push({ kind: '用語集', title: g[0], sub: g[3], href: '#/glossary', term: g[0], text: g[0] + ' ' + g[1] + ' ' + g[3] });
    });
    K.tools.forEach(function (t) {
      searchIndex.push({ kind: '計算ツール', title: t.title, sub: t.desc, href: '#/tools', text: t.title + ' ' + t.desc });
    });
  }

  function setupSearch() {
    var input = document.getElementById('globalSearch');
    var box = document.getElementById('searchResults');
    function close() { box.hidden = true; box.innerHTML = ''; }
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      if (!q) return close();
      var hits = searchIndex.filter(function (r) { return r.text.toLowerCase().indexOf(q) >= 0; }).slice(0, 20);
      box.hidden = false;
      box.innerHTML = hits.length ? hits.map(function (r) {
        return '<a href="' + r.href + '"' + (r.term ? ' data-term="' + esc(r.term) + '"' : '') + '><span class="sr-kind">' + esc(r.kind) + '</span><b>' + esc(r.title) + '</b><br>' +
          esc(r.sub.length > 64 ? r.sub.slice(0, 64) + '…' : r.sub) + '</a>';
      }).join('') : '<p class="sr-empty">「' + esc(input.value) + '」に一致する項目は見つかりませんでした。</p>';
    });
    box.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      var term = a.getAttribute('data-term');
      if (term) { glCat = 'all'; glQuery = term; if (location.hash === '#/glossary') setTimeout(renderGlossary, 0); }
      input.value = '';
      close();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-wrap')) close();
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; close(); input.blur(); } });
  }

  /* ------------------------------ テーマ ------------------------------ */
  function setupTheme() {
    var btn = document.getElementById('themeToggle');
    var saved = null;
    try { saved = localStorage.getItem('kanagata-theme'); } catch (e) { }
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var isDark = cur ? cur === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('kanagata-theme', next); } catch (e) { }
      document.dispatchEvent(new CustomEvent('kanagata:theme'));
    });
  }

  /* ---------------------------- モバイルナビ ---------------------------- */
  function setupNavToggle() {
    var btn = document.getElementById('navToggle');
    var scrim = document.getElementById('scrim');
    function setOpen(open) {
      sidenav.classList.toggle('open', open);
      scrim.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    btn.addEventListener('click', function () { setOpen(!sidenav.classList.contains('open')); });
    scrim.addEventListener('click', function () { setOpen(false); });
    sidenav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    window.addEventListener('hashchange', function () { setOpen(false); });
  }

  /* ------------------------------ ルーター ------------------------------ */
  function renderNotFound() {
    main.innerHTML = '<div class="page-head"><h1>ページが見つかりません</h1>' +
      '<p class="lead">URLが変わったか、まだ用意されていない項目です。</p></div>' +
      '<div class="btn-row"><a class="btn primary" href="#/home">ホームへ戻る</a></div>';
  }

  function route() {
    var raw = location.hash.replace(/^#\/?/, '');
    var anchor = null;
    var hashIdx = raw.indexOf('#');
    if (hashIdx >= 0) { anchor = raw.slice(hashIdx + 1); raw = raw.slice(0, hashIdx); }
    var parts = raw.split('/').filter(Boolean);
    var page = parts[0] || 'home';

    if (typeof K.pageCleanup === 'function') { try { K.pageCleanup(); } catch (e) { } K.pageCleanup = null; }
    if (page === 'flowsim' && K.renderFlowSim) { K.renderFlowSim(main); }
    else if (page === 'molding' && K.renderMolding) { K.renderMolding(main); }
    else if (page === 'types') {
      if (parts[1]) renderMold(parts[1]); else renderTypes();
    } else if (page === 'tools') { renderTools(); }
    else if (page === 'glossary') { renderGlossary(); }
    else if (page === 'quiz') { renderQuiz(); }
    else if (page === 'home') { renderHome(); }
    else if (K.topics[page]) { renderTopic(page); }
    else { renderNotFound(); }

    markNav(page);
    document.title = (page === 'home' ? '金型まなびラボ' :
      ((K.topics[page] && K.topics[page].title) ||
        (page === 'types' && parts[1] && moldById(parts[1]) ? moldById(parts[1]).name : null) ||
        (ROUTES.filter(function (r) { return r.id === page; })[0] || {}).label || '金型まなびラボ') + ' | 金型まなびラボ');

    if (anchor) {
      var t = document.getElementById(anchor);
      if (t) { t.scrollIntoView(); return; }
    }
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }

  /* ------------------------------- 起動 ------------------------------- */
  buildNav();
  buildSearchIndex();
  setupSearch();
  setupTheme();
  setupNavToggle();
  window.addEventListener('hashchange', route);
  if (!location.hash) location.replace('#/home');
  route();

})(window.KANAGATA);
