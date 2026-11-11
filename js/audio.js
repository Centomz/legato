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
  return { way, c, stream, an, src, mute, close() { stream.getTracks().forEach(x => x.stop()); [src, an, mute].forEach(n => n.disconnect()); if (own) c.close().catch(() => {}); } };
}
/* ---------- Hearing notes, chords included (see docs/03-chords.md) ---------- */
// Peaks of a dB spectrum between 55 and 5000 Hz, within 20 dB of the strongest, lowest first.
export function peaksOf(db, sr, fftSize) {
  const hz = sr / fftSize, lo = Math.max(2, Math.floor(55 / hz)), hi = Math.min(db.length - 2, Math.ceil(5000 / hz));
  let mx = -Infinity; for (let i = lo; i <= hi; i++) if (db[i] > mx) mx = db[i];
  const thr = Math.max(mx - 20, -90), out = [];
  for (let i = lo; i <= hi; i++) {
    const a = db[i - 1], b = db[i], c = db[i + 1];
    if (b <= thr || b <= a || b < c) continue;
    const sh = (a - 2 * b + c) ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
    out.push({ f: (i + sh) * hz, db: b - 0.25 * (a - c) * sh });
  }
  return out;
}
// Which notes are sounding: peaks from peaksOf, f = the single pitch from pitchOf (0 if none). Returns [{ m, db, cents }].
export function notesOf(peaks, f) {
  if (!peaks.length) return [];
  const near = (target, minDb = -Infinity) => peaks.find(p => Math.abs(p.f - target) < target * 0.03 && p.db >= minDb);
  const top = Math.max(...peaks.map(p => p.db));
  // One note: its fundamental is among the peaks, or (weak fundamental, low notes) harmonics 2 to 5 all are.
  if (f && (near(f, top - 16) || [2, 3, 4, 5].every(k => near(f * k)))) {
    const ex = 69 + 12 * Math.log2(f / 440), m = Math.round(ex), own = near(f) || near(f * 2) || peaks[0];
    return [{ m, db: own.db, cents: Math.round((ex - m) * 100) }];
  }
  // Several notes: walk up the peaks; skip those that are harmonics of a note already found.
  const acc = [];
  for (const p of peaks) {
    if (acc.some(a => { const k = Math.round(p.f / a.f); return k >= 2 && k <= 12 && Math.abs(p.f - k * a.f) < p.f * 0.03 && p.db < a.db + 8; })) continue;
    const ex = 69 + 12 * Math.log2(p.f / 440), m = Math.round(ex);
    if (Math.abs(ex - m) > 0.35 || m < 36 || m > 96) continue;
    if (p.f < 1200 && !near(p.f * 2) && !near(p.f * 3)) continue; // a real note has overtones; hum and noise do not
    acc.push({ m, f: p.f, db: p.db, cents: 0 });
  }
  return acc.sort((x, y) => y.db - x.db).slice(0, 6);
}
// Listen on an open mic handle (from openMic). Calls onDown(midi, cents) / onUp(midi). Returns a stop function.
export function listen(h, onDown, onUp, onLevel) {
  const c = h.c, an = h.an, an2 = c.createAnalyser();
  an2.fftSize = 8192; an2.smoothingTimeConstant = 0; h.src.connect(an2); an2.connect(h.mute);
  const buf = new Float32Array(an.fftSize), db = new Float32Array(an2.frequencyBinCount), act = new Map();
  let noise = 0.003, prev = 0, strike = 0;
  const timer = setInterval(() => {
    if (c.state !== 'running') c.resume().catch(() => {});
    an.getFloatTimeDomainData(buf);
    // The gate follows the room: an acoustic piano a metre from the iPad mic is much quieter than a line input.
    const gate = Math.max(0.0025, noise * 2.5), { rms, f } = pitchOf(buf, c.sampleRate, gate), t = performance.now();
    if (rms < gate) noise = noise * 0.95 + Math.min(rms, 0.05) * 0.05;
    if (rms > prev * 1.6 && rms > gate * 2) strike = t; // a sudden jump in loudness: something was struck
    prev = rms; onLevel?.(rms);
    let set = [];
    if (rms >= gate) { an2.getFloatFrequencyData(db); set = notesOf(peaksOf(db, c.sampleRate, an2.fftSize), f > 60 && f < 2200 ? f : 0); }
    const seen = new Set();
    for (const n of set) {
      seen.add(n.m);
      let s = act.get(n.m); if (!s) act.set(n.m, s = { hits: 0, miss: 0, on: false, fired: 0, low: 0, lvl: 0 });
      const lvl = 10 ** (n.db / 20);
      s.hits++; s.miss = 0;
      if (!s.on) { if (s.hits >= 2) { s.on = true; s.fired = t; s.low = lvl; onDown(n.m, n.cents); } }
      else {
        s.low = t - s.fired < 150 ? Math.max(s.low, lvl) : Math.min(s.low, lvl); // ride up the attack, then follow the decay
        // the same note struck again: a strike just happened and this note's own level is climbing
        if (t - s.fired > 140 && t - strike < 220 && lvl > s.lvl * 1.12 && lvl > s.low * 1.4) { onUp(n.m); s.fired = t; s.low = lvl; onDown(n.m, n.cents); }
      }
      s.lvl = lvl;
    }
    // A ringing note can drop out for a frame or two; let go after ~120 ms or once the sound has died away.
    for (const [m, s] of act) if (!seen.has(m)) { s.hits = 0; if (++s.miss >= 3 || rms < gate) { if (s.on) onUp(m); act.delete(m); } }
  }, 40);
  return () => { clearInterval(timer); for (const [m, s] of act) if (s.on) onUp(m); try { h.src.disconnect(an2); an2.disconnect(); } catch {} };
}
export async function startMic(onDown, onUp, wayId) {
  if (mic.on) return true;
  ctx(); // unlock playback while the tap still counts
  let h;
  try { h = await openMic(wayId); } catch (e) { mic.error = e.name; return false; }
  const stop = listen(h, onDown, onUp, rms => { mic.rms = rms; });
  mic.close = () => { stop(); h.close(); }; mic.way = h.way.id;
  mic.on = true; mic.error = null;
  return true;
}
export function stopMic() {
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
