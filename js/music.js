// Music model: a piece is { id, title, composer, sharps, beats, tempo, R:[ev], L:[ev] }
// where ev = { m:[midi…] (empty = rest), d: beats, f?: finger, v?: dynamic }.

const LET_SHARP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6], ACC_SHARP = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const LET_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6], ACC_FLAT = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];
const EN = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], SOL = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const BASE = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];

export function spell(midi, sharps = 0) {
  const pc = ((midi % 12) + 12) % 12, fl = sharps < 0;
  return { letter: (fl ? LET_FLAT : LET_SHARP)[pc], acc: (fl ? ACC_FLAT : ACC_SHARP)[pc], oct: Math.floor(midi / 12) - 1 };
}
export function nname(midi, { oct = false, style = 'en', sharps = 0 } = {}) {
  const s = spell(midi, sharps);
  return (style === 'sol' ? SOL : EN)[s.letter] + (s.acc > 0 ? '♯' : s.acc < 0 ? '♭' : '') + (oct ? s.oct : '');
}
export function keyAcc(letter, sharps) {
  if (sharps > 0 && SHARP_ORDER.slice(0, sharps).includes(letter)) return 1;
  if (sharps < 0 && FLAT_ORDER.slice(0, -sharps).includes(letter)) return -1;
  return 0;
}
export const midiToStep = (midi, sharps) => { const s = spell(midi, sharps); return s.oct * 7 + s.letter; };
export function stepToMidi(step, sharps) {
  const letter = ((step % 7) + 7) % 7, oct = Math.floor(step / 7);
  return BASE[letter] + (oct + 1) * 12 + keyAcc(letter, sharps);
}
export function parseNote(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  return BASE['CDEFGAB'.indexOf(m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
export function seq(str) {
  return str.trim().split(/\s+/).map(tok => {
    const [a, f] = tok.split('/'), [n, d] = a.split(':');
    const ev = { m: n === 'r' ? [] : n.split('+').map(parseNote), d: +d };
    if (f) ev.f = +f;
    return ev;
  });
}
export const sumBeats = evs => (evs || []).reduce((a, e) => a + e.d, 0);
export const barsOf = p => Math.max(1, Math.ceil(Math.max(sumBeats(p.R), sumBeats(p.L)) / p.beats - 1e-6));

export function flatten(p) {
  const out = [];
  for (const h of ['R', 'L']) {
    let pos = 0;
    (p[h] || []).forEach((ev, i) => {
      const bar = Math.floor(pos / p.beats + 1e-6), beat = pos - bar * p.beats;
      if (!ev.m.length) out.push({ id: h + i, h, i, pos, bar, beat, d: ev.d, rest: true });
      ev.m.forEach((midi, k) => out.push({ id: h + i + '_' + k, h, i, pos, bar, beat, d: ev.d, midi, f: ev.f, v: ev.v }));
      pos += ev.d;
    });
  }
  return out.sort((a, b) => a.pos - b.pos || a.midi - b.midi);
}

export const KEYS = [
  { id: 'C', name: 'C major', sharps: 0, tonic: 0 }, { id: 'Am', name: 'A minor', sharps: 0, tonic: 9, minor: 1 },
  { id: 'G', name: 'G major', sharps: 1, tonic: 7 }, { id: 'Em', name: 'E minor', sharps: 1, tonic: 4, minor: 1 },
  { id: 'D', name: 'D major', sharps: 2, tonic: 2 }, { id: 'Bm', name: 'B minor', sharps: 2, tonic: 11, minor: 1 },
  { id: 'F', name: 'F major', sharps: -1, tonic: 5 }, { id: 'Dm', name: 'D minor', sharps: -1, tonic: 2, minor: 1 },
];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export function detectKey(midis) {
  if (!midis.length) return KEYS[0];
  let best = KEYS[0], bs = -1;
  for (const k of KEYS) {
    const root = k.minor ? (k.tonic + 3) % 12 : k.tonic;
    const scale = MAJOR.map(x => (x + root) % 12);
    let s = 0;
    for (const m of midis) { const pc = m % 12; if (scale.includes(pc)) s += 1; if (pc === k.tonic) s += 0.35; }
    if (midis[midis.length - 1] % 12 === k.tonic) s += 1.5;
    if (Math.min(...midis) % 12 === k.tonic) s += 0.5;
    if (s > bs) { bs = s; best = k; }
  }
  return best;
}
// Diatonic triads of a key, as { name, midis } rooted around C3.
export function chordsOf(key) {
  const root = key.minor ? (key.tonic + 3) % 12 : key.tonic;
  const scale = MAJOR.map(x => (x + root) % 12);
  return scale.map((pc, i) => {
    const third = (scale[(i + 2) % 7] - pc + 12) % 12, fifth = (scale[(i + 4) % 7] - pc + 12) % 12;
    const base = 48 + pc - (pc > 7 ? 12 : 0);
    const q = fifth === 6 ? '°' : third === 3 ? 'm' : '';
    return { pc, q, pcs: [pc, (pc + third) % 12, (pc + fifth) % 12], midis: [base, base + third, base + fifth] };
  }).filter(c => c.q !== '°');
}

const DURS = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];
// Turn raw notes [{midi,start,dur,k}] (beats) into a monophonic-with-chords event list on a grid.
export function toSeq(notes, grid) {
  const g = new Map();
  for (const n of notes) { const s = Math.round(n.start / grid) * grid; if (!g.has(s)) g.set(s, []); g.get(s).push(n); }
  const starts = [...g.keys()].sort((a, b) => a - b), out = [];
  let pos = 0;
  starts.forEach((s, i) => {
    if (s > pos + 1e-6) out.push({ m: [], d: s - pos });
    const grp = g.get(s), next = starts[i + 1];
    const want = Math.max(grid, ...grp.map(n => n.dur));
    const allowed = (grid < 0.25 ? [...DURS, 0.125] : DURS).filter(d => d >= grid && (next == null || d <= next - s + 1e-6));
    const d = allowed.length ? allowed.reduce((a, b) => Math.abs(b - want) < Math.abs(a - want) ? b : a) : (next - s);
    out.push({ m: [...new Set(grp.map(n => n.midi))].sort((a, b) => a - b), d, src: grp.map(n => n.k) });
    pos = s + d;
  });
  return out;
}

/* ---------- Built-in pieces ---------- */
const MIN_R = [
  'D5:1/5 G4:.5/1 A4:.5/2 B4:.5/3 C5:.5/4', 'D5:1/5 G4:1/1 G4:1/1',
  'E5:1/3 C5:.5/1 D5:.5/2 E5:.5/3 F#5:.5/4', 'G5:1/5 G4:1/1 G4:1/1',
  'C5:1/4 D5:.5/5 C5:.5/4 B4:.5/3 A4:.5/2', 'B4:1/3 C5:.5/4 B4:.5/3 A4:.5/2 G4:.5/1',
  'F#4:1/1 G4:.5/2 A4:.5/3 B4:.5/4 G4:.5/2', 'A4:3/3',
  'D5:1/5 G4:.5/1 A4:.5/2 B4:.5/3 C5:.5/4', 'D5:1/5 G4:1/1 G4:1/1',
  'E5:1/3 C5:.5/1 D5:.5/2 E5:.5/3 F#5:.5/4', 'G5:1/5 G4:1/1 G4:1/1',
  'C5:1/4 D5:.5/5 C5:.5/4 B4:.5/3 A4:.5/2', 'B4:1/3 C5:.5/4 B4:.5/3 A4:.5/2 G4:.5/1',
  'A4:1/3 B4:.5/4 A4:.5/3 G4:.5/2 F#4:.5/1', 'G4:3/2',
  'B5:1 G5:.5 A5:.5 B5:.5 G5:.5', 'A5:1 D5:.5 E5:.5 F#5:.5 D5:.5',
  'G5:1 E5:.5 F#5:.5 G5:.5 D5:.5', 'C#5:1 B4:.5 C#5:.5 A4:1',
  'A4:.5 B4:.5 C#5:.5 D5:.5 E5:.5 F#5:.5', 'G5:1 F#5:1 E5:1',
  'F#5:1 A4:1 C#5:1', 'D5:3',
  'D5:1 G4:.5 F#4:.5 G4:1', 'E5:1 G4:.5 F#4:.5 G4:1',
  'D5:1 C5:1 B4:1', 'A4:.5 G4:.5 F#4:.5 G4:.5 A4:1',
  'D4:.5 E4:.5 F#4:.5 G4:.5 A4:.5 B4:.5', 'C5:1 B4:1 A4:1',
  'B4:.5 D5:.5 G4:1 F#4:1', 'G4:3',
];
const MIN_L = [
  'G3:2/5 A3:1/3', 'B3:3/2', 'C4:3/1', 'B3:3/2', 'A3:3/3', 'G3:3/4', 'D4:1/1 B3:1/2 G3:1/4', 'D4:1/1 D3:.5/5 C4:.5/1 B3:.5/2 A3:.5/3',
  'B3:2/2 A3:1/3', 'G3:1/4 B3:1/2 G3:1/4', 'C4:3/1', 'B3:1/2 C4:.5/1 B3:.5/2 A3:.5/3 G3:.5/4',
  'A3:2/3 F#3:1/5', 'G3:2/4 B3:1/2', 'C4:1/1 D4:1/1 D3:1/5', 'G3:2/2 G2:1/5',
  'G3:3', 'F#3:3', 'E3:1 G3:1 E3:1', 'A3:2 A2:1', 'A3:3', 'B3:1 D4:1 C#4:1', 'D4:1 F#3:1 A3:1', 'D4:1 D3:1 C4:1',
  'B3:2 B3:1', 'C4:2 C4:1', 'B3:1 A3:1 G3:1', 'D4:2 r:1', 'r:3', 'E3:1 G3:1 F#3:1', 'G3:1 B2:1 D3:1', 'G3:1 D3:1 G2:1',
];

function scalePiece() {
  const steps = [2, 2, 1, 2, 2, 2, 1];
  const up = base => { const a = [base]; for (let i = 0; i < 14; i++) a.push(a[i] + steps[i % 7]); return a; };
  const mk = (base, fu) => {
    const u = up(base), all = [...u, ...u.slice(0, -1).reverse()], fs = [...fu, ...fu.slice(0, -1).reverse()];
    return all.map((m, i) => ({ m: [m], d: i === all.length - 1 ? 4 : 1, f: fs[i] }));
  };
  return {
    id: 'gscale', title: 'G major scale', composer: 'Two octaves, hands together', sharps: 1, beats: 4, tempo: 72, warmup: true,
    R: mk(55, [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]), L: mk(43, [5, 4, 3, 2, 1, 3, 2, 1, 4, 3, 2, 1, 3, 2, 1]),
  };
}
function preludePiece() {
  const chords = ['C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5', 'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5', 'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5'];
  const R = [], L = [];
  for (const c of chords) {
    const n = c.split(' ').map(parseNote);
    for (let k = 0; k < 2; k++) {
      L.push({ m: [n[0]], d: .25, f: 5 }, { m: [n[1]], d: .25, f: 3 }, { m: [], d: 1.5 });
      R.push({ m: [], d: .5 }, ...[2, 3, 4, 2, 3, 4].map(i => ({ m: [n[i]], d: .25, f: [0, 0, 1, 2, 4][i] })));
    }
  }
  return { id: 'prelude', title: 'Prelude in C, BWV 846', composer: 'J. S. Bach', sharps: 0, beats: 4, tempo: 60, R, L };
}

export const BUILTIN = [
  { id: 'minuet', title: 'Minuet in G', composer: 'Petzold', sharps: 1, beats: 3, tempo: 120, R: seq(MIN_R.join(' ')), L: seq(MIN_L.join(' ')) },
  preludePiece(), scalePiece(),
];

/* ---------- Standard MIDI files ---------- */
export function writeMidi(p) {
  const PPQ = 480, evs = [];
  for (const n of flatten(p)) if (!n.rest) {
    const vel = n.v === 'p' ? 48 : n.v === 'f' ? 110 : 80, ch = n.h === 'R' ? 0 : 1;
    evs.push([Math.round(n.pos * PPQ), 0x90 | ch, n.midi, vel], [Math.round((n.pos + n.d) * PPQ) - 1, 0x80 | ch, n.midi, 0]);
  }
  evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const vlq = v => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
  const us = Math.round(60e6 / p.tempo);
  const trk = [0, 0xff, 0x51, 3, us >> 16 & 255, us >> 8 & 255, us & 255, 0, 0xff, 0x58, 4, p.beats, 2, 24, 8];
  let last = 0;
  for (const e of evs) { trk.push(...vlq(e[0] - last), e[1], e[2], e[3]); last = e[0]; }
  trk.push(0, 0xff, 0x2f, 0);
  const u32 = v => [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255];
  return new Blob([new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255, 0x4d, 0x54, 0x72, 0x6b, ...u32(trk.length), ...trk])], { type: 'audio/midi' });
}

