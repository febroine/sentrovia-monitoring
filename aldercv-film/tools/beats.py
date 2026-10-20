#!/usr/bin/env python3
"""Onset / sync-point measurement for the "One Page" score (numpy only).

Usage:
    python3 tools/beats.py audio/score.wav [--cues audio/cues.json] [--delta 0.035] [--quiet]

Detection: spectral flux on a log-compressed magnitude STFT (1024-pt Hann,
centred frames, 2.5 ms hop) with a SuperFlux-style frequency max-filter on the
reference frame (suppresses flux from slow pitch drift / noise shimmer). The
flux curve is normalised by its local (+/-2 s) maximum (floored at 0.2 x the
global max) so quiet passages are as visible as loud ones, then peaks are
picked with an adaptive threshold (local 150 ms mean + delta), a +/-30 ms
local-maximum test and 30 ms minimum spacing; peak times are parabolically
interpolated. Bias measured on synthetic attacks in noise: see --selftest.

With --cues, every cue {t, name[, kind]} is matched to the strongest detected
onset within +/-40 ms (or the nearest onset if none is that close) and any
|delta| > 40 ms is FLAGged. Cues with kind == "soft" are swells/fades that
have no transient by design; they are reported but do not fail the check.
Exit code 1 if any hard cue is flagged.
"""
import argparse
import json
import sys
import wave

import numpy as np

TOL_MS = 40.0


