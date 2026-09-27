# Video page design (`site/video/`)

A motion-graphic explainer that is a web page rather than a video file. Kin to the landing page: same tokens, fonts, dusk sky and `localStorage.theme` key, so moving between them never flips the theme.

## One clock

Every frame is a pure function of `t`. `scenes.js` lays the chapters on one timeline and each chapter renders from its local time. Nothing animates on its own: no CSS transitions or keyframes, no timers. That is what makes seeking, frame stepping (`,` `.`), deep links (`#t=90`) and the MP4 export land on the same frame.

The DOOM clip is the one outside clock. While playing it follows the film and is resynced when it drifts past 0.25s. In export it is seeked to the exact frame.

## Stage

- 1920x1080, fitted to the window with CSS `zoom`, not `transform: scale()`. Text is laid out and rasterized at the size it is shown, the same lesson as the landing page cast.
- Canvases (splash, file swarm, subagent GC, three.js) size their backing store to zoom times `devicePixelRatio`.
- Code panes stay dark in both themes. Ligatures are off in panes so `->` reads as typed.
- Chapters clear the frame before the next title rises. Overlapping two headlines in one spot read as a glitch.

## What is real

- The opening is a port of `maki-ui/src/splash.rs`: wave layers, vignette, symbol ramp, fade timings and dracula colors. The idle screen layout (input rule, placeholder, status bar) was captured from a real maki in a PTY.
- The `index` skeleton is `maki index` output, verbatim, for the sample file.
- Benchmark points and labels come from `../bench.svg`.
- The token staircase is illustrative. Its assumptions are printed on screen.

## three.js

Only the bill chapter uses it. `three.min.js` is a tree-shaken subset built from `three.entry.js`, which carries the rebuild command. Boxes are one `InstancedMesh`, so the 40-turn staircase is a single draw call.

## Export

```
node site/video/export.mjs --fps 60 --theme dark --workers 3
```

Frames are rendered in headless Chromium and piped to ffmpeg, one chunk per worker, then joined without re-encoding. `--start` and `--end` take seconds for a quick check. Keep the MP4 out of git and host it as a release asset.

## Verifying

Serve `site/` (`python3 -m http.server`) and open `/video/`. `?export` shows the bare stage and exposes `window.film.seek(t)`. Check both themes at 390px and 1600px.
