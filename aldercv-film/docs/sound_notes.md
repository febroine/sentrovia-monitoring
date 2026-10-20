# Sound notes — "One Page" score

Everything is synthesised in `audio/score.py` (Python 3 + numpy only; no scipy, no samples,
no downloads, no TTS). Fixed seeds: two runs produce byte-identical files.

```
python3 audio/score.py                                   # -> audio/score.wav, audio/cues.json, audio/stems/*
python3 tools/beats.py audio/score.wav --cues audio/cues.json   # sync check (exit 1 if a hard cue is > 40 ms off)
python3 tools/beats.py --selftest                        # detector accuracy on synthetic attacks
```

Output: `audio/score.wav`, 48 kHz / 16-bit stereo (TPDF dither), exactly 1,440,000 frames = 30.000 s.
Stems (`audio/stems/music.wav`, `sfx.wav`, `ambience.wav`) are written at the master gain, before the
limiter, each with its own share of the reverb, so they sum back to the mix (residual -38.7 dB).
`audio/stems/spectrogram.png` is a log-frequency spectrogram (30 Hz–16 kHz) with the cue ticks at the top
(red = hard cue, blue = soft cue).

## Instruments

| Voice | How it's made |
|---|---|
| **Felt piano** | Additive. Stretched partials `f_n = n f0 sqrt(1+B n^2)` (B rises with pitch). 1–3 strings per note, detuned about ±1 cent, so the tone beats slowly. Each partial has a two-stage (prompt + aftersound) exponential decay, and higher partials decay faster, so the tone darkens over time. Felt hammer: a 2.5–7 ms raised-cosine attack, velocity-dependent spectral roll-off, a strike-position comb notch near partial 7, and a 30 ms band-passed hammer-noise/thump transient. Optional damper release of 120 ms. |
| **Pad** | Three detuned saw stacks per note (±9 cents, slow random pitch drift). Band-limited and additive, with a time-varying 4-pole low-pass applied per harmonic, so the filter opens during the swell. |
| **Glass shimmer / twinkles** | Free-bar partial ratios 1 : 2.756 : 5.404 : 8.933. Slow attack (30–70 ms), per-partial decay, and a slightly detuned twin for each partial. |
| **URL bell** | Soft celesta-like bell: partials 1, 2, 3, 4.17, 5.43, plus a tiny mallet tick. |
| **Hook drone** | A1 sine pair (55 / 55.18 Hz, slow beat) + E2 triangle + A2/E3 overtones, slow swell. |
| **Notification blips** | E5 + E5 +7 cents (detuned pair) with a faint 2nd harmonic. 2.5 ms attack, 110 ms decay. |
| **Held breath** | STFT-shaped noise: a soft inhale, then a faint airy hold that tightens until the blink cut. |
| **Water bed** | Brown/pink noise shaped in the STFT domain. A 850 Hz low-pass wanders slowly with LFOs, and a smoothed random time×band "babble" field modulates it. L/R are partly decorrelated (shared + independent noise). Rising-pitch bubble model gurgles, about 11/s in S2 and 7/s in S3. |
| **Paper rustle** | Crackle grains of 3–30 ms cut from 4 pre-filtered noise bands (1.1/2.2/3.8/6 kHz), with Poisson density modulated by LFOs. Plus slow 150–500 ms "sheet sliding" swishes. |
| **Tears** | 0.36 s fibrous rip: dense micro-fibre grains at 380–680/s, a band-passed body noise, and an initial "snap" that sets the onset. Low-passed at 8.5 kHz so it stays crisp without getting harsh. |
| **Sinking bloops** | Low sine, exponential pitch drop (240→100 Hz), with small bubbles riding on it. |
| **Wet grab** | Squelch (a noise resonance falling from 1.45 kHz to 450 Hz) + wet crinkle grains + 4 drips afterwards. |
| **Ink trickle** | Narrow band noise whose centre falls from 2.6 kHz to 900 Hz, with liquid flicker, plus drip "plinks" (about 7.5/s) whose pitch falls from 2 kHz to 750 Hz. |
| **Page drifting away** | Band noise whose centre falls from 1.3 kHz to 450 Hz, panned from centre to right, plus a distant small bloop as the page sinks. |
| **Exhale** | Noise with relaxed-vowel formants (650/1350/2500 Hz) that drift downward, a 45 ms rise and about 1.2 s of decay, low-passed at 4.2 kHz to keep it warm. |
| **Room tone** | Pink noise, low-passed at 1.8 kHz, about -56 dB under the master, from 12.0 to 29.0. |
| **Pencil** | Strokes of 45–120 ms from a 4.2 kHz + 1.6 kHz band-noise buffer, with fast graphite "grit" modulation. Panned left to right as the line grows. |
| **Reverb** | Convolution with a stereo exponentially-decaying noise IR: RT60 2.2 s at low/mid frequencies, shorter in the highs (frequency-dependent decay shaped in the STFT domain). 20 ms pre-delay, 7 early reflections, low-cut at 140 Hz. One IR, used as a per-voice send on each bus. |
| **Master** | 22 Hz zero-phase high-pass and DC removal, a stereo-linked 5 ms look-ahead peak limiter (ceiling -1.5 dBFS), and a gain loop to -16 LUFS (BS.1770 K-weighting with gating, implemented in numpy). 30 ms fade-in at 0.0 and 15 ms fade-out at 30.0 for the loop seam. |

