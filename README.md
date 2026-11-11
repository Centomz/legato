# Legato — piano tutor

A browser piano tutor built from the *Piano Tutor* Claude Design (Classical system: paper ground, hairlines, one gold accent).
No build step and no dependencies — plain ES modules.

## Run

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. (Modules need a server; opening `index.html` as a file won't work.)

## Playing in

- **MIDI keyboard** — click *MIDI* in the sidebar (Chrome/Edge). Best accuracy, and dynamics are measured.
- **Microphone** — click *Mic*. Hears single notes and chords (less reliably below C3, and an octave sounds like one note). If it hears nothing, open `#/miccheck`.
- **Computer keyboard** — `A S D F G H J K L ;` are white keys from middle C, `W E T Y U O P` black keys, `Z`/`X` shift the octave. Or click the on-screen keys.

## Screens

| Design | Route | What works |
|---|---|---|
| 1a Daily plan | `#/today` | Four movements built from your last report, streak, 14-day accuracy, level, shorten/edit plan |
| 1c–1e Live lesson | `#/lesson?piece=minuet&from=1&to=4` | *Wait for me* (on by default): the line or the falling notes stop at each note until you play it. Sheet or falling notes; notes judged right / early-late / wrong in real time; tempo ramp climbs 10% after three clean loops; hands separate; loop; metronome; *Hear it played*; Quiet / Coach / Strict (Strict stops after two slips in a bar and drills it in four steps) |
| 1f Session report | `#/progress` | Accuracy, timing spread + histogram, cleanest tempo, bars mastered, bar-by-bar map, weak bars with *Loop it*, journal line, listen back |
| 1g Recording | `#/studio` | Live waveform, piano roll and staff; key and tempo detected; click track, tap tempo |
| 1h Review | `#/studio/review` | Snap rhythm, key, hand split, tempo; doubtful notes to resolve; play recording vs written; MIDI export |
| 1i Score editor | `#/studio/edit` | Click to write notes, durations, rests, dots, accidentals, dynamics, fingering, undo, play-to-write, chord ideas, MIDI export, practise as a lesson |
| 1j Path · 1k Library | `#/path`, `#/library` | Contents and five strands; filterable library with MIDI import |

EN / FR interface and C D E / Do Ré Mi note names are in the sidebar footer. Everything is saved in the browser's localStorage.

## Not done from the design

- Pieces without a score (Gymnopédie, Chopin, Träumerei) are listed but can't be played until you import a MIDI file.
- Export is MIDI only — there is no PDF export yet.
- Microphone input can't measure dynamics.
- Pedal marks and ties aren't supported in the editor.

Notes for future work (for Claude or another developer) are in `CLAUDE.md` and `docs/`.
