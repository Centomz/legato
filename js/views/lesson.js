// Live lesson: sheet or falling notes, real-time judging, tempo ramp, coach / quiet / strict.
import { store, save, t, esc, nn, icon, q, input, go, getPiece, dkey, toggleMic, toast } from '../core.js';
import { flatten, barsOf } from '../music.js';
import { renderStaff, movePlayhead, hidePlayhead, paintStaff } from '../staff.js';
import { Keyboard, rangeFor } from '../keyboard.js';
import * as audio from '../audio.js';

const TOL = 75, PPB = 92, STEPS = [60, 70, 80, 90, 100], LEAD = 0.06; // LEAD: seconds before a note is due that its key lights
const OVERTONE = [0, 12, -12, 19, 24, -24, 28, 31, 36]; // intervals a microphone may report on top of the real note
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

export function render(root, prm) {
  const piece = getPiece(prm.piece || 'minuet'), nb = barsOf(piece), beats = piece.beats;
  const all = flatten(piece).filter(n => !n.rest);
  const cb = v => Math.max(1, Math.min(nb, v | 0));
  const S = {
    from: cb(+prm.from || 1) - 1, to: cb(+prm.to || (+prm.from || 1) + 3), pct: +prm.pct || store.ramp[piece.id] || 60,
    hands: ['R', 'L'].includes(prm.hands) ? prm.hands : 'both', loop: true, metro: true, reps: 0, drill: null, coach: null, cleanRow: 0,
  };
  if (S.to <= S.from) S.to = S.from + 1;
  const ses = { start: Date.now(), perBar: {}, deltas: [], judged: 0, right: 0, okN: 0, cleanTempo: 0, earned: null, take: [], vel: { R: [], L: [] }, slips: {} };
  let run = null, raf = 0, layout = null, lastLine = -1, lastTg = '', lastCue = '', pendingStop = null, done = false;
  const bpm = () => Math.round(piece.tempo * S.pct / 100);
  const handName = h => h === 'R' ? t('Right hand') : t('Left hand');

  root.innerHTML = `<div class="lesson">
    <header class="l-top">
      <button class="btn sq" data-act="back" aria-label="${t('Back')}">${icon('back')}</button>
      <div class="l-title"><h1>${esc(piece.title)}</h1><p id="sub"></p></div>
      <div class="seg" id="viewseg"></div><div class="seg" id="modeseg"></div>
      <button class="status" data-act="mic" id="instat"></button>
    </header>
    <div class="l-main"><div class="stage" id="stage"></div><aside class="coach" id="coach"></aside></div>
    <div class="l-ctrl" id="ctrl"></div>
    <div id="kb"></div></div>`;
  const $ = id => root.querySelector('#' + id), el = root.firstElementChild;
  const kb = Keyboard($('kb'), rangeFor(all));

  /* ---------- drawing ---------- */
  function drawTop() {
    el.classList.toggle('falling', store.view === 'falling');
    el.classList.toggle('drilling', !!S.drill);
    $('sub').innerHTML = `${esc(piece.composer || '')} · ${t('bars {0}–{1} of {2}', S.from + 1, S.to, nb)} · ${q} = ${bpm()}`;
    $('viewseg').innerHTML = [['sheet', 'music', t('Sheet')], ['falling', 'download', t('Falling notes')]].map(([v, ic, l]) =>
      `<button data-act="view" data-v="${v}" class="${store.view === v ? 'on' : ''}">${icon(ic)}${l}</button>`).join('');
    $('modeseg').innerHTML = [['quiet', t('Quiet')], ['coach', t('Coach')], ['strict', t('Strict')]].map(([v, l]) =>
      `<button data-act="mode" data-v="${v}" class="${store.mode === v ? 'on' : ''}">${l}</button>`).join('');
    $('instat').innerHTML = `<i class="led ${audio.mic.on || audio.midi.inputs ? 'live' : ''}"></i>${audio.mic.on ? t('Mic · listening') : audio.midi.inputs ? t('MIDI · connected') : t('Turn on the microphone')}`;
  }
  function dispPass() { // which pass the playhead is in (the judged pass lingers for a short grace)
    if (!run) return 0;
    if (run.wait) return run.pass;
    const bp = (audio.now() - run.t0) / run.spb;
    return Math.max(run.pass, Math.floor(Math.max(0, bp) / run.len));
  }
  function shownRes() { return !run ? {} : dispPass() > run.pass ? run.carry : run.res; }
  // Beats from the start of the range for whatever is on screen (negative during the count-in).
  function curLocal() { return !run ? 0 : run.wait ? run.p : (audio.now() - run.t0) / run.spb - dispPass() * run.len; }
  // Wait mode: the notes the line is waiting for (every unplayed note at the earliest beat), or null.
  function nextGroup() {
    const pend = run.exp.filter(n => !run.res[n.id]);
    return pend.length ? pend.filter(n => n.pos === pend[0].pos) : null;
  }
  const overtone = (m, notes) => notes.some(x => OVERTONE.includes(m - x.midi));
  function states() {
    const st = {}, res = shownRes(), V = S.drill ? S.drill.saved : S;
    for (const n of all) {
      if (n.bar < V.from || n.bar >= V.to) continue;
      let cls = '', label;
      const r = res[n.id], sl = run?.wait ? run.slip[n.id] : null;
      if (n.bar < S.from || n.bar >= S.to || (S.hands !== 'both' && n.h !== S.hands)) cls = 'st-dim';
      if (r) {
        if (r.st === 'ok') cls = r.fixed ? 'st-off' : 'st-ok';
        else if (r.st === 'late' || r.st === 'early') { cls = 'st-off'; label = (r.ms > 0 ? '+' : '−') + Math.abs(r.ms) + ' ms'; }
        else if (r.st === 'wrong') { cls = 'st-wrong'; label = t('played {0}', nn(r.played, false, piece.sharps)); }
        else cls = 'st-wrong st-miss';
        if (store.mode === 'quiet') label = undefined;
      } else if (sl != null) { cls = 'st-wrong'; if (store.mode !== 'quiet') label = t('played {0}', nn(sl, false, piece.sharps)); }
      st[n.id] = { cls, label };
    }
    return st;
  }
  function drawStage() {
    const stage = $('stage'), V = S.drill ? S.drill.saved : S;
    if (store.view === 'sheet') {
      const r = renderStaff(piece, { from: V.from, to: V.to, perLine: 4, width: 1040, state: states(), fingering: store.fingering, highlightBar: S.drill ? S.drill.bar : null });
      layout = r.layout;
      stage.innerHTML = `<div class="cue" id="cue"><span></span></div><div class="sheet">${r.svg}</div><div class="legend"><span><i class="d ok"></i>${store.wait ? t('right first time') : t('right note, in time')}</span><span><i class="d off"></i>${store.wait ? t('right on a later try') : t('early / late')}</span><span><i class="d bad"></i>${t('wrong note')}</span></div>`;
      lastLine = -1; lastCue = '';
    } else {
      const base = S.from * beats; lastCue = '';
      let h = '<div class="fall"><div class="fall-in">';
      for (let m = kb.lo; m <= kb.hi; m += 12) h += `<i class="lane" style="left:${kb.x[m].l}%"></i>`;
      for (const n of all) {
        if (n.bar < S.from || n.bar >= S.to) continue;
        const x = kb.x[n.midi]; if (!x) continue;
        const mine = S.hands === 'both' || n.h === S.hands;
        h += `<div class="blk ${n.h} ${mine ? '' : 'dim'} ${blkCls(n.id)}" data-id="${n.id}" style="left:${x.l}%;width:${x.w}%;bottom:${(n.pos - base) * PPB}px;height:${Math.max(14, n.d * PPB - 4)}px">${store.fingering && n.f ? n.f : ''}</div>`;
      }
      stage.innerHTML = h + `</div></div><div class="cue" id="cue"><span></span></div><p class="fall-note">${fallNote()}</p>`;
      placeFall();
    }
  }
  const fallNote = () => store.mode === 'quiet' ? t('Quiet mode — colour only, comments in the report') : esc(S.coach?.h || '');
  function placeFall() {
    const inner = root.querySelector('.fall-in'); if (!inner) return;
    inner.style.transform = `translateY(${curLocal() * PPB}px)`;
  }
  function blkCls(id) {
    const r = shownRes()[id];
    if (!r) return run?.wait && run.slip[id] != null ? 'bad' : '';
    return r.st === 'ok' ? (r.fixed ? 'off' : 'ok') : r.st === 'late' || r.st === 'early' ? 'off' : 'bad';
  }
  // Recolour what is on screen without rebuilding it (rebuilding made the line flicker and jump).
  function paint() {
    if (store.view === 'sheet') paintStaff(root.querySelector('.staff'), states());
    else root.querySelectorAll('.blk[data-id]').forEach(b => { const c = blkCls(b.dataset.id); b.classList.remove('ok', 'off', 'bad'); if (c) b.classList.add(c); });
  }
  function setCue(text, count) {
    if (text === lastCue) return; lastCue = text;
    const el = root.querySelector('#cue span'); if (el) { el.textContent = text; el.className = count ? 'count' : ''; }
  }
  function timingText() {
    const d = ses.deltas.slice(-24); if (d.length < 3) return '—';
    const m = avg(d);
    return Math.abs(m) < 18 ? t('on the beat') : m > 0 ? (m < 55 ? t('slightly behind') : t('behind the beat')) : (m > -55 ? t('slightly ahead') : t('ahead of the beat'));
  }
  function dynText() {
    const r = ses.vel.R, l = ses.vel.L, a = [...r, ...l];
    if (!a.length) return `<span class="muted">${t('needs a MIDI keyboard')}</span>`;
    const m = avg(a), lab = m < .25 ? 'pp' : m < .4 ? 'p' : m < .55 ? 'mp' : m < .7 ? 'mf' : m < .85 ? 'f' : 'ff';
    return `<i>${lab}</i>` + (r.length > 3 && l.length > 3 && avg(l) > avg(r) + 0.08 ? ' · ' + t('LH too loud') : '');
  }
  const dots = (n, cls = '') => `<span class="dots ${cls}">${[0, 1, 2].map(i => `<i class="${i < n ? 'f' : ''}"></i>`).join('')}</span>`;
  function drawCoach() {
    const c = $('coach');
    if (S.drill) {
      const d = S.drill;
      c.innerHTML = `<p class="eyebrow">${t('Stopped at bar {0}', d.bar + 1)}</p><h2>${t("Let's take this bar alone.")}</h2>
        <p class="body">${esc(d.why)} ${t('Play the bar with the {0} only, slowly enough that it cannot go wrong. Three clean repetitions and we move up.', handName(d.hand).toLowerCase())}</p>
        <div class="row"><button class="btn primary" data-act="play">${icon(run ? 'pause' : 'play')}${run ? t('Pause') : t('Play bar {0}', d.bar + 1)}</button>
        <button class="btn" data-act="hear">${icon('volume')}${t('Hear it')}</button></div>
        <ol class="steps">${d.steps.map((s, i) => `<li class="${i === d.step ? 'cur' : i < d.step ? 'done' : ''}"><b>${i + 1}</b><div><strong>${s.label}</strong><small>${q} = ${Math.round(piece.tempo * s.pct / 100)}</small></div>
          ${i === d.step ? dots(S.reps, 'green') : i < d.step ? icon('check') : icon('lock')}</li>`).join('')}</ol>
        <button class="link" data-act="skip">${t("Skip — add to tomorrow's weak bars")}</button>`;
      return;
    }
    if (store.mode === 'quiet') {
      c.innerHTML = `<p class="eyebrow">${t('Quiet')}</p><div class="bignum">${S.cleanRow}</div><p class="muted">${t('clean in a row')}</p>
        <p class="muted small">${t('Quiet mode — colour only, comments in the report')}</p>${hint()}`;
      return;
    }
    const m = S.coach || { h: t('Slow is the short road.'), d: store.wait ? t('Press play. The line stops at each note and waits for you: play it and it moves on. Three clean repetitions and the tempo climbs.') : t('Press play: one bar of count-in, then follow the line. Three clean repetitions and the tempo climbs.') };
    c.innerHTML = `<p class="eyebrow">${store.mode === 'strict' ? t('Strict') : t('Coach')}</p><h2>${esc(m.h)}</h2><p class="body">${esc(m.d)}</p>
      <dl class="stats"><dt>${t('Accuracy')}</dt><dd>${ses.judged ? Math.round(100 * ses.right / ses.judged) + '%' : '—'}</dd>
      <dt>${t('Timing')}</dt><dd>${timingText()}</dd><dt>${t('Dynamics')}</dt><dd>${dynText()}</dd>
      <dt>${t('Clean reps')}</dt><dd>${dots(S.reps)}</dd></dl>${hint()}`;
    const fn = root.querySelector('.fall-note'); if (fn) fn.textContent = S.coach?.h || '';
  }
  const hint = () => `<p class="hint">${t('No piano connected? Click the keys, or type A S D F G H J K (W E T Y U for black keys) from middle C — Z / X shift the octave.')}</p>`;
  function drawCtrl() {
    const cur = STEPS.indexOf(S.pct);
    $('ctrl').innerHTML = `<button class="btn sq primary" data-act="play" aria-label="${run ? t('Pause') : t('Play')}">${icon(run && !run.demo ? 'pause' : 'play')}</button>
      <div class="ramp"><div class="ramp-h"><span>${t('Tempo ramp')} · ${q} = ${bpm()}</span><span class="muted">${t('{0}% of {1}', S.pct, piece.tempo)}</span></div>
        <div class="ramp-b">${STEPS.map((v, i) => `<button data-act="pct" data-v="${v}" class="${i < cur ? 'done' : i === cur ? 'cur' : ''}" aria-label="${v}%"></button>`).join('')}</div>
        <div class="ramp-l">${STEPS.map(v => `<span>${v}${v === 100 ? '%' : ''}</span>`).join('')}</div></div>
      <div class="seg">${[['both', t('Both hands')], ['R', t('Right')], ['L', t('Left')]].map(([v, l]) => `<button data-act="hands" data-v="${v}" class="${S.hands === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="loopbox ${S.loop ? 'on' : ''}"><button class="btn ${S.loop ? 'on' : ''}" data-act="loop" aria-pressed="${S.loop}">${icon('loop')}${t('Loop bars')}</button>
        <input type="number" id="rf" min="1" max="${nb}" value="${S.from + 1}" aria-label="${t('From bar')}">–<input type="number" id="rt" min="1" max="${nb}" value="${S.to}" aria-label="${t('To bar')}"></div>
      <button class="btn ${store.wait ? 'on' : ''}" data-act="wait" aria-pressed="${store.wait}">${icon('pause')}${t('Wait for me')}</button>
      <button class="btn ${S.metro ? 'on' : ''}" data-act="metro" aria-pressed="${S.metro}">${icon('timer')}${t('Metronome')}</button>
      <button class="btn ${store.fingering ? 'on' : ''}" data-act="fing" aria-pressed="${store.fingering}">${t('Fingering')}</button>
      <span class="grow"></span>
      <button class="link" data-act="hear">${icon('volume')}${t('Hear it played')}</button>
      <button class="btn" data-act="end">${icon('flag')}${t('End session')}</button>`;
    $('rf').onchange = $('rt').onchange = () => {
      S.from = cb(+$('rf').value) - 1; S.to = Math.max(S.from + 1, cb(+$('rt').value)); S.reps = 0; S.drill = null; stop(); redraw();
    };
  }
  function redraw() { drawTop(); drawStage(); drawCoach(); drawCtrl(); }
  function refresh() { paint(); drawCoach(); }

  /* ---------- engine ---------- */
  const tOf = (n, pass = run.pass) => run.t0 + (pass * run.len + n.pos - run.base) * run.spb;
  async function start(demo = false) {
    stop(true);
    const c = audio.ctx();
    if (c.state !== 'running') { try { await c.resume(); } catch { /* blocked until a user gesture */ } }
    if (c.state !== 'running') { toast(t('Click once anywhere on the page to enable sound, then press play.')); return; }
    const spb = 60 / (piece.tempo * S.pct / 100);
    const rn = all.filter(n => n.bar >= S.from && n.bar < S.to), mine = n => S.hands === 'both' || n.h === S.hands;
    run = {
      demo, spb, bpm: bpm(), base: S.from * beats, len: (S.to - S.from) * beats, t0: c.currentTime + 0.15 + beats * spb,
      exp: demo ? [] : rn.filter(mine), acc: demo ? rn : rn.filter(n => !mine(n)), ai: 0, ap: 0, click: -beats,
      pass: 0, res: {}, carry: {}, strays: 0, missed: [], win: Math.min(0.32, 0.45 * spb),
      // wait mode: p is the position in beats (count-in is negative); it stops at each unplayed group
      wait: store.wait && !demo, p: -beats, floor: -beats, last: c.currentTime, held: false, slip: {}, slips: 0, prev: null,
    };
    drawCtrl(); drawCoach(); drawStage();
    raf = requestAnimationFrame(frame);
  }
  function stop(quiet) {
    cancelAnimationFrame(raf);
    if (!run) return;
    run = null; kb.targets([]); lastTg = '';
    hidePlayhead(root.querySelector('.staff'));
    if (!quiet) { drawCtrl(); drawCoach(); drawStage(); }
  }
  function frame() {
    if (!run) return;
    const now = audio.now();
    let local, changed = false, over = false;
    if (run.wait) {
      const dt = Math.min(0.6, Math.max(0, now - run.last)); run.last = now;
      const pend = nextGroup(), lim = pend ? pend[0].pos - run.base : run.len;
      let p = run.p + dt / run.spb;
      if (run.p < run.floor) p += (run.floor - run.p) * Math.min(1, dt * 12); // glide to a note played early
      run.p = Math.min(p, lim); run.held = !!pend && run.p >= lim;
      // clicks and the other hand follow the line, so they pause while it waits
      while (run.click <= run.p + 1e-6) { if (run.click < 0 || S.metro) audio.click(0, ((run.click % beats) + beats) % beats === 0); run.click++; }
      if (!audio.mic.on) while (run.ai < run.acc.length && run.acc[run.ai].pos - run.base <= run.p + 1e-6) { const n = run.acc[run.ai++]; audio.note(n.midi, 0, n.d * run.spb * 0.95, 0.4); }
      local = run.p; over = !pend && run.p >= run.len - 1e-6;
    } else {
      const bp = (now - run.t0) / run.spb;
      while (run.t0 + run.click * run.spb < now + 0.12) {
        if (run.click < 0 || (S.metro && !run.demo)) audio.click(run.t0 + run.click * run.spb, ((run.click % beats) + beats) % beats === 0);
        run.click++;
      }
      if (!audio.mic.on || run.demo) while (run.acc.length) {
        if (run.ai >= run.acc.length) { if (run.demo || !(S.loop || S.drill)) break; run.ai = 0; run.ap++; }
        const n = run.acc[run.ai], when = tOf(n, run.ap);
        if (when > now + 0.12) break;
        audio.note(n.midi, when, n.d * run.spb * 0.95, run.demo ? 0.75 : 0.4); run.ai++;
      }
      // Misses are held until the pass ends: a pass with nothing played at all pauses instead of counting.
      for (const n of run.exp) if (!run.res[n.id] && now > tOf(n) + run.win) { run.res[n.id] = { st: 'miss' }; run.missed.push(n); changed = true; }
      local = bp - dispPass() * run.len;
      over = run.demo ? bp >= run.len : bp >= (run.pass + 1) * run.len + run.win / run.spb;
    }
    // Key lights: full light only once a note is due (the line or the block has reached it);
    // in the sheet view the next note gets a faint hint so the hand can prepare.
    let tg, soon = [];
    if (run.demo) tg = run.acc.filter(n => n.pos - run.base <= local && local < n.pos - run.base + n.d);
    else {
      const res = shownRes(), pend = run.exp.filter(n => !res[n.id]), first = pend.length ? pend.filter(n => n.pos === pend[0].pos) : [];
      const due = first.length && first[0].pos - run.base <= local + LEAD / run.spb;
      tg = due ? first : []; if (!due && store.view === 'sheet') soon = first;
    }
    const key = tg.map(n => n.id).join() + '|' + soon.map(n => n.id).join();
    if (key !== lastTg) { lastTg = key; kb.targets(tg, soon); }
    if (local < 0) setCue(String(Math.ceil(-local)), true);
    else if (run.wait && run.held) setCue(t('Your turn') + ' — ' + [...new Set(tg.map(n => nn(n.midi, false, piece.sharps)))].join(' · '), false);
    else setCue('', false);
    if (pendingStop) { const p = pendingStop; pendingStop = null; strictStop(p); return; }
    if (changed) refresh();
    if (store.view === 'sheet') {
      const svg = root.querySelector('.staff'), line = movePlayhead(svg, layout, run.base + Math.max(0, local));
      if (line !== lastLine && svg) { lastLine = line; $('stage').scrollTop = line * layout.sysH * (svg.clientWidth / layout.W) - 8; }
    } else placeFall();
    if (over) endPass();
    if (run) raf = requestAnimationFrame(frame);
  }
  function record(bar, st, n, r) {
    const b = ses.perBar[bar] ??= { n: 0, ok: 0, issues: [] };
    b.n++; ses.judged++;
    if (st === 'ok') { b.ok++; ses.okN++; ses.right++; S.cleanRow++; }
    else {
      S.cleanRow = 0;
      if (st === 'late' || st === 'early') ses.right++;
      b.issues.push({ type: st, h: n?.h, beat: n ? Math.floor(n.beat) : 0, played: r.played, want: n?.midi });
    }
    if (r.ms != null) ses.deltas.push(r.ms);
    if (st === 'wrong' || st === 'miss') {
      ses.slips[bar] = (ses.slips[bar] || 0) + 1;
      if (store.mode === 'strict' && !S.drill && ses.slips[bar] >= 2) pendingStop = { bar, n };
    }
    if (st !== 'ok') S.coach = coachFor(bar, st, n, r);
    else if (S.cleanRow && S.cleanRow % 8 === 0) S.coach = { h: t('That is the pulse — keep it.'), d: t('{0} clean notes in a row.', S.cleanRow) };
  }
  function coachFor(bar, st, n, r) {
    if (!n) return { h: t('Eyes on bar {0}.', bar + 1), d: t('An extra {0} slipped in. Play only what is written.', nn(r.played, false, piece.sharps)) };
    const name = nn(n.midi, false, piece.sharps), same = all.filter(x => x.h === n.h), prev = same[same.indexOf(n) - 1];
    if (st === 'late') {
      const thumb = n.f === 1 && prev?.f >= 3;
      return { h: thumb ? t('Let the thumb travel early.') : t('Prepare the note before the beat.'),
        d: t('The {0} in bar {1} landed {2} ms late.', name, bar + 1, r.ms) + ' ' + (thumb ? t('Start passing the thumb under while finger {0} is still down.', prev.f) : t('Have the finger resting on the key before it is due.')) };
    }
    if (st === 'early') return { h: t('Wait for the beat.'), d: t('The {0} in bar {1} came {2} ms early.', name, bar + 1, -r.ms) + ' ' + t('Count the bar aloud and let the metronome lead.') };
    if (st === 'wrong') return { h: t('Eyes on bar {0}.', bar + 1), d: t('You played {0} where {1} is written.', nn(r.played, false, piece.sharps), name) + ' ' + t('Find the key before you need it.') };
    return { h: t('A note went missing.'), d: t('The {0} in bar {1} was not played.', name, bar + 1) + ' ' + t('Slow down rather than skip.') };
  }
  function onDown(m, vel, src) {
    if (src !== 'mic' && store.sound) audio.note(m, 0, 0.5, vel);
    ses.take.push({ m, t: (Date.now() - ses.start) / 1000 });
    if (!run || run.demo) { kb.press(m, 'on'); return; }
    if (run.wait) onDownWait(m, vel, src); else onDownTempo(m, vel, src);
    if (pendingStop) { const p = pendingStop; pendingStop = null; strictStop(p); return; }
    refresh();
  }
  // Wait mode: only the notes the line is waiting for count. A wrong key marks the note red and the line keeps waiting.
  function onDownWait(m, vel, src) {
    const pend = nextGroup(), mic = src === 'mic';
    let hit = pend?.find(n => n.midi === m);
    if (!hit && mic && pend) hit = pend.find(n => n.midi < 48 && n.midi + 12 === m); // low notes: a mic often hears only the octave
    if (hit) {
      // through a mic an octave doubling sounds like one note, so it counts for both
      for (const n of mic ? pend.filter(x => (x.midi - hit.midi) % 12 === 0) : [hit]) {
        const fixed = run.slip[n.id] != null; delete run.slip[n.id];
        run.res[n.id] = { st: 'ok', fixed };
        if (!fixed) record(n.bar, 'ok', n, {});
        if (src === 'midi') ses.vel[n.h].push(vel);
      }
      if (pend.every(n => run.res[n.id])) { run.floor = hit.pos - run.base; run.prev = pend; }
      kb.press(m, 'ok');
      return;
    }
    if (mic && overtone(m, [...(pend || []), ...(run.prev || [])])) return; // an overtone or a ringing note, not a wrong key
    kb.press(m, 'bad');
    const near = pend?.filter(n => run.slip[n.id] == null).sort((a, b) => Math.abs(a.midi - m) - Math.abs(b.midi - m))[0];
    if (near) { run.slip[near.id] = m; run.slips++; record(near.bar, 'wrong', near, { played: m }); }
  }
  function onDownTempo(m, vel, src) {
    const now = audio.now() - (src === 'mic' ? 0.07 : 0), bp = (now - run.t0) / run.spb;
    const find = (pass, taken) => {
      let best = null;
      for (const n of run.exp) {
        if (taken[n.id] || n.midi !== m) continue;
        const dt = now - tOf(n, pass);
        if (Math.abs(dt) <= run.win && (!best || Math.abs(dt) < Math.abs(best.dt))) best = { n, dt };
      }
      return best;
    };
    let best = find(run.pass, run.res), into = run.res;
    if (!best && (S.loop || S.drill)) { best = find(run.pass + 1, run.carry); into = run.carry; }
    if (best) {
      const ms = Math.round(best.dt * 1000), st = Math.abs(ms) <= TOL ? 'ok' : ms > 0 ? 'late' : 'early', r = { st, ms };
      into[best.n.id] = r; record(best.n.bar, st, best.n, r);
      kb.press(m, st === 'ok' ? 'ok' : 'on');
      if (src === 'midi') ses.vel[best.n.h].push(vel);
    } else {
      kb.press(m, 'bad');
      let near = null, fixing = false;
      for (const n of run.exp) {
        const dt = Math.abs(now - tOf(n));
        if (dt > run.win) continue;
        if (run.res[n.id]) { if (n.midi === m && run.res[n.id].st === 'wrong') fixing = true; continue; }
        if (!near || dt < near.dt) near = { n, dt };
      }
      if (src === 'mic' && overtone(m, run.exp.filter(n => Math.abs(now - tOf(n)) <= run.win * 1.5))) return;
      if (near) { const r = { st: 'wrong', played: m }; run.res[near.n.id] = r; record(near.n.bar, 'wrong', near.n, r); }
      else if (!fixing && bp > -0.25) { run.strays++; record(Math.min(S.to - 1, S.from + Math.floor((Math.max(0, bp) % run.len) / beats)), 'wrong', null, { played: m }); }
    }
  }
  function endPass() {
    if (run.demo) { stop(); return; }
    let clean;
    if (run.wait) clean = run.exp.length > 0 && run.slips === 0;
    else {
      if (run.exp.every(n => run.res[n.id]?.st === 'miss') && !run.strays) {
        S.coach = { h: t('Paused.'), d: t('Nothing heard for a whole pass. Press play when you are ready.') };
        stop(); return;
      }
      run.missed.forEach(n => record(n.bar, 'miss', n, {})); run.missed = [];
      const sts = run.exp.map(n => run.res[n.id]?.st);
      clean = run.strays === 0 && sts.every(s => s === 'ok' || s === 'late' || s === 'early') && sts.filter(s => s === 'ok').length >= sts.length * 0.8;
    }
    let restart = false;
    if (clean) {
      S.reps++;
      if (run.bpm >= ses.cleanTempo) { ses.cleanTempo = run.bpm; ses.earned = { from: S.from + 1, to: S.to, bpm: run.bpm }; }
      if (S.pct === 100 && S.hands === 'both') {
        const set = new Set(store.mastered[piece.id] || []);
        for (let b = S.from; b < S.to; b++) set.add(b);
        store.mastered[piece.id] = [...set]; save();
      }
    } else S.reps = 0;
    const d = S.drill;
    if (d) {
      if (clean && (d.step >= 3 || S.reps >= 3)) {
        S.reps = 0;
        if (d.step >= 3) { S.drill = null; S.loop = d.saved.loop; S.coach = { h: t('Back in the flow.'), d: t('Bar {0} held at full tempo. Carry on.', d.bar + 1) }; drawTop(); drawCtrl(); }
        else { d.step++; applyDrill(); restart = true; }
      }
    } else if (S.reps >= 3 && S.pct < 100) {
      S.pct += 10; S.reps = 0; store.ramp[piece.id] = S.pct; save(); restart = true;
      S.coach = { h: t('Three clean — the tempo climbs.'), d: t('Now at {0}% of the goal tempo. Same care, a little faster.', S.pct) };
    } else if (S.reps >= 3 && S.pct === 100) {
      S.coach = { h: t('Learned.'), d: t('Three clean repetitions at full tempo. These bars are yours.') };
    }
    if (restart) { start(); drawTop(); return; }
    if (!S.loop && !S.drill) { finish(true); return; }
    run.pass++; run.res = run.carry; run.carry = {}; run.strays = 0;
    if (run.wait) Object.assign(run, { res: {}, slip: {}, slips: 0, p: 0, floor: 0, click: 0, ai: 0, prev: null });
    refresh();
  }

  /* ---------- strict teacher ---------- */
  function strictStop({ bar, n }) {
    stop(true);
    const hand = n?.h || 'R', name = n ? nn(n.midi, false, piece.sharps) : null;
    ses.slips[bar] = 0;
    S.drill = {
      bar, hand, step: 0, saved: { from: S.from, to: S.to, hands: S.hands, pct: S.pct, loop: S.loop },
      why: name ? t('The {0} slipped twice.', name) : t('Bar {0} slipped twice.', bar + 1),
      steps: [
        { label: `${handName(hand)} · 60%`, hands: hand, pct: 60 }, { label: `${t('Hands together')} · 60%`, hands: 'both', pct: 60 },
        { label: `${t('Hands together')} · 80%`, hands: 'both', pct: 80 }, { label: t('Back into bars {0}–{1} · full tempo', S.from + 1, S.to), back: true, hands: 'both', pct: 100 },
      ],
    };
    S.reps = 0; applyDrill(); redraw();
  }
  function applyDrill() {
    const d = S.drill, s = d.steps[d.step];
    S.from = s.back ? d.saved.from : d.bar; S.to = s.back ? d.saved.to : d.bar + 1;
    S.hands = s.hands; S.pct = s.pct; S.loop = true;
  }
  function leaveDrill() {
    const d = S.drill; if (!d) return;
    Object.assign(S, d.saved); S.drill = null; S.reps = 0;
  }

  /* ---------- session end ---------- */
  function finish(nav) {
    stop(true);
    if (done) return; done = true;
    if (ses.judged < 4) { if (nav) { toast(t('Nothing played yet — no report to write.')); go('#/today'); } return; }
    const bars = Object.keys(ses.perBar).map(Number).sort((a, b) => a - b), perBar = {}, weak = [];
    for (const b of bars) {
      const pb = ses.perBar[b], clean = Math.round(100 * pb.ok / pb.n);
      perBar[b] = clean;
      if (clean < 85 && pb.issues.length) {
        const cnt = {}; pb.issues.forEach(i => { cnt[i.type] = (cnt[i.type] || 0) + (i.type === 'wrong' ? 1.5 : 1); });
        const top = Object.keys(cnt).sort((a, c) => cnt[c] - cnt[a])[0];
        weak.push({ bar: b, clean, ...pb.issues.find(i => i.type === top) });
      }
    }
    weak.sort((a, b) => a.clean - b.clean);
    const rec = {
      id: ses.start, day: dkey(), piece: piece.id, title: piece.title, from: bars[0], to: bars[bars.length - 1], nbars: nb, sharps: piece.sharps,
      minutes: Math.max(1, Math.round((Date.now() - ses.start) / 60000)), accuracy: Math.round(100 * ses.right / ses.judged),
      spread: Math.round(avg(ses.deltas.map(Math.abs))), mean: Math.round(avg(ses.deltas)), cleanTempo: ses.cleanTempo, goal: piece.tempo,
      perBar, deltas: ses.deltas.slice(-600), weak: weak.slice(0, 4), earned: ses.earned, take: ses.take.slice(-400),
    };
    store.sessions.push(rec); store.sessions = store.sessions.slice(-120);
    store.xp += ses.okN;
    if (prm.plan != null && store.plan?.date === dkey()) store.plan.done[+prm.plan] = 1;
    save();
    if (nav) go('#/progress?s=' + rec.id);
  }

  /* ---------- wiring ---------- */
  const acts = {
    back: () => { finish(false); go('#/today'); },
    view: b => { store.view = b.dataset.v; save(); redraw(); },
    mode: b => { store.mode = b.dataset.v; save(); if (S.drill && store.mode !== 'strict') leaveDrill(); redraw(); },
    mic: async () => { await toggleMic(); drawTop(); },
    play: () => { run ? stop() : start(); },
    hear: () => start(true),
    pct: b => { S.pct = +b.dataset.v; S.reps = 0; store.ramp[piece.id] = S.pct; save(); const was = run; stop(true); drawTop(); drawCtrl(); drawCoach(); if (was && !was.demo) start(); },
    hands: b => { S.hands = b.dataset.v; S.reps = 0; const was = run; stop(true); redraw(); if (was && !was.demo) start(); },
    loop: () => { S.loop = !S.loop; drawCtrl(); },
    metro: () => { S.metro = !S.metro; drawCtrl(); },
    wait: () => { store.wait = !store.wait; save(); S.reps = 0; const was = run; stop(true); redraw(); if (was && !was.demo) start(); },
    fing: () => { store.fingering = !store.fingering; save(); drawCtrl(); drawStage(); },
    end: () => finish(true),
    skip: () => {
      const d = S.drill, w = new Set(store.weak[piece.id] || []); w.add(d.bar); store.weak[piece.id] = [...w]; save();
      stop(true); leaveDrill(); S.coach = { h: t('Set aside for tomorrow.'), d: t("Bar {0} is on tomorrow's weak-bars list.", d.bar + 1) }; redraw();
    },
  };
  root.onclick = e => { const b = e.target.closest('[data-act]'); if (b) acts[b.dataset.act]?.(b); };
  const off = input.on((type, m, vel, src) => { if (type === 'up') kb.release(m); else onDown(m, vel, src); });
  input.changed = drawTop;
  redraw();
  return () => { finish(false); off(); kb.destroy(); input.changed = null; };
}
