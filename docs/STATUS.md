# Status

Tick items as they are finished. Work from the top. Each item names the doc that explains it.

## Done (11 Nov 2026) — tested in a desktop browser with simulated input, not yet on the iPad
- [x] Sync fixes: no rebuild on each note, smooth playhead, keys light only when due, count-in cue — `docs/01-sync-fixes.md`
- [x] Wait mode ("Wait for me", on by default) — `docs/02-wait-mode.md`
- [x] Chords through the microphone — `docs/03-chords.md`
- [x] Mic check page tries four ways of opening the mic and shows chords (v5) — `js/views/miccheck.js`

## Waiting on the owner
- [ ] iPad test with the acoustic piano: does the line wait, are single notes and chords heard?
      Ask for a screenshot of `#/miccheck` if notes are wrong or missing.

## Next (not started), in order
1. **Tune chord hearing on the real piano.** Only after the owner's feedback. Knobs in
   `js/audio.js`: peak threshold (`mx - 20` dB in `peaksOf`), harmonic rule (`a.db + 8`),
   cents tolerance (`0.35`), frames to note-on (`hits >= 2`). Change one at a time and re-run the
   fake-microphone test in `docs/testing.md`.
2. **Mic delay in tempo mode.** `onDownTempo` subtracts a fixed 0.07 s for the mic; the chord
   listener needs about 0.1 s. Measure on the iPad (play on the click with wait mode off and read
   the average "+N ms" labels), then set the constant.
3. **Chords in the Studio recorder.** `studio.js` already receives every `input.down`, but overtone
   ghosts are not filtered there. Reuse the `OVERTONE` idea from `lesson.js`.
4. **French for the remaining mic strings** in `js/core.js` toasts, if any are missing.
5. From the README "Not done" list: ties and pedal marks in the editor, PDF export, scores for the
   three library pieces without one.
