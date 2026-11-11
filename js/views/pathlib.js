// Path (contents page), Library (pieces within reach) and Journal.
import { store, save, t, esc, icon, go, toast, dkey, fmtDate, getPiece } from '../core.js';
import { barsOf, readMidi, KEYS } from '../music.js';

/* ---------- Path ---------- */
export function renderPath(root) {
  const nb = barsOf(getPiece('minuet')), m = (store.mastered.minuet || []).length, learned = m >= nb;
  const lv = 4 + Math.floor(store.xp / 900), studio = store.pieces.length + store.takes.length;
  const strands = [[t('Technique'), lv, 70], [t('Repertoire'), lv, Math.round(30 + 60 * m / nb)], [t('Reading'), 3, 80], [t('Ear'), 3, 35], [t('Composition'), 2 + (studio > 3 ? 1 : 0), Math.min(95, 30 + studio * 12)]];
  const dots = '<i class="lead"></i>';
  root.innerHTML = `<div class="page two">
    <section>
      <p class="eyebrow">${t('The path · returning player')}</p><h1 class="display">${t('Contents')}</h1>
      <div class="toc">
        <div class="part done"><span>${t('Part')} I</span><h3>${t('Reawakening the hands')}</h3><em class="ok">${icon('check')}${t('{0} of {1}', 4, 4)}</em></div>
        <div class="part cur"><span>${t('Part')} II</span><h3>${t('Reading again')}</h3><em>${t('{0} of {1}', learned ? 2 : 1, 4)}</em></div>
        <ol class="lessons">
          <li><b>5</b><span>${t('Intervals at sight')}</span>${dots}<em class="ok">${icon('check')}</em></li>
          <li class="${learned ? '' : 'cur'}"><b>6</b><a href="#/lesson?piece=minuet">${t('Minuet in G — two voices')}</a>${dots}<em class="${learned ? 'ok' : 'gold'}">${learned ? icon('check') : t('{0} of {1} bars · continue', m, nb)}</em></li>
          <li><b>7</b><a href="#/lesson?piece=minuet&hands=L&from=1&to=8">${t('Left-hand independence')}</a>${dots}<em>${t('Minuet, left hand alone')}</em></li>
          <li><b>8</b><span>${t('The pedal: first legato')}</span>${dots}<em>${icon('lock')}</em></li>
        </ol>
        <div class="part"><span>${t('Part')} III</span><h3>${t('Voicing & touch')}</h3><em>Satie · Schumann</em></div>
        <div class="part"><span>${t('Part')} IV</span><h3>${t('Speed without tension')}</h3><em>${t('Scales · arpeggios · Bach')}</em></div>
        <div class="part"><span>${t('Part')} V</span><h3>${t('Your own music')}</h3><em>${t('Harmony · form · the Studio')}</em></div>
      </div>
      <div class="row"><a class="btn primary big" href="#/lesson?piece=minuet">${icon('play')}${t('Continue lesson 6')}</a>
        <a class="link" href="#/lesson?piece=prelude">${t('Or read the Prelude in C')}</a></div>
    </section>
    <aside>
      <h2 class="caps rule">${t('Five strands')}</h2>
      ${strands.map(([n, l, p]) => `<div class="strand"><div class="between"><span>${n}</span><span class="muted">${t('Level {0}', l)}</span></div><div class="meter thin"><i style="width:${p}%"></i></div></div>`).join('')}
      <p class="body muted">${t('Your ear is a level behind your fingers. Recording yourself in the Studio and listening back is the quickest way to let the strands meet.')}</p>
    </aside></div>`;
}

