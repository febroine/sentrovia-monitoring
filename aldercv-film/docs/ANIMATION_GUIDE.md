# Animation guide — how every shot is coded

Read this, `docs/style_guide.md` and `docs/shotlist.md` before writing a line. The film must look like
one hand made it. When in doubt: fewer, slower, more textured.

## 1. Architecture & ownership

```
src/film.js            timeline: shot id -> chapter module, frame ranges (owner: director)
src/lib/core.js        math, rng/noise, colour, textures, paint/cel/ink/pencil/glow/text (director)
src/lib/stage.js       env, camera (incl. vertical crop), ui space, post grain (director)
src/lib/palette.js     the only source of colours (director)
src/lib/sky.js         sky bands, clouds, treeline, stars, horizon lights (director)
src/lib/river.js       perspective river, lanes, flowing résumé pages, page sprites (river chapter may improve; keep API)
src/lib/botany.js      agave, leaf masses, blooms, grass, bud stalks, stone bank (director)
src/lib/girl.js        Mira: head, sitFront, bust, wadeBack, hand (director)
src/shots/hook.js      S1, S8            (hook chapter)
src/shots/river.js     S2, S3            (river chapter)
src/shots/page.js      S4, S5            (page chapter)
src/shots/brand.js     S6, S7            (brand chapter)
```

Rules:
- Only edit files you own. Shared libs are read-only for chapters (except river.js for the river chapter).
  Need something new? Build it inside your chapter file (copy/adapt a helper if needed) and mention it in your report
  so the director can promote it to the lib.
- A chapter module exports `{ S#: { draw(ctx, env, t, info) } }`. `t` = seconds since the shot's first frame;
  `info = { T, frame, shot }`. `draw` may return `{ post: { grain, vignette } }` or `{ post: false }`.

## 2. Space, time, determinism

- World space is **1920×1080** per shot. Draw in world units after calling `camera()`. Art should over-draw
  ~150 px beyond the frame on every side so drifts and the vertical crop never show an edge.
- 30 fps, 900 frames. Each frame must be renderable **independently and in any order** (render is split across
  processes). So: no state carried between frames, no `Math.random()`, no `Date`. Use `C.rng(seed)` with fixed seeds.
  Anything that accumulates (river flow) is computed in closed form from `t` (e.g. integrate speed analytically).
- Characters move **on twos**: feed character animation `C.twos(t)` instead of `t`. Camera, water, grain-free
  glows move on ones.
- Easing: `C.ease.inOutSine` for camera; `C.seg(t, a, b, C.ease.X)` for normalised progress; `C.window(t,a,b,ramp)`
  for "on between a and b with soft ramps".

## 3. Camera (one movement per shot)

```js
const { camera, parallax, ui } = require('../lib/stage');
camera(ctx, env, { cx: 960, cy: 540, zoom: C.lerp(1, 1.05, C.seg(t, 0, dur, C.ease.inOutSine)), vx: 1060 });
```
- `vx` = the world x the **vertical 1080×1920 render** centres on (its visible strip is ~607/zoom world px wide).
  Always pass a `vx` that keeps the subject in frame; check vertical stills.
- `parallax(ctx, env, cam, depth)` for background layers (depth 0.3–0.7). Re-call `camera()` before foreground.
- Max ~8 % zoom change or ~120 px travel per shot. No shakes, no whip pans, no zoom punches.

## 4. Layers, caching, performance

- Budget: **≤ 700 ms per 1920×1080 frame** on one core (we render 900 frames × 2 formats on 4 cores).
- Static art (backgrounds, botanicals, stone banks, big painted shapes) is baked once per process:
  ```js
  const bg = env.once('river:S2:bank', () => C.layer(2200, 700, env.res, (x) => { x.translate(150, 0); /* draw */ }));
  C.blit(ctx, bg, -150, 380);   // world position of the layer's (0,0)
  ```
  `env.res` already includes output scale (0.5 animatic, 1 final, 1.78 vertical) and zoom headroom.
- `C.paint()` (gouache mottle + hatch with clipping) is relatively expensive: fine inside cached layers or for
  a few dozen shapes per frame; never for hundreds of shapes per frame.
- Batch strokes: one `beginPath()` + many `moveTo/lineTo` + one `stroke()` is ~100× faster than many strokes.
- `ctx.filter = 'blur(...)'` is expensive on large areas — bake blurred things into layers.

## 5. Look rules (enforced in review)

- Colours only from `src/lib/palette.js` (derive tints with `C.mix`, `C.shade`, `C.rgba`).
- Every non-character surface: `C.paint()` (base + soft-light mottle + pencil hatch) or a baked layer that used it.
  No flat fills on backgrounds. No glossy gradients (a gradient is fine as a base under mottle + hatch).
- Characters: `girl.js` only — flat cel + one shade + warm line. Use the `light` option for rim light:
  act 1 `{ rim: PAL.glow, rimAmt: 0.6–0.9, side: 1 }` (red horizon behind), act 2 / calm `{ rim: '#8ea2dc', rimAmt: 0.4 }`,
  page glow on face: `glow: PAL.paper, glowAmt: 0.3–0.6`.
- Red = rejection (act 1). Green (`PAL.alder*`) = her and her page. Brand teal/amber only in the logo/CV chrome.
- Type: her words in Alegreya (`C.FONT.serif / serifMed / serifIt`), product line in Figtree (`C.FONT.sans*`).
  Anything the viewer must read: ≥ 34 px tall glyphs at 1920 wide, high contrast, held ≥ 1 s.
- Post grain + vignette are applied automatically after `draw()`.

## 6. Vertical (1080×1920) render

- Same draw code; `env.vertical` is true and `camera()` centres on `vx`.
- Screen-space text/UI: call `ui(ctx, env)` → coordinates in design px of `env.uiW × env.uiH`
  (1920×1080 or 1080×1920). Lay text out per mode (e.g. lower third in landscape, bottom quarter in vertical).

## 7. Tools

```bash
node tools/still.js --t 2.5,4.6 --scale 0.5 --dir out/stills/river --tag S2      # landscape stills (seconds)
node tools/still.js --f 75,140 --scale 0.5 --mode vertical --dir out/stills/river --tag S2v
python3 tools/contact.py out/stills/river/contact.png a.png:label b.png:label --cols 3
node tools/render.js --mode landscape --scale 0.5 --from 60 --to 360 --out out/cache/river_preview.mp4
```
Look at your stills with the Read tool (it shows images). Always check one 360-px-wide downscale for readability:
`python3 -c "from PIL import Image; im=Image.open('X.png'); im.resize((360, int(360*im.height/im.width))).save('X_360.png')"`.

## 8. Critique loop (every shot, ≥ 3 rounds)

Render 3–5 stills per shot (landscape + at least one vertical). Score 1–10:
hook · readability@360px · motion · composition · depth · sound sync (does the visual event land on the cue time
in the shot list?) · polish · brand clarity. Write each round to `docs/review/<chapter>.md`:

```
## S2 — round 2
| hook | read@360 | motion | comp | depth | sync | polish | brand |
|  7   |    8     |   7    |  8   |   7   |  8   |   6    |  n/a  |
Problems: 1) … 2) … 3) …
Fixes made: …
```
Repeat until every applicable score is ≥ 8. Brand clarity is "n/a" before 0:22 except that the green clip/leaf
motif should be legible.

## 9. Banned

Glossy SaaS gradients, devices/laptops/phones, neon, 3D, emoji, confetti, Memphis shapes, corporate-flat people,
floating drop-shadow cards, lens flares, camera shake, bouncy text, copying any reference composition or character.
