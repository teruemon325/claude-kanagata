/* ファウンテンフロー（噴水流）と固化層のアニメーション（肉厚方向の断面）
 *
 * 流動先端とともに動く座標系（先端座標系）で、流れ関数
 *   ψ(x,z) = ψ∞(z)·(1 − exp(−(x_f(z) − x)/λ))
 * を使う。ψ∞(z) は十分後方での速度分布（べき乗則流体の厚さ方向分布から平均速度 U を引いたもの）
 * の積分。先端面 x = x_f(z) は ψ = 0 の流線（自由表面）になり、流れ関数から求めた速度場は自動的に
 * 非圧縮（発散ゼロ）を満たす。中心部の樹脂は先端へ追いつき、壁側へ噴き出して固化層に貼りつく。
 */
(function (K) {
  'use strict';

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  function makeFlow(n) {
    var c = (2 * n + 1) / (n + 1), e = (2 * n + 1) / n, k = n / (2 * n + 1), a = (n + 1) / n;
    var LAMBDA = 0.55, KAPPA = 0.6;
    function uLab(z) { return c * (1 - Math.pow(Math.abs(z), a)); }          // 実験室系の速度（U=1）
    function psiInf(z) { var s = z < 0 ? -1 : 1, az = Math.abs(z); return s * (c * (az - k * Math.pow(az, e)) - az); }
    function xf(z) { return -KAPPA * z * z; }                                    // 先端形状（中心が先行）
    function psi(x, z) {
      var d = xf(z) - x;
      if (d <= 0) return 0;
      return psiInf(z) * (1 - Math.exp(-d / LAMBDA));
    }
    function vel(x, z) {                                                          // 先端座標系の速度（数値微分）
      var h = 1e-3;
      return [(psi(x, z + h) - psi(x, z - h)) / (2 * h), -(psi(x + h, z) - psi(x - h, z)) / (2 * h)];
    }
    // 中心速度＝平均速度となる高さ z0（ここより外側は後方へ戻る流れ）
    var z0 = Math.pow(1 - 1 / c, 1 / a);
    // 流線の対応：外側（戻り流れ）の z から、同じ ψ をもつコア側の z を求める
    function coreOf(z) {
      var az = Math.abs(z), target = psiInf(az);
      if (az <= z0) return az / z0;
      var lo = 0, hi = z0;
      for (var i = 0; i < 30; i++) { var mid = (lo + hi) / 2; if (psiInf(mid) < target) lo = mid; else hi = mid; }
      return lo / z0;
    }
    return { n: n, uLab: uLab, psiInf: psiInf, xf: xf, vel: vel, z0: z0, coreOf: coreOf };
  }

  function mount(host) {
    host.innerHTML =
      '<div class="anim-card">' +
      '<div class="anim-canvas"><canvas id="ffCanvas" role="img" aria-label="肉厚方向の断面で見た流動先端（噴水流）と固化層のアニメーション"></canvas></div>' +
      '<div class="anim-controls">' +
      '<button type="button" class="btn" id="ffPlay">❚❚ 停止</button>' +
      '<div class="seg seg-sm" role="radiogroup" aria-label="流体の種類">' +
      '<button type="button" class="seg-btn active" data-n="0.35" role="radio" aria-checked="true">樹脂（せん断流動化 n≈0.35）</button>' +
      '<button type="button" class="seg-btn" data-n="1" role="radio" aria-checked="false">ニュートン流体（n=1）</button></div>' +
      '<label class="fs-check" style="align-items:center"><input type="checkbox" id="ffTrail"> 軌跡を残す</label>' +
      '</div>' +
      '<p class="fs-sub" style="margin:10px 2px 0">色は「流れてきたときに厚さ方向のどこにいたか」です。<b>中心を流れてきた樹脂（明るい黄）ほど、先端で外へ押し出されて製品の一番外側（表面）になります。</b>先端とともに動く視点で描いているため、金型の壁と固化層は左へ流れていくように見えます。</p>' +
      '</div>';
    var cvs = host.querySelector('#ffCanvas'), ctx = cvs.getContext('2d');
    var st = { flow: makeFlow(0.35), parts: [], playing: true, last: 0, raf: 0, visible: true, trail: false };
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) st.playing = false;
    var X0 = -8.2, X1 = 1.6, NPART = 560, U = 1, SPEED = 0.9;
    var font = getComputedStyle(document.documentElement).getPropertyValue('--font');

    function frozenDepth(x) {            // 壁からの固化層厚（先端通過後の経過時間の平方根に比例）
      var d = (st.flow.xf(1) - x) / U;
      return d <= 0 ? 0 : clamp(0.035 + 0.12 * Math.sqrt(d), 0, 0.42);
    }
    function spawn(p, anywhere) {
      var f = st.flow;
      for (var tries = 0; tries < 40; tries++) {
        var z = (Math.random() * 2 - 1), x = anywhere ? X0 + Math.random() * (0 - X0) : X0 + Math.random() * 0.15;
        if (x > f.xf(z) - 0.02) continue;
        if (Math.abs(z) > 1 - frozenDepth(x) - 0.01 && !anywhere) continue;
        if (!anywhere) {                  // 入口では流入量に比例して配置（コアの前向き流れ）
          var up = f.uLab(z) - U;
          if (up <= 0 || Math.random() > up / (f.uLab(0) - U)) continue;
        }
        p.x = x; p.z = z; p.frozen = Math.abs(z) > 1 - frozenDepth(x);
        p.c = f.coreOf(z); p.trail = [];
        return;
      }
      p.x = X0; p.z = 0; p.frozen = false; p.c = 0; p.trail = [];
    }
    function reset() {
      st.parts = [];
      for (var i = 0; i < NPART; i++) { var p = {}; spawn(p, true); st.parts.push(p); }
    }
    function step(dt) {
      var f = st.flow;
      st.parts.forEach(function (p) {
        if (!p.frozen) {
          var v1 = f.vel(p.x, p.z);
          var xm = p.x + v1[0] * dt / 2, zm = p.z + v1[1] * dt / 2;
          var v2 = f.vel(xm, zm);
          p.x += v2[0] * dt; p.z += v2[1] * dt;
          if (p.z > 0.999) p.z = 0.999; if (p.z < -0.999) p.z = -0.999;
          if (Math.abs(p.z) > 1 - frozenDepth(p.x)) p.frozen = true;     // 固化層にとらえられた
        } else {
          p.x -= U * dt;                                                   // 壁と一緒に後方へ
        }
        if (st.trail) { p.trail.push(p.x, p.z); if (p.trail.length > 90) p.trail.splice(0, 2); }
        if (p.x < X0 - 0.1) spawn(p, false);
      });
    }

    function size() {
      var w = cvs.parentNode.clientWidth, h = Math.max(220, Math.min(340, w * 0.36)), dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.style.width = w + 'px'; cvs.style.height = h + 'px'; cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
      st.w = w; st.h = h; st.dpr = dpr;
    }
    function isDark() { var m = getComputedStyle(document.body).backgroundColor.match(/\d+/g); return m && (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) < 110; }
    function heat(x) { var r = K.colormap.ramp('temp', false), i = Math.round(clamp(x, 0, 1) * 255) * 3; return [r.lut[i], r.lut[i + 1], r.lut[i + 2]]; }

    function render() {
      var W = st.w, H = st.h, dark = isDark(), f = st.flow;
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      var padL = 10, padR = 10, wallT = Math.max(18, H * 0.1);
      var gx = function (x) { return padL + (x - X0) / (X1 - X0) * (W - padL - padR); };
      var zc = H / 2, zs = (H / 2 - wallT - 8);
      var gz = function (z) { return zc - z * zs; };
      var C = dark ? { bg: '#1a222c', air: '#222c38', steel: '#445263', hatch: '#5b6b7d', text: '#e6ecf3', muted: '#a1b0c0', frozen: 'rgba(120,160,200,0.42)', arrow: '#e6ecf3' }
        : { bg: '#ffffff', air: '#f3f6f9', steel: '#c3ccd6', hatch: '#97a4b3', text: '#1b2430', muted: '#5b6876', frozen: 'rgba(70,110,150,0.30)', arrow: '#1b2430' };
      ctx.clearRect(0, 0, W, H);
      // 空気（未充填部）
      ctx.fillStyle = C.air; ctx.fillRect(padL, gz(1), W - padL - padR, gz(-1) - gz(1));
      // 溶融樹脂：中心ほど高温
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(gx(X0), gz(1));
      for (var zz = 1; zz >= -1.0001; zz -= 0.05) ctx.lineTo(gx(f.xf(zz)), gz(zz));
      ctx.lineTo(gx(X0), gz(-1)); ctx.closePath();
      var grad = ctx.createLinearGradient(0, gz(1), 0, gz(-1));
      [[0, 0.30], [0.25, 0.55], [0.5, 0.86], [0.75, 0.55], [1, 0.30]].forEach(function (s) { var c = heat(s[1]); grad.addColorStop(s[0], 'rgb(' + c + ')'); });
      ctx.fillStyle = grad; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
      // 固化層
      ctx.fillStyle = C.frozen;
      [1, -1].forEach(function (sg) {
        ctx.beginPath(); ctx.moveTo(gx(X0), gz(sg));
        for (var x = X0; x <= f.xf(1); x += 0.05) ctx.lineTo(gx(x), gz(sg * (1 - frozenDepth(x))));
        ctx.lineTo(gx(f.xf(1)), gz(sg)); ctx.closePath(); ctx.fill();
      });
      // 粒子
      st.parts.forEach(function (p) {
        var c = heat(0.95 - p.c * 0.8);
        if (st.trail && p.trail.length > 4) {
          ctx.strokeStyle = 'rgba(' + c + ',0.35)'; ctx.lineWidth = 1; ctx.beginPath();
          for (var i = 0; i < p.trail.length; i += 2) { var X = gx(p.trail[i]), Z = gz(p.trail[i + 1]); if (i) ctx.lineTo(X, Z); else ctx.moveTo(X, Z); }
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(gx(p.x), gz(p.z), p.frozen ? 1.9 : 2.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgb(' + c + ')'; ctx.fill();
        if (!p.frozen) { ctx.lineWidth = 0.6; ctx.strokeStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)'; ctx.stroke(); }
      });
      // 金型の壁（断面のハッチング）
      [[0, gz(1) - wallT, wallT], [1, gz(-1), wallT]].forEach(function (w) {
        ctx.fillStyle = C.steel; ctx.fillRect(0, w[1], W, w[2]);
        ctx.save(); ctx.beginPath(); ctx.rect(0, w[1], W, w[2]); ctx.clip();
        ctx.strokeStyle = C.hatch; ctx.lineWidth = 1;
        var off = ((st.wallShift || 0) % 12);
        for (var hx = -w[2] - 12 + off; hx < W + 12; hx += 12) { ctx.beginPath(); ctx.moveTo(hx, w[1] + w[2]); ctx.lineTo(hx + w[2], w[1]); ctx.stroke(); }
        ctx.restore();
      });
      // 速度分布（実験室系）
      var xs = X0 + 1.4;
      ctx.strokeStyle = C.arrow; ctx.fillStyle = C.arrow; ctx.lineWidth = 1.3;
      var sc = 1.25;
      ctx.beginPath();
      for (var z = -0.999; z <= 0.999; z += 0.02) { var X = gx(xs + f.uLab(z) * sc), Z = gz(z); if (z > -0.99) ctx.lineTo(X, Z); else ctx.moveTo(X, Z); }
      ctx.stroke();
      for (z = -0.8; z <= 0.81; z += 0.2) {
        var x2 = gx(xs + f.uLab(z) * sc), y2 = gz(z);
        ctx.beginPath(); ctx.moveTo(gx(xs), y2); ctx.lineTo(x2 - 5, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 6, y2 - 3); ctx.lineTo(x2 - 6, y2 + 3); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(gx(xs), gz(1)); ctx.lineTo(gx(xs), gz(-1)); ctx.stroke();
      // ラベル
      ctx.font = '600 11.5px ' + font; ctx.textBaseline = 'middle';
      function tag(x, y, t, align) {
        ctx.textAlign = align || 'left';
        var w = ctx.measureText(t).width + 10, bx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        ctx.fillStyle = dark ? 'rgba(18,24,31,0.85)' : 'rgba(255,255,255,0.88)'; ctx.fillRect(bx, y - 9, w, 18);
        ctx.fillStyle = C.text; ctx.fillText(t, align === 'right' ? x - 5 : align === 'center' ? x : x + 5, y + 0.5);
      }
      var narrow = W < 620;
      tag(gx(xs) + 4, gz(0.9) + 2, narrow ? '速度分布' : '速度分布（金型から見た速さ）');
      tag(gx(-4.2), gz(1) - wallT / 2, '金型（冷たい壁）', 'center');
      tag(gx(narrow ? -4.6 : -3.2), gz(-(1 - frozenDepth(narrow ? -4.6 : -3.2) / 2)), narrow ? '固化層' : '固化層（スキン層）', 'center');
      tag(gx(-2.8), gz(0.02), narrow ? 'コア層' : 'コア層（溶融）', 'center');
      tag(gx(f.xf(0)) - 6, gz(-0.62), '流動先端 →', 'right');
      tag(gx(X1) - 4, gz(0.02), '空気', 'right');
    }

    function loop(now) {
      if (!st.playing) return;
      var dt = Math.min(0.05, (now - st.last) / 1000) * SPEED; st.last = now;
      if (st.visible) {
        var n = Math.ceil(dt / 0.012), h = dt / n;
        for (var i = 0; i < n; i++) step(h);
        st.wallShift = (st.wallShift || 0) - U * dt * (st.w - 20) / (X1 - X0);
        render();
      }
      st.raf = requestAnimationFrame(loop);
    }
    function setPlaying(on) {
      st.playing = on;
      host.querySelector('#ffPlay').textContent = on ? '❚❚ 停止' : '▶ 再生';
      if (on) { st.last = performance.now(); st.raf = requestAnimationFrame(loop); } else cancelAnimationFrame(st.raf);
    }
    host.querySelector('#ffPlay').addEventListener('click', function () { setPlaying(!st.playing); });
    Array.prototype.forEach.call(host.querySelectorAll('[data-n]'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(host.querySelectorAll('[data-n]'), function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
        st.flow = makeFlow(+b.getAttribute('data-n'));
        reset(); render();
      });
    });
    host.querySelector('#ffTrail').addEventListener('change', function (e) { st.trail = e.target.checked; st.parts.forEach(function (p) { p.trail = []; }); });
    var onResize = function () { size(); render(); };
    window.addEventListener('resize', onResize);
    var onTheme = function () { render(); };
    document.addEventListener('kanagata:theme', onTheme);
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { st.visible = es[0].isIntersecting; }) : null;
    if (io) io.observe(cvs);
    size(); reset();
    for (var w = 0; w < 240; w++) step(0.02);          // 初期状態を「流れが発達した状態」にしておく
    render();
    setPlaying(st.playing);
    return function destroy() {
      cancelAnimationFrame(st.raf); window.removeEventListener('resize', onResize); document.removeEventListener('kanagata:theme', onTheme);
      if (io) io.disconnect();
    };
  }

  K.fountainAnim = { mount: mount, makeFlow: makeFlow };
})(window.KANAGATA);
