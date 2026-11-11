// Studio: record a take (notes land on the staff as you play), review the transcription, edit the score.
import { store, save, t, esc, nn, icon, q, input, go, toast, dkey, fmtDate, toggleMic, connectMidi, download } from '../core.js';
import { toSeq, detectKey, KEYS, chordsOf, flatten, barsOf, sumBeats, writeMidi, midiToStep, stepToMidi, spell } from '../music.js';
import { renderStaff, movePlayhead, hidePlayhead, hit } from '../staff.js';
import { Keyboard } from '../keyboard.js';
import * as audio from '../audio.js';

const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const keyOf = p => KEYS.find(k => k.sharps === p.sharps && !!k.minor === !!p.minor) || KEYS[0];

function estimateTempo(events) {
  const on = events.map(e => e.t).sort((a, b) => a - b), ioi = [];
  for (let i = 1; i < on.length; i++) if (on[i] - on[i - 1] > 0.15) ioi.push(on[i] - on[i - 1]);
  if (ioi.length < 3) return null;
  ioi.sort((a, b) => a - b);
  let bpm = 60 / ioi[Math.floor(ioi.length / 2)];
  while (bpm > 138) bpm /= 2; while (bpm < 56) bpm *= 2;
  return Math.round(bpm);
}
// A take's raw events → a written piece, using the take's clean-up options and any resolved doubts.
function written(take) {
  const o = take.opts, bps = o.bpm / 60, key = KEYS.find(k => k.id === o.key) || KEYS[0];
  const first = Math.min(...take.events.map(e => e.t));
  const notes = take.events.map((e, k) => { const f = take.fixes?.[k] || {}; return { k, midi: f.midi ?? e.m, start: f.start ?? (e.t - first) * bps, dur: Math.max(0.2, (e.d || 0.3) * bps) }; });
  return { id: 'take', title: take.title, tempo: o.bpm, sharps: key.sharps, minor: key.minor, beats: 4, notes,
    R: toSeq(notes.filter(n => n.midi >= o.split), o.grid), L: toSeq(notes.filter(n => n.midi < o.split), o.grid) };
}
const locate = (p, k) => { for (const h of ['R', 'L']) { let pos = 0; for (let i = 0; i < p[h].length; i++) { if (p[h][i].src?.includes(k)) return { h, i, pos }; pos += p[h][i].d; } } return null; };
function playPiece(p, fromBeat = 0) {
  const spb = 60 / p.tempo, t0 = audio.now() + 0.12;
  for (const n of flatten(p)) if (!n.rest && n.pos >= fromBeat) audio.note(n.midi, t0 + (n.pos - fromBeat) * spb, n.d * spb * 0.95, n.v === 'p' ? 0.4 : n.v === 'f' ? 1 : 0.7);
  return { t0, spb, end: t0 + (Math.max(sumBeats(p.R), sumBeats(p.L)) - fromBeat) * spb };
}

