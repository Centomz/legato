// On-screen piano. lo and hi must be white keys.
import { input, nn } from './core.js';

const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);

export function Keyboard(el, { lo = 48, hi = 84 } = {}) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const ww = 100 / whites.length, x = {};
  whites.forEach((m, i) => { x[m] = { l: i * ww, w: ww }; });
  for (let m = lo; m <= hi; m++) if (isBlack(m)) x[m] = { l: (whites.indexOf(m - 1) + 1) * ww - ww * 0.3, w: ww * 0.6, b: 1 };
  let html = '<div class="kb">';
  for (let m = lo; m <= hi; m++) html += `<div class="k ${x[m].b ? 'b' : 'w'}" data-m="${m}" style="left:${x[m].l}%;width:${x[m].w}%"><span class="fg"></span>${m % 12 === 0 ? `<span class="lb">${nn(m, true)}</span>` : ''}</div>`;
  el.innerHTML = html + '</div>';
  const key = m => el.querySelector(`[data-m="${m}"]`);
  let down = null;
  el.onpointerdown = e => { const k = e.target.closest('.k'); if (!k) return; e.preventDefault(); down = +k.dataset.m; input.down(down, 0.7, 'mouse'); };
  const release = () => { if (down != null) { input.up(down, 'mouse'); down = null; } };
  addEventListener('pointerup', release); addEventListener('pointercancel', release);
  let targets = [];
  return {
    x, lo, hi,
    press(m, cls = 'on') { const k = key(m); if (k) { k.classList.remove('on', 'ok', 'bad'); k.classList.add(cls); } },
    release(m) { key(m)?.classList.remove('on', 'ok', 'bad'); },
    targets(list) {
      targets.forEach(m => { const k = key(m); if (k) { k.classList.remove('tR', 'tL'); k.querySelector('.fg').textContent = ''; } });
      targets = list.map(n => n.midi);
      list.forEach(n => { const k = key(n.midi); if (k) { k.classList.add('t' + n.h); k.querySelector('.fg').textContent = n.f || ''; } });
    },
    destroy() { removeEventListener('pointerup', release); removeEventListener('pointercancel', release); },
  };
}
export function rangeFor(notes) {
  const ms = notes.filter(n => !n.rest).map(n => n.midi);
  let lo = Math.floor((Math.min(...ms, 48) - 0) / 12) * 12, hi = Math.ceil((Math.max(...ms, 72) + 1) / 12) * 12;
  if (hi - lo < 36) hi = lo + 36;
  return { lo, hi };
}
