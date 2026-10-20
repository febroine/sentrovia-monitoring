# Style guide — "One Page" (aldercv.com, 30 s)

Everything in the film is drawn in code (Canvas 2D via `@napi-rs/canvas`, Skia under the hood).
No generated imagery, no stock, no API keys. The four frames in `refs/` are **grammar only**.

## What we take from the references (and what we never take)

| Ref | Take | Never take |
|---|---|---|
| `ref1_flowers_bank` | Dense hand-painted botanical wall behind a flat cel character; leaf clusters painted as hundreds of individual strokes; long hold, centred stillness; the sitting-on-the-ground calm | the whale, the girl's design, the pole/vines composition, the pink oleander wall as a layout |
| `ref2_corridor` | Visible brush/pencil marks on every surface (wood grain, marble veins); warm interior saturation; "every surface is hand-made" | the corridor, the figure, the wallpaper, the mirror |
| `ref3_eye_closeup` | Extreme close-up on eyes, painted concentric iris rings, single specular dot, flat cel face against a painterly background | the white-haired face paint, the character |
| `ref4_horizon_river` | Wide horizon, sky as layered bands: **indigo → blue → burnt red** with a black treeline; water drawn as **long ribbon bands** curving toward the horizon; silver agave in the foreground | the fox, the girl, the promenade, the exact horizon composition |

## Palette (hex, named in `src/lib/palette.js`)

Night & horizon
- `night0 #10132b` top of sky · `night1 #1b2350` · `night2 #2a3c78` · `blueband #4f78b8`
- `ember0 #6e1a14` · `ember1 #a8301c` · `ember2 #d4512a` · `glow #ef8a3c` (horizon hot line)
- `treeline #17121f`

Paper
- `paper #efe6cf` · `paperWarm #e8d8b4` · `paperShade #c7b08a` · `ink #2b2330` · `stampRed #b3362a`

Botanical
- `leafDeep #1d3529` · `leaf #2f5a3c` · `leafMid #4f7d4a` · `leafLight #8fae6a`
- `agave #b8c4bd` · `agaveLight #e2e8e1` · `agaveShade #7d8c88`
- `bloom #e69aa6` · `bloomLight #f4c3c6` (night-tinted, used sparingly on the bank)

Character (flat cel, 2 tones + line)
- skin `#f0d6c0` / shade `#d6ab95` / line `#4b2f2b`
- hair `#2a1f24` / hair light `#4d3c48` — chin-length bob with bangs
- shirt (pale sage-blue) `#aabdc4` / shade `#7d94a1`
- trousers (indigo) `#2f3659` / shade `#1f2441`
- one **alder-green hair clip** — the accent is on her from the first wide shot

Accent — alder green (one accent only)
- `alder #3f9a6e` · `alderDeep #1d5a43` · `alderLight #8fd4a9`
- Derived from the AlderCV brand: their chrome is deep teal `#123D45`; no `refs/brand.png` was supplied,
  so the green is the brand teal pushed toward a living-leaf green so it reads against both indigo and cream.
- Brand lockup (end card / CV screen chrome) uses the real brand: teal `#123D45`, leaf amber `#E3912B`,
  paper `#F1EFEA`. The amber leaf appears **only** in the logo mark.

Colour rules
- Red belongs to rejection (email glow, stamps, horizon). It drains out of the frame after 0:12.
- Green belongs to her (hair clip, leaves on the page, the final eye reflection). It never appears in act 1 except on her.
- No pure black and no pure white anywhere except the 8-frame cut to black.

## Type

- **Her words** (on the page, the résumé text, the tagline): **Alegreya** (humanist serif, OFL) — Regular / Medium / Italic.
- **Product line** (`aldercv.com`, CV UI): **Figtree** (OFL) — the font aldercv.com itself uses.
- Readability floor: any text the viewer must read is ≥ 34 px cap-height-equivalent at 1920 wide
  (≈ 6.4 px at 360 wide) and on a calm background; the URL is ≥ 64 px on the end card.
- Text is never animated letter-by-letter with bounce. It grows (stroke reveal, left to right, like a vine) or fades.

## Texture

- Every surface: base fill + **gouache mottling** (low-frequency fbm noise, ±6 % value) +
  **pencil hatching** (thin 0.6–1.2 px strokes, 25–40° angle, clipped to the shape, 8–18 % alpha) + **paper grain** (screen-space multiply, applied last).
- Grain "boils" on twos: the screen grain swaps between 3 pre-rendered tiles every 2 frames.
- Characters are cel: flat fill + one shade shape + 1.6–2.4 px warm dark line (never pure black). Characters animate **on twos** (15 fps); the camera and water move on ones (30 fps).
- No blur except: depth-of-field softening of far layers (≤ 2 px) and the page glow.

## Camera

- One movement per shot: a slow push, a slow pull, a slow drift or a slow tilt — eased with `easeInOutSine`, never more than ~8 % zoom change or ~120 px of travel per shot.
- Holds: every shot has at least 0.6 s where nothing but water/grain moves.
- Cuts are hard cuts or a blink. No whip pans, no shakes, no zoom punches, no dissolves except the paper → screen transformation.

## Sound

- No `audio/track.wav` was provided → the score is composed in code (`audio/score.py`, numpy):
  soft additive piano, a slow pad, procedural water and paper rustle, one breath, one warm chord at the resolution.
- Act 1 is noisy (water, paper, tearing); 0:12–0:16 is near silence; act 2 is sparse piano synced to each leaf; the warm chord lands when the CV screen appears.

## Banned

Glossy SaaS gradients, laptops/phones/device mockups, neon, 3D, emoji, confetti, Memphis shapes,
corporate-flat people, drop-shadowed cards floating in space, lens flares, camera shake.