/* ================= Record ================= */
export function renderRecord(root, prm) {
  const R = { on: false, t0: 0, events: [], open: {}, levels: [], bpm: 92, fixed: false, click: false, nextClick: 0, taps: [], title: t('Untitled sketch') };
  let timer = 0, tick = 0;
  root.innerHTML = `<div class="page studio">
    <div class="between wrap"><div><p class="eyebrow">${t('Studio · new take')}</p><h1 class="display" id="title" contenteditable="true" spellcheck="false">${esc(R.title)}</h1></div>
      <div class="chipsrow" id="chips"></div></div>
    <div class="recrow"><span class="rec" id="clock"><i></i>0:00</span><div class="wave" id="wave"></div></div>
    <h2 class="caps">${t('What I hear')}</h2><div class="roll"><svg id="roll" viewBox="0 0 1000 110" preserveAspectRatio="none"></svg></div>
    <h2 class="caps">${t("What I'm writing")}</h2><div id="staff" class="sheet live"></div>
    <p class="muted small">${t('Ringed notes are still settling — they firm up a beat after you play them.')}</p>
    <div class="between wrap ctrlrow"><div class="row" id="ctrl"></div><div class="seg" id="src"></div></div>
    <div id="kb"></div>
    <div id="lists"></div></div>`;
  const $ = id => root.querySelector('#' + id);
  const kb = Keyboard($('kb'), { lo: 48, hi: 84 });
  const now = () => (performance.now() - R.t0) / 1000;

  function drawCtrl() {
    $('ctrl').innerHTML = `<button class="btn primary big" data-act="rec">${icon(R.on ? 'stop' : 'mic')}${R.on ? t('Stop & review') : t('Start recording')}</button>
      <button class="btn ${R.click ? 'on' : ''}" data-act="click" aria-pressed="${R.click}">${icon('timer')}${t('Click track')}</button>
      <button class="btn" data-act="tap">${t('Tap tempo')}</button>`;
    $('src').innerHTML = `<button data-act="mic" class="${audio.mic.on ? 'on' : ''}">${icon('mic')}${t('Microphone')}</button><button data-act="midi" class="${audio.midi.inputs ? 'on' : ''}">${icon('midi')}MIDI</button>`;
  }
  function drawChips() {
    const key = detectKey(R.events.map(e => e.m));
    $('chips').innerHTML = R.events.length ? `<span class="tag">${t(key.name)}</span><span class="tag">4/4</span><span class="tag">${q} ${R.fixed ? '=' : '≈'} ${R.bpm}</span><span class="muted">${R.fixed ? t('tempo set by you') : t('detected so far')}</span>`
      : `<span class="tag">${q} = ${R.bpm}</span><span class="muted">${t('key and tempo appear as you play')}</span>`;
  }
  function drawLive() {
    const tn = R.on ? now() : (R.events.length ? Math.max(...R.events.map(e => e.t + (e.d || 0))) : 0);
    $('clock').innerHTML = `<i class="${R.on ? 'live' : ''}"></i>${mmss(tn)}`;
    const lv = R.levels.slice(-120);
    $('wave').innerHTML = lv.map(v => `<i style="height:${Math.max(4, v * 100)}%"></i>`).join('') + '<b></b>';
    let s = '';
    for (const e of R.events) {
      const x = 660 - (tn - e.t) * 60, w = Math.max(6, ((e.d ?? (tn - e.t)) * 60));
      if (x + w < 0) continue;
      s += `<rect x="${x}" y="${Math.max(4, Math.min(100, 104 - (e.m - 36) * 1.7))}" width="${w}" height="5" rx="1"/>`;
    }
    $('roll').innerHTML = s + '<line x1="660" x2="660" y1="0" y2="110"/>';
  }
  function drawStaff() {
    if (!R.events.length) { $('staff').innerHTML = renderStaff({ beats: 4, sharps: 0, R: [], L: [] }, { staves: ['R'], to: 4, width: 1060, top: 40, bottom: 40, barNumbers: false }).svg; return; }
    const key = detectKey(R.events.map(e => e.m));
    const p = written({ title: '', events: R.events, opts: { bpm: R.bpm, key: key.id, split: 60, grid: 0.5 } });
    const nb = barsOf(p), st = {}, tn = now(), fresh = new Set();
    R.events.forEach((e, k) => { if (R.on && tn - e.t < 60 / R.bpm) fresh.add(k); });
    for (const h of ['R', 'L']) p[h].forEach((ev, i) => { if (ev.src?.some(k => fresh.has(k))) ev.m.forEach((_, j) => { st[h + i + '_' + j] = { cls: 'st-ghost' }; }); });
    $('staff').innerHTML = renderStaff(p, { staves: p.L.length ? ['R', 'L'] : ['R'], from: Math.max(0, nb - 4), to: Math.max(4, nb), width: 1060, top: 40, bottom: 40, gap: 110, state: st, barNumbers: false }).svg;
  }
  function drawLists() {
    const takes = [...store.takes].reverse(), pcs = [...store.pieces].filter(p => !p.imported).reverse();
    $('lists').innerHTML = `<div class="two even"><section><h2 class="caps rule">${t('Your takes')}</h2>
      ${takes.length ? `<ul class="list">${takes.map(k => `<li><a href="#/studio/review?take=${k.id}"><strong>${esc(k.title)}</strong><small>${fmtDate(k.id, { day: 'numeric', month: 'long' })} · ${mmss(k.dur)} · ${k.events.length} ${t('notes')}</small></a><button class="mini" data-deltake="${k.id}" title="${t('Delete')}">${icon('trash')}</button></li>`).join('')}</ul>` : `<p class="muted">${t('No takes yet. Press record and play anything.')}</p>`}</section>
      <section><h2 class="caps rule">${t('Your scores')}</h2>
      ${pcs.length ? `<ul class="list">${pcs.map(p => `<li><a href="#/studio/edit?piece=${p.id}"><strong>${esc(p.title)}</strong><small>${t(keyOf(p).name)} · ${t('{0} bars', barsOf(p))}</small></a></li>`).join('')}</ul>` : `<p class="muted">${t('Scores you write appear here.')}</p>`}
      <div class="row"><a class="btn" href="#/studio/edit">${icon('pencil')}${t('New blank score')}</a></div></section></div>`;
  }
  function loop() {
    tick++;
    const tn = now();
    let lv = audio.mic.on ? Math.min(1, audio.mic.rms * 9) : 0;
    if (!audio.mic.on) for (const e of R.events) lv = Math.max(lv, 0.85 * Math.exp(-(tn - e.t) * (e.d == null ? 0.8 : 2.6)));
    R.levels.push(lv * (0.75 + Math.random() * 0.25));
    if (R.click) while (R.nextClick < audio.now() + 0.2) { audio.click(R.nextClick, false); R.nextClick += 60 / R.bpm; }
    if (!R.fixed && tick % 6 === 0) { const b = estimateTempo(R.events); if (b) R.bpm = b; }
    drawLive();
    if (tick % 5 === 0) { drawStaff(); drawChips(); }
  }
  function startRec() {
    audio.ctx();
    Object.assign(R, { on: true, t0: performance.now(), events: [], open: {}, levels: [], nextClick: audio.now() + 0.05 });
    timer = setInterval(loop, 80); drawCtrl(); drawChips(); drawStaff();
  }
  function stopRec() {
    clearInterval(timer); R.on = false;
    const tn = now();
    R.events.forEach(e => { if (e.d == null) e.d = Math.max(0.1, tn - e.t); });
    if (!R.events.length) { toast(t('Nothing was played — the take is empty.')); drawCtrl(); drawLive(); return; }
    const key = detectKey(R.events.map(e => e.m));
    const take = { id: Date.now(), day: dkey(), title: $('title').textContent.trim() || t('Untitled sketch'), dur: tn, events: R.events, fixes: {},
      opts: { bpm: R.bpm, key: key.id, split: 60, grid: 0.5 } };
    store.takes.push(take); store.takes = store.takes.slice(-30);
    if (prm.plan != null && store.plan?.date === dkey()) store.plan.done[+prm.plan] = 1;
    save(); go('#/studio/review?take=' + take.id);
  }
  const acts = {
    rec: () => (R.on ? stopRec() : startRec()),
    click: () => { R.click = !R.click; R.fixed = R.fixed || R.click; R.nextClick = audio.now() + 0.05; if (!R.on && R.click) toast(t('The click starts with the recording.')); drawCtrl(); drawChips(); },
    tap: () => {
      const n = performance.now(); R.taps = R.taps.filter(x => n - x < 2500); R.taps.push(n); audio.click(0, true);
      if (R.taps.length >= 3) { R.bpm = Math.round(60000 * (R.taps.length - 1) / (n - R.taps[0])); R.fixed = true; drawChips(); }
    },
    mic: async () => { await toggleMic(); drawCtrl(); },
    midi: async () => { await connectMidi(); drawCtrl(); },
  };
  root.onclick = e => {
    const b = e.target.closest('[data-act]'), del = e.target.closest('[data-deltake]');
    if (b) acts[b.dataset.act]?.();
    if (del && confirm(t('Delete this take? This cannot be undone.'))) { store.takes = store.takes.filter(k => String(k.id) !== del.dataset.deltake); save(); drawLists(); }
  };
  const off = input.on((type, m, vel, src, cents) => {
    if (type === 'up') { kb.release(m); const e = R.open[m]; if (e && R.on) { e.d = Math.max(0.08, now() - e.t); delete R.open[m]; } return; }
    kb.press(m); if (src !== 'mic') audio.note(m, 0, 0.5, vel);
    if (R.on) { const e = { m, t: now(), d: null, c: cents || 0 }; if (src === 'mic') e.t = Math.max(0, e.t - 0.07); R.events.push(e); R.open[m] = e; }
  });
  drawCtrl(); drawChips(); drawLive(); drawStaff(); drawLists();
  return () => { clearInterval(timer); off(); kb.destroy(); };
}