def read_wav(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sw == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        x = v.astype(np.float64) / float(1 << 23)
    elif sw == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / float(1 << 31)
    else:
        raise SystemExit(f"unsupported sample width {sw}")
    x = x.reshape(-1, ch)
    return sr, x.mean(axis=1)


def stft_mag(x, n_fft, hop):
    pad = n_fft // 2
    xp = np.pad(x, (pad, pad))
    n_frames = 1 + (len(xp) - n_fft) // hop
    win = np.hanning(n_fft + 1)[:-1]
    out = np.empty((n_frames, n_fft // 2 + 1))
    step = 2048  # frames per chunk, keeps memory bounded
    ar = np.arange(n_fft)
    for s in range(0, n_frames, step):
        e = min(n_frames, s + step)
        idx = ar[None, :] + hop * np.arange(s, e)[:, None]
        out[s:e] = np.abs(np.fft.rfft(xp[idx] * win, axis=1))
    return out  # frame i is centred on sample i*hop


def onset_strength(x, sr, n_fft=1024, hop=None, lag=2):
    hop = hop or int(round(sr * 0.0025))
    mag = stft_mag(x, n_fft, hop)
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    band = (freqs >= 40) & (freqs <= 16000)
    mag = mag[:, band]
    ref = np.percentile(mag, 99.5) + 1e-12
    S = np.log1p(100.0 * mag / ref)
    # SuperFlux: max-filter the reference frame along frequency (3 bins)
    Sm = S.copy()
    Sm[:, 1:] = np.maximum(Sm[:, 1:], S[:, :-1])
    Sm[:, :-1] = np.maximum(Sm[:, :-1], S[:, 1:])
    flux = np.zeros(S.shape[0])
    d = S[lag:] - Sm[:-lag]
    flux[lag:] = np.maximum(d, 0.0).sum(axis=1)
    flux /= flux.max() + 1e-12
    return flux, hop


def moving(x, w, fn):
    from numpy.lib.stride_tricks import sliding_window_view
    xp = np.pad(x, (w, w), mode="edge")
    v = sliding_window_view(xp, 2 * w + 1)
    return fn(v, axis=1)


def pick_peaks(flux, sr, hop, delta=0.035, pre_ms=30, post_ms=30, mean_ms=150, min_gap_ms=30):
    fr = sr / hop
    wmax = max(1, int(round(pre_ms * 1e-3 * fr)))
    wmean = max(1, int(round(mean_ms * 1e-3 * fr)))
    lmax = moving(flux, wmax, np.max)
    lmean = moving(flux, wmean, np.mean)
    cand = np.where((flux >= lmax) & (flux >= lmean + delta) & (flux > 0))[0]
    gap = int(round(min_gap_ms * 1e-3 * fr))
    peaks = []
    for i in cand:
        if peaks and i - peaks[-1] < gap:
            if flux[i] > flux[peaks[-1]]:
                peaks[-1] = i
            continue
        peaks.append(i)
    return np.array(peaks, dtype=int)


def local_normalise(flux, sr, hop, floor=0.2, win_s=2.0):
    """divide by the local (+/-2 s) flux maximum, floored at `floor` x global
    max, so quiet passages (the hook, act 2) are as visible as the loud river."""
    w = int(win_s * sr / hop)
    lm = moving(flux, w, np.max)
    return flux / np.maximum(lm, floor)


def interp_peak(y, i):
    """parabolic interpolation of a peak index"""
    if 0 < i < len(y) - 1:
        a, b, c = y[i - 1], y[i], y[i + 1]
        den = a - 2 * b + c
        if den < 0:
            return i + 0.5 * (a - c) / den
    return float(i)


def detect(path, delta=0.035, floor=0.2):
    sr, x = read_wav(path)
    flux, hop = onset_strength(x, sr)
    flux = local_normalise(flux, sr, hop, floor)
    peaks = pick_peaks(flux, sr, hop, delta=delta)
    times = np.array([interp_peak(flux, p) * hop / sr for p in peaks])
    strength = flux[peaks] if len(peaks) else np.array([])
    return sr, len(x) / sr, times, strength


def selftest(sr=48000):
    """synthetic check: felt-piano-like tones, clicks and noise bursts at known
    times inside pink-ish noise; prints the detection error for each."""
    r = np.random.default_rng(0)
    n = sr * 6
    x = np.cumsum(r.standard_normal(n)) * 0.0
    w = r.standard_normal(n)
    X = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1 / sr)
    X /= np.sqrt(np.maximum(f, 20))
    x += np.fft.irfft(X, n) * 0.02 / np.std(np.fft.irfft(X, n))
    truth = []
    for k, t0 in enumerate(np.arange(0.5, 5.6, 0.45)):
        s0 = int(t0 * sr)
        tt = np.arange(int(0.4 * sr)) / sr
        kind = k % 3
        if kind == 0:  # soft harmonic tone (piano-ish), 5 ms attack
            s = sum(np.sin(2 * np.pi * 523.25 * h * tt) / h ** 1.5 for h in range(1, 7)) * np.exp(-tt / 0.3) * np.minimum(1, tt / 0.005)
        elif kind == 1:  # noise burst
            s = r.standard_normal(len(tt)) * np.exp(-tt / 0.03) * np.minimum(1, tt / 0.001)
        else:  # low harmonic tone, 3 ms attack
            s = sum(np.sin(2 * np.pi * 110 * h * tt) / h for h in range(1, 10)) * np.exp(-tt / 0.5) * np.minimum(1, tt / 0.003)
        x[s0:s0 + len(tt)] += s * 0.1
        truth.append((t0, ["tone 5ms", "noise", "low tone"][kind]))
    x[: int(0.01 * sr)] *= np.linspace(0, 1, int(0.01 * sr))
    flux, hop = onset_strength(x, sr)
    flux = local_normalise(flux, sr, hop)
    pk = pick_peaks(flux, sr, hop)
    times = np.array([interp_peak(flux, p) * hop / sr for p in pk])
    errs = []
    for t0, name in truth:
        e = (times[np.argmin(np.abs(times - t0))] - t0) * 1000
        errs.append(e)
        print(f"  {name:<9} t={t0:5.2f}  err {e:+6.1f} ms")
    print(f"  mean {np.mean(errs):+.1f} ms, max |err| {np.max(np.abs(errs)):.1f} ms, {len(times)} onsets for {len(truth)} events")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav", nargs="?")
    ap.add_argument("--selftest", action="store_true", help="run the synthetic accuracy check and exit")
    ap.add_argument("--cues", help="cues.json: list of {t, name[, kind]}")
    ap.add_argument("--delta", type=float, default=0.035, help="threshold above local mean (0..1)")
    ap.add_argument("--floor", type=float, default=0.2, help="local-normalisation floor (x global max flux)")
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--quiet", action="store_true", help="do not list every onset")
    a = ap.parse_args()
    if a.selftest or not a.wav:
        selftest()
        return 0

    sr, dur, times, strength = detect(a.wav, a.delta, a.floor)
    print(f"# {a.wav}: {dur:.3f} s @ {sr} Hz, {len(times)} onsets (delta={a.delta})")
    if not a.quiet:
        print("#   t (s)   frame  strength")
        for t, s in zip(times, strength):
            bar = "#" * int(round(s * 30))
            print(f"  {t:7.3f}  {t * a.fps:6.1f}  {s:5.3f} {bar}")

    if not a.cues:
        return 0
    with open(a.cues) as f:
        cues = json.load(f)
    print()
    print(f"{'cue':<30} {'kind':<5} {'t_cue':>7} {'frame':>6} {'onset':>8} {'d(ms)':>7} {'str':>5}  status")
    print("-" * 84)
    hard_fail = 0
    n_hard = 0
    for c in cues:
        t = float(c["t"])
        kind = c.get("kind", "hard")
        if len(times) == 0:
            on, s = float("nan"), 0.0
        else:
            near = np.where(np.abs(times - t) <= TOL_MS / 1000.0)[0]
            if len(near):
                i = near[np.argmax(strength[near])]
            else:
                i = int(np.argmin(np.abs(times - t)))
            on, s = times[i], strength[i]
        dms = (on - t) * 1000.0
        ok = abs(dms) <= TOL_MS
        if kind == "soft":
            status = "ok" if ok else "soft (no transient by design)"
        else:
            n_hard += 1
            status = "OK" if ok else "FLAG >40ms"
            hard_fail += 0 if ok else 1
        print(f"{c['name']:<30} {kind:<5} {t:7.3f} {t * a.fps:6.1f} {on:8.3f} {dms:+7.1f} {s:5.2f}  {status}")
    print("-" * 84)
    print(f"hard cues: {n_hard - hard_fail}/{n_hard} within +/-{TOL_MS:.0f} ms")
    return 1 if hard_fail else 0


if __name__ == "__main__":
    sys.exit(main())
