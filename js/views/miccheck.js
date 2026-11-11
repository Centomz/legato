// Mic check: tries each way of opening the microphone, keeps the one that hears the piano best,
// then shows live level and recognised notes so you can see the whole chain working.
import { store, save, t, nn, input } from '../core.js';
import * as audio from '../audio.js';

export const VERSION = 5;
const LABEL = {
  'raw-after': 'Raw sound · engine started after the mic',
  'voice-after': 'iPad voice processing · engine started after the mic',
  'voice-before': 'iPad voice processing · engine started before the mic',
  'raw-before': 'Raw sound · engine started before the mic',
};
const TRY_MS = 3000, HEARD = 0.004;

export function render(root) {
  let h = null, timer = null, dead = false;
  root.innerHTML = `<div class="page">
    <p class="eyebrow">${t('Mic check')} · v${VERSION}</p>
    <h1 class="display">${t('Can Legato hear your piano?')}</h1>
    <p class="lede">${t('Press the button and allow the microphone. Then keep playing notes, loudly and steadily, for about 12 seconds while it tries four ways of listening.')}</p>
    <div class="row"><button class="btn primary big" id="go">${t('Start the check')}</button></div>
    <p class="lede" id="msg"></p>
    <table class="tbl"><tbody id="ways"></tbody></table>
    <table class="tbl"><tbody id="live"></tbody></table>
    <div class="meter" id="meter"><i></i></div>
  </div>`;
  const $ = id => root.querySelector('#' + id), msg = s => { $('msg').textContent = s; };
  function row(tb, k, label, val, ok) {
    let tr = tb.querySelector(`[data-k="${k}"]`);
    if (!tr) { tr = document.createElement('tr'); tr.dataset.k = k; tr.innerHTML = '<td></td><td></td>'; tb.append(tr); }
    tr.firstChild.textContent = label; tr.lastChild.textContent = val;
    tr.lastChild.style.color = ok == null ? '' : ok ? 'var(--green)' : 'var(--red)';
  }
  const rmsOf = buf => { let s = 0; for (const x of buf) s += x * x; return Math.sqrt(s / buf.length); };
  const lvl = v => (v * 1000).toFixed(1);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) msg(t('This page cannot use a microphone here (it needs https).'));

  $('go').onclick = async () => {
    stopAll(); $('ways').innerHTML = ''; $('live').innerHTML = '';
    if (audio.mic.on) { audio.stopMic(); input.changed?.(); } // the app's own mic would compete with the test
    $('go').disabled = true;
    const results = [];
    for (const [i, way] of audio.MIC_WAYS.entries()) {
      if (dead) return;
      msg(t('Keep playing… way {0} of {1}', i + 1, audio.MIC_WAYS.length));
      row($('ways'), way.id, `${i + 1}. ${t(LABEL[way.id])}`, t('listening…'));
      let next;
      // Open the next way before closing the previous one, so the iPad keeps capturing throughout.
      try { next = await audio.openMic(way.id, true); }
      catch (e) { row($('ways'), way.id, `${i + 1}. ${t(LABEL[way.id])}`, `${e.name}`, false); continue; }
      h?.close(); h = next;
      const buf = new Float32Array(h.an.fftSize); let loud = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < TRY_MS && !dead) {
        h.an.getFloatTimeDomainData(buf); loud = Math.max(loud, rmsOf(buf));
        $('meter').firstChild.style.width = Math.min(100, rmsOf(buf) * 2500) + '%';
        await wait(40);
      }
      results.push({ id: way.id, loud, state: h.c.state });
      row($('ways'), way.id, `${i + 1}. ${t(LABEL[way.id])}`, `${t('loudest')} ${lvl(loud)} · ${h.c.state}`, loud > HEARD);
    }
    h?.close(); h = null;
    $('go').disabled = false;
    const best = results.sort((a, b) => b.loud - a.loud)[0];
    if (!best || best.loud <= HEARD) {
      msg(t('None of the four ways heard sound. Check that no other app is using the microphone, that nothing covers it, and try again.'));
      return;
    }
    store.micWay = best.id; save();
    msg(t('Legato will now listen with way {0}. Play notes or chords to see them recognised below, then turn on Mic in the sidebar for your lessons.', audio.MIC_WAYS.findIndex(w => w.id === best.id) + 1));
    try { h = await audio.openMic(best.id, true); } catch { return; }
    // The live part runs the same listener as the lessons, so what shows here is what a lesson hears.
    const held = new Set(); let lines = [], lastOn = 0;
    const show = () => row($('live'), 'pitch', t('Notes recognised'), lines.length ? lines.slice(-6).join('   ·   ') : t('none yet — play a note or a chord'), lines.length ? true : null);
    show();
    const stopL = audio.listen(h, m => {
      const now = performance.now();
      // notes that start within 150 ms of each other are shown together, as one chord
      if (now - lastOn < 150 && lines.length) lines[lines.length - 1] += ' + ' + nn(m, true); else lines.push(nn(m, true));
      lastOn = now; held.add(m); show();
    }, m => held.delete(m), rms => {
      $('meter').firstChild.style.width = Math.min(100, rms * 2500) + '%';
      row($('live'), 'level', t('Sound reaching the app'), `${t('now')} ${lvl(rms)}`, null);
    });
    const hh = h; h = { close() { stopL(); hh.close(); } };
  };
  function stopAll() { clearInterval(timer); timer = null; h?.close(); h = null; }
  return () => { dead = true; stopAll(); };
}
