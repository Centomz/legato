// Today: the daily plan in four movements, streak, accuracy and level.
import { store, save, t, icon, q, go, dkey, addDays, fmtDate, practiceDays, streak, getPiece, ROMAN } from '../core.js';
import { barsOf } from '../music.js';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty'];
const words = n => store.lang === 'fr' || n > 69 ? String(n) : n < 20 ? WORDS[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + WORDS[n % 10] : '');

// Group bars into a short run: [6,7,11] -> [6,7]
function firstRun(bars) {
  const s = [...bars].sort((a, b) => a - b); if (!s.length) return null;
  let end = s[0]; for (const b of s.slice(1)) { if (b === end + 1) end = b; else break; }
  return [s[0], end];
}
export function buildPlan() {
  const today = dkey();
  if (store.plan?.date !== today) { store.plan = { date: today, done: [0, 0, 0, 0], min: [4, 8, 8, 5] }; save(); }
  const minuet = getPiece('minuet'), nb = barsOf(minuet), mastered = new Set(store.mastered.minuet || []);
  const last = [...store.sessions].reverse().find(s => s.piece === 'minuet' && s.weak?.length);
  const weakBars = [...new Set([...(store.weak.minuet || []), ...(last ? last.weak.map(w => w.bar) : [])])].filter(b => !mastered.has(b));
  const run = firstRun(weakBars), fromReport = !!run;
  const [wa, wb] = run || [0, 3];
  let first = 0; while (first < nb && mastered.has(first)) first++;
  if (first >= nb) first = 0;
  const na = Math.floor(first / 8) * 8, nz = Math.min(nb, na + 8);
  const yesterday = last && last.day === dkey(addDays(new Date(), -1));
  return [
    { title: t('Warm-up'), sub: `${t('G major scale, two octaves, hands together at')} ${q} = 72`, href: '#/lesson?piece=gscale&from=1&to=8&pct=100&plan=0' },
    { title: t('Weak bars'), tag: fromReport ? (yesterday ? t("from yesterday's report") : t('from your last report')) : null,
      sub: fromReport ? t('Minuet in G, bars {0}–{1} · loop from 60% to full tempo, three clean repetitions each step', wa + 1, wb + 1) : t('No weak bars on file yet · Minuet in G, bars 1–4 as a slow loop from 60%'),
      href: `#/lesson?piece=minuet&from=${wa + 1}&to=${wb + 1}&pct=60&plan=1` },
    { title: t('New material'), sub: t('Minuet in G, bars {0}–{1} · hands separate first, then together', na + 1, nz), href: `#/lesson?piece=minuet&from=${na + 1}&to=${nz}&hands=R&pct=60&plan=2` },
    { title: t('Play & record'), sub: t('Improvise over G – Em – C – D. The take is transcribed to your Studio.'), href: '#/studio?plan=3' },
  ];
}

export function accuracyByDay(n = 14) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = dkey(addDays(new Date(), -i)), ss = store.sessions.filter(s => s.day === k);
    out.push(ss.length ? Math.round(ss.reduce((a, s) => a + s.accuracy, 0) / ss.length) : null);
  }
  return out;
}

