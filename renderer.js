(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  // Assigned by the admin. In the full product this list comes from the server; users cannot create or edit projects.
  const ASSIGNED = [
    { id: 'pr1', name: 'PMS Platform', color: '#2F5D8A', tasks: [
      { id: 't11', name: 'Weekly score report' }, { id: 't12', name: 'Task assignment screen' }, { id: 't13', name: 'Bug fixes' } ] },
    { id: 'pr2', name: 'FMS Workflows', color: '#1F8A7E', tasks: [
      { id: 't21', name: 'Step builder' }, { id: 't22', name: 'Approval flow' } ] },
    { id: 'pr3', name: 'Web Tracker', color: '#85509A', tasks: [
      { id: 't31', name: 'Desktop app UI' }, { id: 't32', name: 'Idle detection testing' } ] },
  ];
  // Set by the admin, not editable by the user.
  const RULES = { idleSec: 60, everySec: 60, workStart: '09:00', workEnd: '18:00' };

  const ALL = ASSIGNED.flatMap((p) => p.tasks.map((t) => ({ task: t, project: p })));
  const info = (taskId) => ALL.find((x) => x.task.id === taskId) || ALL[0];

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
  const everyLabel = () => (RULES.everySec % 60 === 0 ? `${RULES.everySec / 60} min` : `${RULES.everySec} s`);

  // ---------- state (saved locally) ----------
  function load() {
    try { const s = JSON.parse(localStorage.getItem('tt3')); if (s && s.days) return s; } catch (e) {}
    return { selected: ALL[0].task.id, days: {} };
  }
  const S = load();
  if (!ALL.some((x) => x.task.id === S.selected)) S.selected = ALL[0].task.id;
  const save = () => { try { localStorage.setItem('tt3', JSON.stringify(S)); } catch (e) {} };
  const today = () => (S.days[dayKey()] = S.days[dayKey()] || []);
  const idleMs = (s) => s.idle.reduce((a, i) => a + (i.end - i.start), 0);
  const trackedMs = (s) => Math.max(0, s.end - s.start - idleMs(s));
  // tracked intervals of a session: the session minus its idle spans
  function segs(s) {
    const out = []; let c = s.start;
    [...s.idle].sort((a, b) => a.start - b.start).forEach((i) => { if (i.start > c) out.push([c, i.start]); c = Math.max(c, i.end); });
    if (s.end > c) out.push([c, s.end]);
    return out;
  }

  let run = 'stopped', cur = null, lastTick = Date.now(), lastShotAt = 0, win = null, lastWinKey = '';

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
    const sel = info(S.selected);
    $('statusText').textContent = !running ? 'Not tracking' : run === 'idle' ? 'Paused · idle' : `Tracking · ${sel.task.name}`;
    $('stateText').textContent = !running ? 'Ready' : run === 'idle' ? 'Paused · no input' : 'Tracking';
    $('stateText').style.color = run === 'idle' ? 'var(--amber)' : 'var(--ink)';
    $('timer').classList.toggle('paused', run === 'idle');
    $('sub').innerHTML = !running
      ? (cur && trackedMs(cur) > 0 ? `Last session ${dur(trackedMs(cur) / 60000)} on <b>${esc(info(cur.taskId).task.name)}</b>.` : 'Select a task below, then press Start.')
      : run === 'idle' ? 'No activity detected. The timer is paused until you come back.'
      : `Recording time on <b>${esc(sel.task.name)}</b> <span class="muted">· ${esc(sel.project.name)}</span>`;
    $('pickHint').textContent = running ? 'Stop the timer to switch task' : 'Assigned to you by your admin';
    renderTimer(); renderPicker();
  }

  function renderTimer() {
    const secs = cur ? Math.floor(trackedMs(cur) / 1000) : 0;
    $('timer').textContent = fmtHms(secs);
    document.title = run === 'stopped' ? 'Tech Exactly Time Tracker' : `${fmtHms(secs)} · ${info(S.selected).task.name}`;
  }

  function renderPicker() {
    const running = run !== 'stopped';
    const mins = (id) => today().filter((s) => s.taskId === id).reduce((a, s) => a + trackedMs(s) / 60000, 0);
    const collapsed = S.collapsed || [];
    $('picker').innerHTML = ASSIGNED.map((p) => {
      const open = !collapsed.includes(p.id);
      const total = p.tasks.reduce((a, t) => a + mins(t.id), 0);
      const hasSel = p.tasks.some((t) => t.id === S.selected);
      return `
      <button class="grp" data-grp="${p.id}" aria-expanded="${open}">
        <span class="chev${open ? ' open' : ''}" aria-hidden="true"></span>
        <span class="eyebrow"><i class="swatch" style="background:${p.color}"></i>${esc(p.name)}</span>
        <span class="small muted">${p.tasks.length} tasks${hasSel && !open ? ' · selected inside' : ''}</span>
        <span class="mono small grp__t">${dur(total)}</span>
      </button>
      ${open ? p.tasks.map((t) => `
        <button class="pick${t.id === S.selected ? ' on' : ''}" role="radio" aria-checked="${t.id === S.selected}" data-id="${t.id}" ${running && t.id !== S.selected ? 'disabled' : ''}>
          <span class="radio"></span><b>${esc(t.name)}</b><span class="mono small">${dur(mins(t.id))} today</span>
        </button>`).join('') : ''}`;
    }).join('');
  }

  // timeline: green = tracked, blank = not tracked
  function renderTimeline() {
    const list = today();
    const mid = midnight(), nowMin = (Date.now() - mid) / 60000;
    const all = list.flatMap((s) => segs(s).map(([a, b]) => ({ a: (a - mid) / 60000, b: (b - mid) / 60000, s })));
    const total = all.reduce((x, g) => x + (g.b - g.a), 0);
    $('todayTotal').textContent = dur(total);
    if (!list.length) { $('timeline').innerHTML = '<div class="empty">Nothing tracked yet today. Press Start to begin.</div>'; return; }

    let lo = 8 * 60, hi = 20 * 60;
    all.forEach((g) => { lo = Math.min(lo, Math.floor(g.a / 60) * 60); hi = Math.max(hi, Math.ceil(g.b / 60) * 60); });
    hi = Math.min(24 * 60, Math.max(hi, Math.ceil(nowMin / 60) * 60)); lo = Math.max(0, lo);
    const pct = (m) => ((m - lo) / (hi - lo)) * 100;
    const step = (hi - lo) / 60 > 14 ? 2 : 1;
    const hours = []; for (let h = lo; h <= hi; h += 60) hours.push(h);
    const ws = hhmm(RULES.workStart), we = hhmm(RULES.workEnd);

    const grid = hours.map((h) => `<i class="tl__grid" style="left:${pct(h)}%"></i>`).join('');
    const work = `<i class="tl__work" style="left:${pct(ws)}%;width:${pct(we) - pct(ws)}%"></i>`;
    const now = `<i class="tl__now" style="left:${pct(nowMin)}%"></i>`;
    const blocks = all.map((g) => {
      const { task, project } = info(g.s.taskId);
      return `<div class="tl__block" style="left:${pct(g.a)}%;width:${pct(g.b) - pct(g.a)}%" data-t="${esc(task.name)}" data-s="${esc(project.name)} · ${clock(mid + g.a * 60000)}–${clock(mid + g.b * 60000)} · ${dur(g.b - g.a)}" data-x="${pct((g.a + g.b) / 2)}"></div>`;
    }).join('');

    // not tracked = working hours so far, minus tracked time inside them
    const limit = Math.min(we, nowMin);
    const trackedIn = all.reduce((x, g) => x + Math.max(0, Math.min(g.b, limit) - Math.max(g.a, ws)), 0);
    const notTracked = Math.max(0, limit - ws - trackedIn);

    $('timeline').innerHTML = `
      <div class="tl" id="tl">
        <div class="tl__axis">${hours.filter((_, i) => i % step === 0).map((h) => `<span style="left:${pct(h)}%">${pad(h / 60)}</span>`).join('')}</div>
        <div class="tl__row"><div style="position:relative;flex:1"><div class="tl__lane big">${grid}${work}${blocks}${now}</div></div></div>
      </div>
      <div class="legend"><span><i class="trk"></i>Tracked</span><span><i class="blank"></i>Not tracked</span><span class="muted">Working hours ${RULES.workStart}–${RULES.workEnd}</span></div>
      <div class="stats">
        <div><span class="eyebrow">Tracked</span><b>${dur(total)}</b></div>
        <div class="red"><span class="eyebrow">Not tracked</span><b>${dur(notTracked)}</b></div>
      </div>`;
  }

  // tooltip via delegation
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-t]'); const root = $('tl'); if (!root) return;
    root.querySelectorAll('.tl__tip').forEach((n) => n.remove());
    if (!el || !root.contains(el)) return;
    const lane = el.closest('.tl__lane').parentElement; const tip = document.createElement('div'); tip.className = 'tl__tip';
    tip.style.left = `clamp(110px, ${el.dataset.x}%, calc(100% - 110px))`; tip.innerHTML = `<b>${el.dataset.t}</b><span>${el.dataset.s}</span>`; lane.appendChild(tip);
  });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-t]')) document.querySelectorAll('.tl__tip').forEach((n) => n.remove()); });

  function renderChecks(ir) {
    const isIdle = ir.s >= RULES.idleSec;
    $('idleOut').innerHTML = `<span class="pill"><i class="dot ${isIdle ? 'idle' : 'tracking'}"></i>${isIdle ? 'Idle' : 'Active'}</span> <span class="muted small mono">· ${ir.s}s</span><br><span class="muted small">${esc(ir.src || '')}</span>`;
    const next = run === 'tracking' ? Math.max(0, Math.ceil((lastShotAt + RULES.everySec * 1000 - Date.now()) / 1000)) : null;
    $('nextOut').textContent = next === null ? '–' : `${pad(Math.floor(next / 60))}:${pad(next % 60)}`;
  }
  function renderWin() {
    $('winOut').innerHTML = win && win.ok ? `${esc(win.app)}<br><span class="muted small">${esc(win.title)}</span>` : `<span class="muted">${win ? esc(win.error) : '–'}</span>`;
  }
  function renderShot(r) {
    $('shotOut').innerHTML = r.ok
      ? `<span class="mono">${clock(Date.now())}</span> <span class="muted small">· ${r.files.map((f) => f.kb + ' KB').join(' + ')} · OK</span><br><span class="muted small">${esc(r.method || '')}</span>`
      : `<span style="color:var(--red-deep)">Failed</span><br><span class="muted small">${esc(r.error)}</span>`;
  }

  // ---------- actions ----------
  async function shot() {
    const { task, project } = info(S.selected);
    const r = await api.screenshot(`${project.name} ${task.name}`);
    renderShot(r);
    if (r.ok && cur) cur.shots.push(Date.now());
    log(r.ok ? `screenshot OK (${r.method || 'electron'}, ${r.files.map((f) => f.kb + 'KB').join('+')})` : `screenshot FAILED: ${r.error}`);
  }

  function start() {
    const now = Date.now();
    cur = { id: 's' + now, taskId: S.selected, start: now, end: now, idle: [], shots: [] };
    today().push(cur); run = 'tracking'; lastTick = now; lastShotAt = 0;
    log(`START · ${info(S.selected).task.name}`); save(); renderRun(); renderTimeline();
  }
  function stop() {
    const mins = cur ? trackedMs(cur) / 60000 : 0;
    run = 'stopped'; if (cur) cur.end = Date.now();
    log(`STOP · +${dur(mins)}`); toast(`Saved ${dur(mins)} to ${info(cur ? cur.taskId : S.selected).task.name}`);
    save(); renderRun(); renderTimeline();
  }

  $('startStop').onclick = () => (run === 'stopped' ? start() : stop());
  $('picker').addEventListener('click', (e) => {
    const g = e.target.closest('.grp');
    if (g) { // expand or collapse a project's tasks
      S.collapsed = S.collapsed || [];
      const i = S.collapsed.indexOf(g.dataset.grp);
      if (i >= 0) S.collapsed.splice(i, 1); else S.collapsed.push(g.dataset.grp);
      save(); renderPicker(); return;
    }
    const b = e.target.closest('.pick'); if (!b || run !== 'stopped') return;
    S.selected = b.dataset.id; cur = null; save(); renderRun();
  });
  $('open').onclick = () => api.openFolder();
  $('everyText').textContent = `A screenshot of your screen every ${everyLabel()} while the timer runs.`;
  $('idleText').textContent = `Time pauses after ${RULES.idleSec >= 60 ? RULES.idleSec / 60 + ' min' : RULES.idleSec + ' s'} without keyboard or mouse input.`;

  // ---------- 1-second heartbeat ----------
  setInterval(async () => {
    const now = Date.now(), gap = now - lastTick; lastTick = now;
    const ir = await api.idle(); renderChecks(ir);
    if (run === 'stopped') return;

    // computer slept or app was suspended: do not count that time
    if (gap > 15000 && ir.s * 1000 < gap - 2000) cur.idle.push({ start: now - gap, end: now });

    const isIdle = ir.s >= RULES.idleSec;
    if (isIdle && run === 'tracking') {
      run = 'idle'; cur.idle.push({ start: Math.max(cur.start, now - ir.s * 1000), end: now }); log(`idle (${ir.s}s) · timer paused`); renderRun(); renderTimeline();
    } else if (isIdle && run === 'idle') {
      cur.idle[cur.idle.length - 1].end = now;
    } else if (!isIdle && run === 'idle') {
      run = 'tracking'; log('activity · timer resumed'); renderRun(); renderTimeline();
    }
    cur.end = now;
    renderTimer();

    if (run === 'tracking' && now - lastShotAt >= RULES.everySec * 1000) { lastShotAt = now; shot(); }
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