/* ---------- Library ---------- */
const LIB = [
  { id: 'minuet', title: 'Minuet in G', by: 'Petzold, from the Anna Magdalena notebook', key: 'G major', level: 4, len: '1:40', trains: 'Two voices', era: 'Baroque' },
  { id: 'prelude', title: 'Prelude in C, BWV 846', by: 'J. S. Bach · opening eight bars', key: 'C major', level: 4, len: '0:35', trains: 'Even arpeggios', era: 'Baroque', slow: 1 },
  { id: 'gscale', title: 'G major scale', by: 'Warm-up · two octaves', key: 'G major', level: 3, len: '0:30', trains: 'Thumb crossings', era: 'Technique' },
  { title: 'Gymnopédie No. 1', by: 'Erik Satie', key: 'D major', level: 4, len: '3:20', trains: 'Left-hand leaps, voicing', era: 'Impressionist', slow: 1 },
  { title: 'Prelude in E minor, Op. 28 No. 4', by: 'Frédéric Chopin', key: 'E minor', level: 5, len: '2:20', trains: 'Melody over chords, pedal', era: 'Romantic', slow: 1 },
  { title: 'Träumerei', by: 'Robert Schumann', key: 'F major', level: 5, len: '2:40', trains: 'Inner voices', era: 'Romantic', slow: 1 },
];
const secs = l => { const [a, b] = l.split(':'); return +a * 60 + +b; };
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const FILTERS = [['level', 'Your level ± 1', r => Math.abs(r.level - 4) <= 1], ['Baroque', 'Baroque', r => r.era === 'Baroque'], ['Romantic', 'Romantic', r => r.era === 'Romantic'],
  ['Impressionist', 'Impressionist', r => r.era === 'Impressionist'], ['short', 'Under 2 minutes', r => secs(r.len) < 120], ['slow', 'Slow & quiet', r => r.slow], ['own', 'My own pieces', r => r.own]];

