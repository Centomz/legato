// Shared state, persistence, i18n, icons, input hub and small helpers.
import { BUILTIN, nname } from './music.js';
import { FR } from './i18n.js';
import * as audio from './audio.js';

const KEY = 'legato.v1';
const defaults = {
  lang: 'en', names: 'en', fingering: true, mode: 'coach', view: 'sheet', sound: true,
  sessions: [], journal: [], plan: null, mastered: {}, weak: {}, ramp: {}, xp: 0, takes: [], pieces: [], intention: {},
};
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* fresh start */ }
export const store = Object.assign(defaults, saved);
export function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage unavailable */ } }

export function t(s, ...a) {
  const out = (store.lang === 'fr' && FR[s]) || s;
  return out.replace(/\{(\d)\}/g, (_, i) => a[i] ?? '');
}
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const nn = (midi, oct = false, sharps = 0) => nname(midi, { oct, style: store.names, sharps });
export const q = '<span class="q">♩</span>';

/* ---------- dates ---------- */
export const dkey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const fmtDate = (d, o = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(d).toLocaleDateString(store.lang === 'fr' ? 'fr-FR' : 'en-GB', o);
export function practiceDays() {
  const s = new Set(store.sessions.map(x => x.day));
  store.takes.forEach(x => s.add(x.day));
  return s;
}
export function streak() {
  const days = practiceDays(); let d = new Date(), n = 0;
  if (!days.has(dkey(d))) d = addDays(d, -1);
  while (days.has(dkey(d))) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------- pieces ---------- */
export const getPiece = id => BUILTIN.find(p => p.id === id) || store.pieces.find(p => p.id === id) || BUILTIN[0];

/* ---------- icons ---------- */
const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  path: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
  library: '<path d="M4 4v16M8 4v16M12 4v16M15 5l5 15"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  chart: '<path d="M3 3v18h18M7 15l4-5 3 3 5-6"/>',
  journal: '<path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M2 7h4M2 12h4M2 17h4M18.4 2.6a2 2 0 0 1 2.8 2.8L14 12.6l-3.5.9.9-3.5z"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-9 0 4-4 7-4 12a7 7 0 0 0 7 8z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  loop: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  timer: '<circle cx="12" cy="14" r="7"/><path d="M12 14l3-3M10 2h4"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5 8 21l4-2 4 2-1-7.5"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>',
  pencil: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  flag: '<path d="M5 21V4h13l-2 4 2 4H5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  midi: '<path d="M4 6v9a3 3 0 0 0 6 0V9a3 3 0 0 1 6 0v9"/><circle cx="4" cy="5" r="1.5"/><circle cx="16" cy="19" r="1.5"/>',
};
export const icon = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- input hub: mouse, computer keys, MIDI and microphone all end up here ---------- */
const subs = new Set();
export const input = {
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
  down(m, vel = 0.7, src = 'key', cents = 0) { subs.forEach(f => f('down', m, vel, src, cents)); },
  up(m, src = 'key') { subs.forEach(f => f('up', m, 0, src, 0)); },
  octave: 0, changed: null,
};
const ROW = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
const held = {};
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { input.octave = Math.max(-2, input.octave - 1); return; }
  if (k === 'x') { input.octave = Math.min(2, input.octave + 1); return; }
  if (k in ROW && !held[k]) { held[k] = 60 + ROW[k] + 12 * input.octave; input.down(held[k], 0.7, 'key'); }
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (held[k]) { input.up(held[k]); delete held[k]; } });

export async function toggleMic() {
  if (audio.mic.on) audio.stopMic();
  else if (!(await audio.startMic((m, c) => input.down(m, 0.7, 'mic', c), m => input.up(m, 'mic'), store.micWay))) toast(t('Microphone unavailable — check the browser permission.'));
  input.changed?.();
  return audio.mic.on;
}
export async function connectMidi() {
  const ok = await audio.startMidi((m, v) => input.down(m, v, 'midi'), m => input.up(m, 'midi'), () => input.changed?.());
  if (!ok) toast(t('MIDI is not available in this browser.'));
  else if (!audio.midi.inputs) toast(t('No MIDI keyboard found — plug one in and it will connect.'));
  input.changed?.();
}
export function inputStatus() {
  const parts = [];
  if (audio.mic.on) parts.push(t('Mic · listening'));
  if (audio.midi.inputs) parts.push(t('MIDI · connected'));
  return parts.join(' · ');
}
// If MIDI permission was granted before, reconnect silently.
navigator.permissions?.query({ name: 'midi' }).then(p => { if (p.state === 'granted') connectMidi(); }).catch(() => {});

export const go = hash => { location.hash = hash; };
export const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
