// Engraves a piece as an SVG grand staff. Returns { svg, layout } — layout maps beats to x and clicks to pitch.
import { spell, keyAcc, flatten, barsOf } from './music.js';

const LP = 96, BOTTOM = { R: 30, L: 18 }; // staff step of the bottom line: E4 treble, G2 bass
const KS = { R: { s: [8, 5, 9, 6, 3, 7, 4], f: [4, 7, 3, 6, 2, 5, 1] }, L: { s: [6, 3, 7, 4, 1, 5, 2], f: [2, 5, 1, 4, 0, 3, -1] } };
const REST = [[4, '𝄻', 15], [2, '𝄼', 20], [1, '𝄽', 30], [0.5, '𝄾', 28], [0.25, '𝄿', 28], [0.125, '𝄿', 28]];

export function renderStaff(p, o = {}) {
  const beats = p.beats, per = o.perLine || 4, W = o.width || 1000;
  const from = o.from || 0, to = o.to ?? barsOf(p);
  const staves = o.staves || ['R', 'L'], top0 = o.top ?? 58, gap = o.gap ?? 132;
  const sysH = top0 + (staves.length - 1) * gap + 40 + (o.bottom ?? 56);
  const nLines = Math.max(1, Math.ceil((to - from) / per));
  const barW = (W - LP - 2) / per, st = o.state || {};
  const top = (line, h) => line * sysH + top0 + staves.indexOf(h) * gap;
  const xOf = pos => {
    const b = Math.min(Math.floor(pos / beats + 1e-6), to - 1) - from, line = Math.floor(b / per);
    return { line, x: LP + (b % per) * barW + 26 + ((pos - (b + from) * beats) / beats) * (barW - 34) };
  };
  // Playhead position: same as xOf, but it glides across the barline during the last quarter-beat
  // of a bar instead of jumping the 34 px between one bar's end and the next bar's first beat.
  const xPh = pos => {
    const b0 = Math.min(Math.floor(pos / beats + 1e-6), to - 1), b = b0 - from, line = Math.floor(b / per), col = b % per;
    const fr = (pos - b0 * beats) / beats, x0 = LP + col * barW + 26, span = barW - 34, z = 1 - 0.25 / beats;
    let x = x0 + fr * span;
    if (fr > z && col < per - 1 && b0 < to - 1) x = x0 + z * span + ((fr - z) / (1 - z)) * ((1 - z) * span + 34);
    return { line, x };
  };
  let s = `<svg class="staff" viewBox="0 0 ${W} ${sysH * nLines}" width="100%" xmlns="http://www.w3.org/2000/svg">`;

  for (let line = 0; line < nLines; line++) {
    const y0 = top(line, staves[0]), y1 = top(line, staves[staves.length - 1]) + 40;
    const barsHere = Math.min(per, to - from - line * per), xEnd = LP + barsHere * barW;
    if (o.highlightBar != null) {
      const b = o.highlightBar - from - line * per;
      if (b >= 0 && b < barsHere) s += `<rect class="barhl" x="${LP + b * barW}" y="${y0 - 26}" width="${barW}" height="${y1 - y0 + 52}"/>`;
    }
    for (const h of staves) {
      const ty = top(line, h);
      for (let i = 0; i < 5; i++) s += `<line class="sl" x1="0" x2="${xEnd}" y1="${ty + i * 10}" y2="${ty + i * 10}"/>`;
      for (let b = 0; b <= barsHere; b++) s += `<line class="bl" x1="${LP + b * barW}" x2="${LP + b * barW}" y1="${ty}" y2="${ty + 40}"/>`;
      s += h === 'R' ? `<text class="clef" x="6" y="${ty + 40}" font-size="56">𝄞</text>` : `<text class="clef" x="6" y="${ty + 31}" font-size="44">𝄢</text>`;
      const n = Math.abs(p.sharps || 0), offs = KS[h][p.sharps > 0 ? 's' : 'f'];
      for (let i = 0; i < n; i++) s += `<text class="acc" x="${44 + i * 9}" y="${ty + 40 - offs[i] * 5 + 6}">${p.sharps > 0 ? '♯' : '♭'}</text>`;
      if (line === 0 || o.timeEveryLine) s += `<text class="ts" x="${62 + n * 9}" y="${ty + 19}">${beats}</text><text class="ts" x="${62 + n * 9}" y="${ty + 39}">4</text>`;
    }
    s += `<line class="bl" x1="0" x2="0" y1="${y0}" y2="${y1}"/>`;
    if (o.barNumbers !== false) s += `<text class="bn" x="${LP + 4}" y="${y0 - 30}">${from + line * per + 1}</text>`;
  }

  // Group notes into events (chords), then into beams.
  const events = new Map();
  for (const n of flatten(p)) {
    if (n.bar < from || n.bar >= to || !staves.includes(n.h)) continue;
    const key = n.h + n.i;
    if (!events.has(key)) { const { line, x } = xOf(n.pos); events.set(key, { ...n, key, line, x, notes: [], ty: top(line, n.h) }); }
    if (!n.rest) {
      const sp = spell(n.midi, p.sharps), off = sp.oct * 7 + sp.letter - BOTTOM[n.h];
      events.get(key).notes.push({ ...n, sp, off, y: events.get(key).ty + 40 - off * 5 });
    }
  }
  const evs = [...events.values()];
  const beamOf = new Map();
  for (const h of staves) {
    const list = evs.filter(e => e.h === h).sort((a, b) => a.pos - b.pos);
    let grp = [];
    const flush = () => { if (grp.length > 1) { const g = { evs: grp }; grp.forEach(e => beamOf.set(e.key, g)); } grp = []; };
    for (const e of list) {
      const ok = !e.rest && (e.d === 0.5 || e.d === 0.25);
      const last = grp[grp.length - 1];
      if (!ok || (last && (Math.floor(last.pos + 1e-6) !== Math.floor(e.pos + 1e-6) || last.line !== e.line || Math.abs(last.pos + last.d - e.pos) > 1e-6))) flush();
      if (ok) grp.push(e);
    }
    flush();
  }
  for (const g of new Set(beamOf.values())) {
    const ys = g.evs.flatMap(e => e.notes.map(n => n.y)), offs = g.evs.flatMap(e => e.notes.map(n => n.off));
    g.up = offs.reduce((a, b) => a + b, 0) / offs.length < 4;
    g.y = g.up ? Math.min(...ys) - 31 : Math.max(...ys) + 31;
  }

  for (const e of evs) {
    if (e.rest) {
      let rem = e.d, pos = e.pos;
      for (const [d, g, dy] of REST) while (rem >= d - 1e-6) {
        const bar = Math.floor(pos / beats + 1e-6);
        const { x } = xOf(pos), full = d === 4 || (Math.abs(pos - bar * beats) < 1e-6 && rem >= beats);
        s += `<text class="rest" x="${full ? LP + ((bar - from) % per + .5) * barW - 6 : x - 5}" y="${e.ty + dy}">${full ? '𝄻' : g}</text>`;
        if (full) { rem -= Math.min(rem, beats); pos += beats; } else { rem -= d; pos += d; }
      }
      continue;
    }
    const g = beamOf.get(e.key), offs = e.notes.map(n => n.off), ys = e.notes.map(n => n.y);
    const up = g ? g.up : offs.reduce((a, b) => a + b, 0) / offs.length < 4;
    const hollow = e.d >= 2, stem = e.d < 4, dotted = [6, 3, 1.5, 0.75].includes(e.d);
    const sx = e.x + (up ? 5.6 : -5.6), sy0 = up ? Math.max(...ys) : Math.min(...ys);
    const sy1 = g ? g.y : (up ? Math.min(...ys) - 31 : Math.max(...ys) + 31);
    const sel = o.selected && o.selected.h === e.h && o.selected.i === e.i;
    const cls0 = st[e.notes[0].id]?.cls || '';
    let out = `<g class="n ${cls0}${sel ? ' sel' : ''}" data-h="${e.h}" data-i="${e.i}">`;
    if (sel || /now|ghost/.test(cls0)) e.notes.forEach(n => { out += `<circle class="halo" cx="${e.x}" cy="${n.y}" r="12"/>`; });
    if (stem) out += `<line class="stem" x1="${sx}" x2="${sx}" y1="${sy0}" y2="${sy1}"/>`;
    if (stem && !g && e.d < 1) {
      const dir = up ? 1 : -1;
      for (let k = 0; k < (e.d <= 0.25 ? 2 : 1); k++) out += `<path class="flag" d="M${sx} ${sy1 + dir * k * 7} q 9 ${dir * 7} 6 ${dir * 18}"/>`;
    }
    for (const n of e.notes) {
      const c = st[n.id]?.cls || '';
      out += `<g class="${c}" data-id="${n.id}" data-lx="${e.x}" data-ly="${e.ty + 78}">`;
      for (let l = -2; l >= n.off; l -= 2) out += `<line class="ledger" x1="${e.x - 10}" x2="${e.x + 10}" y1="${e.ty + 40 - l * 5}" y2="${e.ty + 40 - l * 5}"/>`;
      for (let l = 10; l <= n.off; l += 2) out += `<line class="ledger" x1="${e.x - 10}" x2="${e.x + 10}" y1="${e.ty + 40 - l * 5}" y2="${e.ty + 40 - l * 5}"/>`;
      out += `<ellipse class="head${hollow ? ' hollow' : ''}" cx="${e.x}" cy="${n.y}" rx="6.3" ry="4.5" transform="rotate(-20 ${e.x} ${n.y})"/>`;
      if (n.sp.acc !== keyAcc(n.sp.letter, p.sharps)) out += `<text class="acc" x="${e.x - 18}" y="${n.y + 6}">${n.sp.acc > 0 ? '♯' : n.sp.acc < 0 ? '♭' : '♮'}</text>`;
      if (dotted) out += `<circle class="dot" cx="${e.x + 12}" cy="${n.y - (n.off % 2 === 0 ? 5 : 0)}" r="1.8"/>`;
      if (st[n.id]?.label) out += `<text class="lbl" x="${e.x}" y="${e.ty + 40 + 38}">${st[n.id].label}</text>`;
      out += '</g>';
    }
    if (o.fingering && e.f) out += `<text class="fing" x="${e.x}" y="${Math.min(e.ty - 12, Math.min(...ys, up ? sy1 : 1e9) - 9)}">${e.f}</text>`;
    if (e.v) out += `<text class="dyn" x="${e.x - 4}" y="${e.ty + 40 + 30}">${e.v}</text>`;
    out += '</g>';
    s += out;
  }
  for (const g of new Set(beamOf.values())) {
    const a = g.evs[0], b = g.evs[g.evs.length - 1], dx = g.up ? 5.6 : -5.6, y = g.up ? g.y : g.y - 4, d2 = g.up ? 7 : -7;
    const cls = st[a.notes[0].id]?.cls || '';
    s += `<g class="n ${/dim/.test(cls) ? 'st-dim' : ''}"><rect class="beam" x="${a.x + dx - .6}" y="${y}" width="${b.x - a.x + 1.2}" height="4"/>`;
    for (let i = 0; i < g.evs.length - 1; i++) if (g.evs[i].d === 0.25 && g.evs[i + 1].d === 0.25)
      s += `<rect class="beam" x="${g.evs[i].x + dx - .6}" y="${y + d2}" width="${g.evs[i + 1].x - g.evs[i].x + 1.2}" height="4"/>`;
    s += '</g>';
  }
  s += '<line class="ph" x1="0" x2="0" y1="0" y2="0" style="display:none"/></svg>';
  return { svg: s, layout: { W, sysH, top0, gap, staves, per, from, to, barW, beats, xOf, xPh, nLines } };
}

