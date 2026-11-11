# 03 — Chords through the microphone

MIDI and the on-screen / computer keyboard already send several notes. This is about the mic.
All in `js/audio.js`; the lesson side is in `docs/02-wait-mode.md` (mic leniency).

## Pipeline (`listen(handle, onDown, onUp)`, every 40 ms)
1. Time-domain buffer (2048 samples) → `pitchOf()` (autocorrelation): loudness (rms) and one pitch.
   A noise gate follows the room (`noise`), as before.
2. Spectrum from a second analyser (`fftSize 8192`, no smoothing) → `peaksOf()`: local maxima
   between 55 and 5000 Hz above 10 % of the strongest peak, with interpolated frequency.
3. `notesOf(peaks, f)` decides the set of notes:
   - **Single note** if the autocorrelation pitch `f` has its fundamental among the peaks, or its
     harmonics 2, 3, 4 and 5 are all there (low notes with a weak fundamental). → one note.
   - Otherwise **chord**: walk the peaks from low to high. A peak is skipped when it is a harmonic
     (×2…×12, within 3 %) of a note already accepted and not much louder than it. Otherwise it
     becomes a note if it is within 35 cents of a pitch and has a harmonic of its own (×2 or ×3).
     At most 6 notes.
4. Tracking per note (`act` map): note-on after 2 frames in a row, note-off after 3 frames missing
   or when the sound falls under the gate. A re-strike of a sounding note needs a sudden jump in
   overall loudness (`strike`) within the last 220 ms **and** that note's own level climbing.

`startMic()` (sidebar Mic button) and the live part of `#/miccheck` both call `listen()`.

## Test result (11 Nov 2026, synthetic piano, `docs/testing.md` snippet)
13 of 14 heard exactly: triads C, Dm, Am, G/B, a four-note Fmaj7, intervals (third, fifth, wide
tenth), single and repeated notes, low G2. The miss: C4+C5 (an octave) heard as C4 alone — expected.
**Not yet tried on a real piano.**

## Known limits (tell the owner, don't hide them)
- Chords below about C3 are unreliable (the mic barely hears the fundamentals).
- Two notes an octave apart are heard as one note; the lesson counts the octave as played.
- A loud overtone can be reported as an extra note; the lesson ignores overtones of wanted notes,
  the Studio recorder does not.
- Notes a semitone apart below C4 cannot be separated.
- Recognition takes about 100 ms, so tempo mode is less fair with the mic than wait mode.

## How to check
`docs/testing.md` has a fake-microphone snippet that plays synthetic chords into the app.
The mic check page (`#/miccheck`) shows the notes heard live, chords included.