export function render(root) {
  const items = buildPlan(), P = store.plan, total = P.min.reduce((a, b) => a + b, 0);
  const next = P.done.findIndex(d => !d), days = practiceDays(), st = streak();
  const h = new Date().getHours(), when = h < 12 ? t('This morning') : h < 18 ? t('This afternoon') : t('Tonight');
  const acc = accuracyByDay(), have = acc.filter(v => v != null);
  const monday = addDays(new Date(), -((new Date().getDay() + 6) % 7));
  const level = 4 + Math.floor(store.xp / 900), into = store.xp % 900;
  let editing = false;

  function draw() {
    root.innerHTML = `<div class="page two">
      <section>
        <p class="eyebrow">${fmtDate(new Date())} · ${t('Day {0}', Math.max(1, st + (days.has(dkey()) ? 0 : 1)))}</p>
        <h1 class="display">${when}: ${t('{0} minutes,', words(total))}<br>${t('four movements.')}</h1>
        <h2 class="caps rule">${t("Today's practice")}</h2>
        <ol class="plan">${items.map((it, i) => `<li class="${P.done[i] ? 'done' : ''}">
          <button class="num" data-act="toggle" data-i="${i}" title="${t('Mark as done')}">${ROMAN[i]}</button>
          <a href="${it.href}"><strong>${it.title}</strong>${P.done[i] ? ` <span class="ok">· ${t('done')}</span>` : ''}${it.tag ? `<span class="tag">${it.tag}</span>` : ''}<span class="sub">${it.sub}</span></a>
          ${editing ? `<input type="number" min="1" max="30" value="${P.min[i]}" data-i="${i}" aria-label="${t('Minutes')}">` : `<span class="min">${P.min[i]} min</span>`}</li>`).join('')}</ol>
        <div class="row">
          ${next >= 0 ? `<a class="btn primary big" href="${items[next].href}">${icon('play')}${next === 0 ? t('Begin at I') : t('Resume at {0}', ROMAN[next])}</a>`
            : `<a class="btn primary big" href="#/progress">${icon('chart')}${t('All four done — read the report')}</a>`}
          <button class="btn" data-act="short">${total > 10 ? t('Shorten to 10 min') : t('Back to 25 min')}</button>
          <button class="link" data-act="edit">${editing ? t('Done editing') : t('Edit plan')}</button>
        </div>
      </section>
      <aside>
        <div class="streak"><span class="big">${icon('flame')}${st === 1 ? t('1 day') : t('{0} days', st)}</span>
          <div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => { const d = addDays(monday, i), k = dkey(d); return `<span><i class="${days.has(k) ? 'f' : ''} ${k === dkey() ? 'now' : ''}"></i>${fmtDate(d, { weekday: 'narrow' })}</span>`; }).join('')}</div></div>
        <div class="card"><p class="eyebrow">${t('Accuracy · last 14 days')}</p>
          <div class="bars">${acc.map(v => `<i style="height:${v == null ? 2 : Math.max(8, v - 30) / 0.7}%" class="${v == null ? 'none' : ''}" title="${v == null ? '' : v + '%'}"></i>`).join('')}</div>
          <div class="between small"><span class="muted">${have.length ? have[0] + '%' : t('No sessions yet')}</span><span>${have.length ? (acc[13] != null ? t('{0}% today', acc[13]) : t('{0}% last', have[have.length - 1])) : ''}</span></div></div>
        <div class="card"><p class="eyebrow">${t('Level {0} · Returning hands', level)}</p>
          <div class="meter"><i style="width:${into / 9}%"></i></div>
          <p class="muted small">${t('{0} of 900 to Level {1}', into, level + 1)}</p></div>
        <div class="principle"><p class="eyebrow">${t('Practice principle')}</p><h3>${t('Slow is the short road.')}</h3>
          <p>${t("If a passage isn't clean at half tempo, it isn't learned. Every new passage here starts at 60% and only climbs after three clean repetitions.")}</p></div>
      </aside></div>`;
    root.querySelectorAll('.plan input').forEach(inp => { inp.onchange = () => { P.min[+inp.dataset.i] = Math.max(1, Math.min(30, +inp.value || 1)); save(); }; });
  }
  root.onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'toggle') { P.done[+b.dataset.i] = P.done[+b.dataset.i] ? 0 : 1; save(); render(root); }
    if (b.dataset.act === 'short') { P.min = total > 10 ? [2, 3, 3, 2] : [4, 8, 8, 5]; save(); render(root); }
    if (b.dataset.act === 'edit') { if (editing) { render(root); return; } editing = true; draw(); }
  };
  draw();
}
