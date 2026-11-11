// Session report: accuracy, timing spread, bar-by-bar map, weak bars to loop, journal line.
import { store, save, t, esc, nn, icon, q, fmtDate, toast, dkey } from '../core.js';
import * as audio from '../audio.js';

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
function what(w, sharps) {
  const hand = w.h === 'L' ? t('Left hand') : t('Right hand'), beat = t(ORD[w.beat] || 'first');
  if (w.type === 'wrong') return w.want != null ? t('{0} played for {1}', nn(w.played, false, sharps), nn(w.want, false, sharps)) : t('Extra notes slipped in');
  if (w.type === 'miss') return t('{0} drops notes on the {1} beat', hand, beat);
  if (w.type === 'early') return t('{0} rushes the {1} beat', hand, beat);
  return t('{0} arrives late on the {1} beat', hand, beat);
}

export function render(root, prm) {
  const list = store.sessions;
  if (!list.length) {
    root.innerHTML = `<div class="page"><p class="eyebrow">${t('Session report')}</p><h1 class="display">${t('Nothing to report yet.')}</h1>
      <p class="lede">${t('Play a lesson and end the session: the report shows right notes, timing spread, the cleanest tempo and the bars to loop tomorrow.')}</p>
      <div class="row"><a class="btn primary big" href="#/lesson?piece=minuet&from=1&to=4">${icon('play')}${t('Start with the Minuet, bars 1–4')}</a></div></div>`;
    return;
  }
  const s = list.find(x => String(x.id) === prm.s) || list[list.length - 1];
  const mastered = (store.mastered[s.piece] || []).length;
  const bars = []; for (let b = s.from; b <= s.to; b++) bars.push(b);
  // timing histogram: 11 bins from −165 to +165 ms
  const bins = new Array(11).fill(0);
  s.deltas.forEach(d => { bins[Math.max(0, Math.min(10, Math.floor((d + 165) / 30)))]++; });
  const mx = Math.max(1, ...bins);
  const lean = s.mean > 12 ? t('mostly late') : s.mean < -12 ? t('mostly early') : t('centred on the beat');
  const weakBars = s.weak.map(w => w.bar);
  const entry = store.journal.find(j => j.session === s.id);
  let stopTake = null;

  root.innerHTML = `<div class="page">
    <div class="between"><p class="eyebrow">${t('Session report')} · ${s.minutes} min · ${fmtDate(s.id)}</p>
      ${list.length > 1 ? `<select id="pick" aria-label="${t('Earlier sessions')}">${[...list].reverse().map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${fmtDate(x.id, { day: 'numeric', month: 'short' })} · ${esc(x.title)} · ${x.accuracy}%</option>`).join('')}</select>` : ''}</div>
    <h1 class="display">${esc(s.title)}, ${t('bars {0}–{1}', s.from + 1, s.to + 1)}</h1>
    <div class="kpis">
      <div><b>${s.accuracy}%</b><span>${t('right notes')}</span></div>
      <div><b>±${s.spread} ms</b><span>${t('timing spread')}, ${lean}</span></div>
      <div><b>${s.cleanTempo ? `${q} = ${s.cleanTempo}` : '—'}</b><span>${t('cleanest tempo · goal {0}', s.goal)}</span></div>
      <div><b>${mastered} / ${s.nbars}</b><span>${t('bars mastered')}</span></div>
    </div>
    <div class="two">
      <section>
        <h2 class="caps">${t('Bar by bar')}</h2>
        <div class="barmap">${bars.map(b => { const c = s.perBar[b]; return `<a href="#/lesson?piece=${s.piece}&from=${b + 1}&to=${b + 1}" class="${c == null ? '' : c >= 90 ? 'ok' : c >= 75 ? 'off' : 'bad'}" title="${c == null ? '' : c + '%'}">${b + 1}</a>`; }).join('')}</div>
        ${s.weak.length ? `<table class="tbl"><thead><tr><th>${t('Weak bar')}</th><th>${t('What happened')}</th><th>${t('Clean')}</th><th></th></tr></thead><tbody>
          ${s.weak.map(w => `<tr><td>${t('Bar {0}', w.bar + 1)}</td><td>${esc(what(w, s.sharps))}</td><td>${w.clean}%</td><td><a class="link" href="#/lesson?piece=${s.piece}&from=${w.bar + 1}&to=${w.bar + 1}&pct=60">${icon('loop')}${t('Loop it')}</a></td></tr>`).join('')}</tbody></table>`
          : `<p class="lede">${t('No weak bars in this session — every bar was at least 85% clean.')}</p>`}
        <div class="row">
          ${s.weak.length ? `<button class="btn primary" data-act="add">${t("Add bars {0} to tomorrow's plan", weakBars.map(b => b + 1).join(', '))}</button>` : ''}
          <button class="btn" data-act="listen">${icon('play')}${t('Listen back to the take')}</button>
        </div>
      </section>
      <aside>
        <h2 class="caps">${t('Timing')}</h2>
        <div class="hist">${bins.map((v, i) => `<i class="${i === 5 ? 'mid' : ''}" style="height:${Math.max(3, 100 * v / mx)}%"></i>`).join('')}</div>
        <div class="between small muted"><span>${t('early')}</span><span>${t('on the beat')}</span><span>${t('late')}</span></div>
        ${s.earned ? `<div class="earned"><span class="medal">${icon('award')}</span><div><p class="eyebrow">${t('Earned')}</p><strong>${t('A clean pass')}</strong>
          <p class="muted small">${t('Bars {0}–{1} without a slip at', s.earned.from, s.earned.to)} ${q} = ${s.earned.bpm}</p></div></div>` : ''}
        <label class="fld">${t('Journal — how did it feel?')}<textarea id="jr" rows="3" placeholder="${t("A line for tomorrow's you")}">${esc(entry?.text || '')}</textarea></label>
      </aside>
    </div></div>`;

  const pick = root.querySelector('#pick'); if (pick) pick.onchange = () => { location.hash = '#/progress?s=' + pick.value; };
  root.querySelector('#jr').onchange = e => {
    const text = e.target.value.trim(), i = store.journal.findIndex(j => j.session === s.id);
    if (i >= 0) { if (text) store.journal[i].text = text; else store.journal.splice(i, 1); }
    else if (text) store.journal.push({ id: Date.now(), day: s.day, session: s.id, text, kind: 'after' });
    save(); toast(t('Saved to the journal.'));
  };
  root.onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'add') {
      store.weak[s.piece] = [...new Set([...(store.weak[s.piece] || []), ...weakBars])]; save();
      toast(t("Added to tomorrow's weak bars."));
    }
    if (b.dataset.act === 'listen') {
      if (!s.take?.length) return toast(t('No take was kept for this session.'));
      let when = audio.now() + 0.1, prev = s.take[0].t; // long silences are shortened to two seconds
      s.take.forEach(n => { when += Math.min(2, n.t - prev); prev = n.t; audio.note(n.m, when, 0.45, 0.7); });
      toast(t('Playing your take…'));
    }
  };
  return () => stopTake?.();
}
export { dkey };
