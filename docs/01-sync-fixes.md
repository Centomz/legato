# 01 — Sync fixes (line jumps, keys lighting early, "when do I play?")

All in `js/views/lesson.js`, `js/staff.js`, `js/keyboard.js`.

## Problems the owner reported

1. In the sheet view the tempo line sometimes jumps to the next note.
2. In the falling-notes view a key lights up before its block reaches the keyboard.
3. It is unclear when to press and when to wait.

## Causes and fixes

### A. The staff was rebuilt on every played note
`refresh()` called `drawStage()`, which replaced the whole SVG (or every falling block). The playhead
was destroyed and re-created each time, so it flickered and jumped, and the scroll position reset.

**Fix:** `drawStage()` runs only when the structure changes (start, stop, range, hands, view, drill).
On each note, `paint()` updates classes in place:
- sheet: `paintStaff(svg, states)` in `staff.js` sets the class of each `<g data-id>` and its label.
- falling: each `.blk` has `data-id`; `paint()` toggles `ok / off / bad`.

### B. The playhead jumped 34 px at every barline
`xOf(pos)` maps a bar's beats to `x0 … x0 + barW − 34`; the next bar starts 34 px further on.
**Fix:** `layout.xPh(pos)` (used only by `movePlayhead`) is the same as `xOf` except in the last
quarter-beat of a bar, where it glides across the barline. Notes on a sixteenth grid still line up.
Line changes scroll smoothly (`scrollTo({behavior:'smooth'})`).

### C. Keys lit up as soon as the previous note was judged
The target was "the next unplayed note", lit immediately.
**Fix:** a key gets the full light (`tR`/`tL`) only when the note is **due**: the line (or the block)
has reached it, within `LEAD = 0.06 s`. In the sheet view the next note also gets a faint outline
(`.k.soon`) so the hand can prepare; the falling view shows no early hint, because the blocks do that.

### D. No visible count-in
**Fix:** `#cue` (a pill at the top of the stage) shows the count-in number, then in wait mode
"Your turn — G · B" while the line is waiting.

## How to check
- Play a lesson in each view; the line must move without jumps while notes are being coloured.
- In falling view, a key must light only when its block touches the keyboard.
