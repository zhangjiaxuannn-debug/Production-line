(function () {
  'use strict';
  var KEY = 'shengchanxian-v2', OLD = 'shengchanxian-v1';
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var app = document.getElementById('app');
  var overlay = document.getElementById('overlay');
  var ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
  var CLOCK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var PLAY = '<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M1 0 L8 4 L1 8 Z" fill="currentColor"/></svg>';
  var PAUSE = '<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><rect width="3" height="8" fill="currentColor"/><rect x="5" width="3" height="8" fill="currentColor"/></svg>';
  var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- state ---------- */
  var S, T = { screen: 'list', setup: null, sheet: null, msg: '', lastQ: '', tipN: -1 };
  function blank() { return { v: 2, lang: 'en', goals: [], timer: null, cur: null, view: 'full', home: 'lines', fmt: '24', drafts: [], order: [], day: { s: 8, e: 22 } }; }
  function normalize(d) {
    var s = Object.assign(blank(), d || {});
    if (!Array.isArray(s.goals)) s.goals = [];
    s.goals = s.goals.filter(function (g) { return g && g.nodes && Array.isArray(g.needs); });
    s.goals.forEach(function (g) {
      if (!g.id) g.id = uid();
      if (g.status !== 'standby') g.status = 'active';
      Object.keys(g.nodes).forEach(function (k) {
        var n = g.nodes[k];
        n.id = k; n.needs = Array.isArray(n.needs) ? n.needs : []; n.log = n.log || {};
        n.status = n.status === 'done' ? 'done' : 'todo'; n.mins = (n.mins === 0) ? 0 : (n.mins || 15);
      });
    });
    if (s.lang !== 'zh') s.lang = 'en';
    if (s.view !== 'full' && s.view !== 'time') s.view = 'focus';
    if (!s.vf) { s.view = 'full'; s.vf = 1; }
    if (typeof s.pause !== 'string') s.pause = '';
    if (!s.frozen || typeof s.frozen !== 'object') s.frozen = {};
    if (s.fmt !== '12') s.fmt = '24';
    if (!Array.isArray(s.drafts)) s.drafts = [];
    if (s.home !== 'time') s.home = 'lines';
    if (!Array.isArray(s.order)) s.order = [];
    if (!s.day || !(s.day.s >= 0 && s.day.e <= 24 && s.day.e - s.day.s >= 1)) s.day = { s: 8, e: 22 };
    if (s.timer && Date.now() >= s.timer.endAt && !s.timer.paused) s.timer.fired = true;
    return s;
  }
  function migrateV1(o) {
    var g = { id: uid(), title: o.goal || '', dl: (o.dl === 'date' && o.deadline) ? o.deadline : null, needs: [], nodes: {}, status: 'active', created: Date.now() };
    function chain(stages, prev) {
      (stages || []).forEach(function (ms) {
        (ms.actions || []).forEach(function (a) {
          g.nodes[a.id] = { id: a.id, text: a.label, needs: prev.slice(), start: true, mins: a.mins || 15, repeat: (a.repeat && a.repeat.length) ? a.repeat : null, log: a.log || {}, status: a.status === 'done' ? 'done' : 'todo', tag: a.tag || '', prevMins: a.prevMins || null };
          prev = [a.id];
        });
        g.nodes[ms.id] = { id: ms.id, text: ms.label, needs: prev.slice(), start: false, mins: 15, repeat: null, log: {}, status: ms.status === 'done' ? 'done' : 'todo', tag: '' };
        prev = [ms.id];
      });
      return prev;
    }
    var lasts = [];
    (o.lanes || []).forEach(function (l) { lasts = lasts.concat(chain(l.stages, [])); });
    g.needs = chain(o.tail || [], lasts);
    return g;
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {}
    try {
      var old = localStorage.getItem(OLD);
      if (old) {
        var o = JSON.parse(old), s = blank();
        if (o && o.phase === 'line' && o.lanes && o.lanes.length) {
          var g = migrateV1(o);
          s.goals.push(g);
          if (o.timer) s.timer = o.timer;
          if (o.view === 'full') s.view = 'full';
        }
        s = normalize(s);
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
        return s;
      }
    } catch (e) {}
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  S = load();
  T.scrollNow = false;

  function tr(key, vars) {
    var e = window.STR[key]; if (!e) return key;
    var s = e[S.lang === 'zh' ? 1 : 0];
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function say(kind, fallback, vars) {
    if (kind === 'start') return '';
    if (kind === 'step' || kind === 'stage') {
      var pool = window.PRAISE.filter(function (p) { return p[0] !== T.lastQ; }), p = pool[Math.floor(Math.random() * pool.length)];
      T.lastQ = p[0];
      return p[S.lang === 'zh' ? 1 : 0];
    }
    return tr(fallback, vars);
  }

  /* ---------- model helpers ---------- */
  function gById(id) { return S.goals.find(function (g) { return g.id === id; }); }
  function findNode(id) {
    for (var i = 0; i < S.goals.length; i++) { var n = S.goals[i].nodes[id]; if (n) return { g: S.goals[i], n: n }; }
    return null;
  }
  function nodesOf(g) { return Object.keys(g.nodes).map(function (k) { return g.nodes[k]; }); }
  function isDone(n) { return n.status === 'done'; }
  /* a list step: one step made of several small items, each with the same time */
  function itemsLeft(n) { return n.items ? n.items.filter(function (i) { return !i.d; }).length : 0; }
  function listCur(n) { if (!n.items) return -1; for (var i = 0; i < n.items.length; i++) if (!n.items[i].d) return i; return -1; }
  function schedMins(n) { var m = n.mins || 15; return n.items ? m * Math.max(1, itemsLeft(n)) : m; }
  function isReady(g, n) { return !isDone(n) && n.needs.every(function (id) { return !g.nodes[id] || isDone(g.nodes[id]); }); }
  function readyList(g) {
    var r = nodesOf(g).filter(function (n) { return isReady(g, n); });
    return r.sort(function (a, b) { return (b.start ? 1 : 0) - (a.start ? 1 : 0); });
  }
  function goalDone(g) { return g.needs.length > 0 && g.needs.every(function (id) { return !g.nodes[id] || isDone(g.nodes[id]); }); }
  function progress(g) {
    var all = nodesOf(g), d = 0, tot = 0;
    all.forEach(function (n) {
      if (n.items && n.items.length) { tot += n.items.length; d += isDone(n) ? n.items.length : n.items.length - itemsLeft(n); }
      else { tot += 1; if (isDone(n)) d += 1; }
    });
    return { done: d, total: tot, pct: tot ? Math.round(d * 100 / tot) : 0 };
  }
  function dlEndOf(dl, dlh) {
    if (!dl) return null;
    var p = dl.split('-'), d = dlh == null ? new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59) : new Date(+p[0], +p[1] - 1, +p[2], +dlh, 0, 0);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  function dlEnd(g) { return dlEndOf(g.dl, g.dlh); }
  function daysLeft(g) { var e = dlEnd(g); return e == null ? null : Math.max(0, Math.ceil((e - Date.now()) / 86400000)); }
  /* more than a day: days. Under a day: hours. */
  function leftTextMs(ms) {
    if (ms <= 0) return tr('dueNow');
    if (ms < 3600000) return tr('lessHour');
    if (ms < 86400000) return tr('hoursLeft', { n: Math.ceil(ms / 3600000) });
    var d = Math.floor(ms / 86400000);
    return d === 1 ? tr('dayLeft') : tr('daysLeft', { n: d });
  }
  function daysText(g) { return leftTextMs(dlEnd(g) - Date.now()); }
  function estMins(g) { var t = 0; nodesOf(g).forEach(function (n) { if (!isDone(n) && n.mins > 0) t += n.items ? n.mins * itemsLeft(n) : n.mins; }); return t; }
  function estText(g) {
    var t = estMins(g); if (!t) return '';
    var hh = Math.floor(t / 60), mm = t % 60;
    return tr('estNeed', { t: (hh ? hh + ' h' : '') + (hh && mm ? ' ' : '') + (mm ? mm + ' min' : '') });
  }
  function metaHtml(g, d) {
    var e = estText(g);
    if (d === null && !e) return '';
    return '<div class="meta">' + (d !== null ? '<span class="days">' + esc(daysText(g)) + '</span>' : '') + (e ? '<span class="est">' + esc(e) + '</span>' : '') + '</div>';
  }
  function clock(sec) { var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function minsLbl(m) { return m === 0 ? tr('na') : tr('min', { n: m }); }
  function mk(text, start, mins) { return { id: uid(), text: text, needs: [], start: !!start, mins: mins == null ? 15 : mins, repeat: null, log: {}, status: 'todo', tag: '' }; }

  /* ---------- repeat ---------- */
  function todayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function isRec(n) { return !!(n.repeat && n.repeat.length); }
  function schedToday(n) { return isRec(n) && n.repeat.indexOf(new Date().getDay()) >= 0; }
  function doneToday(n) { return isRec(n) && n.log && n.log[todayKey()] === 'done'; }
  function dayName(x) { return window.STR.dayShort[S.lang === 'zh' ? 1 : 0][x]; }
  function repLabel(n) {
    var d = n.repeat.slice();
    if (d.length === 7) return tr('daily');
    if (d.length === 5 && [1, 2, 3, 4, 5].every(function (x) { return d.indexOf(x) >= 0; })) return tr('weekdays');
    return tr('weekPre') + DAY_ORDER.filter(function (x) { return d.indexOf(x) >= 0; }).map(dayName).join(S.lang === 'zh' ? '' : ' ');
  }
  function nextDay(n) {
    var t = new Date().getDay();
    for (var k = 1; k <= 7; k++) { var x = (t + k) % 7; if (n.repeat.indexOf(x) >= 0) return k === 1 ? tr('tomorrow') : dayName(x); }
    return '';
  }
  function repModeOf(n) { if (!isRec(n)) return 'none'; return n.repeat.length === 7 ? 'daily' : 'days'; }

  /* ---------- timer ---------- */
  var audio = null;
  function timerState(id) {
    if (!S.timer || S.timer.id !== id) return 'idle';
    if (S.timer.paused) return 'pause';
    return Date.now() >= S.timer.endAt ? 'end' : 'run';
  }
  function timerLeft() {
    if (!S.timer) return 0;
    if (S.timer.paused) return S.timer.left;
    return Math.max(0, Math.ceil((S.timer.endAt - Date.now()) / 1000));
  }
  function timerFrac() { if (!S.timer) return 0; return Math.min(1, Math.max(0, 1 - timerLeft() / S.timer.total)); }
  function initAudio() {
    try { if (!audio) { var C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); } if (audio && audio.state === 'suspended') audio.resume(); } catch (e) {}
  }
  function beep() {
    try {
      if (!audio) return;
      var t0 = audio.currentTime + 0.03;
      function tone(t, type, f, len, vol, cut, q) {
        var o = audio.createOscillator(), g = audio.createGain(), fl = audio.createBiquadFilter();
        o.type = type; o.frequency.setValueAtTime(f, t);
        fl.type = 'lowpass'; fl.Q.value = q || 1;
        fl.frequency.setValueAtTime(cut, t);
        fl.frequency.exponentialRampToValueAtTime(Math.max(120, cut / 8), t + len);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.005 + len);
        o.connect(fl); fl.connect(g); g.connect(audio.destination);
        o.start(t); o.stop(t + len + 0.06);
      }
      [110, 110, 165, 220].forEach(function (f, i) { tone(t0 + i * 0.16, 'sawtooth', f, 0.14, 0.22, 3500, 12); });
      [0, 0.32].forEach(function (x) { tone(t0 + x, 'sine', 55, 0.3, 0.9, 400, 1); });
    } catch (e) {}
  }
  function askNotify() { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(function () {}); } catch (e) {} }
  function notify(text) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var title = tr('timeUp');
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg && reg.showNotification) reg.showNotification(title, { body: text, icon: 'icons/icon-192.png', tag: 'shengchanxian-timer' });
          else new Notification(title, { body: text });
        }).catch(function () {});
      } else { new Notification(title, { body: text }); }
    } catch (e) {}
  }
  function alarm() {
    var f = S.timer ? findNode(S.timer.id) : null;
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
    beep(); notify(f ? f.n.text : '');
  }
  function tick() {
    if (!S.timer) return;
    var st = timerState(S.timer.id);
    if (st === 'end' && !S.timer.fired) { S.timer.fired = true; save(); alarm(); render(); return; }
    if (st === 'run') {
      var t = document.getElementById('tagTxt'); if (t) t.textContent = clock(timerLeft());
      var b = document.getElementById('tbar'); if (b) b.style.width = Math.round(timerFrac() * 100) + '%';
    }
  }
  setInterval(tick, 500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  function clearTimerFor(id) { if (S.timer && S.timer.id === id) S.timer = null; }

  /* ---------- gear loader ---------- */
  function gearSvg(size, cls) {
    var n = 9, c = 12, ro = 11.2, ri = 8.8, hole = 3.2, w = Math.PI / n, d = '';
    for (var i = 0; i < n; i++) {
      var a = i * 2 * Math.PI / n;
      [[a - w * 0.62, ri], [a - w * 0.36, ro], [a + w * 0.36, ro], [a + w * 0.62, ri]].forEach(function (p, k) {
        d += (i === 0 && k === 0 ? 'M' : 'L') + (c + p[1] * Math.cos(p[0])).toFixed(2) + ' ' + (c + p[1] * Math.sin(p[0])).toFixed(2) + ' ';
      });
    }
    d += 'Z M' + (c + hole) + ' ' + c + ' A' + hole + ' ' + hole + ' 0 1 0 ' + (c - hole) + ' ' + c + ' A' + hole + ' ' + hole + ' 0 1 0 ' + (c + hole) + ' ' + c + ' Z';
    return '<svg class="' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="#1A1D21" fill-rule="evenodd"/></svg>';
  }
  function showLoader(text, withTip) {
    var tip = '';
    if (withTip) {
      var i; do { i = Math.floor(Math.random() * window.TIPS.length); } while (i === T.tipN && window.TIPS.length > 1);
      T.tipN = i;
      var t = window.TIPS[i];
      tip = '<div class="tip"><span class="tk">' + esc(tr('tipK')) + '</span><span class="tt">' + esc(t[0][S.lang === 'zh' ? 1 : 0]) + '</span><span class="ts">' + esc(t[1]) + '</span></div>';
    }
    overlay.innerHTML = '<div class="loader" role="status"><div class="gears">' + gearSvg(56) + gearSvg(30, 'small') + '</div><span>' + esc(text) + '</span>' + tip + '</div>';
  }
  function hideLoader() { overlay.innerHTML = ''; }

  /* ---------- conveyor pieces ---------- */
  var CORNER = (function () {
    var lines = '';
    for (var t = 60; t <= 210; t += 30) {
      var r = t * Math.PI / 180, c = Math.cos(r), si = Math.sin(r);
      lines += '<line x1="' + (16 + 3 * c).toFixed(2) + '" y1="' + (3 * si).toFixed(2) + '" x2="' + (16 + 16 * c).toFixed(2) + '" y2="' + (16 * si).toFixed(2) + '"/>';
    }
    return '<svg class="corner" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M16 0 L0 0 A16 16 0 0 0 16 16 Z" fill="#F4F5F2"/>' +
      '<g clip-path="url(#cq)"><g class="rl" stroke="#142A6E" stroke-width="1.5">' + lines + '</g></g>' +
      '<path class="lm" d="M16 0 L0 0 A16 16 0 0 0 16 16 Z" fill="#C8FF2E"/>' +
      '<path d="M0.75 0 A15.25 15.25 0 0 0 16 15.25" fill="none" stroke="#1A1D21" stroke-width="1.5"/></svg>';
  })();
  function hrowHtml(pos, cls, extra) {
    var inner = pos === 'first' ? CORNER + '<i class="hbar"></i>' : (pos === 'last' ? '<i class="hbar"></i>' + CORNER : '<i class="hbar"></i>');
    return '<div class="hrow ' + pos + (cls ? ' ' + cls : '') + '" ' + (extra || '') + '>' + inner + '</div>';
  }
  function mxHtml(cls, extra) { return '<div class="mx' + (cls ? ' ' + cls : '') + '" ' + (extra || '') + '><i class="tri l"></i><i class="core"></i><i class="tri r"></i></div>'; }
  /* ---------- belts: one SVG per merge, straight runs and corners are one path ---------- */
  var DROP = 32, BUSH = 16, INH = 20;
  function gapHtml(n, lits, ds, allLit, o) {
    var H = n > 1 ? DROP + BUSH + INH : DROP;
    return '<div class="gap" data-n="' + n + '" data-lit="' + lits.join(',') + '" data-ds="' + ds.join(',') + '" data-all="' + (allLit ? 1 : 0) + '" data-mv="' + o.mv + '" data-pw="' + (o.pw ? 1 : 0) + '"' + (o.bk ? ' data-bk="' + esc(o.bk) + '"' : '') + ' style="height:' + H + 'px">' +
      (n > 1 ? mxHtml('abs' + (allLit ? ' lit' : ''), 'style="top:' + (DROP - 2) + 'px;--d:' + (ds[0] + 75) + 'ms"') : '') + '<svg class="belts" aria-hidden="true"></svg></div>';
  }
  function layoutBelts() {
    Array.prototype.forEach.call(app.querySelectorAll('.gap'), function (g) {
      var kidsEl = g.previousElementSibling, svg = g.querySelector('svg');
      if (!kidsEl || !svg || !/\bkids\b/.test(kidsEl.className)) return;
      var n = +g.dataset.n, W = g.offsetWidth, H = g.offsetHeight, xm = W / 2, yb = DROP + 8;
      var lits = g.dataset.lit.split(','), ds = g.dataset.ds.split(','), mv = g.dataset.mv, pw = g.dataset.pw === '1', allLit = g.dataset.all === '1';
      var nxt = g.nextElementSibling, ext = 0;
      if (nxt) {
        ext = Math.max(0, nxt.offsetTop - (g.offsetTop + H));
        var vis = nxt.querySelector('.card.cur, .ready-card');
        if (vis) { var wrap = vis.offsetParent, up = vis.offsetTop; if (wrap && wrap !== nxt && wrap.offsetParent === nxt) up += wrap.offsetTop; ext += up; }
      }
      var P = [], gl = g.getBoundingClientRect().left, xs = Array.prototype.map.call(kidsEl.children, function (c) { var r = c.lastElementChild.getBoundingClientRect(); return r.left + r.width / 2 - gl; });
      if (n > 1) xm = (xs[0] + xs[n - 1]) / 2; else xm = xs[0];
      var mxEl = g.querySelector('.mx'), half = mxEl ? Math.max(8, mxEl.getBoundingClientRect().width / 2 - 3) : 22;
      if (mxEl && n > 1) { mxEl.style.left = (xm - 10) + 'px'; mxEl.style.marginLeft = '0'; }
      Array.prototype.forEach.call(g.querySelectorAll('.mx.sub'), function (e) { e.remove(); });
      Array.prototype.forEach.call(kidsEl.children, function (c, i) {
        var x = xs[i], d;
        if (n === 1) d = 'M' + x + ' 0V' + (H + ext);
        else if (i === 0 || i === n - 1) {
          var dir = i === 0 ? 1 : -1, stop = xm - dir * half, r = Math.max(2, Math.min(16, Math.abs(stop - x) - 1));
          d = 'M' + x + ' 0V' + (yb - r) + 'A' + r + ' ' + r + ' 0 0 ' + (dir > 0 ? 0 : 1) + ' ' + (x + dir * r) + ' ' + yb + 'H' + stop;
        } else {
          if (Math.abs(x - xm) < half + 14) x = xm;
          else { var sm = document.createElement('div'); sm.className = 'mx abs sub' + (lits[i] === '1' ? ' lit' : ''); sm.style.top = (DROP - 2) + 'px'; sm.style.left = (x - 10) + 'px'; sm.style.margin = '0'; sm.innerHTML = '<i class="tri l"></i><i class="core"></i><i class="tri r"></i>'; g.appendChild(sm); }
          d = 'M' + x + ' 0V' + yb;
        }
        P.push({ d: d, lit: lits[i] === '1', move: mv === 'all' || lits[i] === '1', delay: +ds[i] || 0 });
      });
      if (n > 1) P.push({ d: 'M' + xm + ' ' + yb + 'V' + (H + ext), lit: allLit, move: mv === 'all' || allLit, delay: (+ds[0] || 0) + 135 });
      var o = '', f = '', l = '', t = '';
      P.forEach(function (p) {
        o += '<path d="' + p.d + '"/>'; f += '<path d="' + p.d + '"/>';
        if (p.lit || pw) l += '<path pathLength="1" class="' + (pw ? 'draw' : '') + '" style="--d:' + p.delay + 'ms" d="' + p.d + '"/>';
        t += '<path class="' + (p.move ? 'mv' : '') + '" d="' + p.d + '"/>';
      });
      svg.style.setProperty('--ph', '-' + (Date.now() % 2200) + 'ms');
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.innerHTML = '<g class="b-o">' + o + '</g><g class="b-f">' + f + '</g><g class="b-l">' + l + '</g><g class="b-t">' + t + '</g>';
      var bk = g.dataset.bk;
      if (bk && T.beltSig && T.screen === 'setup' && T.setup && T.setup.phase === 'chain') {
        var sig = Math.round(W) + ':' + P.map(function (p) { return p.d; }).join('|');
        if (T.beltSig[bk] !== sig) {
          T.beltSig[bk] = sig;
          if (!reduce && svg.animate) {
            var fx = { duration: 160, delay: 110, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' };
            svg.animate([{ opacity: 0 }, { opacity: 1 }], fx);
            var mxe = g.querySelector('.mx'); if (mxe) mxe.animate([{ opacity: 0 }, { opacity: 1 }], fx);
          }
        }
      }
    });
  }
  /* ---------- pull neighbouring branches closer when the space between them is empty ---------- */
  function compactTrees() {
    var GAP = T.screen === 'setup' ? 40 : 28, BELT = 48;
    Array.prototype.forEach.call(app.querySelectorAll('.kids > .col'), function (c) { c.style.marginLeft = ''; });
    Array.prototype.forEach.call(app.querySelectorAll('.gap'), function (g) { if (g.nextElementSibling) g.nextElementSibling.style.translate = ''; });
    function rects(list) { return Array.prototype.map.call(list, function (e) { var r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom + BELT }; }); }
    Array.prototype.slice.call(app.querySelectorAll('.kids')).reverse().forEach(function (row) {
      var cols = Array.prototype.slice.call(row.children);
      for (var i = 1; i < cols.length; i++) {
        var left = [];
        for (var j = 0; j < i; j++) left = left.concat(rects(cols[j].querySelectorAll('.bx')));
        var mine = rects(cols[i].querySelectorAll('.bx')), best = Infinity;
        left.forEach(function (a) { mine.forEach(function (b) { if (a.t < b.b && b.t < a.b) best = Math.min(best, b.l - a.r - GAP); }); });
        if (best !== Infinity && best > 1) cols[i].style.marginLeft = (-best) + 'px';
      }
    });
    alignParents();
  }
  /* each step sits under the middle of the belt that feeds it (the merger is always mid-bus) */
  function alignParents() {
    Array.prototype.forEach.call(app.querySelectorAll('.gap'), function (g) {
      var kidsEl = g.previousElementSibling, box = g.nextElementSibling;
      if (!kidsEl || !box || kidsEl.className.indexOf('kids') < 0 || !kidsEl.children.length) return;
      var kc = kidsEl.children, a = kc[0].lastElementChild.getBoundingClientRect(), z = kc[kc.length - 1].lastElementChild.getBoundingClientRect();
      var xm = ((a.left + a.width / 2) + (z.left + z.width / 2)) / 2 - g.getBoundingClientRect().left;
      box.style.translate = (xm - g.offsetWidth / 2) + 'px 0';
    });
  }
  function setCenter(id) {
    T.centerId = id;
    T.clicks = (T.clicks || []).filter(function (x) { return x !== id; });
    T.clicks.push(id);
    if (T.clicks.length > 20) T.clicks.shift();
  }
  function dayToggle() {
    var on = S.dayOn !== false;
    return '<div class="vt" role="group"><button type="button" class="' + (on ? 'sel' : '') + '" aria-pressed="' + on + '" data-a="day-on" data-v="1">' + esc(tr('on')) + '</button><button type="button" class="' + (on ? '' : 'sel') + '" aria-pressed="' + (!on) + '" data-a="day-on" data-v="0">' + esc(tr('off')) + '</button></div>';
  }
  function fitTitles() {
    var list = document.querySelectorAll('.h1[data-k="h1"]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      el.style.fontSize = ''; el.classList.remove('one');
      if (el.textContent.indexOf('\n') < 0) { el.classList.remove('fit'); continue; }
      el.classList.add('fit'); el.classList.add('one');
      if (el.scrollWidth <= el.clientWidth + 0.5) continue;
      el.classList.remove('one');
      var fs = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && fs > 16) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
    }
  }
  function relayoutTrees() { fitTitles(); compactTrees(); layoutBelts(); }
  window.addEventListener('resize', relayoutTrees);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayoutTrees);

  function posOf(idx, sibs) { return idx === 0 ? 'first' : (idx === sibs - 1 ? 'last' : 'mid'); }

  /* ---------- schedule (real clock) ---------- */
  var PPM = 3, COLORS = ['#142A6E', '#1A1D21', '#5C6166', '#FF8000'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dlText(su, h) { return su.date ? fmtDate(su.date, true) + (h != null ? ', ' + fmtHour(h) : '') : tr('pickDate'); }
  function dlhParse(tv, cur) {
    var mm = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])?m?$/i.exec(tv);
    if (!tv) return null;
    if (!mm) return undefined;
    var hv = +mm[1], ap = (mm[3] || '').toLowerCase();
    if (!ap && S.fmt === '12' && hv >= 1 && hv <= 12) ap = (cur != null && cur >= 12) ? 'p' : 'a';
    if (ap === 'p' && hv < 12) hv += 12; else if (ap === 'a' && hv === 12) hv = 0;
    return hv >= 0 && hv <= 23 ? hv : undefined;
  }
  function fmtHour(h) {
    if (S.fmt === '12') { var x = h % 24, hh = x % 12 === 0 ? 12 : x % 12; return hh + ' ' + (x < 12 ? 'AM' : 'PM'); }
    return pad(h) + ':00';
  }
  function hm(t) {
    var d = new Date(t), H = d.getHours(), M = d.getMinutes();
    if (S.fmt === '12') return (H % 12 === 0 ? 12 : H % 12) + ':' + pad(M) + ' ' + (H < 12 ? 'AM' : 'PM');
    return pad(H) + ':' + pad(M);
  }
  function goalsSorted() {
    return S.goals.filter(function (g) { return g.status !== 'standby'; }).sort(function (a, b) {
      if (a.dl && b.dl) return a.dl < b.dl ? -1 : (a.dl > b.dl ? 1 : 0);
      return a.dl ? -1 : (b.dl ? 1 : 0);
    });
  }
  function eligible(n) { return n.start && !isDone(n) && !(isRec(n) && (doneToday(n) || !schedToday(n))); }
  function normOrder() {
    var ok = {};
    S.goals.forEach(function (g) { if (g.status === 'standby') return; nodesOf(g).forEach(function (n) { if (eligible(n)) ok[n.id] = 1; }); });
    var have = {}, ord = S.order.filter(function (id) { if (ok[id] && !have[id]) { have[id] = 1; return true; } return false; });
    goalsSorted().forEach(function (g) { nodesOf(g).forEach(function (n) { if (ok[n.id] && !have[n.id]) { have[n.id] = 1; ord.push(n.id); } }); });
    S.order = ord;
  }
  function prereqs(g, n) {
    var res = [], seen = {};
    (function walk(ids) {
      ids.forEach(function (id) {
        var m = g.nodes[id]; if (!m || seen[id]) return; seen[id] = 1;
        if (isDone(m)) return;
        if (m.start && !isRec(m)) res.push(id); else walk(m.needs);
      });
    })(n.needs);
    return res;
  }
  function fitTime(t, mins) {
    for (var k = 0; k < 400; k++) {
      var d = new Date(t);
      var ds = S.dayOn === false ? 0 : S.day.s, de = S.dayOn === false ? 24 : S.day.e;
      var ws = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ds).getTime();
      var we = new Date(d.getFullYear(), d.getMonth(), d.getDate(), de).getTime();
      if (t < ws) t = ws;
      if (mins * 60000 > we - ws || t + mins * 60000 <= we) return t;
      t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, ds).getTime();
    }
    return t;
  }
  function buildSchedule() {
    normOrder();
    var cut = {};
    var rem = S.order.map(findNode).filter(Boolean), left = {};
    rem.forEach(function (f) { left[f.n.id] = 1; });
    var out = [], cur = Math.ceil(Date.now() / 300000) * 300000, guard = 0, cu = cur, tn = new Date(), tk = ymd(tn.getFullYear(), tn.getMonth(), tn.getDate()), pk = todayKey();
    /* a line due today ignores the working hours and is never pushed to another day; it goes first */
    function urgent(f) { return f.g.dl === tk; }
    rem = rem.filter(urgent).concat(rem.filter(function (f) { return !urgent(f); }));
    /* a step whose timer was started stays where it started and is marked as started; it is not pushed back */
    if (S.timer) {
      var ri = -1;
      rem.forEach(function (f, i) { if (f.n.id === S.timer.id) ri = i; });
      if (ri >= 0) {
        var rf = rem.splice(ri, 1)[0]; delete left[rf.n.id];
        var rs = S.timer.startAt || (S.timer.endAt - S.timer.total * 1000), rm = schedMins(rf.n);
        var re = Math.max(rs + rm * 60000, Math.ceil(Date.now() / 300000) * 300000);
        out.push({ g: rf.g, n: rf.n, start: rs, end: re, locked: false, unfit: false, started: true });
        if (re > cu) cu = re;
        if (S.pause !== pk && re > cur) cur = re;
      }
    }
    /* Pause reschedule: steps keep the slots they had when it was switched on, however late it gets today */
    if (S.pause === pk && S.frozen) {
      var keepRem = [];
      rem.forEach(function (f) {
        var z = S.frozen[f.n.id];
        if (z) {
          out.push({ g: f.g, n: f.n, start: z[0], end: z[1], locked: !isReady(f.g, f.n), unfit: false, frozen: true });
          delete left[f.n.id];
          if (z[1] > cur) cur = z[1];
          if (z[1] > cu) cu = z[1];
        } else keepRem.push(f);
      });
      rem = keepRem;
    }
    while (rem.length && guard++ < 5000) {
      var idx = -1;
      for (var i = 0; i < rem.length; i++) {
        if (prereqs(rem[i].g, rem[i].n).every(function (id) { return !left[id]; })) { idx = i; break; }
      }
      if (idx < 0) idx = 0;
      var f = rem.splice(idx, 1)[0]; delete left[f.n.id];
      var mins = schedMins(f.n), st;
      var unfit = false;
      if (urgent(f)) {
        st = cu;
        /* order is kept: once one step does not fit before the deadline, every step after it is listed apart too */
        if (cut.all || st + mins * 60000 > dlEnd(f.g)) { unfit = true; cut.all = 1; }
        else { cu = st + mins * 60000; if (cu > cur) cur = cu; }
      } else { st = fitTime(cur, mins); cur = st + mins * 60000; }
      out.push({ g: f.g, n: f.n, start: st, end: st + mins * 60000, locked: !isReady(f.g, f.n), unfit: unfit });
    }
    return out;
  }
  function goalColor(g) { var i = S.goals.indexOf(g); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }
  function vTimeline(fid) {
    var sch = buildSchedule(), now = Date.now();
    var dOff = Math.max(0, Math.min(120, T.schedDay || 0)), d0 = new Date(now), t0 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + dOff).getTime(), t1 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + dOff + 1).getTime();
    var unfit = sch.filter(function (b) { return b.unfit && (!fid || b.g.id === fid); });
    var items = sch.filter(function (b) { return !b.unfit && b.start >= t0 && b.start < t1; });
    T.hidden = sch.filter(function (b) { return !b.unfit && !(b.start >= t0 && b.start < t1); }).map(function (b) { return b.n.id; });
    var paused = dOff === 0 && S.pause === todayKey();
    var dayLbl = dOff === 0 ? tr('today') : (dOff === 1 ? tr('tomorrowCap') : new Date(t0).toLocaleDateString(S.lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    var h = '<div class="tl-top"><div class="tl-nav"><span class="tl-day">' + esc(dayLbl) + '</span><button type="button" class="mini tl-pick" data-a="sch-cal">' + esc(tr('pickDate')) + '</button></div>' +
      (dOff === 0 ? '<button type="button" class="mini" data-a="' + (paused ? 'resume-today' : 'pause-today') + '">' + esc(paused ? tr('resumeToday') : tr('pauseToday')) + '</button>' : '<button type="button" class="mini" data-a="sch-today">' + esc(tr('today')) + '</button>') + '</div>';
    if (paused) h += '<div class="small tl-hint">' + esc(tr('pausedNote')) + '</div>';
    else if (!items.length) h += '<div class="small tl-hint">' + esc(tr('noBlocks')) + '</div>';
    else h += '<div class="small tl-hint">' + esc(tr('holdHint')) + '</div>';
    var HR = 3600000, FULL = 60 * PPM, COMPACT = 18, occ = [], off = [], hh = [], k;
    for (k = 0; k < 24; k++) occ[k] = items.some(function (b) { return b.start < t0 + (k + 1) * HR && b.end > t0 + k * HR; }) || (now >= t0 + k * HR && now < t0 + (k + 1) * HR && false);
    var acc = 12;
    for (k = 0; k < 24; k++) { off[k] = acc; hh[k] = occ[k] ? FULL : COMPACT; acc += hh[k]; }
    function yOf(t) { var hr = Math.max(0, Math.min(23.999, (t - t0) / HR)), i = Math.floor(hr); return off[i] + (hr - i) * hh[i]; }
    var lay = [], pb = 0;
    items.forEach(function (b) {
      var top = yOf(b.start), ht = Math.max(24, yOf(b.end - 1) - top - 2);
      top = Math.max(top, pb); pb = top + ht + 2; lay.push([top, ht]);
    });
    var boxH = Math.max(acc + 14, pb + 14);
    h += '<div class="tl" style="height:' + boxH + 'px">';
    for (var x = 0; x < 24; x++) h += '<div class="tl-h' + (occ[x] ? '' : ' empty') + '" style="top:' + off[x] + 'px"><span>' + fmtHour(x) + '</span></div>';
    h += '<div class="tl-h empty" style="top:' + acc + 'px"><span>' + fmtHour(24) + '</span></div>';
    items.forEach(function (b, bi) {
      var top = lay[bi][0], ht = lay[bi][1];
      var mine = !fid || b.g.id === fid;
      var late = b.g.dl && b.end > dlEnd(b.g);
      h += '<div class="tblock' + (b.locked ? ' locked' : '') + (b.started ? ' started' : '') + (mine ? '' : ' other') + (late ? ' late' : '') + (ht < 34 ? ' tiny' : '') + '" role="button" tabindex="0" data-a="edit" data-id="' + b.n.id + '" style="top:' + top + 'px;height:' + ht + 'px;--c:' + goalColor(b.g) + '">' +
        '<span class="tm">' + hm(b.start) + (b.started ? ' · ' + esc(tr('startedTag')) : '') + (fid ? '' : ' · ' + esc(b.g.title)) + (late ? ' · ' + esc(tr('late')) : '') + '</span><span class="tn">' + esc(b.n.text) + '</span></div>';
    });
    h += (dOff === 0 ? '<div class="tl-now" style="top:' + yOf(now) + 'px"><i></i></div>' : '') + '</div>';
    if (unfit.length) {
      h += '<div class="unfit"><div class="set-l">' + esc(tr('unfitH')) + '</div><div class="small">' + esc(tr('unfitS')) + '</div>';
      unfit.forEach(function (b) { h += '<div class="unfit-row" role="button" tabindex="0" data-a="edit" data-id="' + b.n.id + '"><span class="tn">' + esc(b.n.text) + '</span><span class="tm">' + esc((fid ? '' : b.g.title + ' · ') + minsLbl(b.n.mins)) + '</span></div>'; });
      h += '</div>';
    }
    var later = sch.filter(function (b) { return !b.unfit && b.start >= t1; }).length;
    if (later) h += '<div class="small">' + esc(tr(dOff === 0 ? 'afterToday' : 'afterDay', { n: later })) + '</div>';
    return h;
  }

  /* ---------- screens: list ---------- */
  function curText(g) {
    if (goalDone(g)) return tr('allDone');
    var r = readyList(g);
    return r.length ? tr('nowIs', { x: r[0].text }) : '';
  }
  function gcard(g, fin) {
    var p = progress(g), d = daysLeft(g), sb = g.status === 'standby';
    var h = '<button type="button" class="gcard' + (sb ? ' standby' : '') + (fin ? ' finished' : '') + '" data-a="open" data-id="' + g.id + '"><span class="t">' + esc(g.title) + '</span>';
    if (sb) return h + '<span class="cur">' + esc(tr('onStandby')) + '</span></button>';
    if (!fin) h += metaHtml(g, d);
    h += '<span class="cur">' + esc(curText(g)) + '</span><span class="bar"><i style="width:' + p.pct + '%"></i></span></button>';
    return h;
  }
  function vList() {
    var fin = S.goals.filter(function (g) { return g.status !== 'standby' && goalDone(g); });
    var act = S.goals.filter(function (g) { return g.status !== 'standby' && !goalDone(g); });
    act.sort(function (a, b) {
      if (a.dl && b.dl) return a.dl < b.dl ? -1 : (a.dl > b.dl ? 1 : 0);
      return a.dl ? -1 : (b.dl ? 1 : 0);
    });
    var sb = S.goals.filter(function (g) { return g.status === 'standby'; });
    var h = '<main class="list"><div class="top"><span class="eyebrow">' + esc(tr('app')) + '</span><div class="top-r"><button type="button" class="ghost-sm" data-a="open-settings">' + esc(tr('settings')) + '</button></div></div>';
    h += '<div class="vt tabs" role="group"><button type="button" class="' + (S.home !== 'time' ? 'sel' : '') + '" aria-pressed="' + (S.home !== 'time') + '" data-a="home-tab" data-v="lines">' + esc(tr('tabLines')) + '</button><button type="button" class="' + (S.home === 'time' ? 'sel' : '') + '" aria-pressed="' + (S.home === 'time') + '" data-a="home-tab" data-v="time">' + esc(tr('tabTime')) + '</button></div>';
    if (S.home === 'time') return h + vTimeline(null) + '<div style="height:48px"></div></main>';
    if (!S.goals.length) h += '<div class="small">' + esc(tr('noGoals')) + '</div>';
    act.forEach(function (g) { h += gcard(g); });
    h += '<button type="button" class="add-goal" data-a="new-goal">' + esc(tr('newGoal')) + '</button>';
    if (S.drafts.length) {
      h += '<div class="sec-l">' + esc(tr('draftsLabel')) + '</div>';
      S.drafts.forEach(function (d) { h += '<div class="draft-row"><button type="button" class="gcard draft" data-a="draft-open" data-id="' + d.id + '"><span class="t">' + esc(d.goal || tr('untitled')) + '</span><span class="cur">' + esc(tr('draftNote')) + '</span></button><button type="button" class="ghost-sm draft-del" data-a="draft-del" data-id="' + d.id + '">' + esc(tr('del')) + '</button></div>'; });
    }
    if (fin.length) { h += '<div class="sec-l">' + esc(tr('doneLabel')) + '</div>'; fin.forEach(function (g) { h += gcard(g, true); }); }
    if (sb.length) { h += '<div class="sec-l">' + esc(tr('standbyLabel')) + '</div>'; sb.forEach(function (g) { h += gcard(g); }); }
    return h + '</main>';
  }

  /* ---------- screen: settings ---------- */
  function vSettings() {
    function chip(label, on, a, v) { return '<button type="button" class="chip' + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-a="' + a + '" data-v="' + v + '">' + esc(label) + '</button>'; }
    function row(lbl, key, val) { return '<div class="step-row"><span>' + esc(lbl) + '</span><div class="btns"><button type="button" class="mini" data-a="day-' + key + '" data-v="-1" aria-label="-1">−</button><span class="pct">' + fmtHour(val) + '</span><button type="button" class="mini" data-a="day-' + key + '" data-v="1" aria-label="+1">+</button></div></div>'; }
    var h = '<main class="settings"><div class="top"><button type="button" class="ghost-sm" data-a="home">‹ ' + esc(tr('back')) + '</button></div>';
    h += '<h1 class="list-h">' + esc(tr('settings')) + '</h1>';
    h += '<section class="set"><div class="set-l">' + esc(tr('language')) + '</div><div class="chips">' + chip('English', S.lang === 'en', 'set-lang', 'en') + chip('中文', S.lang === 'zh', 'set-lang', 'zh') + '</div></section>';
    h += '<section class="set"><div class="set-l">' + esc(tr('timeFmt')) + '</div><div class="chips">' + chip(tr('fmt24'), S.fmt === '24', 'set-fmt', '24') + chip(tr('fmt12'), S.fmt === '12', 'set-fmt', '12') + '</div></section>';
    h += '<section class="set"><div class="set-l day-h"><span>' + esc(tr('dayTitle')) + '</span>' + dayToggle() + '</div><div class="small">' + esc(tr('dayNote')) + '</div>' + (S.dayOn === false ? '<div class="small">' + esc(tr('dayOffNote')) + '</div>' : row(tr('dayStart'), 's', S.day.s) + row(tr('dayEnd'), 'e', S.day.e)) + '</section>';
    h += '<section class="set"><div class="set-l">' + esc(tr('backup')) + '</div><button type="button" class="b-outline" data-a="backup">' + esc(tr('bkTitle')) + '</button></section>';
    return h + '<div style="height:48px"></div></main>';
  }

  /* ---------- screens: line ---------- */
  function minsHtml(n) { return n.prevMins ? '<s>' + n.prevMins + '</s> → ' + minsLbl(n.mins) : minsLbl(n.mins); }
  function curCard(n) {
    var rec = isRec(n);
    if (rec && (doneToday(n) || !schedToday(n))) {
      var h0 = '<div class="card"><div class="lbl">' + esc(n.text) + '</div><div class="mins">' + esc(repLabel(n)) + ' · ' + minsHtml(n) + '</div>';
      h0 += doneToday(n) ? '<div class="row-mini"><span class="done-tag">' + esc(tr('doneToday')) + '</span><span class="note">' + esc(tr('nextAt', { x: nextDay(n) })) + '</span></div>' : '<div class="note">' + esc(tr('rest')) + ' · ' + esc(tr('nextAt', { x: nextDay(n) })) + '</div>';
      return h0 + '<div class="row-mini"><button type="button" class="mini" data-a="edit" data-id="' + n.id + '">' + esc(tr('edit')) + '</button></div></div>';
    }
    var st = timerState(n.id), tagInner, cls = 'tag-v';
    if (st === 'run') tagInner = PAUSE + '<span id="tagTxt">' + clock(timerLeft()) + '</span>';
    else if (st === 'pause') tagInner = PLAY + '<span>' + clock(timerLeft()) + '</span>';
    else if (st === 'end') { tagInner = '<span>' + esc(tr('timeUp')) + '</span>'; cls += ' end'; }
    else tagInner = (n.mins ? PLAY : '') + '<span>' + esc(n.mins ? tr('tagStart', { n: n.mins }) : tr('tagStartNA')) + '</span>';
    var frac = (st === 'run' || st === 'pause') ? timerFrac() : (st === 'end' ? 1 : 0);
    var h = '<div class="cur-wrap' + (S.timer && S.timer.id !== n.id ? ' idle' : '') + '"><button type="button" class="tagbtn" data-a="timer" data-id="' + n.id + '"><span class="' + cls + '">' + tagInner + '</span></button>' +
      '<div class="card cur"><i id="' + (st === 'run' ? 'tbar' : 'tbar0') + '" class="tbar' + (st === 'end' ? ' end' : '') + '" style="width:' + Math.round(frac * 100) + '%"></i><i class="corner-t"></i>' +
      '<div class="lbl">' + esc(n.text) + '</div>';
    if (n.items && listCur(n) >= 0) {
      var lci = listCur(n);
      h += '<div class="li-cur">' + esc(n.items[lci].t) + '</div><div class="li-pos"><span>' + esc(tr('itemOf', { a: lci + 1, b: n.items.length })) + '</span><button type="button" class="li-all" data-a="li-all" data-id="' + n.id + '">' + esc(tr('seeAll', { n: n.items.length })) + '</button></div>';
    }
    if (rec) h += '<div class="mins">' + esc(repLabel(n)) + '</div>';
    if (n.prevMins) h += '<span class="adj chg">' + minsHtml(n) + '</span>';
    if (st === 'pause') h += '<div class="paused"><span>' + esc(tr('paused')) + '</span><button type="button" class="mini" data-a="timer-reset" data-id="' + n.id + '">' + esc(tr('resetTimer')) + '</button></div>';
    h += '<div class="btns"><button type="button" class="b b-navy b-done" data-a="done" data-id="' + n.id + '">' + esc(tr('done')) + '</button><button type="button" class="b b-line" data-a="miss" data-id="' + n.id + '">' + esc(tr('miss')) + '</button></div>' +
      '<div class="btns"><button type="button" class="b b-split" data-a="edit" data-id="' + n.id + '">' + esc(tr('edit')) + '</button></div>' + (n.items ? '<i class="li-bar"><i style="width:' + Math.round((n.items.length - itemsLeft(n)) * 100 / n.items.length) + '%"></i></i>' : '') + '</div></div>';
    return h;
  }
  function readyCard(n) {
    return '<div class="ready-card"><div class="lbl">' + esc(n.text) + '</div><button type="button" class="b b-navy" data-a="make-start" data-id="' + n.id + '">' + esc(tr('nowBtn')) + '</button><button type="button" class="b up" data-a="prior" data-id="' + n.id + '">' + esc(tr('upBtn')) + '</button></div>';
  }
  function prodHtml(g, wide) {
    var p = progress(g);
    var h = '<div class="prod-wrap"' + (wide ? ' style="width:100%"' : '') + '><div class="bx prod"' + (wide ? ' style="width:100%"' : '') + '><span class="k">' + esc(tr('product')) + '</span><span class="t">' + esc(g.title) + '</span>' + (goalDone(g) ? '<span class="pdone">' + esc(tr('prodCompleted')) + '</span>' : '') + '<i class="fill" style="width:' + p.pct + '%"></i></div>';
    return h + '</div>';
  }
  function vFocus(g) {
    var all = nodesOf(g), done = all.filter(isDone).length;
    var ready = readyList(g), later = all.filter(function (n) { return !isDone(n) && !isReady(g, n); }).length;
    var h = '<div class="stackf">';
    if (done) h += '<button type="button" class="fold done" data-a="view" data-v="full"><span class="done-tag">' + esc(tr('doneTag')) + '</span><span>' + esc(tr('doneFold', { n: done })) + '</span></button>';
    ready.forEach(function (n) { h += n.start ? curCard(n) : readyCard(n); });
    if (later) h += '<button type="button" class="fold" data-a="view" data-v="full"><span>' + esc(tr('laterFold', { n: later })) + '</span></button>';
    h += '<i class="pgap' + (goalDone(g) ? ' on' : '') + '"></i>' + prodHtml(g, true) + '</div>';
    return h;
  }
  function lcol(g, id, idx, sibs) {
    var root = id === 'root', n = root ? { needs: g.needs } : g.nodes[id];
    if (!n) return '';
    var multi = sibs > 1, kids = n.needs.filter(function (k) { return g.nodes[k]; });
    var h = '<div class="col' + (multi ? ' m' : '') + '">';
    if (kids.length) {
      h += '<div class="kids">';
      kids.forEach(function (k, i) { h += lcol(g, k, i, kids.length); });
      h += '</div>';
      var lits = kids.map(function (k) { return isDone(g.nodes[k]) ? 1 : 0; });
      var all = lits.every(function (x) { return x; });
      h += gapHtml(kids.length, lits, kids.map(function () { return 0; }), all, { mv: 'lit' });
    }
    if (root) h += prodHtml(g, false);
    else if (isDone(n)) h += '<div class="bx node isdone" role="button" tabindex="0" data-a="edit" data-id="' + n.id + '"><span>' + esc(n.text) + '</span></div>';
    else if (isReady(g, n) && n.start) h += '<div class="bx curbx">' + curCard(n) + '</div>';
    else if (isReady(g, n)) h += '<div class="bx">' + readyCard(n) + '</div>';
    else h += '<div class="bx node ' + (n.start ? 'start' : 'plain') + '" role="button" tabindex="0" data-a="edit" data-id="' + n.id + '">' + (n.start ? '<span class="tag">' + esc(minsLbl(n.mins)) + '</span>' : '') + '<span>' + esc(n.text) + '</span></div>';
    return h + '</div>';
  }
  function vTree(g) { return '<div class="tree" id="tree"><div class="tree-in">' + lcol(g, 'root', 0, 1) + '</div></div>'; }
  function vLine() {
    var g = gById(S.cur);
    if (!g) { T.screen = 'list'; return vList(); }
    var p = progress(g), d = daysLeft(g);
    var h = '<main class="line"><div class="top"><button type="button" class="ghost-sm" data-a="home">‹ ' + esc(tr('back')) + '</button><div class="top-r"><div class="vt" role="group"><button type="button" class="' + (S.view === 'focus' ? 'sel' : '') + '" aria-pressed="' + (S.view === 'focus') + '" data-a="view" data-v="focus">' + esc(tr('focus')) + '</button><button type="button" class="' + (S.view === 'full' ? 'sel' : '') + '" aria-pressed="' + (S.view === 'full') + '" data-a="view" data-v="full">' + esc(tr('full')) + '</button><button type="button" class="' + (S.view === 'time' ? 'sel' : '') + '" aria-pressed="' + (S.view === 'time') + '" data-a="view" data-v="time">' + esc(tr('timeTab')) + '</button></div><button type="button" class="ghost-sm" data-a="gmenu" aria-label="' + esc(tr('goalMenu')) + '">⋯</button></div></div>';
    h += '<header class="head"><div class="goal-head"><div class="goal-t">' + esc(g.title) + '</div><button type="button" class="ghost-sm" data-a="line-edit">' + esc(tr('editSteps')) + '</button></div>';
    h += metaHtml(g, d);
    h += '<div class="bar-row"><div class="bar"><i style="width:' + p.pct + '%"></i></div><span class="pct">' + p.pct + '%</span></div></header>';
    if (g.status === 'standby') h += '<div class="standby-bar"><span>' + esc(tr('onStandby')) + '</span><button type="button" data-a="resume" data-id="' + g.id + '">' + esc(tr('resume')) + '</button></div>';
    h += S.view === 'full' ? vTree(g) : (S.view === 'time' ? vTimeline(g.id) : vFocus(g));
    return h + '<div style="height:48px"></div></main>';
  }

  /* ---------- sheets ---------- */
  function planHtml(mins, repMode, repDays) {
    var h = '<div class="small">' + esc(tr('minutes')) + '</div><div class="chips">' + [5, 15, 30, 60, 0].map(function (m) { var sel = mins === m; return '<button type="button" class="chip' + (sel ? ' sel' : '') + '" aria-pressed="' + sel + '" data-a="sh-mins" data-v="' + m + '">' + esc(minsLbl(m)) + '</button>'; }).join('') + '</div>';
    h += '<div class="small">' + esc(tr('repeat')) + '</div><div class="chips">' + [['none', 'noRepeat'], ['daily', 'daily'], ['days', 'pickDays']].map(function (r) { var sel = repMode === r[0]; return '<button type="button" class="chip' + (sel ? ' sel' : '') + '" aria-pressed="' + sel + '" data-a="sh-rep" data-v="' + r[0] + '">' + esc(tr(r[1])) + '</button>'; }).join('') + '</div>';
    if (repMode === 'days') h += '<div class="chips">' + DAY_ORDER.map(function (x) { var sel = repDays.indexOf(x) >= 0; return '<button type="button" class="chip day' + (sel ? ' sel' : '') + '" aria-pressed="' + sel + '" data-a="sh-day" data-v="' + x + '">' + esc(dayName(x)) + '</button>'; }).join('') + '</div>';
    return h;
  }
  /* ---------- duration and repeat picker (setup sheet) ---------- */
  var pkResize = null;
  function pkBuzz() { try { if (navigator.vibrate) navigator.vibrate(4); } catch (e) {} }
  function initPicker() {
    if (pkResize) { window.removeEventListener('resize', pkResize); pkResize = null; }
    var sh = T.sheet; if (!sh || (sh.type !== 'sumins' && sh.type !== 'node') || !document.getElementById('pkDur')) return;
    var isNode = sh.type === 'node';
    var f = isNode ? findNode(sh.id) : suFind(sh.id); if (!f) return;
    var n = f.n, PRESET = [5, 15, 30, 60], RK = isNode ? 'repeat' : 'rep';
    var st = {
      dur: n.mins == null ? -1 : (n.mins === 0 ? 4 : (PRESET.indexOf(n.mins) >= 0 ? PRESET.indexOf(n.mins) : 4)),
      unsure: n.mins === 0,
      rep: !n[RK] || !n[RK].length ? 0 : (n[RK].length === 7 ? 1 : 2),
      days: DAY_ORDER.map(function (d) { return !!(n[RK] && n[RK].indexOf(d) >= 0); })
    };
    function touch() {
      if (isNode) { n.prevMins = null; return; }
      if (!sh.pushed) { suPush(); sh.pushed = true; }
      if (!S.clockSeen) { S.clockSeen = true; save(); }
    }
    function commit() { if (isNode) save(); }
    function applyRep() {
      var arr = [];
      st.days.forEach(function (v, i) { if (v) arr.push(DAY_ORDER[i]); });
      n[RK] = st.rep === 0 || !arr.length ? null : arr;
      commit();
    }

    /* single-select bar with a sliding thumb */
    function makeSeg(el, labels, get, set) {
      el.innerHTML = '<i class="pk-thumb"></i>' + labels.map(function (t, i) { return '<span class="pk-cell" role="radio" data-i="' + i + '">' + esc(t) + '</span>'; }).join('');
      var thumb = el.querySelector('.pk-thumb'), cells = el.querySelectorAll('.pk-cell');
      function paint(i) {
        var w = el.clientWidth / labels.length;
        thumb.style.width = w + 'px';
        thumb.style.transform = 'translateX(' + (Math.max(i, 0) * w) + 'px)';
        thumb.style.opacity = i < 0 ? '0' : '1';
        for (var k = 0; k < cells.length; k++) { cells[k].classList.toggle('on', k === i); cells[k].setAttribute('aria-checked', String(k === i)); }
      }
      function idxAt(x) {
        var r = el.getBoundingClientRect();
        return Math.max(0, Math.min(labels.length - 1, Math.floor((x - r.left) / (r.width / labels.length))));
      }
      var dragging = false, live = 0, sx = 0, sy = 0, decided = false;
      el.addEventListener('pointerdown', function (e) {
        dragging = true; decided = false; sx = e.clientX; sy = e.clientY;
        live = idxAt(e.clientX);
        if (live !== get()) pkBuzz();
        paint(live);
      });
      el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        if (!decided) {
          if (Math.abs(e.clientY - sy) > 10 && Math.abs(e.clientY - sy) > Math.abs(e.clientX - sx)) { dragging = false; paint(get()); return; }
          if (Math.abs(e.clientX - sx) > 4) { decided = true; el.classList.add('dragging'); try { el.setPointerCapture(e.pointerId); } catch (err) {} }
        }
        var i = idxAt(e.clientX);
        if (i !== live) { live = i; pkBuzz(); paint(i); }
      });
      el.addEventListener('pointerup', function () { if (!dragging) return; dragging = false; el.classList.remove('dragging'); set(live); });
      el.addEventListener('pointercancel', function () { dragging = false; el.classList.remove('dragging'); paint(get()); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); set(Math.min(labels.length - 1, Math.max(0, get()) + 1)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); set(Math.max(0, get() - 1)); }
      });
      thumb.style.transition = 'none'; paint(get());
      requestAnimationFrame(function () { requestAnimationFrame(function () { thumb.style.transition = ''; }); });
      return { paint: paint, thumb: thumb };
    }

    var otherWrap = document.getElementById('pkOtherWrap'), otherIn = document.getElementById('pkOtherIn'), unsure = document.getElementById('pkUnsure');
    var daysWrap = document.getElementById('pkDaysWrap'), daysEl = document.getElementById('pkDays'), sumEl = document.getElementById('pkSum');
    if (!otherWrap) return;
    var hasRep = !!daysEl;

    var dur = makeSeg(document.getElementById('pkDur'), ['5', '15', '30', '60', tr('otherSeg')], function () { return st.dur; }, function (i) {
      touch(); st.dur = i; dur.paint(i);
      if (i < 4) { n.mins = PRESET[i]; st.unsure = false; unsure.setAttribute('aria-pressed', 'false'); otherIn.disabled = false; }
      else if (n.mins != null && n.mins !== 0 && PRESET.indexOf(n.mins) >= 0 && !isNode) { n.mins = null; otherIn.value = ''; }
      otherWrap.classList.toggle('open', i === 4);
      commit();
    });
    otherIn.addEventListener('input', function () {
      var v = otherIn.value.replace(/[^0-9]/g, '');
      if (v !== otherIn.value) otherIn.value = v;
      touch();
      var m = Math.round(+v);
      if (m >= 1) n.mins = Math.min(480, m); else if (!isNode) n.mins = null;
      commit();
    });
    unsure.addEventListener('click', function () {
      touch(); st.unsure = !st.unsure;
      unsure.setAttribute('aria-pressed', String(st.unsure));
      otherIn.disabled = st.unsure;
      if (st.unsure) { otherIn.value = ''; n.mins = 0; } else n.mins = isNode ? 15 : null;
      commit();
    });

    if (hasRep) {
    /* days: drag to paint */
    var dayLong = DAY_ORDER.map(function (d) { return dayName(d); });
    var dayShortLbl = S.lang === 'zh' ? dayLong : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    daysEl.innerHTML = dayShortLbl.map(function (d, i) { return '<span class="pk-cell" role="checkbox" aria-label="' + esc(dayLong[i]) + '" data-i="' + i + '">' + esc(d) + '</span>'; }).join('');
    var dayCells = daysEl.querySelectorAll('.pk-cell');
    function paintDays() {
      for (var i = 0; i < 7; i++) { dayCells[i].classList.toggle('on', st.days[i]); dayCells[i].setAttribute('aria-checked', String(st.days[i])); }
      var picked = [];
      st.days.forEach(function (v, i) { if (v) picked.push(dayLong[i]); });
      var sum;
      if (picked.length === 7) sum = tr('everyDay');
      else if (picked.length === 5 && st.days.slice(0, 5).every(Boolean)) sum = tr('weekdays');
      else if (picked.length === 2 && st.days[5] && st.days[6]) sum = tr('weekends');
      else if (picked.length) sum = tr('everyX', { x: picked.join(tr('sumSep')) });
      else sum = tr('pickOne');
      sumEl.textContent = sum;
    }
    function dayAt(x) {
      var r = daysEl.getBoundingClientRect();
      return Math.max(0, Math.min(6, Math.floor((x - r.left) / (r.width / 7))));
    }
    var rep;
    function afterDays() {
      touch();
      var all = st.days.every(Boolean);
      if (all && st.rep !== 1) { st.rep = 1; rep.paint(1); }
      else if (!all && st.rep === 1) { st.rep = 2; rep.paint(2); }
      applyRep(); paintDays();
    }
    var dDrag = false, dMode = true, dLast = -1, dsx = 0, dsy = 0, dDecided = false;
    daysEl.addEventListener('pointerdown', function (e) {
      dDrag = true; dDecided = false; dsx = e.clientX; dsy = e.clientY;
      var i = dayAt(e.clientX);
      dMode = !st.days[i]; st.days[i] = dMode; dLast = i; pkBuzz(); afterDays();
    });
    daysEl.addEventListener('pointermove', function (e) {
      if (!dDrag) return;
      if (!dDecided) {
        if (Math.abs(e.clientY - dsy) > 10 && Math.abs(e.clientY - dsy) > Math.abs(e.clientX - dsx)) { dDrag = false; return; }
        if (Math.abs(e.clientX - dsx) > 4) { dDecided = true; try { daysEl.setPointerCapture(e.pointerId); } catch (err) {} }
      }
      var i = dayAt(e.clientX);
      if (i === dLast) return;
      var a = Math.min(i, dLast), b = Math.max(i, dLast);
      for (var k = a; k <= b; k++) st.days[k] = dMode;
      dLast = i; pkBuzz(); afterDays();
    });
    daysEl.addEventListener('pointerup', function () { dDrag = false; });
    daysEl.addEventListener('pointercancel', function () { dDrag = false; });
    daysEl.addEventListener('keydown', function (e) {
      var k = '1234567'.indexOf(e.key);
      if (k >= 0) { st.days[k] = !st.days[k]; afterDays(); }
    });

    rep = makeSeg(document.getElementById('pkRep'), [tr('noRepeat'), tr('daily'), tr('pickDays')], function () { return st.rep; }, function (i) {
      touch(); st.rep = i; rep.paint(i);
      if (i === 1) st.days = [true, true, true, true, true, true, true];
      if (i === 2 && st.days.every(Boolean)) st.days = [false, false, false, false, false, false, false];
      if (i === 2 && !st.days.some(Boolean)) st.days[(new Date().getDay() + 6) % 7] = true;
      daysWrap.classList.toggle('open', i !== 0);
      applyRep(); paintDays();
    });
    paintDays();
    }
    pkResize = function () {
      var gs = hasRep ? [dur, rep] : [dur];
      gs.forEach(function (g) { g.thumb.style.transition = 'none'; });
      dur.paint(st.dur); if (hasRep) rep.paint(st.rep);
      requestAnimationFrame(function () { gs.forEach(function (g) { g.thumb.style.transition = ''; }); });
    };
    window.addEventListener('resize', pkResize);
  }

  function pickerHtml(pm, pr, noRep) {
    var pOther = pm === 0 || (pm != null && [5, 15, 30, 60].indexOf(pm) < 0);
      return         '<div class="pk-grp"><div class="pk-lbl">' + esc(tr('minPh')) + '</div><div class="pk-bar pk-seg" id="pkDur" role="radiogroup" tabindex="0"></div>' +
        '<div class="pk-reveal' + (pOther ? ' open' : '') + '" id="pkOtherWrap"><div><div class="pk-in"><div class="pk-other"><input id="pkOtherIn" inputmode="numeric" autocomplete="off" aria-label="' + esc(tr('minPh')) + '" placeholder="' + esc(tr('minPh')) + '" value="' + (pm > 0 && [5, 15, 30, 60].indexOf(pm) < 0 ? pm : '') + '"' + (pm === 0 ? ' disabled' : '') + '><button type="button" class="pk-unsure" id="pkUnsure" aria-pressed="' + (pm === 0) + '">' + esc(tr('notSure')) + '</button></div></div></div></div></div>' +
        (noRep ? '' : '<div class="pk-grp"><div class="pk-lbl">' + esc(tr('repeat')) + '</div><div class="pk-bar pk-seg" id="pkRep" role="radiogroup" tabindex="0"></div>' +
        '<div class="pk-reveal' + (pr && pr.length ? ' open' : '') + '" id="pkDaysWrap"><div><div class="pk-in"><div class="pk-bar pk-days" id="pkDays" role="group" tabindex="0"></div><div class="pk-sum" id="pkSum" aria-live="polite"></div></div></div></div></div>');
  }
  function vSheet() {
    var sh = T.sheet; if (!sh) return '';
    var inner = '', f;
    if (sh.type === 'add') {
      f = sh.target === 'root' ? { n: { text: (gById(S.cur) || {}).title || '' } } : findNode(sh.target);
      var tgt = f ? f.n.text : '';
      if (sh.step === 'text') {
        inner = '<label for="addIn" class="h3">' + esc(sh.tiny ? tr('tinyQ') : tr('addQ', { x: tgt })) + '</label>' +
          '<input id="addIn" class="field" enterkeyhint="done" autocomplete="off" placeholder="' + esc(sh.tiny ? tr('tinyPh') : tr('addPh')) + '" value="' + esc(sh.text) + '">' +
          (sh.tiny
            ? '<button type="button" id="addGo" class="b-primary" data-a="add-next"' + (sh.text.trim() ? '' : ' disabled') + '>' + esc(tr('add')) + '</button>'
            : planHtml(sh.mins, sh.repMode, sh.repDays) + '<button type="button" class="b-primary addGate" data-a="add-save"' + (sh.text.trim() ? '' : ' disabled') + '>' + esc(tr('add')) + '</button><button type="button" class="b-outline addGate" data-a="add-prior"' + (sh.text.trim() ? '' : ' disabled') + '>' + esc(tr('priorAdd')) + '</button>') +
          '<button type="button" class="b-text" data-a="close">' + esc(tr('cancel')) + '</button>';
      } else if (sh.step === 'choose') {
        inner = '<div class="preview">' + esc(sh.text) + '</div><button type="button" class="b-primary" data-a="add-now">' + esc(tr('nowBtn')) + '</button><button type="button" class="b-outline" data-a="add-prior">' + esc(tr('priorBtn')) + '</button><button type="button" class="b-text" data-a="close">' + esc(tr('cancel')) + '</button>';
      } else {
        inner = '<div class="preview">' + esc(sh.text) + '</div>' + planHtml(sh.mins, sh.repMode, sh.repDays) + '<button type="button" class="b-primary" data-a="add-save">' + esc(tr('add')) + '</button><button type="button" class="b-text" data-a="close">' + esc(tr('cancel')) + '</button>';
      }
    } else if (sh.type === 'node') {
      f = findNode(sh.id); if (!f) return '';
      var n = f.n;
      inner = '<label for="renIn" class="small">' + esc(tr('stepText')) + '</label><input id="renIn" class="field" autocomplete="off" enterkeyhint="done" value="' + esc(n.text) + '">';
      if (!isDone(n)) {
        if (n.start) inner += pickerHtml(n.mins, isRec(n) ? n.repeat : null, !!n.items);
        else inner += '<button type="button" class="b-primary" data-a="make-start-sheet" data-id="' + n.id + '">' + esc(tr('nowBtn')) + '</button>';
        if (isRec(n)) inner += '<button type="button" class="b-outline" data-a="end-repeat" data-id="' + n.id + '">' + esc(tr('endRepeat')) + '</button>';
      }
      inner += '<button type="button" class="b-text" data-a="close">' + esc(tr('closeSave')) + '</button>';
    } else if (sh.type === 'miss') {
      f = findNode(sh.id); if (!f) return '';
      inner = '<div class="preview">' + esc(f.n.text) + '</div><div class="h3">' + esc(tr('missQ')) + '</div><div class="small">' + esc(tr('missHint')) + '</div><button type="button" class="b-primary" data-a="miss-split" data-id="' + sh.id + '">' + esc(tr('missSplit')) + '</button><button type="button" class="b-outline" data-a="miss-keep" data-id="' + sh.id + '">' + esc(tr('missKeep')) + '</button>';
    } else if (sh.type === 'menu') {
      f = gById(S.cur); if (!f) return '';
      inner = '<div class="preview">' + esc(f.title) + '</div>';
      if (sh.confirm) inner += '<div class="h3">' + esc(tr('delAsk')) + '</div><div class="btns"><button type="button" class="b-primary" data-a="del-yes">' + esc(tr('del')) + '</button><button type="button" class="b-outline" data-a="close">' + esc(tr('cancel')) + '</button></div>';
      else inner += '<button type="button" class="b-outline" data-a="' + (f.status === 'standby' ? 'resume' : 'standby') + '" data-id="' + f.id + '">' + esc(f.status === 'standby' ? tr('resume') : tr('toStandby')) + '</button><button type="button" class="b-outline" data-a="del-ask">' + esc(tr('del')) + '</button><button type="button" class="b-text" data-a="close">' + esc(tr('close')) + '</button>';
    } else if (sh.type === 'sumins') {
      var sf = suFind(sh.id);
      inner = '<div class="h3">' + esc(tr('qHow')) + '</div>' + pickerHtml(sf ? sf.n.mins : null, sf ? sf.n.rep : null, !!(sf && sf.n.items)) + '<button type="button" class="pk-ok" data-a="close">' + esc(tr('good')) + '</button>';
    } else if (sh.type === 'hdel') {
      f = gById(sh.id); if (!f) return '';
      inner = '<div class="preview">' + esc(f.title) + '</div><div class="h3">' + esc(tr('delAsk')) + '</div><div class="btns"><button type="button" class="b-primary" data-a="hdel-yes" data-id="' + f.id + '">' + esc(tr('del')) + '</button><button type="button" class="b-outline" data-a="close">' + esc(tr('cancel')) + '</button></div>';
    } else if (sh.type === 'schcal') {
      inner = '<div class="h3">' + esc(tr('pickDate')) + '</div>' + calHtml(T.schCal || (T.schCal = { calY: null, calM: null, date: '' }), 'sch-cal') + '<button type="button" class="b-text" data-a="close">' + esc(tr('close')) + '</button>';
    } else if (sh.type === 'li') {
      f = findNode(sh.id); if (!f || !f.n.items) return '';
      var lcur = listCur(f.n);
      inner = '<div class="h3">' + esc(f.n.text) + '</div><div class="li-list">' + f.n.items.map(function (it, i) { return '<div class="li-row' + (it.d ? ' dn' : '') + (i === lcur ? ' now' : '') + '"><i class="li-bx' + (it.d ? ' k' : '') + '"></i><span>' + esc(it.t) + '</span></div>'; }).join('') + '</div><button type="button" class="b-text" data-a="close">' + esc(tr('close')) + '</button>';
    } else if (sh.type === 'tips') {
      inner = '<div class="h3">' + esc(tr('tipsTitle')) + '</div><ul class="tips-list"><li>' + esc(tr('tip1')) + '</li><li>' + esc(tr('tip2')) + '</li><li>' + esc(tr('tip4')) + '</li><li>' + esc(tr('tip3')) + '</li></ul><button type="button" class="b-primary" data-a="close">' + esc(tr('good')) + '</button>';
    } else if (sh.type === 'day') {
      var row = function (lbl, key, val) { return '<div class="step-row"><span>' + esc(lbl) + '</span><div class="btns"><button type="button" class="mini" data-a="day-' + key + '" data-v="-1" aria-label="-1">−</button><span class="pct">' + fmtHour(val) + '</span><button type="button" class="mini" data-a="day-' + key + '" data-v="1" aria-label="+1">+</button></div></div>'; };
      inner = '<div class="h3 day-h"><span>' + esc(tr('dayTitle')) + '</span>' + dayToggle() + '</div><div class="small">' + esc(tr('dayNote')) + '</div>' + (S.dayOn === false ? '<div class="small">' + esc(tr('dayOffNote')) + '</div>' : row(tr('dayStart'), 's', S.day.s) + row(tr('dayEnd'), 'e', S.day.e)) + '<button type="button" class="b-primary" data-a="close">' + esc(tr('good')) + '</button>';
    } else if (sh.type === 'backup') {
      inner = '<div class="h3">' + esc(tr('bkTitle')) + '</div><button type="button" class="b-primary" data-a="bk-export">' + esc(tr('bkExport')) + '</button><button type="button" class="b-outline" data-a="bk-copy">' + esc(sh.copied ? tr('bkCopied') : tr('bkCopy')) + '</button><button type="button" class="b-outline" data-a="bk-import">' + esc(tr('bkImport')) + '</button>';
      if (sh.err) inner += '<div class="small">' + esc(tr('bkBad')) + '</div>';
      inner += '<button type="button" class="b-text" data-a="close">' + esc(tr('close')) + '</button>';
    } else if (sh.type === 'import') {
      inner = '<div class="h3">' + esc(tr('bkReplaceQ')) + '</div><div class="small">' + esc(tr('bkInfo', { n: sh.data.goals.length })) + '</div><div class="btns"><button type="button" class="b-primary" data-a="bk-replace">' + esc(tr('bkReplace')) + '</button><button type="button" class="b-outline" data-a="close">' + esc(tr('cancel')) + '</button></div>';
    }
    return '<div class="scrim" data-a="scrim"><div class="sheet' + (sh.type === 'sumins' || sh.type === 'node' ? ' pk-sheet' : '') + '" role="dialog" aria-modal="true">' + inner + '</div></div>';
  }

  /* ---------- setup flow (backward planning) ---------- */
  function suNew() { T.beltSig = {}; return { phase: 'goal', goal: '', dlPick: false, date: '', dl: null, dlh: null, root: null, focus: null, nid: 1, gid: null, hist: [], sel: null }; }
  function suRestore(d) {
    var x = d.data, su = suNew();
    su.phase = x.phase; su.goal = x.goal; su.dlPick = x.dlPick; su.date = x.date; su.dl = x.dl; su.dlh = x.dlh == null ? null : x.dlh; su.root = x.root; su.nid = x.nid; su.draftId = d.id;
    return su;
  }
  function suFromGoal(g) {
    var su = suNew();
    function conv(id) {
      var n = g.nodes[id]; if (!n) return null;
      var o = { id: 'o_' + id, real: id, state: 'set', text: n.text, mins: n.mins, rep: n.repeat && n.repeat.length ? n.repeat.slice() : null, needs: [] };
      if (n.items && n.items.length) { o.kind = 'list'; o.items = n.items.map(function (i) { return i.t; }); o.rep = null; }
      n.needs.forEach(function (c) { var k = conv(c); if (k) o.needs.push(k); });
      return o;
    }
    su.root = { id: 'root', state: 'product', needs: [] };
    g.needs.forEach(function (c) { var k = conv(c); if (k) su.root.needs.push(k); });
    su.phase = 'chain'; su.goal = g.title; su.dl = g.dl; su.dlh = g.dlh == null ? null : g.dlh; su.editGid = g.id;
    return su;
  }
  /* keep which items were already done when the list is edited */
  function applyItems(n, o) {
    if (!o.items || !o.items.length) { delete n.items; return; }
    var old = n.items || [], used = {};
    n.items = o.items.map(function (t) {
      var d = false;
      old.forEach(function (x, i) { if (!used[i] && !d && x.t === t) { used[i] = 1; d = !!x.d; } });
      return { t: t, d: d };
    });
    if (n.status === 'done' && itemsLeft(n)) n.status = 'todo';
  }
  function suApply() {
    var su = T.setup, g = gById(su.editGid); if (!g) return;
    var keep = {};
    function put(o) {
      var id;
      if (o.real && g.nodes[o.real]) {
        id = o.real; var n = g.nodes[id];
        n.text = o.text; n.mins = o.mins === 0 ? 0 : (o.mins || 15); n.repeat = o.items && o.items.length ? null : (o.rep && o.rep.length ? o.rep.slice() : null);
        applyItems(n, o);
      } else {
        id = uid();
        g.nodes[id] = { id: id, text: o.text, needs: [], start: true, mins: o.mins === 0 ? 0 : (o.mins || 15), repeat: o.items && o.items.length ? null : (o.rep && o.rep.length ? o.rep.slice() : null), log: {}, status: 'todo', tag: '' };
        applyItems(g.nodes[id], o);
      }
      keep[id] = 1;
      g.nodes[id].needs = (o.needs || []).map(put);
      return id;
    }
    g.needs = su.root.needs.map(put);
    Object.keys(g.nodes).forEach(function (k) { if (!keep[k]) { clearTimerFor(k); delete g.nodes[k]; } });
    save();
  }
  function suPush() {
    var su = T.setup; if (!su) return;
    su.hist.push(JSON.parse(JSON.stringify({ phase: su.phase, dlPick: su.dlPick, date: su.date, dl: su.dl, dlh: su.dlh, root: su.root, focus: su.focus, nid: su.nid, goal: su.goal })));
    if (su.hist.length > 60) su.hist.shift();
  }
  function suId() { return 'n' + (T.setup.nid++); }
  function suWalk(n, fn, parent) { fn(n, parent); (n.needs || []).forEach(function (c) { suWalk(c, fn, n); }); }
  function suFind(id) { var r = null, p = null; suWalk(T.setup.root, function (n, par) { if (n.id === id) { r = n; p = par; } }); return r ? { n: r, p: p } : null; }
  function suFirstDraft() { var r = null; suWalk(T.setup.root, function (n) { if (!r && n.state === 'draft') r = n; }); return r; }
  function suLeaf(n) { return !n.needs || !n.needs.length; }
  function suMissing() { var m = 0; suWalk(T.setup.root, function (n) { if (n.id !== 'root' && n.state === 'set' && n.mins == null) m++; }); return m; }
  function suAllSet() { var ok = true; suWalk(T.setup.root, function (n) { if (n.state === 'draft') ok = false; }); return ok && suMissing() === 0; }
  function suDepth(n, d) { d = d || 0; var m = d; (n.needs || []).forEach(function (c) { m = Math.max(m, suDepth(c, d + 1)); }); return m; }

  function ymd(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function fmtDate(key, long) {
    var p = key.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return new Intl.DateTimeFormat(S.lang === 'zh' ? 'zh-CN' : 'en-US', long ? { year: 'numeric', month: 'long', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  }
  function calHtml(su, pre) {
    pre = pre || 'su-cal';
    var now = new Date();
    if (su.calY == null) { su.calY = now.getFullYear(); su.calM = now.getMonth(); }
    var first = new Date(su.calY, su.calM, 1), off = (first.getDay() + 6) % 7, dim = new Date(su.calY, su.calM + 1, 0).getDate();
    var title = new Intl.DateTimeFormat(S.lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long' }).format(first);
    var todayKey = ymd(now.getFullYear(), now.getMonth(), now.getDate());
    var atNow = su.calY === now.getFullYear() && su.calM === now.getMonth();
    var h = '<div class="cal" data-k="cal"><div class="cal-h"><button type="button" class="cal-n" data-a="' + pre + '-prev" aria-label="' + esc(tr('prevMonth')) + '"' + (atNow ? ' disabled' : '') + '>‹</button><span>' + esc(title) + '</span><button type="button" class="cal-n" data-a="' + pre + '-next" aria-label="' + esc(tr('nextMonth')) + '">›</button></div><div class="cal-g">';
    DAY_ORDER.forEach(function (x) { h += '<span class="cal-w">' + esc(dayName(x)) + '</span>'; });
    for (var i = 0; i < off; i++) h += '<span></span>';
    for (var d = 1; d <= dim; d++) {
      var key = ymd(su.calY, su.calM, d), dis = key < todayKey, sel = key === su.date;
      h += '<button type="button" class="cal-d' + (sel ? ' sel' : '') + (key === todayKey ? ' now' : '') + '" data-a="' + pre + '-pick" data-v="' + key + '"' + (dis ? ' disabled' : '') + ' aria-pressed="' + sel + '">' + d + '</button>';
    }
    return h + '</div></div>';
  }
  function suGoalView() {
    var su = T.setup;
    var h = '<div class="group"><div class="narrow"><label for="goalIn" class="h1" data-k="h1" data-leave>' + esc(tr('goalQ')) + '</label>';
    if (su.phase === 'goal') h += '<div class="sub" data-k="sub" data-leave>' + esc(tr('goalSub')) + '</div>';
    h += '<div class="goal-row"><input id="goalIn" class="field" data-k="goalbox" enterkeyhint="done" autocomplete="off" placeholder="' + esc(tr('goalPh')) + '" value="' + esc(su.goal) + '">' +
      (su.phase === 'goal' ? '<button type="button" id="goalOk" class="go" data-a="su-goal-ok" aria-label="' + esc(tr('ok')) + '"' + (su.goal.trim() ? '' : ' hidden') + '>' + ARROW + '</button>' : '') + '</div>';
    if (su.phase === 'deadline') {
      h += '<fieldset data-k="dlq" data-d="140" data-leave style="margin-top:14px"><legend>' + esc(tr('dlQ')) + '</legend><div class="opts">' +
        '<button type="button" class="opt" data-a="su-dl-no"><span class="opt-t">' + esc(tr('dlNo')) + '</span><span class="opt-s">' + esc(tr('dlNoS')) + '</span></button>' +
        '<button type="button" class="opt' + (su.dlPick ? ' sel' : '') + '" aria-pressed="' + su.dlPick + '" data-a="su-dl-yes"><span class="opt-t">' + esc(tr('dlYes')) + '</span><span class="opt-s">' + esc(tr('dlYesS')) + '</span></button></div>';
      if (su.dlPick) h += '<div class="sub" style="margin-top:4px" data-k="dll">' + esc(tr('dlLabel')) + '</div>' + calHtml(su) + '<div class="step-row dl-h" data-k="dlhr"><span>' + esc(tr('dlHour')) + '</span><div class="btns"><button type="button" class="mini" data-a="su-dlh" data-v="-1" aria-label="-1">−</button><input id="dlhIn" class="field dlh-in" type="text" inputmode="numeric" maxlength="2" autocomplete="off" enterkeyhint="done" aria-label="' + esc(tr('dlHour')) + '" placeholder="' + (S.fmt === '12' ? '1-12' : '0-23') + '" value="' + (su.dlh == null ? '' : (S.fmt === '12' ? (su.dlh % 12 || 12) : su.dlh)) + '"><button type="button" class="mini" data-a="su-dlh" data-v="1" aria-label="+1">+</button></div></div>' + (S.fmt === '12' ? '<div class="ampm-row" data-k="dlap"><div class="vt" role="group"><button type="button" class="' + (su.dlh != null && su.dlh < 12 ? 'sel' : '') + '" aria-pressed="' + (su.dlh != null && su.dlh < 12) + '" data-a="su-ampm" data-v="am">AM</button><button type="button" class="' + (su.dlh != null && su.dlh >= 12 ? 'sel' : '') + '" aria-pressed="' + (su.dlh != null && su.dlh >= 12) + '" data-a="su-ampm" data-v="pm">PM</button></div></div>' : '') + '<div class="date-row" data-k="dlr"><div class="cal-sel">' + esc(dlText(su, su.dlh)) + '</div><button type="button" id="dlGo" class="b-primary" data-a="su-dl-go"' + (su.date ? '' : ' disabled') + '>' + esc(tr('cont')) + '</button></div>';
      h += '</fieldset>';
    }
    return h + '</div></div>';
  }
  function suStub(key, delay) { return '<i class="stub' + (key.indexOf('in-') === 0 ? ' in' : '') + '" data-k="' + key + '" data-anim="grow-y" style="--d:' + delay + 'ms"></i>'; }
  function suPlus(n, parent, idx, sibs) {
    if (T.setup && T.setup.phase === 'done') return '';
    if (!T.setup || (T.setup.sel !== n.id && T.setup.focus !== n.id)) return '';
    var lone = parent && parent.id === 'root' && parent.needs.length === 1 && !n.needs.length;
    var h = (parent && !lone) ? '<button type="button" class="x" data-a="su-remove" data-id="' + n.id + '" aria-label="' + esc(tr('removeAria')) + '">×</button>' : '';
    if (!n.needs.length) h += '<i class="stem"></i>';
    h += '<button type="button" class="pp up" data-a="su-add-up" data-id="' + n.id + '" aria-label="' + esc(tr('addUp')) + '"><span class="hit"></span></button>';
    if (parent) h += '<button type="button" class="pp down" data-a="su-add-down" data-id="' + n.id + '" aria-label="' + esc(tr('addDown')) + '"><span class="hit"></span></button>';
    if (parent && idx === sibs - 1) h += '<button type="button" class="plus" data-a="su-split" data-id="' + parent.id + '" aria-label="' + esc(tr('moreAria')) + '"><i class="ic"></i></button>';
    return h;
  }
  function suCol(n, parent, idx, sibs, depth, md) {
    var su = T.setup, multi = sibs > 1, step = 150;
    var actCls = (su.sel === n.id || su.focus === n.id) ? ' act' : '';
    var h = '<div class="col' + (multi ? ' m' : '') + '">';
    if (n.needs.length) {
      h += '<div class="kids">';
      n.needs.forEach(function (c, i) { h += suCol(c, n, i, n.needs.length, depth + 1, md); });
      h += '</div>';
      var dly = (md - depth - 1) * step, pwr = su.phase === 'done';
      h += gapHtml(n.needs.length, n.needs.map(function () { return 0; }), n.needs.map(function () { return dly; }), false, { mv: 'all', pw: pwr, bk: n.id + ':' + n.needs.map(function (c) { return c.id; }).join('.') });
    }
    if (n.state === 'draft') {
      h += '<div class="bx draft' + actCls + '" data-k="b-' + n.id + '"><input id="in-' + n.id + '" class="field" data-sid="' + n.id + '" enterkeyhint="done" autocomplete="off" placeholder="' + esc(tr('write')) + '" value="' + esc(n.text) + '">' +
        '<button type="button" class="ok" id="ok-' + n.id + '" data-a="su-confirm" data-id="' + n.id + '" aria-label="' + esc(tr('setTime')) + '"' + (n.text.trim() ? '' : ' hidden') + '>' + CLOCK + '</button>';
      if (actCls) {
        var isList = n.kind === 'list';
        h += '<div class="dpanel"><div class="pk-lbl">' + esc(tr('typeLbl')) + '</div><div class="kind-seg"><button type="button" class="' + (isList ? '' : 'on') + '" data-a="su-kind" data-id="' + n.id + '" data-v="task" aria-pressed="' + (!isList) + '">' + esc(tr('kindTask')) + '</button><button type="button" class="' + (isList ? 'on' : '') + '" data-a="su-kind" data-id="' + n.id + '" data-v="list" aria-pressed="' + isList + '">' + esc(tr('kindList')) + '</button></div>';
        if (isList) h += '<div class="pk-lbl">' + esc(tr('listLines')) + '</div><textarea id="li-' + n.id + '" class="li-ta" rows="4" data-lid="' + n.id + '" placeholder="' + esc(tr('listPh')) + '">' + esc(n.itemsText || '') + '</textarea><div class="li-num"><span>' + esc(tr('numberTo')) + '</span><input id="ln-' + n.id + '" inputmode="numeric" maxlength="2" value="12" aria-label="' + esc(tr('numberTo')) + '"><button type="button" data-a="su-number" data-id="' + n.id + '">' + esc(tr('numberFill')) + '</button></div>';
        h += '</div>';
      }
      h += suPlus(n, parent, idx, sibs) + '</div>';
    } else if (n.state === 'product') {
      h += '<div class="prod-wrap"><div class="bx prod" data-k="goalbox" style="--d:' + ((md + 1) * step) + 'ms"><span class="k">' + esc(tr('product')) + '</span><span class="t">' + esc(su.goal) + '</span><i class="fill"></i></div>';
      if (su.dl) {
        var msl = Math.max(0, dlEndOf(su.dl, su.dlh) - Date.now()), days = Math.ceil(msl / 86400000);
        var frac = Math.max(0.06, Math.min(1, days / 30));
        h += '<div class="dl" data-k="dl" data-d="260"><i class="bar"><i style="width:' + Math.round(frac * 100) + '%"></i></i><span>' + (msl < 86400000 ? leftTextMs(msl) : days + (S.lang === 'zh' ? ' 天' : ' d')) + '</span></div>';
      }
      h += '</div>';
    } else {
      h += '<div class="bx node start' + actCls + (n.mins == null ? ' untimed' : '') + '" data-k="b-' + n.id + '" role="button" tabindex="0" data-a="su-edit" data-id="' + n.id + '">';
      h += '<button type="button" class="tag' + (n.mins != null ? '' : ' unset') + '" data-a="su-mins" data-id="' + n.id + '" aria-label="' + esc(tr('tagAria')) + '">' + esc(n.mins != null ? minsLbl(n.mins) : tr('setMins')) + '</button>';
      h += '<span>' + esc(n.text) + (n.items && n.items.length ? ' <small class="li-n">' + esc(tr('nItems', { n: n.items.length })) + '</small>' : '') + '</span>' + suPlus(n, parent, idx, sibs) + '</div>';
    }
    return h + '</div>';
  }
  function suHeading() {
    return T.setup.phase === 'done' ? '' : tr('qFirst');
  }
  function suSub() {
    var su = T.setup;
    if (su.phase === 'done') return '';
    if (!suFirstDraft() && suMissing() > 0) return tr('subMins');
    return tr('subAdd') + (S.clockSeen ? '' : ' ' + tr('subClock'));
  }
  function suChainView() {
    var su = T.setup, md = suDepth(su.root), q = suHeading();
    var h = '<div class="group' + (su.phase === 'done' ? ' setup-done' : '') + '">';
    var qs = su.phase === 'done' ? '' : suSub();
    if (q) h += '<div class="qwrap" data-k="q-' + esc(q) + '" data-d="80"><div class="q-row"><div class="q">' + esc(q) + '</div><button type="button" class="ghost-sm tips-btn" data-a="su-tips">' + esc(tr('tips')) + '</button></div>' + (qs ? '<div class="qs">' + esc(qs) + '</div>' : '') + '</div>';
    h += '<div class="tree"><div class="tree-in">' + suCol(su.root, null, 0, 1, 0, md) + '</div></div>';
    if (su.phase === 'chain' && suAllSet()) h += '<div class="foot" data-k="gen"><button type="button" class="b-primary" data-a="' + (su.editGid ? 'su-apply' : 'su-gen') + '">' + esc(tr(su.editGid ? 'saveChanges' : 'gen')) + '</button></div>';
    if (su.phase === 'done') h += '<div class="foot" data-k="donemsg" data-d="' + ((md + 1) * 150 + 300) + '"><span class="done-msg">' + esc(tr('live')) + '</span></div>';
    return h + '</div>';
  }
  function vSetup() {
    var su = T.setup;
    var h = '<main id="stage"><div class="su-nav"><button type="button" class="back" data-a="' + (su.editGid ? 'su-cancel-edit' : 'home') + '">' + esc(tr(su.editGid ? 'cancel' : 'homeBtn')) + '</button>' + (su.hist.length && su.phase !== 'done' ? '<button type="button" class="back" data-a="su-back">‹ ' + esc(tr('back')) + '</button>' : '') + '</div>';
    if (su.phase !== 'done' && !su.editGid) h += '<div class="su-navr">' + (su.goal.trim() ? '<button type="button" class="restart' + (T.savedFlash ? ' ok' : '') + '" data-a="su-save">' + esc(T.savedFlash ? tr('saved') : tr('save')) + '</button>' : '') + '<button type="button" class="restart" data-a="su-restart">' + esc(tr('restart')) + '</button></div>';
    h += (su.phase === 'goal' || su.phase === 'deadline') ? suGoalView() : suChainView();
    return h + '</main>';
  }
  function suLeave(cb) {
    var els = app.querySelectorAll('[data-leave]');
    if (reduce || !els.length || !Element.prototype.animate) { cb(); return; }
    els.forEach(function (el) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' }); });
    setTimeout(cb, 210);
  }
  function suNextFocus() { var d = suFirstDraft(); T.setup.focus = d ? d.id : null; if (d) T.setup.sel = null; return d ? 'in-' + d.id : null; }
  function suConfirm(id) {
    var f = suFind(id); if (!f || !f.n.text.trim()) return;
    var lines = null;
    if (f.n.kind === 'list') {
      lines = String(f.n.itemsText || '').split(String.fromCharCode(10)).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!lines.length) return;
    }
    suPush();
    if (lines) { f.n.items = lines; f.n.rep = null; } else { delete f.n.items; delete f.n.kind; }
    delete f.n.itemsText;
    f.n.text = f.n.text.trim(); f.n.state = 'set';
    var nf = suNextFocus(); if (!nf) T.setup.sel = id;
    render(nf);
  }
  function suToChain() {
    suLeave(function () {
      var su = T.setup;
      var d = { id: suId(), state: 'draft', text: '', needs: [], mins: null };
      su.root = { id: 'root', state: 'product', needs: [d] };
      su.phase = 'chain'; su.focus = d.id;
      render('in-' + d.id);
    });
  }
  function suConvert(n, g) {
    var id = uid();
    var node = { id: id, text: n.text, needs: [], start: true, mins: n.mins === 0 ? 0 : (n.mins || 15), repeat: n.items && n.items.length ? null : (n.rep && n.rep.length ? n.rep.slice() : null), log: {}, status: 'todo', tag: '' };
    if (n.items && n.items.length) node.items = n.items.map(function (t) { return { t: t, d: false }; });
    g.nodes[id] = node;
    (n.needs || []).forEach(function (c) { node.needs.push(suConvert(c, g)); });
    return id;
  }
  function suFinish() {
    var su = T.setup;
    var g = { id: uid(), title: su.goal.trim(), dl: su.dl, dlh: su.dl ? su.dlh : null, needs: [], nodes: {}, status: 'active', created: Date.now() };
    su.root.needs.forEach(function (c) { g.needs.push(suConvert(c, g)); });
    S.goals.push(g); S.cur = g.id; S.view = 'full';
    if (su.draftId) S.drafts = S.drafts.filter(function (d) { return d.id !== su.draftId; });
    save();
    /* no power-up scene: straight to the line */
    T.screen = 'line'; T.setup = null; T.msg = ''; render();
  }

  /* ---------- render + FLIP ---------- */
  function snap() { var m = {}; app.querySelectorAll('[data-k]').forEach(function (el) { m[el.dataset.k] = el.getBoundingClientRect(); }); return m; }
  function play(prev) {
    if (reduce || !Element.prototype.animate) return;
    app.querySelectorAll('[data-k]').forEach(function (el) {
      var k = el.dataset.k, r = el.getBoundingClientRect(), o = prev[k];
      if (o) {
        var dx = o.left - r.left, dy = o.top - r.top, sx = o.width / (r.width || 1), sy = o.height / (r.height || 1);
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01) {
          el.animate([{ transformOrigin: '0 0', transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' }, { transformOrigin: '0 0', transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      } else {
        var d = +(el.dataset.d || 0), an = el.dataset.anim;
        var kf = an === 'grow-y' ? [{ transform: 'scaleY(0)', transformOrigin: 'bottom' }, { transform: 'scaleY(1)', transformOrigin: 'bottom' }]
          : an === 'grow-x' ? [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }]
          : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }];
        el.animate(kf, { duration: an ? 260 : 340, delay: d, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      }
    });
  }
  function render(focusId) {
    var ae = document.activeElement;
    var fid = focusId || (ae && ae.id) || null;
    var sel = null;
    if (!focusId && ae && ae.id) { try { sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { sel = null; } }
    var scrollY = window.scrollY;
    var prev = T.screen === 'setup' ? snap() : null;
    var treeEl = document.getElementById('tree'), treeX = treeEl ? treeEl.scrollLeft : null;
    document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = tr('app') + ' · ' + tr('titleTag');
    var body = T.screen === 'setup' ? vSetup() : (T.screen === 'line' ? vLine() : (T.screen === 'settings' ? vSettings() : vList()));
    app.innerHTML = body + vSheet();
    initPicker();
    fitTitles();
    compactTrees();
    layoutBelts();
    if (prev) play(prev);
    var t2 = document.getElementById('tree');
    if (t2) { if (treeX !== null) t2.scrollLeft = treeX; else t2.scrollLeft = Math.max(0, (t2.scrollWidth - t2.clientWidth) / 2); }
    if (T.screen !== 'setup') window.scrollTo(0, scrollY);
    var nl = document.querySelector('.tl-now');
    if (T.scrollNow && nl) { T.scrollNow = false; window.scrollTo(0, Math.max(0, nl.getBoundingClientRect().top + window.scrollY - 160)); }
    if (fid) {
      var el = document.getElementById(fid);
      if (el) {
        try { el.focus({ preventScroll: !focusId }); } catch (e) { el.focus(); }
        if (sel && sel[0] != null && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} }
      }
    }
    if (!T.centerId && focusId && String(focusId).indexOf('in-') === 0) setCenter(String(focusId).slice(3));
    if (T.centerId && T.screen === 'setup' && T.setup && T.setup.phase === 'chain') {
      var cid = T.centerId; T.centerId = null;
      setTimeout(function () {
        try {
          var bx = document.querySelector('[data-k="b-' + cid + '"]');
          if (bx) {
            var bm = reduce ? 'auto' : 'smooth', tr0 = document.getElementById('tree'), br = bx.getBoundingClientRect();
            if (tr0) {
              var tb = tr0.getBoundingClientRect(), dx = (br.left + br.width / 2) - (tb.left + tb.width / 2);
              if (Math.abs(dx) > 48) tr0.scrollTo({ left: tr0.scrollLeft + dx, behavior: bm });
            }
            var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight, dy = (br.top + br.height / 2) - vh / 2;
            if (Math.abs(dy) > 48) window.scrollBy({ top: dy, behavior: bm });
          }
        } catch (e) {}
      }, 460);
    }
  }

  /* ---------- actions ---------- */
  function openSheet(sh, focus) { T.sheet = sh; render(focus); }
  function sheetRepApply(sh) {
    if (sh.type !== 'node') return;
    var f = findNode(sh.id); if (!f) return;
    f.n.repeat = sh.repMode === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : (sh.repMode === 'days' && sh.repDays.length ? sh.repDays.slice() : null);
  }
  function addNodeAbove(sh, node) {
    if (sh.target === 'root') { var rg = gById(S.cur); if (!rg) return null; rg.nodes[node.id] = node; rg.needs.push(node.id); return { g: rg, n: rg }; }
    var f = findNode(sh.target); if (!f) return null;
    f.g.nodes[node.id] = node; f.n.needs.push(node.id);
    return f;
  }
  function download(name, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (e) {}
  }
  function backupText() { return JSON.stringify({ app: 'shengchanxian', format: 2, exported: new Date().toISOString(), data: S }); }
  function parseBackup(text) {
    try {
      var o = JSON.parse(text), d = o && o.data ? o.data : o;
      if (d && d.phase === 'line' && d.lanes) { var s = blank(); s.goals.push(migrateV1(d)); if (d.timer) s.timer = d.timer; d = s; }
      if (!d || !Array.isArray(d.goals)) return null;
      return normalize(d);
    } catch (e) { return null; }
  }

  app.addEventListener('input', function (e) {
    var t = e.target, su = T.setup;
    if (t.id === 'goalIn' && su) { su.goal = t.value; var ok = document.getElementById('goalOk'); if (ok) ok.hidden = !su.goal.trim(); return; }
    if (t.id === 'dlIn' && su) { su.date = t.value; var g = document.getElementById('dlGo'); if (g) g.disabled = !t.value; return; }
    if (t.dataset && t.dataset.lid && su) { var lf = suFind(t.dataset.lid); if (lf) lf.n.itemsText = t.value; return; }
    if (t.dataset && t.dataset.sid && su) {
      var f = suFind(t.dataset.sid); if (f) f.n.text = t.value;
      var b = document.getElementById('ok-' + t.dataset.sid); if (b) b.hidden = !t.value.trim();
      return;
    }
    if (t.id === 'renIn' && T.sheet && T.sheet.type === 'node') { var rf = findNode(T.sheet.id); if (rf && t.value.trim()) { rf.n.text = t.value; save(); } return; }
    if (t.id === 'dlhIn') { var dg = t.value.replace(/[^0-9]/g, '').slice(0, 2); if (dg !== t.value) t.value = dg; if (T.setup) { var lv = dlhParse(dg, T.setup.dlh), cs = document.querySelector('.date-row .cal-sel'); if (cs) cs.textContent = dlText(T.setup, lv === undefined ? T.setup.dlh : lv); } return; }
    if (t.id === 'addIn' && T.sheet) { T.sheet.text = t.value; var gb = document.getElementById('addGo'); if (gb) gb.disabled = !t.value.trim(); Array.prototype.forEach.call(document.querySelectorAll('.addGate'), function (b) { b.disabled = !t.value.trim(); }); }
  });
  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'dlhIn' && T.setup) {
      var pv = dlhParse(t.value.trim(), T.setup.dlh);
      if (pv !== undefined) T.setup.dlh = pv;
      render(); return;
    }
    if (t.id === 'dlIn' && T.setup) { T.setup.date = t.value; var g = document.getElementById('dlGo'); if (g) g.disabled = !t.value; }
    if (t.id === 'fileIn' && t.files && t.files[0]) {
      var file = t.files[0], rd = new FileReader();
      rd.onload = function () {
        var d = parseBackup(String(rd.result));
        if (d) openSheet({ type: 'import', data: d }); else openSheet({ type: 'backup', err: true });
      };
      rd.onerror = function () { openSheet({ type: 'backup', err: true }); };
      rd.readAsText(file);
    }
  });
  app.addEventListener('focusin', function (e) {
    var t = e.target, su = T.setup;
    if (!su || !t.dataset || !t.dataset.sid || su.focus === t.dataset.sid) return;
    su.focus = t.dataset.sid; su.sel = null; setCenter(t.dataset.sid); render();
  });
  app.addEventListener('keydown', function (e) {
    var t = e.target;
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (t.id === 'goalIn' && T.setup) { e.preventDefault(); suGoalOk(); }
    else if (t.dataset && t.dataset.sid && t.tagName === 'INPUT') { e.preventDefault(); suConfirm(t.dataset.sid); }
    else if (t.id === 'pkOtherIn') { e.preventDefault(); t.blur(); }
    else if (t.id === 'addIn') { e.preventDefault(); act('add-next', {}); }
    else if (t.id === 'dlhIn') { e.preventDefault(); t.blur(); }
    else if (t.getAttribute && t.getAttribute('role') === 'button' && t.dataset.a) { e.preventDefault(); t.click(); }
  });
  function suGoalOk() { var su = T.setup; if (!su || !su.goal.trim() || su.phase !== 'goal') return; suPush(); su.phase = 'deadline'; render(); }

  /* home: hold a line card (touch or left mouse button) or right-click it to delete it */
  var lp = { timer: 0, x: 0, y: 0 };
  function lpAsk(card) {
    if (T.screen !== 'list' || T.sheet || !card) return;
    T.noClick = Date.now();
    T.sheet = { type: 'hdel', id: card.dataset.id };
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) {}
    render();
  }
  function lpStop() { if (lp.timer) { clearTimeout(lp.timer); lp.timer = 0; } }
  app.addEventListener('pointerdown', function (e) {
    var card = e.target.closest ? e.target.closest('.gcard[data-a="open"]') : null;
    lpStop();
    if (!card || T.screen !== 'list' || T.sheet || (e.pointerType === 'mouse' && e.button !== 0)) return;
    lp.x = e.clientX; lp.y = e.clientY;
    lp.timer = setTimeout(function () { lp.timer = 0; lpAsk(card); }, 600);
  });
  app.addEventListener('pointermove', function (e) { if (lp.timer && (Math.abs(e.clientX - lp.x) > 8 || Math.abs(e.clientY - lp.y) > 8)) lpStop(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { app.addEventListener(t, lpStop); });
  window.addEventListener('scroll', lpStop, true);
  app.addEventListener('contextmenu', function (e) {
    var card = e.target.closest ? e.target.closest('.gcard[data-a="open"]') : null;
    if (card) { e.preventDefault(); lpStop(); lpAsk(card); }
  });
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]');
    if (!el) return;
    if (T.noClick && Date.now() - T.noClick < 500) { T.noClick = 0; return; }
    if (el.dataset.a === 'scrim' && e.target !== el) return;
    if (el.dataset.a === 'su-edit' && e.target.closest('.tag')) return;
    act(el.dataset.a, el.dataset, e, el);
  });

  function act(a, d, e, el) {
    var id = d.id, v = d.v, f, su = T.setup, sh = T.sheet;
    switch (a) {
      /* navigation */
      case 'home': T.screen = 'list'; T.sheet = null; T.msg = ''; T.setup = null; break;
      case 'open': S.cur = id; T.screen = 'line'; T.msg = ''; T.scrollNow = false; save(); break;
      case 'draft-open':
        (function () {
          var d = S.drafts.find(function (x) { return x.id === id; }); if (!d) return;
          T.setup = suRestore(d); T.screen = 'setup'; T.sheet = null;
          var fd = T.setup.root ? suFirstDraft() : null; T.setup.focus = fd ? fd.id : null;
          render(T.setup.phase === 'goal' ? 'goalIn' : (fd ? 'in-' + fd.id : null));
        })();
        return;
      case 'draft-del': S.drafts = S.drafts.filter(function (d) { return d.id !== id; }); save(); break;
      case 'open-settings': T.screen = 'settings'; T.msg = ''; break;
      case 'set-lang': S.lang = v === 'zh' ? 'zh' : 'en'; save(); break;
      case 'set-fmt': S.fmt = v === '12' ? '12' : '24'; save(); break;
      case 'lang': S.lang = S.lang === 'zh' ? 'en' : 'zh'; save(); break;
      case 'view': S.view = v === 'full' ? 'full' : (v === 'time' ? 'time' : 'focus'); T.scrollNow = false; save(); break;
      case 'pause-today':
        S.pause = ''; S.frozen = {};
        buildSchedule().forEach(function (b) { if (!b.unfit) S.frozen[b.n.id] = [b.start, b.end]; });
        S.pause = todayKey(); save(); break;
      case 'resume-today': S.pause = ''; S.frozen = {}; save(); break;
      case 'sch-cal': T.schCal = { calY: null, calM: null, date: '' }; T.sheet = { type: 'schcal' }; break;
      case 'sch-cal-prev': if (T.schCal) { T.schCal.calM--; if (T.schCal.calM < 0) { T.schCal.calM = 11; T.schCal.calY--; } } break;
      case 'sch-cal-next': if (T.schCal) { T.schCal.calM++; if (T.schCal.calM > 11) { T.schCal.calM = 0; T.schCal.calY++; } } break;
      case 'sch-cal-pick':
        (function () {
          var pp = String(v).split('-'), pd = new Date(+pp[0], +pp[1] - 1, +pp[2]), nw = new Date();
          T.schedDay = Math.max(0, Math.min(120, Math.round((pd.getTime() - new Date(nw.getFullYear(), nw.getMonth(), nw.getDate()).getTime()) / 86400000)));
          T.sheet = null; T.schCal = null;
        })();
        break;
      case 'sch-today': T.schedDay = 0; break;
      case 'home-tab': S.home = v === 'time' ? 'time' : 'lines'; T.scrollNow = false; save(); break;
      case 'day-open': T.sheet = { type: 'day' }; break;
      case 'day-on': S.dayOn = v !== '0'; save(); break;
      case 'day-s': S.day.s = Math.max(0, Math.min(S.day.e - 1, S.day.s + (+v))); save(); break;
      case 'day-e': S.day.e = Math.min(24, Math.max(S.day.s + 1, S.day.e + (+v))); save(); break;
      case 'new-goal': T.setup = suNew(); T.screen = 'setup'; render('goalIn'); return;
      case 'close': T.sheet = null; break;
      case 'scrim': T.sheet = null; break;
      case 'add-root': T.sheet = { type: 'add', target: 'root', text: '', step: 'text', tiny: false, mins: 15, repMode: 'none', repDays: [] }; render('addIn'); return;
      case 'gmenu': T.sheet = { type: 'menu' }; break;
      case 'standby': f = gById(id); if (f) { f.status = 'standby'; save(); } T.sheet = null; break;
      case 'resume': f = gById(id); if (f) { f.status = 'active'; save(); } T.sheet = null; break;
      case 'del-ask': sh.confirm = true; break;
      case 'node-del-ask': sh.confirm = true; break;
      case 'node-del-no': sh.confirm = false; break;
      case 'node-del-yes':
        f = findNode(id); if (!f) return;
        (function () {
          var g = f.g, ps = [g].concat(nodesOf(g)).filter(function (p) { return p.needs.indexOf(id) >= 0; });
          if (g.needs.length === 1 && g.needs[0] === id && !f.n.needs.length) { T.sheet = null; T.msg = tr('delLast'); return; }
          ps.forEach(function (p) {
            var at = p.needs.indexOf(id);
            Array.prototype.splice.apply(p.needs, [at, 1].concat(f.n.needs.filter(function (c) { return p.needs.indexOf(c) < 0; })));
            if (p !== g && !p.needs.length) p.start = true;
          });
          delete g.nodes[id]; clearTimerFor(id);
        })();
        T.sheet = null; save(); break;
      case 'hdel-yes':
        S.goals = S.goals.filter(function (g) { return g.id !== id; });
        if (S.timer && !findNode(S.timer.id)) S.timer = null;
        if (S.cur === id) S.cur = null;
        T.sheet = null; save(); break;
      case 'del-yes':
        S.goals = S.goals.filter(function (g) { return g.id !== S.cur; });
        if (S.timer && !findNode(S.timer.id)) S.timer = null;
        S.cur = null; T.screen = 'list'; T.sheet = null; save(); break;

      /* line actions */
      case 'timer':
        f = findNode(id); if (!f) return;
        var ts = timerState(id);
        if (ts === 'run') { S.timer.left = timerLeft(); S.timer.paused = true; }
        else if (ts === 'pause') { S.timer.endAt = Date.now() + S.timer.left * 1000; S.timer.paused = false; initAudio(); }
        else if (!f.n.mins) return;
        else { initAudio(); askNotify(); S.timer = { id: id, startAt: Date.now(), endAt: Date.now() + f.n.mins * 60000, total: f.n.mins * 60, fired: false, paused: false, left: 0 }; }
        save(); break;
      case 'timer-reset': clearTimerFor(id); save(); break;
      case 'done':
        f = findNode(id); clearTimerFor(id);
        if (f) {
          f.n.prevMins = null;
          if (f.n.items && listCur(f.n) >= 0) {
            f.n.items[listCur(f.n)].d = true;
            if (itemsLeft(f.n) === 0) f.n.status = 'done';
          }
          else if (isRec(f.n)) { f.n.log[todayKey()] = 'done'; T.msg = tr('msgDoneRep'); }
          else {
            f.n.status = 'done';
            T.msg = goalDone(f.g) ? tr('msgGoal') : (f.n.needs.length > 1 ? say('stage', 'msgDone') : say('step', 'msgDone'));
          }
        }
        save(); break;
      case 'miss': T.sheet = { type: 'miss', id: id }; break;
      case 'miss-keep':
        T.sheet = null;
        f = findNode(id); clearTimerFor(id);
        if (f) {
          if (f.g.dl) { f.n.tag = 'spread'; T.msg = tr('msgSpread'); }
          else {
            var old = f.n.mins;
            if (!old) { T.msg = tr('msgOk'); break; }
            f.n.mins = Math.max(5, Math.round(old / 2));
            f.n.prevMins = f.n.mins < old ? old : null; f.n.tag = '';
            T.msg = f.n.mins < old ? tr('msgHalf', { n: f.n.mins }) : tr('msg5');
          }
        }
        save(); break;
      case 'miss-split': clearTimerFor(id);
      case 'split':
      case 'prior':
        /* adding or removing boxes happens in the set-up editor only */
        (function () { var lg = gById(S.cur); if (!lg) return; save(); T.setup = suFromGoal(lg); T.setup.sel = 'o_' + id; T.screen = 'setup'; T.sheet = null; T.msg = ''; })();
        break;
      case 'edit':
        f = findNode(id); if (!f) return;
        T.sheet = { type: 'node', id: id, repMode: repModeOf(f.n), repDays: isRec(f.n) ? f.n.repeat.slice() : [] }; break;
      case 'make-start':
        f = findNode(id); if (!f) return;
        f.n.start = true; save();
        T.sheet = { type: 'node', id: id, repMode: 'none', repDays: [] }; break;
      case 'make-start-sheet':
        f = findNode(id); if (!f) return;
        f.n.start = true; save(); sh.repMode = 'none'; sh.repDays = []; break;
      case 'end-repeat':
        f = findNode(id); if (f) { f.n.repeat = null; f.n.status = 'done'; clearTimerFor(id); save(); }
        T.sheet = null; break;

      /* sheet: plan chips */
      case 'sh-mins':
        sh.mins = +v;
        if (sh.type === 'node') { f = findNode(sh.id); if (f) { f.n.mins = +v; f.n.prevMins = null; save(); } }
        break;
      case 'sh-rep':
        sh.repMode = v;
        if (v === 'days' && !sh.repDays.length) sh.repDays = [new Date().getDay()];
        sheetRepApply(sh); save(); break;
      case 'sh-day':
        var k = sh.repDays.indexOf(+v);
        if (k >= 0) sh.repDays.splice(k, 1); else sh.repDays.push(+v);
        sheetRepApply(sh); save(); break;

      /* sheet: add flow */
      case 'add-next':
        if (!sh || sh.type !== 'add' || !sh.text.trim()) return;
        if (sh.tiny) {
          f = findNode(sh.target); if (!f) return;
          clearTimerFor(f.n.id);
          addNodeAbove(sh, mk(sh.text.trim(), true, 5));
          T.sheet = null; T.msg = say('split', 'msgTiny'); save(); break;
        }
        act('add-save', {}); return;
      case 'add-now': if (!sh.text.trim()) return; sh.text = sh.text.trim(); sh.step = 'plan'; break;
      case 'add-prior':
        if (!sh.text.trim()) return; sh.text = sh.text.trim();
        f = addNodeAbove(sh, mk(sh.text, false, 15)); if (!f) return;
        T.sheet = { type: 'add', target: sh.lastId = f.n.needs[f.n.needs.length - 1], text: '', step: 'text', tiny: false, mins: 15, repMode: 'none', repDays: [] };
        save(); render('addIn'); return;
      case 'add-save':
        if (!sh.text.trim()) return; sh.text = sh.text.trim();
        var nn = mk(sh.text, true, sh.mins);
        nn.repeat = sh.repMode === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : (sh.repMode === 'days' && sh.repDays.length ? sh.repDays.slice() : null);
        clearTimerFor(sh.target);
        addNodeAbove(sh, nn); T.sheet = null; save(); break;

      /* backup */
      case 'backup': T.sheet = { type: 'backup' }; break;
      case 'bk-export': download('shengchanxian-' + new Date().toISOString().slice(0, 10) + '.json', backupText()); return;
      case 'bk-copy':
        try { navigator.clipboard.writeText(backupText()).then(function () { if (T.sheet && T.sheet.type === 'backup') { T.sheet.copied = true; render(); } }).catch(function () {}); } catch (err) {}
        return;
      case 'bk-import': (function () { var fi = document.getElementById('fileIn'); if (!fi) { fi = document.createElement('input'); fi.type = 'file'; fi.id = 'fileIn'; fi.accept = '.json,application/json'; fi.hidden = true; app.appendChild(fi); } fi.value = ''; fi.click(); })(); return;
      case 'bk-replace':
        S = sh.data; T.sheet = null; T.screen = 'list'; T.msg = tr('bkDone'); save(); break;

      /* setup */
      case 'su-back':
        if (!su || !su.hist.length) return;
        (function () {
          var p = su.hist.pop();
          su.phase = p.phase; su.dlPick = p.dlPick; su.date = p.date; su.dl = p.dl; su.dlh = p.dlh == null ? null : p.dlh; su.root = p.root; su.focus = p.focus; su.nid = p.nid; su.goal = p.goal; su.sel = null;
          render(su.phase === 'goal' ? 'goalIn' : (su.focus ? 'in-' + su.focus : null));
        })();
        return;
      case 'su-save':
        if (!su || !su.goal.trim()) return;
        (function () {
          var data = JSON.parse(JSON.stringify({ phase: su.phase, goal: su.goal, dlPick: su.dlPick, date: su.date, dl: su.dl, dlh: su.dlh, root: su.root, nid: su.nid }));
          if (!su.draftId) su.draftId = uid();
          var rec = { id: su.draftId, goal: su.goal.trim(), saved: Date.now(), data: data }, at = -1;
          S.drafts.forEach(function (d, i) { if (d.id === rec.id) at = i; });
          if (at >= 0) S.drafts[at] = rec; else S.drafts.push(rec);
          save(); T.savedFlash = true; render();
          setTimeout(function () { T.savedFlash = false; if (T.screen === 'setup') render(); }, 1600);
        })();
        return;
      case 'su-restart': hideLoader(); T.setup = suNew(); render('goalIn'); return;
      case 'su-goal-ok': suGoalOk(); return;
      case 'su-dl-no': suPush(); su.dl = null; suToChain(); return;
      case 'su-dl-yes': suPush(); su.dlPick = true; render(); return;
      case 'su-cal-prev': su.calM--; if (su.calM < 0) { su.calM = 11; su.calY--; } render(); return;
      case 'su-cal-next': su.calM++; if (su.calM > 11) { su.calM = 0; su.calY++; } render(); return;
      case 'su-cal-pick': su.date = v; render(); return;
      case 'su-dlh':
        su.dlh = (function (c, dv) { var k = c == null ? -1 : c; k += dv; if (k > 23) return null; if (k < -1) return 23; return k < 0 ? null : k; })(su.dlh, +v); render(); return;
      case 'su-ampm':
        su.dlh = su.dlh == null ? (v === 'pm' ? 12 : 0) : (su.dlh % 12) + (v === 'pm' ? 12 : 0); render(); return;
      case 'su-dl-go': if (!su.date) return; suPush(); su.dl = su.date; suToChain(); return;
      case 'su-confirm':
        suConfirm(id);
        (function () { var c = suFind(id); if (c && c.n.state === 'set') { T.sheet = { type: 'sumins', id: id }; render(); } })();
        return;
      case 'su-split':
        f = suFind(id); if (!f) return;
        suPush();
        var nd = { id: suId(), state: 'draft', text: '', needs: [], mins: null };
        f.n.needs.push(nd); su.sel = null; su.focus = nd.id; render('in-' + nd.id); return;
      case 'su-add-up':
        f = suFind(id); if (!f) return;
        suPush();
        var nu = { id: suId(), state: 'draft', text: '', needs: f.n.needs.slice(), mins: null };
        f.n.needs = [nu]; su.sel = null; su.focus = nu.id; render('in-' + nu.id); return;
      case 'su-add-down':
        f = suFind(id); if (!f || !f.p) return;
        suPush();
        var ndn = { id: suId(), state: 'draft', text: '', needs: [f.n], mins: null };
        f.p.needs[f.p.needs.indexOf(f.n)] = ndn; su.sel = null; su.focus = ndn.id; render('in-' + ndn.id); return;
      case 'su-remove':
        f = suFind(id); if (!f || !f.p) return;
        if (f.p.id === 'root' && f.p.needs.length === 1 && !f.n.needs.length) return;
        suPush();
        (function () { var at = f.p.needs.indexOf(f.n); Array.prototype.splice.apply(f.p.needs, [at, 1].concat(f.n.needs)); })();
        (function () {
          T.clicks = (T.clicks || []).filter(function (x) { return x !== id; });
          for (var q = T.clicks.length - 1; q >= 0; q--) { if (suFind(T.clicks[q])) { T.centerId = T.clicks[q]; break; } }
        })();
        render(suNextFocus()); return;
      case 'su-kind':
        f = suFind(id); if (!f) return;
        f.n.kind = v === 'list' ? 'list' : 'task';
        render('in-' + id); return;
      case 'su-number':
        f = suFind(id); if (!f) return;
        (function () {
          var cnt = Math.max(1, Math.min(60, Math.round(+(document.getElementById('ln-' + id) || {}).value) || 12)), arr = [];
          for (var q = 1; q <= cnt; q++) arr.push(String(q));
          f.n.itemsText = arr.join(String.fromCharCode(10));
        })();
        render('in-' + id); return;
      case 'li-all': T.sheet = { type: 'li', id: id }; break;
      case 'su-tips': T.sheet = { type: 'tips' }; render(); return;
      case 'su-mins':
        if (e) e.stopPropagation();
        if (su.phase !== 'chain') return;
        T.sheet = { type: 'sumins', id: id }; render(); return;
      case 'su-edit':
        if (su.phase !== 'chain') return;
        f = suFind(id); if (!f || f.n.state !== 'set') return;
        if (su.sel !== id) { su.sel = id; setCenter(id); render(); return; }
        suPush();
        if (f.n.items) { f.n.kind = 'list'; f.n.itemsText = f.n.items.join(String.fromCharCode(10)); }
        f.n.state = 'draft'; su.focus = f.n.id; su.sel = null; setCenter(f.n.id); render('in-' + f.n.id); return;
      case 'line-edit':
        (function () { var lg = gById(S.cur); if (!lg) return; save(); T.setup = suFromGoal(lg); T.screen = 'setup'; T.sheet = null; T.msg = ''; })();
        break;
      case 'su-cancel-edit': T.screen = 'line'; T.setup = null; break;
      case 'su-apply':
        suApply(); T.screen = 'line'; T.setup = null; T.msg = ''; break;
      case 'su-gen':
        showLoader(tr('genning'), true);
        setTimeout(function () { hideLoader(); suFinish(); }, reduce ? 2600 : 3000);
        return;
      case 'su-open':
        S.cur = su.gid; S.view = 'full'; save(); T.screen = 'line'; T.setup = null; T.msg = say('start', 'msgDone'); break;
      default: return;
    }
    render();
  }

  /* ---------- timeline: refresh + long-press drag ---------- */
  var D = null;
  setInterval(function () {
    if (D || T.sheet) return;
    if ((T.screen === 'list' && S.home === 'time') || (T.screen === 'line' && S.view === 'time')) render();
  }, 30000);
  function stopDrag(revert) {
    if (!D) return;
    clearTimeout(D.timer); clearInterval(D.auto);
    if (D.active && revert) { D.el.style.transform = ''; D.el.classList.remove('dragging'); }
    D = null;
  }
  function updateDrag() {
    if (!D || !D.active) return;
    D.el.style.transform = 'translateY(' + (D.lastY - D.sy + (window.scrollY - D.scroll0)) + 'px)';
    var r = D.el.getBoundingClientRect(), cy = r.top + r.height / 2, target = null;
    var blocks = Array.prototype.filter.call(app.querySelectorAll('.tblock'), function (b) { return b !== D.el; });
    blocks.forEach(function (b) { b.classList.remove('dropbefore', 'dropend'); });
    for (var i = 0; i < blocks.length; i++) { var br = blocks[i].getBoundingClientRect(); if (cy < br.top + br.height / 2) { target = blocks[i]; break; } }
    D.target = target;
    if (target) target.classList.add('dropbefore'); else if (blocks.length) blocks[blocks.length - 1].classList.add('dropend');
  }
  app.addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest('.tblock');
    if (!el || D || (e.pointerType === 'mouse' && e.button !== 0)) return;
    D = { el: el, id: el.dataset.id, sx: e.clientX, sy: e.clientY, lastY: e.clientY, pid: e.pointerId, active: false, scroll0: window.scrollY, target: null };
    D.timer = setTimeout(function () {
      if (!D) return;
      D.active = true; el.classList.add('dragging');
      try { el.setPointerCapture(D.pid); } catch (x) {}
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (x) {}
      D.auto = setInterval(function () {
        if (!D) return;
        if (D.lastY < 90) window.scrollBy(0, -10); else if (D.lastY > window.innerHeight - 90) window.scrollBy(0, 10); else return;
        updateDrag();
      }, 16);
    }, 320);
  });
  app.addEventListener('pointermove', function (e) {
    if (!D) return;
    if (!D.active) { if (Math.abs(e.clientX - D.sx) > 8 || Math.abs(e.clientY - D.sy) > 8) stopDrag(false); return; }
    D.lastY = e.clientY; updateDrag();
  });
  app.addEventListener('pointerup', function () {
    if (!D) return;
    if (!D.active) { stopDrag(false); return; }
    var did = D.id, tgt = D.target;
    var ids = Array.prototype.map.call(app.querySelectorAll('.tblock'), function (b) { return b.dataset.id; }).filter(function (id) { return id !== did; });
    var at = tgt ? ids.indexOf(tgt.dataset.id) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, did);
    S.order = ids.concat(T.hidden || []); save();
    T.noClick = Date.now();
    stopDrag(false); render();
  });
  app.addEventListener('pointercancel', function () { stopDrag(true); });
  app.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('.tblock')) e.preventDefault(); });
  document.addEventListener('touchmove', function (e) { if (D && D.active) e.preventDefault(); }, { passive: false });

  render();
})();