export function readMidi(buf) {
  const d = new DataView(buf); let p = 0;
  const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p++)); return s; };
  if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
  p += 4; p += 2; const ntr = d.getUint16(p); p += 2; const ppq = d.getUint16(p); p += 2;
  if (ppq & 0x8000) throw new Error('SMPTE time is not supported');
  let tempo = 120, beats = 4; const tracks = [];
  for (let t = 0; t < ntr && p < d.byteLength; t++) {
    if (str(4) !== 'MTrk') break;
    const end = p + 4 + d.getUint32(p); p += 4;
    let tick = 0, status = 0; const open = {}, notes = [];
    while (p < end) {
      let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80);
      tick += v;
      let s = d.getUint8(p);
      if (s & 0x80) { status = s; p++; } else s = status;
      if (s === 0xff) {
        const type = d.getUint8(p++); let len = 0; do { b = d.getUint8(p++); len = (len << 7) | (b & 0x7f); } while (b & 0x80);
        if (type === 0x51 && tempo === 120 && len === 3) tempo = Math.round(60e6 / ((d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)));
        if (type === 0x58 && len >= 2) beats = d.getUint8(p) * 4 / (2 ** d.getUint8(p + 1));
        p += len;
      } else if (s === 0xf0 || s === 0xf7) { let len = 0; do { b = d.getUint8(p++); len = (len << 7) | (b & 0x7f); } while (b & 0x80); p += len; }
      else {
        const hi = s & 0xf0, a = d.getUint8(p++), c = (hi === 0xc0 || hi === 0xd0) ? 0 : d.getUint8(p++);
        if (hi === 0x90 && c > 0) open[a] = tick;
        else if ((hi === 0x80 || hi === 0x90) && open[a] != null) { notes.push({ midi: a, start: open[a] / ppq, dur: (tick - open[a]) / ppq }); delete open[a]; }
      }
    }
    p = end;
    if (notes.length) tracks.push(notes);
  }
  if (!tracks.length) throw new Error('No notes found');
  let R, L;
  if (tracks.length >= 2) { R = tracks[0]; L = tracks.slice(1).flat(); const avg = a => a.reduce((s, n) => s + n.midi, 0) / a.length; if (avg(R) < avg(L)) [R, L] = [L, R]; }
  else { R = tracks[0].filter(n => n.midi >= 60); L = tracks[0].filter(n => n.midi < 60); }
  beats = [2, 3, 4, 6].includes(beats) ? beats : 4;
  const key = detectKey([...R, ...L].map(n => n.midi));
  const clean = evs => evs.map(({ m, d }) => ({ m, d }));
  return { sharps: key.sharps, minor: key.minor, beats, tempo: Math.max(40, Math.min(200, tempo)), R: clean(toSeq(R, .25)), L: clean(toSeq(L, .25)) };
}