export function renderLibrary(root) {
  let filter = 'level', query = '';
  const rows = () => [...LIB, ...store.pieces.map(p => {
    const nb = barsOf(p), k = KEYS.find(k => k.sharps === p.sharps && !!k.minor === !!p.minor) || KEYS[0];
    return { id: p.id, title: p.title, by: p.imported ? t('Imported score') : t('You · from the Studio'), key: k.name, level: 3, len: mmss(nb * p.beats * 60 / p.tempo), trains: p.imported ? 'Imported' : 'Your own writing', era: 'Own', own: 1, imported: p.imported, nb };
  })];
  const you = r => {
    if (!r.id) return `<span class="muted" title="${t('No score for this piece yet')}">—</span>`;
    if (r.own && !r.imported) return `<span class="gold">${t('Draft · {0} bars', r.nb)}</span>`;
    const nb = r.nb || barsOf(getPiece(r.id)), m = (store.mastered[r.id] || []).length;
    return m >= nb ? `<span class="ok">${t('Learned')}</span>` : m ? `<span class="gold">${t('{0} / {1} bars', m, nb)}</span>` : `<span class="muted">${t('Not started')}</span>`;
  };
  function draw() {
    const f = FILTERS.find(x => x[0] === filter), ql = query.toLowerCase();
    const list = rows().filter(r => (!f || f[2](r)) && (!ql || (r.title + r.by + r.trains + r.era).toLowerCase().includes(ql)));
    root.querySelector('#chips').innerHTML = FILTERS.map(([id, l]) => `<button class="chip ${filter === id ? 'on' : ''}" data-f="${id}">${t(l)}</button>`).join('');
    root.querySelector('#rows').innerHTML = list.length ? list.map(r => `<tr class="${r.id ? 'can' : 'cant'}" data-id="${r.id || ''}">
      <td><span class="thumb ${r.own ? 'own' : ''}">${r.own ? icon('pencil') : ''}</span></td>
      <td><strong>${esc(r.title)}</strong><small>${esc(t(r.by))}</small></td><td>${t(r.key)}</td><td>${r.level}</td><td>${r.len}</td><td>${t(r.trains)}</td>
      <td>${you(r)}${r.own ? ` <button class="mini" data-edit="${r.id}" title="${t('Open in the editor')}">${icon('pencil')}</button><button class="mini" data-del="${r.id}" title="${t('Delete')}">${icon('trash')}</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="7" class="muted empty">${t('Nothing here yet.')}</td></tr>`;
  }
  root.innerHTML = `<div class="page">
    <p class="eyebrow">${t('Library')}</p>
    <div class="between wrap"><h1 class="display">${t('Pieces within reach')}</h1>
      <div class="row tight"><label class="search">${icon('search')}<input id="q" type="search" placeholder="${t('Title, composer, mood')}" aria-label="${t('Search')}"></label>
      <button class="btn" data-act="import">${icon('upload')}${t('Import a score')}</button><input id="file" type="file" accept=".mid,.midi,audio/midi" hidden></div></div>
    <div class="chips" id="chips"></div>
    <div class="scroll-x"><table class="tbl lib"><thead><tr><th></th><th>${t('Piece')}</th><th>${t('Key')}</th><th>${t('Level')}</th><th>${t('Length')}</th><th>${t('Trains')}</th><th>${t('You')}</th></tr></thead><tbody id="rows"></tbody></table></div>
    <p class="muted small">${t('Pieces marked — have no score in Legato yet. Import a MIDI file to add any piece you like.')}</p></div>`;
  root.querySelector('#q').oninput = e => { query = e.target.value; draw(); };
  const file = root.querySelector('#file');
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const p = readMidi(await f.arrayBuffer());
      Object.assign(p, { id: 'u' + Date.now(), title: f.name.replace(/\.midi?$/i, ''), composer: t('Imported score'), user: true, imported: true });
      store.pieces.push(p); save(); filter = 'own'; draw(); toast(t('Imported “{0}”.', p.title));
    } catch (err) { toast(t('Could not read that file: {0}', err.message)); }
    file.value = '';
  };
  root.onclick = e => {
    const c = e.target.closest('[data-f]'), ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), row = e.target.closest('tr[data-id]');
    if (e.target.closest('[data-act="import"]')) return file.click();
    if (c) { filter = filter === c.dataset.f ? '' : c.dataset.f; return draw(); }
    if (ed) return go('#/studio/edit?piece=' + ed.dataset.edit);
    if (del) {
      if (!confirm(t('Delete this piece? This cannot be undone.'))) return;
      store.pieces = store.pieces.filter(p => p.id !== del.dataset.del); save(); return draw();
    }
    if (row) row.dataset.id ? go('#/lesson?piece=' + row.dataset.id) : toast(t('No score for this piece yet — import a MIDI file to add it.'));
  };
  draw();
}

/* ---------- Journal ---------- */
export function renderJournal(root) {
  const today = dkey();
  const draw = () => {
    const list = [...store.journal].sort((a, b) => b.id - a.id);
    root.innerHTML = `<div class="page narrow">
      <p class="eyebrow">${t('Journal')}</p><h1 class="display">${t('A line a day')}</h1>
      <label class="fld">${t('Before you start — one intention for today')}
        <textarea id="int" rows="2" placeholder="${t('e.g. Keep the wrist loose on the thumb crossings')}">${esc(store.intention[today] || '')}</textarea></label>
      <label class="fld">${t('After practice — how did it feel?')}
        <textarea id="new" rows="3" placeholder="${t("A line for tomorrow's you")}"></textarea></label>
      <div class="row"><button class="btn primary" data-act="add">${t('Add to the journal')}</button></div>
      <h2 class="caps rule">${t('Entries')}</h2>
      ${list.length ? list.map(j => `<article class="entry"><p class="eyebrow">${fmtDate(j.id)}</p><blockquote>“${esc(j.text)}”</blockquote>
        <button class="mini" data-del="${j.id}" title="${t('Delete')}">${icon('trash')}</button></article>`).join('') : `<p class="muted">${t('No entries yet. One honest line after each session is enough.')}</p>`}
    </div>`;
    root.querySelector('#int').onchange = e => { store.intention[today] = e.target.value.trim(); save(); toast(t('Intention kept for today.')); };
  };
  root.onclick = e => {
    const del = e.target.closest('[data-del]');
    if (del) { store.journal = store.journal.filter(j => String(j.id) !== del.dataset.del); save(); return draw(); }
    if (e.target.closest('[data-act="add"]')) {
      const text = root.querySelector('#new').value.trim(); if (!text) return;
      store.journal.push({ id: Date.now(), day: today, text, kind: 'after' }); save(); draw();
    }
  };
  draw();
}