Harmony: Act 1 is A minor, low and sparse, with minor-second rubs (B/C, E/F, G#/A, A/Bb).
Act 2 is F major with a lydian B (Fmaj7#11) and soft low chords, kept at least 150 ms away from the leaf notes.
The leaves spell C5–E5–G5–A5. The resolution is **Fmaj9**: F1 + C2 (low root and open fifth), then A3 E4 G4 C5,
rolled over 26 ms on piano and played by the pad at the same time.
The loop note is E6. E is also the fifth of the A/E drone at 0.0, so the loop seam stays in key.

## Cue list (`audio/cues.json`)

"hard" = a transient that must land within 40 ms; "soft" = a swell, fade or bed change with no transient by design.

| t (s) | frame | cue | kind |
|---|---|---|---|
| 0.000 | 0.0 | drone_in (loop seam) | soft |
| 0.050 | 1.5 | held_breath | soft |
| 0.150 | 4.5 | blip_1 (red pulse) | hard |
| 0.850 | 25.5 | blip_2 (red pulse) | hard |
| 1.550 | 46.5 | blip_3 (red pulse) | hard |
| 2.000 | 60.0 | blink_cut (S1->S2) | soft |
| 2.000 | 60.0 | water_in | soft |
| 2.000 | 60.0 | paper_rustle_in | soft |
| 3.600 | 108.0 | tear_1 | hard |
| 4.000 | 120.0 | sink_bloop_1 | soft |
| 5.200 | 156.0 | tear_2 | hard |
| 5.600 | 168.0 | sink_bloop_2 | soft |
| 7.400 | 222.0 | wet_grab | hard |
| 8.300 | 249.0 | ink_slide_start | soft |
| 10.800 | 324.0 | page_drifts_away | soft |
| 12.000 | 360.0 | water_paper_fade_out | soft |
| 12.600 | 378.0 | exhale | hard |
| 12.800 | 384.0 | near_silence (room tone) | soft |
| 16.000 | 480.0 | act2_piano_returns | soft |
| 16.300 | 489.0 | smooth_sheet | soft |
| 16.800 | 504.0 | line_1_pencil | soft |
| 17.500 | 525.0 | leaf_1_C5 | hard |
| 18.300 | 549.0 | line_2_pencil | soft |
| 18.900 | 567.0 | leaf_2_E5 | hard |
| 19.500 | 585.0 | line_3_pencil | soft |
| 20.000 | 600.0 | leaf_3_G5 | hard |
| 20.500 | 615.0 | line_4_pencil | soft |
| 21.100 | 633.0 | leaf_4_A5 | hard |
| 22.000 | 660.0 | shimmer_page_lifts | soft |
| 22.000 | 660.0 | pad_swell_start | soft |
| 23.500 | 705.0 | sea_to_stars_twinkles | soft |
| 24.500 | 735.0 | WARM_CHORD Fmaj9 (CV reveal) | hard |
| 27.600 | 828.0 | url_bell C6 | hard |
| 29.000 | 870.0 | cut_to_black | soft |
| 29.267 | 878.0 | calm_eye_note E6 (frame 878) | hard |

## Mix levels

`score.py` loudness (numpy BS.1770) and an independent check with `ffmpeg -af ebur128=peak=true+sample`:

| Measure | Value |
|---|---|
| Integrated loudness | **-16.0 LUFS** (ffmpeg: -16.0 LUFS, threshold -26.5) |
| Sample peak | **-1.5 dBFS** |
| True peak | **-1.3 dBTP** |
| Loudness range | 10.8 LU |
| Limiter | max gain reduction 1.3 dB (only on the first tear's snap and the chord's attack) |
| DC offset | < 1e-8 |
| Loop seam | last 10 ms -75 dBFS RMS → first 10 ms -58 dBFS RMS. Both ends are faded to digital zero. |
| E6 (frame 878) decay | -40.9 dB below its peak by 29.95–29.97 s |
| L/R correlation | hook 0.95, act 1 0.58, act 2 0.64, brand 0.66. Mono fold-down loses ≤ 1.1 dB. |

Short-term loudness by section (mix, K-weighted):

| Section | Loudness | Peak |
|---|---|---|
| hook (0.00–2.00 s) | -18.8 LUFS | -7.6 dBFS |
| S2 river (2.00–7.00 s) | -15.4 LUFS | -1.5 dBFS |
| S3 insert (7.00–12.00 s) | -15.1 LUFS | -1.9 dBFS |
| exhale (12.40–13.80 s) | -24.8 LUFS | -10.6 dBFS |
| near-silence (13.80–16.00 s) | -39.2 LUFS | -26.6 dBFS |
| act 2 (16.00–22.00 s) | -18.3 LUFS | -6.3 dBFS |
| lift/pad (22.00–24.40 s) | -17.3 LUFS | -6.8 dBFS |
| warm chord (24.50–27.00 s) | -12.5 LUFS | -1.5 dBFS |
| tail+bell (27.00–29.00 s) | -15.6 LUFS | -5.4 dBFS |
| black (29.00–29.26 s) | -30.9 LUFS | -16.4 dBFS |
| E6 note (29.27–30.00 s) | -26.0 LUFS | -11.5 dBFS |

Stems at master gain: music -17.2 LUFS, ambience -19.7 LUFS, sfx -25.0 LUFS (the sfx are transient and sparse).

## beats.py verification

Detector: spectral flux on a log-compressed 1024-point STFT with a 2.5 ms hop and a SuperFlux-style frequency max-filter.
The flux is normalised to its local ±2 s maximum, peaks are picked against an adaptive threshold and then
parabolically interpolated. On synthetic attacks in noise (`--selftest`) the mean error is +1.5 ms and the maximum is 6.2 ms.

```
$ python3 tools/beats.py audio/score.wav --cues audio/cues.json --quiet
# audio/score.wav: 30.000 s @ 48000 Hz, 186 onsets (delta=0.035)

cue                            kind    t_cue  frame    onset   d(ms)   str  status
------------------------------------------------------------------------------------
drone_in (loop seam)           soft    0.000    0.0    0.147  +147.0  0.14  soft (no transient by design)
held_breath                    soft    0.050    1.5    0.147   +97.0  0.14  soft (no transient by design)
blip_1 (red pulse)             hard    0.150    4.5    0.147    -3.0  0.14  OK
blip_2 (red pulse)             hard    0.850   25.5    0.848    -2.3  0.09  OK
blip_3 (red pulse)             hard    1.550   46.5    1.548    -2.3  0.07  OK
blink_cut (S1->S2)             soft    2.000   60.0    2.102  +102.4  0.52  soft (no transient by design)
water_in                       soft    2.000   60.0    2.102  +102.4  0.52  soft (no transient by design)
paper_rustle_in                soft    2.000   60.0    2.102  +102.4  0.52  soft (no transient by design)
tear_1                         hard    3.600  108.0    3.597    -3.3  0.77  OK
sink_bloop_1                   soft    4.000  120.0    3.975   -25.0  0.15  ok
tear_2                         hard    5.200  156.0    5.196    -4.2  1.00  OK
sink_bloop_2                   soft    5.600  168.0    5.617   +17.2  0.11  ok
wet_grab                       hard    7.400  222.0    7.401    +0.9  0.47  OK
ink_slide_start                soft    8.300  249.0    8.227   -72.6  0.08  soft (no transient by design)
page_drifts_away               soft   10.800  324.0   10.781   -19.2  0.49  ok
water_paper_fade_out           soft   12.000  360.0   11.925   -75.0  0.10  soft (no transient by design)
exhale                         hard   12.600  378.0   12.617   +17.5  0.19  OK
near_silence (room tone)       soft   12.800  384.0   12.617  -182.5  0.19  soft (no transient by design)
act2_piano_returns             soft   16.000  480.0   15.999    -1.5  0.21  ok
smooth_sheet                   soft   16.300  489.0   16.441  +140.9  0.09  soft (no transient by design)
line_1_pencil                  soft   16.800  504.0   16.802    +2.5  1.00  ok
leaf_1_C5                      hard   17.500  525.0   17.498    -1.6  0.82  OK
line_2_pencil                  soft   18.300  549.0   18.302    +2.2  0.93  ok
leaf_2_E5                      hard   18.900  567.0   18.898    -1.8  0.77  OK
line_3_pencil                  soft   19.500  585.0   19.502    +2.1  0.62  ok
leaf_3_G5                      hard   20.000  600.0   19.998    -1.9  0.69  OK
line_4_pencil                  soft   20.500  615.0   20.503    +2.7  0.76  ok
leaf_4_A5                      hard   21.100  633.0   21.098    -1.6  0.61  OK
shimmer_page_lifts             soft   22.000  660.0   21.654  -345.7  0.10  soft (no transient by design)
pad_swell_start                soft   22.000  660.0   21.654  -345.7  0.10  soft (no transient by design)
sea_to_stars_twinkles          soft   23.500  705.0   23.457   -43.0  0.10  soft (no transient by design)
WARM_CHORD Fmaj9 (CV reveal)   hard   24.500  735.0   24.498    -2.0  0.77  OK
url_bell C6                    hard   27.600  828.0   27.599    -0.8  0.22  OK
cut_to_black                   soft   29.000  870.0   29.264  +264.3  1.00  soft (no transient by design)
calm_eye_note E6 (frame 878)   hard   29.267  878.0   29.264    -2.4  1.00  OK
------------------------------------------------------------------------------------
hard cues: 14/14 within +/-40 ms
```

All 14 hard cues land within ±5 ms: the 3 blips, 2 tears, the grab, the exhale, the 4 leaf notes, the warm chord,
the URL bell and the frame-878 note. Every soft cue except the bloops and pencil starts is reported as "no transient
by design", as intended (swells, fades, bed changes). Both bloops still match within 25 ms.
