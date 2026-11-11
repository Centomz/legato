// Sound out (small piano-ish synth, metronome click) and sound in (microphone pitch, Web MIDI).
let ac, master;
export function ctx() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createDynamicsCompressor(); master.connect(ac.destination);
  }
  if (ac.state !== 'running' && ac.state !== 'closed') ac.resume().catch(() => {}); // iOS also has 'interrupted'
  return ac;
}
export const now = () => ctx().currentTime;

export function note(midi, when = 0, dur = 0.5, vel = 0.7) {
  const c = ctx(), t = Math.max(c.currentTime, when || 0), f = 440 * 2 ** ((midi - 69) / 12);
  const g = c.createGain(); g.connect(master);
  const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = c.createGain(); g2.gain.value = 0.22;
  o1.connect(g); o2.connect(g2); g2.connect(g);
  const peak = 0.3 * vel, end = t + Math.max(dur, 0.12);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.setTargetAtTime(peak * 0.3, t + 0.01, 0.25);
  g.gain.setTargetAtTime(0, end, 0.07);
  o1.start(t); o2.start(t); o1.stop(end + 0.6); o2.stop(end + 0.6);
}
export function click(when, accent) {
  const c = ctx(), t = Math.max(c.currentTime, when);
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.value = accent ? 1560 : 1040; o.connect(g); g.connect(master);
  g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
  o.start(t); o.stop(t + 0.06);
}

/* ---------- Microphone: monophonic pitch tracking ---------- */
export const mic = { on: false, rms: 0, error: null };
let micStream, micTimer;
export function pitchOf(buf, sr, floor) {
  const n = buf.length; let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < floor) return { rms, f: 0 };
  const half = n >> 1, c = new Float32Array(half);
  for (let lag = 0; lag < half; lag++) { let s = 0; for (let i = 0; i < half; i++) s += buf[i] * buf[i + lag]; c[lag] = s; }
  let d = 0; while (d < half - 1 && c[d] > c[d + 1]) d++;
  let mx = -1;
  for (let i = d; i < half; i++) if (c[i] > mx) mx = c[i];
  if (mx < c[0] * 0.5) return { rms, f: 0 };
  // Take the first peak that is nearly as strong as the best one: the best one alone is often
  // a multiple of the period, which reads a fading note an octave or two too low.
  let pos = -1;
  for (let i = Math.max(d, 1); i < half - 1; i++) if (c[i] >= mx * 0.9 && c[i] >= c[i - 1] && c[i] >= c[i + 1]) { pos = i; break; }
  if (pos <= 0) return { rms, f: 0 };
  const a = c[pos - 1], b = c[pos], e = c[pos + 1] ?? b, sh = (a + e - 2 * b) ? (a - e) / (2 * (a + e - 2 * b)) : 0;
  return { rms, f: sr / (pos + sh) };
}
/* Ways to open the microphone. Desktop browsers hear well with the raw sound (no voice processing),
   but on iPad Safari some of these give near-silence, depending on whether the audio context exists
   before the mic opens and whether voice processing is on. The mic check tries them all and keeps the best. */
export const MIC_WAYS = [
  { id: 'raw-after', raw: true, after: true },
  { id: 'voice-after', raw: false, after: true },
  { id: 'voice-before', raw: false, after: false },
  { id: 'raw-before', raw: true, after: false },
];
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const defaultWay = () => (IOS ? 'voice-after' : 'raw-before');
export async function openMic(id, separate = false) { // separate: never use the playback context
  const way = MIC_WAYS.find(w => w.id === id) || MIC_WAYS.find(w => w.id === defaultWay());
  let c = way.after ? null : (separate ? new (window.AudioContext || window.webkitAudioContext)() : ctx());
  const stream = await navigator.mediaDevices.getUserMedia({ audio: way.raw ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : true });
  if (way.after) c = new (window.AudioContext || window.webkitAudioContext)(); // while capturing, Safari lets it start
  if (c.state !== 'running') { try { await c.resume(); } catch {} }
  const src = c.createMediaStreamSource(stream), an = c.createAnalyser(), mute = c.createGain();
  // Safari only processes nodes that lead to the speakers, so route the analyser into a silent gain.
  an.fftSize = 2048; mute.gain.value = 0; src.connect(an); an.connect(mute); mute.connect(c.destination);
  const own = c !== ac;
  return { way, c, stream, an, close() { stream.getTracks().forEach(x => x.stop()); [src, an, mute].forEach(n => n.disconnect()); if (own) c.close().catch(() => {}); } };
}
export async function startMic(onDown, onUp, wayId) {
  if (mic.on) return true;
  ctx(); // unlock playback while the tap still counts
  let h;
  try { h = await openMic(wayId); } catch (e) { mic.error = e.name; return false; }
  micStream = h.stream; mic.close = h.close; mic.way = h.way.id;
  const c = h.c, an = h.an;
  const buf = new Float32Array(an.fftSize);
  let cur = null, cand = null, cnt = 0, fired = 0, low = 1, noise = 0.003, prev = 0, gap = 0;
  micTimer = setInterval(() => {
    if (c.state !== 'running') c.resume().catch(() => {});
    an.getFloatTimeDomainData(buf);
    // The gate follows the room: an acoustic piano a metre from the iPad mic is much quieter than a line input.
    const gate = Math.max(0.0025, noise * 2.5), { rms, f } = pitchOf(buf, c.sampleRate, gate);
    if (!f) noise = noise * 0.95 + Math.min(rms, 0.05) * 0.05;
    mic.rms = rms; const last = prev; prev = rms;
    if (!f || f < 60 || f > 2200) {
      // A ringing note can lose its pitch for a frame or two; only let go after ~120 ms or once it has died away.
      if (cur != null && (++gap >= 3 || rms < gate)) { onUp(cur); cur = null; }
      cand = null; cnt = 0; return;
    }
    gap = 0;
    const exact = 69 + 12 * Math.log2(f / 440), m = Math.round(exact);
    if (m === cand) cnt++; else { cand = m; cnt = 1; }
    const t = performance.now();
    low = t - fired < 150 ? Math.max(low, rms) : Math.min(low, rms); // ride up the attack, then follow the decay
    const fresh = m !== cur, again = m === cur && t - fired > 140 && rms > Math.max(0.006, noise * 4) && rms > low * 1.9 && rms > last * 1.6; // a new strike is a sudden jump, not a wobble
    if (cnt >= 2 && (fresh || again)) {
      if (cur != null) onUp(cur);
      cur = m; fired = t; low = rms;
      onDown(m, Math.round((exact - m) * 100));
    }
  }, 40);
  mic.on = true; mic.error = null;
  return true;
}
export function stopMic() {
  clearInterval(micTimer);
  mic.close?.(); mic.close = null;
  mic.on = false; mic.rms = 0;
}

/* ---------- Web MIDI ---------- */
export const midi = { inputs: 0, supported: !!navigator.requestMIDIAccess };
export async function startMidi(onDown, onUp, onChange) {
  if (!midi.supported) return false;
  try {
    const acc = await navigator.requestMIDIAccess();
    const bind = () => {
      midi.inputs = 0;
      acc.inputs.forEach(inp => {
        midi.inputs++;
        inp.onmidimessage = e => {
          const [s, a, b] = e.data, hi = s & 0xf0;
          if (hi === 0x90 && b > 0) onDown(a, b / 127);
          else if (hi === 0x80 || (hi === 0x90 && b === 0)) onUp(a);
        };
      });
      onChange?.();
    };
    acc.onstatechange = bind; bind();
    return true;
  } catch { return false; }
}
