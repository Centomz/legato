// Shell and router.
import { store, save, t, icon, input, streak, connectMidi, toggleMic } from './core.js';
import * as audio from './audio.js';
import { render as today } from './views/today.js';
import { render as lesson } from './views/lesson.js';
import { render as progress } from './views/progress.js';
import { renderPath, renderLibrary, renderJournal } from './views/pathlib.js';
import { renderRecord, renderReview, renderEditor } from './views/studio.js';

const routes = { today, path: renderPath, library: renderLibrary, studio: renderRecord, 'studio/review': renderReview, 'studio/edit': renderEditor, progress, journal: renderJournal, lesson };
const NAV = [['today', 'home', 'Today'], ['path', 'path', 'Path'], ['library', 'library', 'Library'], ['studio', 'mic', 'Studio'], ['progress', 'chart', 'Progress'], ['journal', 'journal', 'Journal']];
const app = document.getElementById('app');
let cleanup = null;

function parse() {
  const h = location.hash.replace(/^#\/?/, '') || 'today', [path, qs] = h.split('?');
  return { path: routes[path] ? path : 'today', prm: Object.fromEntries(new URLSearchParams(qs || '')) };
}
function side(path) {
  const st = streak(), sec = path.split('/')[0];
  return `<aside class="side">
    <a class="logo" href="#/today">Legato<i>.</i></a>
    <nav>${NAV.map(([id, ic, l]) => `<a href="#/${id}" class="${sec === id ? 'on' : ''}" ${sec === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${t(l)}</span></a>`).join('')}</nav>
    <div class="side-foot">
      <p>${icon('flame')}<span>${st === 1 ? t('1-day streak') : t('{0}-day streak', st)}</span></p>
      <p class="inputs">${icon('mic')}<button data-shell="mic" class="${audio.mic.on ? 'on' : ''}">${t('Mic')}</button>·<button data-shell="midi" class="${audio.midi.inputs ? 'on' : ''}">MIDI</button>
        <span class="muted">${audio.mic.on || audio.midi.inputs ? t('ready') : t('off')}</span></p>
      <p class="lang"><button data-shell="en" class="${store.lang === 'en' ? 'on' : ''}">EN</button><button data-shell="fr" class="${store.lang === 'fr' ? 'on' : ''}">FR</button>
        <span class="sep"></span><button data-shell="n-en" class="${store.names === 'en' ? 'on' : ''}">C D E</button><button data-shell="n-sol" class="${store.names === 'sol' ? 'on' : ''}">Do Ré Mi</button></p>
    </div></aside>`;
}
function render() {
  cleanup?.(); cleanup = null;
  const { path, prm } = parse();
  document.documentElement.lang = store.lang;
  input.changed = null;
  if (path === 'lesson') { app.className = 'full'; app.innerHTML = '<main id="view"></main>'; }
  else { app.className = 'shell'; app.innerHTML = side(path) + '<main id="view"></main>'; input.changed = () => { const s = app.querySelector('.side'); if (s) s.outerHTML = side(path); }; }
  const view = app.querySelector('#view');
  view.onclick = null;
  cleanup = routes[path](view, prm) || null;
  scrollTo(0, 0);
}
app.addEventListener('click', async e => {
  const b = e.target.closest('[data-shell]'); if (!b) return;
  const a = b.dataset.shell;
  if (a === 'mic') await toggleMic();
  else if (a === 'midi') await connectMidi();
  else { if (a === 'en' || a === 'fr') store.lang = a; else store.names = a.slice(2); save(); render(); }
});
addEventListener('hashchange', render);
render();
