(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const PALETTE = ['#2F5D8A', '#1F8A7E', '#C98F10', '#6F8A2E', '#85509A', '#3B3B42'];

  // Preview fallback so the UI can be opened in a normal browser. In the app, preload.js provides window.api.
  const api = window.api || {
    env: async () => ({ platform: 'preview', note: 'running without Electron' }),
    idle: async () => ({ s: window.__idle || 2, src: 'preview' }),
    activeWindow: async () => ({ ok: true, app: 'VS Code', title: 'renderer.js — time-tracker' }),
    screenshot: async () => ({ ok: true, method: 'preview', ms: 120, files: [{ kb: 312 }] }),
    openFolder: async () => '',
  };

  // ---------- time helpers ----------
  const fmtHms = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const dur = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${pad(m)}m` : `${m}m`; };
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const hhmm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  // ---------- state (saved locally) ----------
  function load() {
    try { const s = JSON.parse(localStorage.getItem('tt2')); if (s && s.projects && s.projects.length) return s; } catch (e) {}
    let projects = [{ id: 'p1', name: 'General', color: PALETTE[0] }], selected = 'p1';
    try {
      const o = JSON.parse(localStorage.getItem('tt-state'));
      if (o && o.projects && o.projects.length) { projects = o.projects.map((p, i) => ({ id: p.id, name: p.name, color: PALETTE[i % 6] })); selected = o.selected || projects[0].id; }
    } catch (e) {}
    return { projects, selected, days: {}, set: { idleSec: 60, everySec: 60, workStart: '09:00', workEnd: '18:00' } };
  }
  const S = load();
  const save = () => { try { localStorage.setItem('tt2', JSON.stringify(S)); } catch (e) {} };
  const today = () => (S.days[dayKey()] = S.days[dayKey()] || []);
  const proj = (id) => S.projects.find((p) => p.id === id) || S.projects[0];
  const idleMs = (s) => s.idle.reduce((a, i) => a + (i.end - i.start), 0);
  const trackedMs = (s) => Math.max(0, s.end - s.start - idleMs(s));

  let run = 'stopped', cur = null, lastTick = Date.now(), lastShotAt = 0, idleSecs = 0, lastShot = null, win = null, lastWinKey = '';

  const log = (m) => { const l = $('log'); l.textContent = `${new Date().toLocaleTimeString()}  ${m}\n${l.textContent}`.slice(0, 6000); };
  function toast(t) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // ---------- rendering ----------
  function renderRun() {
    const running = run !== 'stopped';
    const b = $('startStop');
    b.textContent = running ? 'Stop' : 'Start';
    b.className = `btn btn--block go ${running ? 'btn--ink' : 'btn--red'}`;
    const cls = running ? (run === 'idle' ? 'idle' : 'tracking') : 'stopped';
    $('dot').className = `dot ${cls}`; $('dot2').className = `dot ${cls}`;
    const name = proj(S.selected).name;
    $('statusText').textContent = !running ? 'Not tracking' : run === 'idle' ? 'Paused · idle' : `Tracking · ${name}`;
    $('stateText').textContent = !running ? 'Ready' : run === 'idle' ? 'Paused · no input' : 'Tracking';
    $('stateText').style.color = run === 'idle' ? 'var(--amber)' : 'var(--ink)';
    $('timer').classList.toggle('paused', run === 'idle');
    $('sub').innerHTML = !running
      ? (cur && trackedMs(cur) > 0 ? `Last session ${dur(trackedMs(cur) / 60000)} on <b>${esc(proj(cur.projectId).name)}</b>.` : 'Select a project below, then press Start.')
      : run === 'idle' ? 'No activity detected. The timer is paused until you come back.' : `Recording time on <b>${esc(name)}</b>.`;
    $('pickHint').textContent = running ? 'Stop the timer to switch' : '';
    renderTimer();
    renderPicker();
  }

  function renderTimer() {
    const secs = cur ? Math.floor(trackedMs(cur) / 1000) : 0;
    $('timer').textContent = fmtHms(secs);
    document.title = run === 'stopped' ? 'Tech Exactly Time Tracker' : `${fmtHms(secs)} · ${proj(S.selected).name}`;
  }

  function renderPicker() {
    const running = run !== 'stopped';
    const mins = (id) => today().filter((s) => s.projectId === id).reduce((a, s) => a + trackedMs(s) / 60000, 0);
    $('picker').innerHTML = S.projects.map((p) => `
      <button class="pick${p.id === S.selected ? ' on' : ''}" role="radio" aria-checked="${p.id === S.selected}" data-id="${p.id}" ${running && p.id !== S.selected ? 'disabled' : ''}>
        <span class="radio"></span><b><i class="swatch" style="background:${p.color}"></i>${esc(p.name)}</b><span class="mono small">${dur(mins(p.id))} today</span>
      </button>`).join('');
    $('newBtn').disabled = running;
  }

  function gapsOf(list, nowMin, lo) {
    const ws = Math.max(hhmm(S.set.workStart), lo), we = hhmm(S.set.workEnd), limit = Math.min(we, nowMin);
    const mid = midnight(); const gaps = []; let c = ws;
    [...list].sort((a, b) => a.start - b.start).forEach((s) => {
      const st = (s.start - mid) / 60000, en = (s.end - mid) / 60000;
      if (st - c >= 10 && c < limit) gaps.push([c, Math.min(st, limit)]);
      c = Math.max(c, en);
    });
    if (limit - c >= 10) gaps.push([c, limit]);
    return gaps;
  }

  function renderTimeline() {
    const list = today();
    const mid = midnight(), nowMin = (Date.now() - mid) / 60000;
    const total = list.reduce((a, s) => a + trackedMs(s) / 60000, 0);
    $('todayTotal').textContent = dur(total);
    if (!list.length) { $('timeline').innerHTML = '<div class="empty">Nothing tracked yet today. Press Start to begin.</div>'; return; }

    let lo = 8 * 60, hi = 20 * 60;
    list.forEach((s) => { lo = Math.min(lo, Math.floor((s.start - mid) / 3600000) * 60); hi = Math.max(hi, Math.ceil((s.end - mid) / 3600000) * 60); });
    hi = Math.min(24 * 60, Math.max(hi, Math.ceil(nowMin / 60) * 60)); lo = Math.max(0, lo);
    const pct = (m) => ((m - lo) / (hi - lo)) * 100;
    const step = (hi - lo) / 60 > 14 ? 2 : 1;
    const hours = []; for (let h = lo; h <= hi; h += 60) hours.push(h);

    const grid = hours.map((h) => `<i class="tl__grid" style="left:${pct(h)}%"></i>`).join('');
    const work = `<i class="tl__work" style="left:${pct(hhmm(S.set.workStart))}%;width:${pct(hhmm(S.set.workEnd)) - pct(hhmm(S.set.workStart))}%"></i>`;
    const now = `<i class="tl__now" style="left:${pct(nowMin)}%"></i>`;
    const gaps = gapsOf(list, nowMin, lo).map(([a, b]) =>
      `<div class="tl__gap" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%" data-t="No activity" data-s="${clock(mid + a * 60000)}–${clock(mid + b * 60000)} · ${dur(b - a)} untracked" data-x="${pct((a + b) / 2)}">${b - a >= 28 ? dur(b - a) : ''}</div>`).join('');
    const blocks = list.map((s) => {
      const st = (s.start - mid) / 60000, en = (s.end - mid) / 60000, len = Math.max(en - st, 0.01), p = proj(s.projectId);
      const idle = s.idle.map((i) => `<i class="tl__idle" style="left:${((i.start - s.start) / 60000 / len) * 100}%;width:${((i.end - i.start) / 60000 / len) * 100}%"></i>`).join('');
      const im = idleMs(s) / 60000;
      return `<div class="tl__block" style="left:${pct(st)}%;width:${pct(en) - pct(st)}%;background:${p.color}" data-t="${esc(p.name)}" data-s="${clock(s.start)}–${clock(s.end)} · ${dur(trackedMs(s) / 60000)} tracked${im >= 0.5 ? ` · ${dur(im)} idle` : ''}" data-x="${pct((st + en) / 2)}">${idle}</div>`;
    }).join('');
    const shotsList = list.flatMap((s) => s.shots.map((t) => ({ t, p: proj(s.projectId) })));
    const ticks = shotsList.map(({ t }) => `<i class="tl__shot" style="left:${pct((t - mid) / 60000)}%" data-t="Screenshot" data-s="${clock(t)}" data-x="${pct((t - mid) / 60000)}"></i>`).join('');

    const used = S.projects.filter((p) => list.some((s) => s.projectId === p.id));
    const idleTot = list.reduce((a, s) => a + idleMs(s) / 60000, 0);
    const gapTot = gapsOf(list, nowMin, lo).reduce((a, [x, y]) => a + (y - x), 0);

    $('timeline').innerHTML = `
      <div class="tl" id="tl">
        <div class="tl__axis">${hours.filter((_, i) => i % step === 0).map((h) => `<span style="left:${pct(h)}%">${pad(h / 60)}</span>`).join('')}</div>
        <div class="tl__row"><span class="tl__label">Time</span><div style="position:relative;flex:1"><div class="tl__lane big">${grid}${work}${gaps}${blocks}${now}</div></div></div>
        <div class="tl__row"><span class="tl__label">Captures</span><div style="position:relative;flex:1"><div class="tl__lane small">${grid}${ticks}${now}</div></div></div>
      </div>
      <div class="legend">${used.map((p) => `<span><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}<span><i class="hatch"></i>Idle</span><span><i class="gap"></i>No activity</span><span><i class="cap"></i>Screenshot</span></div>
      <div class="stats">
        <div><span class="eyebrow">Tracked</span><b>${dur(total)}</b></div>
        <div><span class="eyebrow">Idle</span><b>${dur(idleTot)}</b></div>
        <div class="red"><span class="eyebrow">No activity</span><b>${dur(gapTot)}</b></div>
        <div><span class="eyebrow">Captures</span><b>${shotsList.length}</b></div>
      </div>`;
  }

  // tooltip via delegation
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-t]'); const root = $('tl'); if (!root) return;
    root.querySelectorAll('.tl__tip').forEach((n) => n.remove());
    if (!el || !root.contains(el)) return;
    const lane = el.closest('.tl__lane').parentElement; const tip = document.createElement('div'); tip.className = 'tl__tip';
    tip.style.left = `clamp(90px, ${el.dataset.x}%, calc(100% - 90px))`; tip.innerHTML = `<b>${el.dataset.t}</b><span>${el.dataset.s}</span>`; lane.appendChild(tip);
  });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-t]')) document.querySelectorAll('.tl__tip').forEach((n) => n.remove()); });

  function renderChecks(ir) {
    const thr = S.set.idleSec;
    const isIdle = ir.s >= thr;
    $('idleOut').innerHTML = `<span class="pill"><i class="dot ${isIdle ? 'idle' : 'tracking'}"></i>${isIdle ? 'Idle' : 'Active'}</span> <span class="muted small mono">· ${ir.s}s</span><br><span class="muted small">${esc(ir.src || '')}</span>`;
    const next = run === 'tracking' ? Math.max(0, Math.ceil((lastShotAt + S.set.everySec * 1000 - Date.now()) / 1000)) : null;
    $('nextOut').textContent = next === null ? '–' : `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
  }
  function renderWin() {
    $('winOut').innerHTML = win && win.ok ? `${esc(win.app)}<br><span class="muted small">${esc(win.title)}</span>` : `<span class="muted">${win ? esc(win.error) : '–'}</span>`;
  }
  function renderShot(r) {
    if (!r) { $('shotOut').textContent = '–'; return; }
    $('shotOut').innerHTML = r.ok
      ? `<span class="mono">${clock(Date.now())}</span> <span class="muted small">· ${r.files.map((f) => f.kb + ' KB').join(' + ')} · OK</span><br><span class="muted small">${esc(r.method || '')}</span>`
      : `<span style="color:var(--red-deep)">Failed</span><br><span class="muted small">${esc(r.error)}</span>`;
  }

  // ---------- actions ----------
  async function shot() {
    const r = await api.screenshot(proj(S.selected).name);
    lastShot = r; renderShot(r);
    if (r.ok && cur) cur.shots.push(Date.now());
    log(r.ok ? `screenshot OK (${r.method || 'electron'}, ${r.files.map((f) => f.kb + 'KB').join('+')})` : `screenshot FAILED: ${r.error}`);
    renderTimeline();
  }

  function start() {
    const now = Date.now();
    cur = { id: 's' + now, projectId: S.selected, start: now, end: now, idle: [], shots: [] };
    today().push(cur); run = 'tracking'; lastTick = now; lastShotAt = 0;
    log(`START · ${proj(S.selected).name}`); save(); renderRun(); renderTimeline();
  }
  function stop() {
    const secs = cur ? trackedMs(cur) / 60000 : 0;
    run = 'stopped'; if (cur) cur.end = Date.now();
    log(`STOP · +${dur(secs)}`); toast(`Saved ${dur(secs)} to ${proj(cur ? cur.projectId : S.selected).name}`);
    save(); renderRun(); renderTimeline();
  }

  $('startStop').onclick = () => (run === 'stopped' ? start() : stop());
  $('picker').addEventListener('click', (e) => {
    const b = e.target.closest('.pick'); if (!b || run !== 'stopped') return;
    S.selected = b.dataset.id; cur = null; save(); renderRun();
  });
  $('newBtn').onclick = () => { $('newWrap').hidden = true; $('newRow').hidden = false; $('newName').focus(); };
  const closeNew = () => { $('newRow').hidden = true; $('newWrap').hidden = false; $('newName').value = ''; };
  const addProject = () => {
    const name = $('newName').value.trim(); if (!name) return;
    const p = { id: 'p' + Date.now(), name, color: PALETTE[S.projects.length % PALETTE.length] };
    S.projects.push(p); S.selected = p.id; cur = null; save(); closeNew(); renderRun(); toast(`Created ${name}`);
  };
  $('newAdd').onclick = addProject; $('newCancel').onclick = closeNew;
  $('newName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addProject(); if (e.key === 'Escape') closeNew(); });
  $('open').onclick = () => api.openFolder();
  const bind = (id, key) => { const el = $(id); el.value = S.set[key]; el.onchange = () => { S.set[key] = Math.max(5, +el.value || S.set[key]); el.value = S.set[key]; save(); }; };
  bind('every', 'everySec'); bind('thr', 'idleSec');

  // ---------- 1-second heartbeat ----------
  setInterval(async () => {
    const now = Date.now(), gap = now - lastTick; lastTick = now;
    const ir = await api.idle(); idleSecs = ir.s; renderChecks(ir);
    if (run === 'stopped') return;

    // computer slept or app was suspended: do not count that time
    if (gap > 15000 && ir.s * 1000 < gap - 2000) cur.idle.push({ start: now - gap, end: now });

    const isIdle = ir.s >= S.set.idleSec;
    if (isIdle && run === 'tracking') {
      run = 'idle'; cur.idle.push({ start: Math.max(cur.start, now - ir.s * 1000), end: now }); log(`idle (${ir.s}s) · timer paused`); renderRun(); renderTimeline();
    } else if (isIdle && run === 'idle') {
      cur.idle[cur.idle.length - 1].end = now;
    } else if (!isIdle && run === 'idle') {
      run = 'tracking'; log('activity · timer resumed'); renderRun(); renderTimeline();
    }
    cur.end = now;
    renderTimer();

    if (run === 'tracking' && now - lastShotAt >= S.set.everySec * 1000) { lastShotAt = now; shot(); }
  }, 1000);

  setInterval(() => { if (run !== 'stopped') { save(); renderTimeline(); renderPicker(); } }, 5000);
  setInterval(async () => {
    win = await api.activeWindow(); renderWin();
    if (win && win.ok) { const k = `${win.app}|${win.title}`; if (k !== lastWinKey) { lastWinKey = k; log(`window → ${win.app} — ${win.title}`); } }
  }, 2000);
  window.addEventListener('beforeunload', save);

  (async () => { $('env').textContent = JSON.stringify(await api.env(), null, 2); })();
  renderRun(); renderTimeline();
})();