/* ================= Review ================= */
export function renderReview(root, prm) {
  const take = store.takes.find(k => String(k.id) === prm.take) || store.takes[store.takes.length - 1];
  if (!take) { go('#/studio'); return; }
  take.fixes ||= {};
  let mode = 'written', playing = 0, raf = 0, di = 0;
  const beatLabel = pos => { const b = pos % 4, w = Math.floor(b) + 1, f = b - Math.floor(b); return w + (f === 0.5 ? ' &' : f ? ` +${f}` : ''); };

  function doubts(p) {
    const g = take.opts.grid, pitch = [], time = [];
    p.notes.forEach(n => {
      const e = take.events[n.k], f = take.fixes[n.k] || {};
      if (f.midi == null && Math.abs(e.c || 0) > 30) pitch.push({ k: n.k, kind: 'pitch', opts: [e.m, e.m + Math.sign(e.c)] });
      else if (f.start == null && g >= 0.25) { const x = n.start / g, fr = x - Math.floor(x); if (Math.abs(fr - 0.5) < 0.1) time.push({ k: n.k, kind: 'time', opts: [Math.floor(x) * g, Math.ceil(x) * g], w: Math.abs(fr - 0.5) }); }
    });
    return [...pitch, ...time.sort((a, b) => a.w - b.w).slice(0, 4)];
  }
  function draw() {
    const p = written(take), ds = doubts(p), d = ds[di % Math.max(1, ds.length)], loc = d && locate(p, d.k);
    const nb = barsOf(p), o = take.opts;
    const r = renderStaff(p, { staves: p.L.length ? ['R', 'L'] : ['R'], to: Math.max(4, Math.ceil(nb / 4) * 4), width: 860, selected: loc, barNumbers: true });
    let card = '';
    if (d && loc) {
      const e = take.events[d.k];
      card = `<div class="doubt"><p class="eyebrow">${t('Bar {0}', Math.floor(loc.pos / 4) + 1)} · ${t('beat {0}', beatLabel(loc.pos))}</p>
        <p>${d.kind === 'pitch' ? t('I heard something between {0} and {1}. Which did you mean?', nn(d.opts[0], false, p.sharps), nn(d.opts[1], false, p.sharps)) : t('This {0} fell between two places in the bar. Where did you mean it?', nn(e.m, false, p.sharps))}</p>
        <div class="row tight">${d.opts.map((v, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-fix="${v}">${d.kind === 'pitch' ? nn(v, false, p.sharps) : t('Beat {0}', beatLabel(v))}</button>`).join('')}
        ${d.kind === 'pitch' ? `<button class="link" data-act="both">${icon('volume')}${t('Play both')}</button>` : ''}</div></div>`;
    }
    root.innerHTML = `<div class="page review"><div class="two wide">
      <section>
        <p class="eyebrow">${t('Take')} · ${fmtDate(take.id, { day: 'numeric', month: 'long' })} · ${mmss(take.dur)}</p>
        <h1 class="display">${ds.length ? t('{0} notes heard, {1} to check', take.events.length, ds.length) : t('{0} notes heard, all settled', take.events.length)}</h1>
        <input class="titlein" id="tt" value="${esc(take.title)}" aria-label="${t('Title')}">
        <div class="sheet">${r.svg}</div>${card}
        <div class="between wrap playrow"><div class="row tight"><button class="btn sq" data-act="play" aria-label="${t('Play')}">${icon('play')}</button>
          <button class="link ${mode === 'raw' ? 'on' : ''}" data-act="raw">${t('Play my recording')}</button><span class="muted">·</span>
          <button class="link ${mode === 'written' ? 'on' : ''}" data-act="writ">${t('Play the written score')}</button></div>
          ${ds.length > 1 ? `<button class="link" data-act="next">${t('Next doubtful note')} →</button>` : ''}</div>
      </section>
      <aside class="panel">
        <h2 class="caps">${t('Clean-up')}</h2>
        <label class="fld">${t('Snap rhythm to')}<div class="seg">${[[0.125, t('Off')], [0.5, t('Eighths')], [0.25, t('Sixteenths')]].map(([g, l]) => `<button data-grid="${g}" class="${o.grid === g ? 'on' : ''}">${l}</button>`).join('')}</div></label>
        <label class="fld">${t('Key signature')}<select id="key">${KEYS.map(k => `<option value="${k.id}" ${k.id === o.key ? 'selected' : ''}>${t(k.name)}</option>`).join('')}</select></label>
        <label class="fld">${t('Split the hands at')}<select id="split">${[48, 55, 60, 64, 67].map(m => `<option value="${m}" ${m === o.split ? 'selected' : ''}>${nn(m, true)}${m === 60 ? ' — ' + t('middle C') : ''}</option>`).join('')}</select></label>
        <label class="fld">${t('Tempo')}<span class="inl">${q} = <input type="number" id="bpm" min="40" max="200" value="${o.bpm}"></span></label>
        <span class="grow"></span>
        <button class="btn primary" data-act="edit">${icon('pencil')}${t('Open in the editor')}</button>
        <button class="btn" data-act="midi">${icon('download')}${t('Export MIDI')}</button>
        <a class="link" href="#/studio">${t('Back to the Studio')}</a>
      </aside></div></div>`;
    const $ = id => root.querySelector('#' + id);
    $('key').onchange = e => { o.key = e.target.value; save(); draw(); };
    $('split').onchange = e => { o.split = +e.target.value; save(); draw(); };
    $('bpm').onchange = e => { o.bpm = Math.max(40, Math.min(200, +e.target.value || 92)); take.fixes = Object.fromEntries(Object.entries(take.fixes).filter(([, f]) => f.midi != null).map(([k, f]) => [k, { midi: f.midi }])); save(); draw(); };
    $('tt').onchange = e => { take.title = e.target.value.trim() || take.title; save(); };
    root.onclick = e => {
      const fx = e.target.closest('[data-fix]'), gr = e.target.closest('[data-grid]'), a = e.target.closest('[data-act]')?.dataset.act;
      if (fx && d) { take.fixes[d.k] = { ...take.fixes[d.k], [d.kind === 'pitch' ? 'midi' : 'start']: +fx.dataset.fix }; save(); return draw(); }
      if (gr) { o.grid = +gr.dataset.grid; save(); return draw(); }
      if (a === 'both' && d) { audio.note(d.opts[0], 0, 0.6); audio.note(d.opts[1], audio.now() + 0.7, 0.6); }
      if (a === 'next') { di++; draw(); }
      if (a === 'raw' || a === 'writ') { mode = a === 'raw' ? 'raw' : 'written'; draw(); }
      if (a === 'play') {
        if (audio.now() < playing) return;
        if (mode === 'raw') { const t0 = audio.now() + 0.1, f = Math.min(...take.events.map(e => e.t)); take.events.forEach(e => audio.note(e.m, t0 + e.t - f, e.d || 0.3)); playing = t0 + take.dur - f; }
        else {
          const pl = playPiece(p); playing = pl.end;
          const svg = root.querySelector('.staff'), step = () => { const pos = (audio.now() - pl.t0) / pl.spb; if (audio.now() > pl.end || !svg.isConnected) return hidePlayhead(svg); movePlayhead(svg, r.layout, Math.max(0, pos)); raf = requestAnimationFrame(step); };
          step();
        }
      }
      if (a === 'midi') download(writeMidi(p), take.title + '.mid');
      if (a === 'edit') {
        const strip = evs => evs.map(({ m, d }) => ({ m, d }));
        const pc = { id: 'u' + Date.now(), title: take.title, composer: t('You · from the Studio'), user: true, tempo: p.tempo, sharps: p.sharps, minor: p.minor, beats: 4, R: strip(p.R), L: strip(p.L) };
        store.pieces.push(pc); save(); go('#/studio/edit?piece=' + pc.id);
      }
    };
  }
  draw();
  return () => cancelAnimationFrame(raf);
}

/* ================= Editor ================= */
const DUR = [[4, '1'], [2, '½'], [1, '¼'], [0.5, '⅛'], [0.25, '1⁄16']];
const DNAME = { 4: 'whole note', 3: 'dotted half note', 2: 'half note', 1.5: 'dotted quarter note', 1: 'quarter note', 0.75: 'dotted eighth note', 0.5: 'eighth note', 0.375: 'dotted sixteenth note', 0.25: 'sixteenth note' };
const tempoWord = b => b < 60 ? 'Largo' : b < 76 ? 'Adagio' : b < 108 ? 'Andante' : b < 120 ? 'Moderato' : b < 156 ? 'Allegro' : 'Presto';

export function renderEditor(root, prm) {
  let p = store.pieces.find(x => x.id === prm.piece);
  if (!p) {
    p = { id: 'u' + Date.now(), title: t('Untitled'), composer: t('You · from the Studio'), user: true, tempo: 92, sharps: 0, minor: 1, beats: 4, R: [], L: [] };
    store.pieces.push(p); save(); history.replaceState(null, '', '#/studio/edit?piece=' + p.id);
  }
  const E = { dur: 1, dot: false, hand: 'R', sel: null, write: false, hist: [], lastAdd: 0 };
  let layout, raf = 0;
  const snap = () => { E.hist.push(JSON.stringify({ R: p.R, L: p.L })); if (E.hist.length > 60) E.hist.shift(); };
  const commit = () => { save(); draw(); };
  const selEv = () => E.sel && p[E.sel.h][E.sel.i];
  const curDur = () => E.dur * (E.dot ? 1.5 : 1);
  function add(h, ms) {
    const n = performance.now(), last = p[h][p[h].length - 1];
    if (ms.length === 1 && last && last.m.length && n - E.lastAdd < 70 && E.hand === h) { if (!last.m.includes(ms[0])) { last.m.push(ms[0]); last.m.sort((a, b) => a - b); } }
    else { snap(); p[h].push({ m: ms, d: curDur() }); }
    E.lastAdd = n; E.hand = h; E.sel = { h, i: p[h].length - 1 }; commit();
  }
  function posOf(sel) { let pos = 0; for (let i = 0; i < sel.i; i++) pos += p[sel.h][i].d; return pos; }
  function ideas() {
    const key = keyOf(p), mel = flatten(p).filter(n => !n.rest && n.h === 'R'), nb = mel.length ? mel[mel.length - 1].bar : 0;
    const pcs = mel.filter(n => n.bar >= nb - 1).map(n => n.midi % 12);
    return chordsOf(key).map(c => ({ ...c, score: pcs.filter(x => c.pcs.includes(x)).length + (c.pc === key.tonic ? 0.5 : 0) })).sort((a, b) => b.score - a.score).slice(0, 5);
  }
  function draw() {
    const nb = barsOf(p), ev = selEv(), filled = Math.ceil(Math.max(sumBeats(p.R), sumBeats(p.L)) / 4 + 0.01);
    const r = renderStaff(p, { to: Math.max(8, Math.ceil((nb + 1) / 4) * 4), width: 800, selected: E.sel, fingering: true, barNumbers: false });
    layout = r.layout;
    let selHtml = `<p class="muted">${t('Click a staff to write a note. Click a note to select it; ↑ ↓ change its pitch, ⌫ deletes it.')}</p>`;
    if (ev) {
      const pos = posOf(E.sel), beat = pos % 4;
      selHtml = `<h3>${ev.m.length ? ev.m.map(m => nn(m, true, p.sharps)).join(' + ') : t('Rest')} · ${t(DNAME[ev.d] || 'note')}</h3>
        <p class="muted small">${t('Bar {0}', Math.floor(pos / 4) + 1)}, ${t('beat {0}', +(beat + 1).toFixed(2))} · ${E.sel.h === 'R' ? t('right hand') : t('left hand')}</p>
        ${ev.m.length ? `<label class="fld">${t('Fingering')}<div class="seg">${[1, 2, 3, 4, 5].map(f => `<button data-f="${f}" class="${ev.f === f ? 'on' : ''}">${f}</button>`).join('')}</div></label>` : ''}`;
    }
    root.innerHTML = `<div class="editor">
      <div class="tools">
        <div class="seg">${DUR.map(([d, l]) => `<button data-dur="${d}" class="${E.dur === d ? 'on' : ''}" title="${t(DNAME[d])}">${l}</button>`).join('')}</div>
        <div class="seg"><button data-act="rest">${t('Rest')}</button><button data-act="dot" class="${E.dot ? 'on' : ''}">${t('Dot')}</button></div>
        <div class="seg"><button data-acc="1">♯</button><button data-acc="-1">♭</button><button data-acc="0">♮</button></div>
        <div class="seg">${['p', 'mf', 'f'].map(v => `<button data-dyn="${v}" class="dynb ${ev?.v === v ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div class="seg"><button data-hand="R" class="${E.hand === 'R' ? 'on' : ''}">${t('Right')}</button><button data-hand="L" class="${E.hand === 'L' ? 'on' : ''}">${t('Left')}</button></div>
        <button class="btn sq" data-act="undo" aria-label="${t('Undo')}" title="${t('Undo')}">${icon('undo')}</button>
        <span class="grow"></span>
        <button class="btn ${E.write ? 'primary' : ''}" data-act="write" aria-pressed="${E.write}">${icon('mic')}${E.write ? t('Writing as you play') : t('Play to write')}</button>
      </div>
      <div class="ed-main">
        <div class="desk"><div class="paper">
          <input class="ptitle" id="pt" value="${esc(p.title)}" aria-label="${t('Title')}">
          <p class="ptempo"><i>${tempoWord(p.tempo)},</i> ${q} = <input type="number" id="pb" min="40" max="200" value="${p.tempo}" aria-label="${t('Tempo')}"></p>
          <div class="sheet" id="sheet">${r.svg}</div></div></div>
        <aside class="panel">
          <h2 class="caps">${t('Selected')}</h2>${selHtml}
          <hr><p class="eyebrow">${t('Ideas for bar {0}', filled + 1)}</p><p>${t("Chords that fit what you've written:")}</p>
          <div class="row tight wrap">${ideas().map(c => `<button class="chip gold" data-chord="${c.midis.join(',')}">${nn(c.midis[0], false, p.sharps)}${c.q}</button>`).join('')}</div>
          <p class="muted small">${t('Click to hear · Shift-click to write it in the left hand')}</p>
          <label class="fld">${t('Key signature')}<select id="pk">${KEYS.map(k => `<option value="${k.id}" ${k === keyOf(p) ? 'selected' : ''}>${t(k.name)}</option>`).join('')}</select></label>
          <span class="grow"></span>
          <button class="btn" data-act="play">${icon('play')}${t('Play from bar 1')}</button>
          <button class="btn" data-act="export">${icon('download')}${t('Export score')}</button>
          <a class="link" href="#/lesson?piece=${p.id}">${t('Practise this piece as a lesson')}</a>
        </aside></div>
      <div id="kb"></div></div>`;
    kb?.destroy(); kb = Keyboard(root.querySelector('#kb'), { lo: 36, hi: 84 });
    const $ = id => root.querySelector('#' + id);
    $('pt').onchange = e => { p.title = e.target.value.trim() || p.title; save(); };
    $('pb').onchange = e => { p.tempo = Math.max(40, Math.min(200, +e.target.value || 92)); commit(); };
    $('pk').onchange = e => { const k = KEYS.find(x => x.id === e.target.value); p.sharps = k.sharps; p.minor = k.minor ? 1 : 0; commit(); };
    $('sheet').onclick = e => {
      const g = e.target.closest('.n[data-h]');
      if (g) { E.sel = { h: g.dataset.h, i: +g.dataset.i }; E.hand = E.sel.h; const ev2 = selEv(); ev2?.m.forEach(m => audio.note(m, 0, 0.4)); return draw(); }
      const svg = $('sheet').querySelector('svg'), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const c = pt.matrixTransform(svg.getScreenCTM().inverse()), hh = hit(layout, c.x, c.y), midi = stepToMidi(hh.step, p.sharps);
      if (midi < 28 || midi > 100) return;
      audio.note(midi, 0, 0.4); add(hh.h, [midi]);
    };
  }
  let kb = null;
  root.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const ev = selEv(), ds = b.dataset;
    if (ds.dur) { E.dur = +ds.dur; if (ev) { snap(); ev.d = curDur(); } return commit(); }
    if (ds.acc && ev?.m.length) { snap(); ev.m = ev.m.map(m => ds.acc === '0' ? m - spell(m, p.sharps).acc : m + +ds.acc); ev.m.forEach(m => audio.note(m, 0, 0.4)); return commit(); }
    if (ds.dyn && ev) { snap(); if (ev.v === ds.dyn) delete ev.v; else ev.v = ds.dyn; return commit(); }
    if (ds.hand) { E.hand = ds.hand; E.sel = null; return draw(); }
    if (ds.f && ev) { snap(); if (ev.f === +ds.f) delete ev.f; else ev.f = +ds.f; return commit(); }
    if (ds.chord) { const ms = ds.chord.split(',').map(Number); ms.forEach(m => audio.note(m, 0, 0.9, 0.6)); if (e.shiftKey) add('L', ms); return; }
    const a = ds.act;
    if (a === 'rest') { snap(); p[E.hand].push({ m: [], d: curDur() }); E.sel = { h: E.hand, i: p[E.hand].length - 1 }; commit(); }
    if (a === 'dot') { E.dot = !E.dot; if (ev) { snap(); ev.d = curDur(); } commit(); }
    if (a === 'undo') { const h = E.hist.pop(); if (h) { Object.assign(p, JSON.parse(h)); E.sel = null; commit(); } }
    if (a === 'write') { E.write = !E.write; draw(); }
    if (a === 'export') download(writeMidi(p), p.title + '.mid');
    if (a === 'play') {
      cancelAnimationFrame(raf);
      const pl = playPiece(p), svg = root.querySelector('.staff');
      const step = () => { if (audio.now() > pl.end || !svg.isConnected) return hidePlayhead(svg); movePlayhead(svg, layout, Math.max(0, (audio.now() - pl.t0) / pl.spb)); raf = requestAnimationFrame(step); };
      step();
    }
  };
  const onKey = e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const ev = selEv();
    if ((e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault(); const s = E.sel || (p[E.hand].length ? { h: E.hand, i: p[E.hand].length - 1 } : null); if (!s) return;
      snap(); p[s.h].splice(s.i, 1); E.sel = p[s.h].length ? { h: s.h, i: Math.max(0, s.i - 1) } : null; return commit();
    }
    if (!ev) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); if (!ev.m.length) return; snap(); const dir = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 7 : 1);
      ev.m = ev.m.map(m => stepToMidi(midiToStep(m, p.sharps) + dir, p.sharps)); ev.m.forEach(m => audio.note(m, 0, 0.4)); commit();
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const i = E.sel.i + (e.key === 'ArrowRight' ? 1 : -1); if (i >= 0 && i < p[E.sel.h].length) { E.sel = { h: E.sel.h, i }; draw(); } }
  };
  addEventListener('keydown', onKey);
  const off = input.on((type, m, vel, src) => {
    if (type === 'up') { kb?.release(m); return; }
    kb?.press(m); if (src !== 'mic') audio.note(m, 0, 0.5, vel);
    if (E.write) add(E.hand, [m]);
  });
  draw();
  return () => { removeEventListener('keydown', onKey); off(); kb?.destroy(); cancelAnimationFrame(raf); };
}
