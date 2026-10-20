# Brand chapter review (S6, S7)

Stills: `out/stills/brand/` (landscape `--scale 0.5`, vertical `--mode vertical --scale 0.5`, 360-px downscales `*_360.png`).
Scores: hook · read@360 · motion · comp · depth · sync · polish · brand.

## S6b — round 1
| hook | read@360 | motion | comp | depth | sync | polish | brand |
|  7   |    8     |   6    |  7   |   6   |   8   |   6    |   8   |
Problems: 1) "BA Visual Communication" ran past the right edge of the page (column too narrow).
2) The hand-painted page at the cut had a grey halo ring (blur-filtered edge stroke leaking outside its clip) and
was small in frame; the glow barely read. 3) The 24.4–24.6 crossfade put two texts on top of each other
(painted lines + CV lines) for 2–3 frames: muddy.
Fixes made: columns re-spaced (Skills | Experience at +360 | Education at +900); URL in the bar 64→74 px
(cap ≈ 52 px → ≈ 9.7 px at 360 wide), bar 150 px, name 140 px; painted edge now layered clipped strokes (no blur).

## S7 — round 1
| hook | read@360 | motion | comp | depth | sync | polish | brand |
|  7   |    8     |   7    |  7   |   7   |   8   |   5    |   8   |
Problems: 1) `girl.bust` shoulders are ~3.3 head-widths wide: in an MCU she reads as a head on a blocky cape,
with a big rectangular shade block. 2) Face light from the page is faint. 3) Vertical: bottom-quarter text sits on
her pale shirt (needs a night scrim).
Fixes made: local `miraBust()` in brand.js (same cel recipe: celPart + one shade + rim + page glow, sloped
shoulders ~2.4 head-widths, folds, placket, 3 buttons) at scale 2.55; added below-frame page glow; vertical
scrim (night0, 0→0.9) under the bottom-quarter text.

## S6b — round 2
| hook | read@360 | motion | comp | depth | sync | polish | brand |
|  8   |    8     |   8    |  8   |   6   |   9   |   8    |   9   |
Problems: 1) Depth: panel on a flat painted night; acceptable for an insert but thin. 2) Halo at the cut could be
stronger. 3) Leaf accent near the name is tiny at 360 px.
Fixes made: transition re-staged into 3 non-overlapping steps inside 6 frames — (a) painted grain + words dissolve
to a clean brandPaper blank as the sheet de-rotates (−1.4°→0) and its edges straighten into the panel rect
(k 0→0.5), (b) teal bar + CV resolve on it (k 0.4→1), fully resolved at f738 (24.6 s); larger page at the cut
(960 px tall), halo 1.0 at cut + swell on the chord (Gaussian at 24.52 s); leaf accent 0.42→0.5 × name size.

## S7 — round 2
| hook | read@360 | motion | comp | depth | sync | polish | brand |
|  8   |    9     |   8    |  8   |   7   |   9   |   7    |   9   |
Problems: 1) Hair silhouette from the lib is helmet-like at this size (lib, not touched). 2) Rim light barely
reads. 3) Sea ribbons bottom-left are busy behind the tagline.
Checked: tagline grows left→right 27.0–27.55 (soft edge, no bounce); URL + logo fade/rise 27.6–27.9, legible at
27.7 (bell 27.6); look-up 27.9→28.13 in 4 drawings on twos (lookY 1→0, lids 0.5→1, mouth → 'soft' on the 3rd
drawing); stillness 28.2–29.0 (0.8 s). URL 96 px Figtree SemiBold (cap ≈ 67 px; ≈ 12.6 px at 360 wide).
