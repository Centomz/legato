# 02 — Wait mode ("Wait for me")

Toggle in the lesson controls. Stored in `store.wait` (default `true`). Not used for *Hear it played*.

## Behaviour
- The line (sheet) or the blocks (falling) move at the chosen tempo up to the next unplayed
  **group** (all expected notes at the same beat, both hands), then stop until every note of the
  group has been pressed. Notes of a group may be pressed one after another.
- Pressing the group early is accepted; the line then glides forward to it.
- A wrong key does not move on. The note is shown red with "played X"; when the right key comes,
  it turns amber (right, but not first time). A note right first time turns green.
- No early/late judging in wait mode, so no timing numbers in the report (shown as "—").
- Metronome clicks and the other hand's accompaniment follow the line (they stop while it waits).
- A pass is "clean" when it had no wrong key. Three clean passes raise the tempo, as before.
- Strict mode still stops after two slips in a bar.

## Implementation (`js/views/lesson.js`)
- `run.wait` is set in `start()`. Position is `run.p` (beats from the start of the range; negative
  during count-in), advanced in `frame()` by `dt / spb` and capped at the next pending group
  (`nextGroup()`). `run.floor` is the position of the last completed group; if `p < floor`, `p`
  glides up to it.
- Tempo mode still derives position from the audio clock (`run.t0`); both feed `local`, which the
  playhead, the falling blocks and the key lights use.
- `onDownWait(m, src)` handles presses: match against `nextGroup()`; `run.slip[id]` holds a wrong
  key shown on a pending note; `run.slips` counts wrong keys in the pass.
- Microphone leniency (`src === 'mic'`): extra notes an octave / twelfth above a wanted or just
  played note are ignored (they are overtones), and an octave doubling inside a group counts.

## How to check
- Start a lesson, don't play: the line must stop at the first note and wait indefinitely.
- Play the right key: it moves to the next note and waits again.
- Play a wrong key: red, still waiting. Then the right one: amber, moves on.
