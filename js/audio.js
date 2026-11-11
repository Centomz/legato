// Sound out (small piano-ish synth, metronome click) and sound in (microphone pitch, Web MIDI).
let ac, master;
export function ctx() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createDynamicsCompressor(); master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
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
function pitchOf(buf, sr) {
  const n = buf.length; let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return { rms, f: 0 };
  const half = n >> 1, c = new Float32Array(half);
  for (let lag = 0; lag < half; lag++) { let s = 0; for (let i = 0; i < half; i++) s += buf[i] * buf[i + lag]; c[lag] = s; }
  let d = 0; while (d < half - 1 && c[d] > c[d + 1]) d++;
  let mx = -1, pos = -1;
  for (let i = d; i < half; i++) if (c[i] > mx) { mx = c[i]; pos = i; }
  if (pos <= 0 || mx < c[0] * 0.5) return { rms, f: 0 };
  const a = c[pos - 1], b = c[pos], e = c[pos + 1] ?? b, sh = (a + e - 2 * b) ? (a - e) / (2 * (a + e - 2 * b)) : 0;
  return { rms, f: sr / (pos + sh) };
}
export async function startMic(onDown, onUp) {
  if (mic.on) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) { mic.error = e.name; return false; }
  const c = ctx(), src = c.createMediaStreamSource(micStream), an = c.createAnalyser();
  an.fftSize = 2048; src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let cur = null, cand = null, cnt = 0, fired = 0, low = 1;
  micTimer = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    const { rms, f } = pitchOf(buf, c.sampleRate);
    mic.rms = rms;
    if (!f || f < 60 || f > 2200) { if (cur != null) { onUp(cur); cur = null; } cand = null; cnt = 0; return; }
    const exact = 69 + 12 * Math.log2(f / 440), m = Math.round(exact);
    if (m === cand) cnt++; else { cand = m; cnt = 1; }
    low = Math.min(low, rms);
    const t = performance.now();
    const fresh = m !== cur, again = m === cur && t - fired > 140 && rms > 0.03 && rms > low * 1.9;
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
  micStream?.getTracks().forEach(t => t.stop());
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
