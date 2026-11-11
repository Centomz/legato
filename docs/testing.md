# Testing and deploying

## Run locally
```bash
python3 -m http.server 5173
```
Open http://localhost:5173. The browser caches modules hard: after editing, start the server on a
**new port** (5174, 5175 …) to be sure you load the new code.

## Play without a piano
- Computer keys: `A S D F G H J K L ;` are white keys from middle C, `W E T Y U O P` black keys.
- In the browser console, notes can be sent straight into the app:
  ```js
  const core = await import('/js/core.js');
  core.input.down(67, 0.7, 'key'); core.input.up(67, 'key');   // G4
  ```
- The lesson needs one real click on the page first (browsers block sound until then).

## Fake microphone (for mic and chord work)
Paste in the console **before** clicking Mic or "Start the check". It replaces the mic with a
synthetic piano that plays the chords in `seq` (MIDI numbers), one every 0.9 s:
```js
navigator.mediaDevices.getUserMedia = async () => {
  const c = new AudioContext(); await c.resume(); const dst = c.createMediaStreamDestination();
  const seq = [[60, 64, 67], [67], [62, 65, 69], [55, 71], [60]];
  seq.forEach((ch, i) => ch.forEach(m => {
    const t = c.currentTime + 0.6 + i * 0.9, f = 440 * 2 ** ((m - 69) / 12), g = c.createGain(); g.connect(dst);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.01);
    g.gain.setTargetAtTime(0, t + 0.02, 0.35); g.gain.setTargetAtTime(0, t + 0.7, 0.03);
    [1, 2, 3, 4, 5].forEach((h, j) => { const o = c.createOscillator(), og = c.createGain();
      og.gain.value = [1, .5, .3, .15, .1][j]; o.frequency.value = f * h; o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.85); });
  }));
  return dst.stream;
};
```
To log what the app hears: `core.input.on((k, m, v, src) => console.log(k, m, src))`.

## Deploy
```bash
git add -A && git commit -m "…" && git push
```
GitHub Pages rebuilds in about a minute and caches files for 10 minutes. On the iPad, close the
tab and reopen it. `#/miccheck` shows the loaded version (`VERSION` in `js/views/miccheck.js`).

## What cannot be tested here
A real acoustic piano through the iPad microphone. Only the owner can do that; ask for a
screenshot of `#/miccheck` when mic behaviour is in doubt.