export function movePlayhead(svg, L, pos) {
  const ph = svg?.querySelector('.ph'); if (!ph) return 0;
  const { line, x } = L.xPh(Math.max(L.from * L.beats, Math.min(pos, L.to * L.beats - 1e-4)));
  const y0 = line * L.sysH + L.top0 - 34, y1 = line * L.sysH + L.top0 + (L.staves.length - 1) * L.gap + 40 + 34;
  ph.style.display = ''; ph.setAttribute('x1', x); ph.setAttribute('x2', x); ph.setAttribute('y1', y0); ph.setAttribute('y2', y1);
  return line;
}
// Recolour notes in place (no rebuild): states = { noteId: { cls, label } }.
export function paintStaff(svg, states) {
  if (!svg) return;
  const seen = new Set();
  for (const g of svg.querySelectorAll('g[data-id]')) {
    const st = states[g.dataset.id] || {}, cls = st.cls || '';
    if (g.getAttribute('class') !== cls) g.setAttribute('class', cls);
    const outer = g.parentNode;
    if (!seen.has(outer)) { seen.add(outer); const oc = 'n ' + cls; if (outer.getAttribute('class') !== oc) outer.setAttribute('class', oc); }
    let lbl = g.querySelector('.lbl');
    if (!st.label) { lbl?.remove(); continue; }
    if (!lbl) {
      lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('class', 'lbl'); lbl.setAttribute('x', g.dataset.lx); lbl.setAttribute('y', g.dataset.ly); g.append(lbl);
    }
    if (lbl.textContent !== st.label) lbl.textContent = st.label;
  }
}
export const hidePlayhead = svg => { const ph = svg?.querySelector('.ph'); if (ph) ph.style.display = 'none'; };

// Map a click (in viewBox units) to a hand, staff step and bar.
export function hit(L, x, y) {
  const line = Math.max(0, Math.min(L.nLines - 1, Math.floor(y / L.sysH))), yy = y - line * L.sysH;
  let h = L.staves[0], best = 1e9;
  L.staves.forEach((s, i) => { const d = Math.abs(yy - (L.top0 + i * L.gap + 20)); if (d < best) { best = d; h = s; } });
  const ty = L.top0 + L.staves.indexOf(h) * L.gap;
  return { h, step: BOTTOM[h] + Math.round((ty + 40 - yy) / 5), bar: L.from + line * L.per + Math.max(0, Math.floor((x - LP) / L.barW)) };
}
