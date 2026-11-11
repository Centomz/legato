# Legato — piano tutor (instructions for Claude)

Browser piano tutor. Plain ES modules, no build step, no dependencies. Live at
https://centomz.github.io/legato/ (GitHub Pages, repo `Centomz/legato`, branch `main`).

## Read these first

| File | What it covers |
|---|---|
| `docs/STATUS.md` | What is done, what is left, in order. **Start here and pick the first unticked item.** |
| `docs/01-sync-fixes.md` | Playhead jumps, keys lighting early, count-in cue |
| `docs/02-wait-mode.md` | "Wait for me": the line / falling notes wait for the right key |
| `docs/03-chords.md` | Hearing several notes at once through the microphone |
| `docs/testing.md` | How to test without a piano, and how to deploy |
| `README.md` | User-facing overview: screens, routes, inputs |

## Map of the code

- `js/app.js` — router and sidebar. Routes are in `routes`.
- `js/core.js` — `store` (localStorage `legato.v1`), `t()` translation, `input` hub (every note from mouse, keys, MIDI or mic arrives through `input.down(midi, vel, src)`).
- `js/audio.js` — synth, metronome click, microphone (`openMic`, `listen`, `startMic`), Web MIDI.
- `js/music.js` — pieces, `flatten(piece)` → notes `{id, h:'R'|'L', pos (beats), bar, d, midi, f}`.
- `js/staff.js` — SVG grand staff, playhead, in-place note colouring.
- `js/keyboard.js` — on-screen keys and target lights.
- `js/views/lesson.js` — the live lesson engine (tempo mode and wait mode).
- `js/views/miccheck.js` — mic diagnostic page (`#/miccheck`).
- `js/i18n.js` — French strings. Every new `t('…')` string needs an entry in `FR`.

## Rules

- Keep it dependency-free and build-free. No frameworks.
- Every user-visible string goes through `t()`, with a French entry in `js/i18n.js`.
- Never rebuild the staff SVG or the falling blocks on each played note: use `paint()` in `lesson.js` (see `docs/01-sync-fixes.md`).
- Test in a browser before pushing (see `docs/testing.md`). The owner tests on an iPad with an acoustic piano.
- After a change: tick it in `docs/STATUS.md`, commit, `git push` (this deploys). GitHub Pages caches files for 10 minutes.
- Bump `VERSION` in `js/views/miccheck.js` when mic code changes, so the owner can see which version the iPad loaded.
- The owner watches token use: keep changes small, don't re-read files you don't need.
