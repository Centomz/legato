// Mic check: walks through each step between the piano and the app and shows where the sound stops.
import { t, nn } from '../core.js';
import * as audio from '../audio.js';

export const VERSION = 3;

export function render(root) {
  let stream, ac, timer, loud = 0, notes = [];
  root.innerHTML = `<div class="page">
    <p class="eyebrow">${t('Mic check')} · v${VERSION}</p>
    <h1 class="display">${t('Can Legato hear your piano?')}</h1>
    <p class="lede">${t('Press the button, allow the microphone, then play single notes slowly. Each line turns green when that step works.')}</p>
    <div class="row"><button class="btn primary big" id="go">${t('Start the check')}</button></div>
    <table class="tbl" id="out"><tbody></tbody></table>
    <div class="meter" id="meter"><i></i></div>
  </div>`;
  const rows = {}, body = root.querySelector('#out tbody');
  function row(k, label, val, ok) {
    if (!rows[k]) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${label}</td><td></td>`; body.append(tr); rows[k] = tr; }
    const td = rows[k].lastChild; td.textContent = val; td.style.color = ok == null ? '' : ok ? 'var(--green)' : 'var(--red)';
  }
  row('https', t('Secure page (needed for the mic)'), window.isSecureContext ? t('yes') : t('no'), window.isSecureContext);
  row('api', t('Browser can use a microphone'), navigator.mediaDevices?.getUserMedia ? t('yes') : t('no'), !!navigator.mediaDevices?.getUserMedia);
  row('app', t('Mic button in the sidebar'), audio.mic.on ? t('on') : t('off — the lessons only listen when it is on'), audio.mic.on);

  root.querySelector('#go').onclick = async () => {
    stop();
    // Make and unlock the sound engine while the tap still counts, before the permission prompt.
    ac = new (window.AudioContext || window.webkitAudioContext)();
    ac.resume().catch(() => {});
    row('perm', t('Microphone allowed'), t('asking…'));
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { row('perm', t('Microphone allowed'), `${t('no')} — ${e.name}: ${e.message}`, false); return; }
    row('perm', t('Microphone allowed'), t('yes'), true);
    const tr = stream.getAudioTracks()[0], st = tr?.getSettings?.() || {};
    row('track', t('Microphone in use'), `${tr?.label || '?'} · ${tr?.readyState}${tr?.muted ? ' · ' + t('muted by the system') : ''}${st.sampleRate ? ' · ' + st.sampleRate + ' Hz' : ''}`, tr?.readyState === 'live' && !tr.muted);
    try { await ac.resume(); } catch {}
    const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(), mute = ac.createGain();
    an.fftSize = 2048; mute.gain.value = 0; src.connect(an); an.connect(mute); mute.connect(ac.destination);
    const buf = new Float32Array(an.fftSize), t0 = ac.currentTime;
    timer = setInterval(() => {
      if (ac.state !== 'running') ac.resume().catch(() => {});
      row('engine', t('Sound engine running'), `${ac.state} · ${ac.sampleRate} Hz · ${(ac.currentTime - t0).toFixed(1)} s`, ac.state === 'running' && ac.currentTime > t0);
      an.getFloatTimeDomainData(buf);
      const { rms, f } = audio.pitchOf(buf, ac.sampleRate, 0.0025);
      loud = Math.max(loud, rms);
      row('level', t('Sound reaching the app'), `${t('now')} ${(rms * 1000).toFixed(1)} · ${t('loudest')} ${(loud * 1000).toFixed(1)}`, loud > 0.004);
      root.querySelector('#meter i').style.width = Math.min(100, rms * 2500) + '%';
      if (f > 60 && f < 2200) {
        const m = Math.round(69 + 12 * Math.log2(f / 440));
        if (notes[notes.length - 1] !== m) { notes.push(m); notes = notes.slice(-8); }
        row('pitch', t('Notes recognised'), `${notes.map(n => nn(n)).join(' · ')}  (${Math.round(f)} Hz)`, true);
      } else if (!rows.pitch) row('pitch', t('Notes recognised'), t('none yet — play one note at a time'), null);
    }, 50);
  };
  function stop() { clearInterval(timer); stream?.getTracks().forEach(x => x.stop()); ac?.close().catch(() => {}); stream = ac = null; }
  return stop;
}
