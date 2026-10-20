#!/usr/bin/env python3
"""Procedural score for "One Page" (30.0 s, 48 kHz / 16-bit stereo).

Everything is synthesised here with numpy: no samples, no downloads, no TTS.
Deterministic: every generator draws from its own fixed-seed RNG.

    python3 audio/score.py
      -> audio/score.wav            final mix (exactly 30.000 s)
      -> audio/cues.json            every sync point placed ({t, name, kind})
      -> audio/stems/music.wav      piano, pad, bells, drone (with reverb)
      -> audio/stems/sfx.wav        blips, paper, tears, ink, breath, pencil
      -> audio/stems/ambience.wav   water bed, bubbles, room tone, held breath
      -> audio/stems/spectrogram.png

Stems are written at the same master gain as the mix, pre-limiter, so
music + sfx + ambience ~= score (the limiter only touches a few peaks).

Timeline follows docs/shotlist.md exactly (frame = t * 30).
"""
import json
import os
import wave

import numpy as np

SR = 48000
DUR = 30.0
N = int(round(SR * DUR))  # 1,440,000 samples
FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
STEMS = os.path.join(HERE, "stems")

TARGET_LUFS = -16.0
CEIL_DB = -1.5  # sample-peak ceiling (keeps true peak <= -1 dBTP)

CUES = []


def cue(t, name, kind="hard"):
    CUES.append({"t": round(float(t), 4), "frame": round(float(t) * FPS, 2), "name": name, "kind": kind})


def rng(seed):
    return np.random.default_rng(seed)


def db(x):
    return 10.0 ** (x / 20.0)


# ---------------------------------------------------------------------------
# small DSP toolkit (no scipy)
# ---------------------------------------------------------------------------

def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def fade(n, kind="in"):
    """raised-cosine fade of n samples"""
    if n <= 0:
        return np.ones(0)
    r = 0.5 - 0.5 * np.cos(np.pi * (np.arange(n) + 0.5) / n)
    return r if kind == "in" else r[::-1]


def apply_edges(x, fin, fout):
    x = x.copy()
    fin = min(fin, len(x))
    fout = min(fout, len(x))
    if fin:
        x[..., :fin] *= fade(fin, "in")
    if fout:
        x[..., x.shape[-1] - fout:] *= fade(fout, "out")
    return x


def lp_mag(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (np.maximum(f, 0) / fc) ** (2 * order))


def hp_mag(f, fc, order=2):
    f = np.maximum(f, 1e-6)
    return 1.0 / np.sqrt(1.0 + (fc / f) ** (2 * order))


def bp_mag(f, fc, q):
    f = np.maximum(f, 1e-6)
    return 1.0 / np.sqrt(1.0 + q * q * (f / fc - fc / f) ** 2)


def fft_filter(x, mag_fn):
    """zero-phase filtering with an arbitrary magnitude response mag_fn(freqs)."""
    n = x.shape[-1]
    nfft = 1 << int(np.ceil(np.log2(n + 4096)))
    X = np.fft.rfft(x, nfft, axis=-1)
    f = np.fft.rfftfreq(nfft, 1.0 / SR)
    X *= mag_fn(f)
    return np.fft.irfft(X, nfft, axis=-1)[..., :n]


def stft(x, n=1024, hop=256):
    win = np.hanning(n + 1)[:-1]
    xp = np.pad(x, (n, n + n))
    frames = 1 + (len(xp) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    return np.fft.rfft(xp[idx] * win, axis=1)


def istft(X, length, n=1024, hop=256):
    win = np.hanning(n + 1)[:-1]
    fr = np.fft.irfft(X, n, axis=1) * win
    total = hop * (X.shape[0] - 1) + n
    out = np.zeros(total)
    ws = np.zeros(total)
    w2 = win * win
    for i in range(X.shape[0]):
        out[i * hop:i * hop + n] += fr[i]
        ws[i * hop:i * hop + n] += w2
    out /= np.maximum(ws, 1e-8)
    return out[n:n + length]


def shaped_noise(length, gain_fn, seed, n=1024, hop=256):
    """white noise shaped in the STFT domain by gain_fn(times[:,None], freqs[None,:])."""
    r = rng(seed)
    x = r.standard_normal(length)
    X = stft(x, n, hop)
    t = (np.arange(X.shape[0]) * hop - n) / SR + n / 2 / SR  # centre time of each frame
    f = np.fft.rfftfreq(n, 1.0 / SR)
    X *= gain_fn(t[:, None], f[None, :])
    return istft(X, length, n, hop)


def smooth_random(length_s, rate_hz, seed, n_out):
    """band-limited random control signal in [-1,1]-ish, sampled at n_out points over length_s."""
    r = rng(seed)
    k = int(np.ceil(length_s * rate_hz)) + 4
    pts = r.standard_normal(k)
    xs = np.linspace(0, k - 3 - 1e-6, n_out)
    i = np.floor(xs).astype(int)
    u = xs - i
    # cubic (Catmull-Rom) interpolation
    p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)


def pan_gains(p):
    a = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


class Bus:
    """stereo dry bus + stereo reverb send"""

    def __init__(self, name):
        self.name = name
        self.dry = np.zeros((2, N))
        self.send = np.zeros((2, N))

    def add(self, sig, t0, gain=1.0, pan=0.0, send=0.0):
        """sig: mono (n,) or stereo (2,n). t0 in seconds (sample-accurate)."""
        s0 = int(round(t0 * SR))
        if sig.ndim == 1:
            gl, gr = pan_gains(pan)
            sig = np.vstack([sig * gl, sig * gr])
        n = sig.shape[1]
        a, b = max(0, s0), min(N, s0 + n)
        if b <= a:
            return
        seg = sig[:, a - s0:b - s0] * gain
        self.dry[:, a:b] += seg
        if send:
            self.send[:, a:b] += seg * send


# ---------------------------------------------------------------------------
# instruments
# ---------------------------------------------------------------------------

def midi_hz(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
        "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def nm(name):
    """'C5' -> midi"""
    p, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + NOTE[p]


def piano(midi, vel=0.4, dur=None, seed=0, decay_scale=1.0, max_len=7.0, bright=1.0):
    """Soft felt piano, additive.

    - stretched (inharmonic) partials f_n = n f0 sqrt(1 + B n^2)
    - 1-3 strings per note, detuned by ~1 cent -> slow beating
    - two-stage (prompt / aftersound) exponential decay per partial; higher
      partials die faster, so the tone low-passes / darkens over time
    - felt hammer: soft attack ramp, spectral roll-off set by velocity,
      strike-position comb notch, short hammer-noise thump
    - damper: optional note-off with a 120 ms felt release
    Returns a mono array starting exactly at the hammer contact (sample 0).
    """
    r = rng(1000 + seed * 7 + midi)
    f0 = midi_hz(midi)
    B = float(np.clip(2.6e-4 * (f0 / 261.6) ** 1.1, 4e-5, 2.5e-3))
    t60_1 = float(np.clip(10.0 * (261.6 / f0) ** 0.55, 1.4, 16.0)) * decay_scale
    length = min(max_len, t60_1 * 0.9 + 0.4)
    if dur is not None:
        length = min(length, dur + 0.15)
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    nstr = 1 if f0 < 80 else (2 if f0 < 140 else 3)
    detune = {1: [0.0], 2: [-0.6, 0.7], 3: [-1.1, 0.15, 0.95]}[nstr]
    fc_felt = (900.0 + 3800.0 * vel) * bright
    tilt = 1.25 + 0.9 * (1.0 - vel)
    nmax = int(min(48, 15000.0 / f0))
    strike = 1.0 / 7.3
    for k in range(1, nmax + 1):
        fk = k * f0 * np.sqrt(1.0 + B * k * k)
        if fk > 16000:
            break
        amp = (1.0 / k ** tilt) * np.exp(-(fk / fc_felt) ** 1.6)
        amp *= 0.25 + 0.75 * abs(np.sin(np.pi * k * strike))
        if fk < 120:  # small soundboard: weak radiation of the deep fundamental
            amp *= 0.35 + 0.65 * (fk / 120.0)
        if amp < 1e-5:
            continue
        t60 = t60_1 / (1.0 + (fk / 1600.0) ** 1.25)
        kd = 6.91 / t60
        env = 0.68 * np.exp(-t * kd * 2.4) + 0.32 * np.exp(-t * kd * 0.55)
        part = np.zeros(n)
        for c in detune:
            cents = c * (0.6 + 0.8 * r.random())
            ph = r.random() * 2 * np.pi
            part += np.sin(2 * np.pi * fk * 2 ** (cents / 1200.0) * t + ph)
        out += amp * env * part / nstr
    # felt attack: 2.5..7 ms raised-cosine (softer for quiet notes)
    na = int(SR * (0.0025 + 0.0045 * (1.0 - vel)))
    out[:na] *= fade(na, "in")
    # hammer noise: short band-passed burst + low felt thump
    nh = int(0.03 * SR)
    hn = r.standard_normal(nh)
    hn = fft_filter(hn, lambda f: bp_mag(f, 1800 + 1500 * vel, 0.9) + 0.6 * bp_mag(f, 2.2 * f0 + 150, 1.5))
    he = np.exp(-np.arange(nh) / (0.0045 * SR)) * fade(nh, "out")
    he[:24] *= fade(24, "in")
    out[:nh] += hn * he * (0.035 + 0.05 * vel)
    out /= 0.9
    if dur is not None:
        nd = int(dur * SR)
        if nd < n:
            rel = int(0.12 * SR)
            g = np.ones(n)
            g[nd:nd + rel] = fade(min(rel, n - nd), "out")[: max(0, min(rel, n - nd))]
            g[nd + rel:] = 0
            out *= g
    out[-int(0.02 * SR):] *= fade(int(0.02 * SR), "out")
    return out * vel


def piano_pan(midi):
    return float(np.clip((midi - 60) / 36.0, -0.55, 0.55))


def glass(f0, amp=1.0, decay=2.0, attack=0.02, seed=0, ratios=(1.0, 2.756, 5.404, 8.933), length=None):
    """glass / free-bar bell partials, slow-ish attack, per-partial decay, slight beat."""
    r = rng(5000 + seed)
    length = length or decay * 1.6 + attack
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    pamp = [1.0, 0.28, 0.09, 0.035]
    for i, ra in enumerate(ratios):
        f = f0 * ra
        if f > 17000:
            continue
        d = decay / (1.0 + 0.9 * i)
        beat = 1.0 + (r.random() - 0.5) * 0.0012
        out += pamp[i % len(pamp)] * np.exp(-t / (d / 6.91 * 2.3)) * 0.5 * (
            np.sin(2 * np.pi * f * t + r.random() * 6.28) + np.sin(2 * np.pi * f * beat * t + r.random() * 6.28))
    na = max(8, int(attack * SR))
    out[:na] *= fade(na, "in")
    out[-int(0.03 * SR):] *= fade(int(0.03 * SR), "out")
    return out * amp


def bell(f0, amp=1.0, decay=2.4, seed=0):
    """soft celesta-like bell: mostly fundamental, octave, inharmonic 4.2/5.4 partials"""
    r = rng(6000 + seed)
    n = int((decay * 1.4 + 0.1) * SR)
    t = np.arange(n) / SR
    parts = [(1.0, 1.0, 1.0), (2.0, 0.22, 0.55), (3.0, 0.05, 0.4), (4.17, 0.06, 0.28), (5.43, 0.025, 0.2)]
    out = np.zeros(n)
    for ra, a, dr in parts:
        f = f0 * ra
        tau = decay * dr / 6.91 * 2.0
        out += a * np.exp(-t / tau) * np.sin(2 * np.pi * f * t + r.random() * 6.28)
    # tiny mallet tick
    nk = int(0.008 * SR)
    tick = fft_filter(r.standard_normal(nk), lambda f: bp_mag(f, 3200, 0.8)) * np.exp(-np.arange(nk) / (0.0015 * SR))
    out[:nk] += 0.06 * tick
    na = int(0.003 * SR)
    out[:na] *= fade(na, "in")
    out[-int(0.03 * SR):] *= fade(int(0.03 * SR), "out")
    return out * amp


def pad_voice(f0, t_len, env, fc_curve, seed, n_osc=3, spread_cents=9.0):
    """detuned saw stack, additive band-limited, with a time-varying low-pass
    (per-harmonic gain from fc_curve) and slow random pitch drift. Returns stereo."""
    r = rng(7000 + seed)
    n = int(t_len * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    fc = fc_curve  # per-sample cutoff (Hz)
    for o in range(n_osc):
        cents = (o - (n_osc - 1) / 2) * spread_cents / max(1, (n_osc - 1) / 2) + r.normal(0, 1.2)
        drift = 2.5 * smooth_random(t_len, 0.6, 7100 + seed * 13 + o, n)  # cents
        inst = f0 * 2 ** ((cents + drift) / 1200.0)
        phase = 2 * np.pi * np.cumsum(inst) / SR + r.random() * 6.28
        p = (o / max(1, n_osc - 1)) * 1.2 - 0.6
        gl, gr = pan_gains(p)
        k = 1
        kmax_f = min(5000.0, 3.5 * float(np.max(fc)))
        while k * f0 < kmax_f:
            g = (1.0 / k) * lp_mag(k * inst, fc, 2)
            v = g * np.sin(k * phase)
            out[0] += v * gl
            out[1] += v * gr
            k += 1
    out *= env / n_osc
    return out


# ---------------------------------------------------------------------------
# reverb: stereo exponentially-decaying noise IR, freq-dependent decay
# ---------------------------------------------------------------------------

def make_ir(rt60=2.2, predelay=0.020, length=2.8, seed=42):
    out = []
    n = int(length * SR)
    for ch in range(2):
        def g(t, f):
            rt = rt60 * (0.55 + 0.45 / (1.0 + (f / 3500.0) ** 1.3))
            dec = np.exp(-6.91 * np.maximum(t, 0) / rt)
            tone = lp_mag(f, 7000, 1) * hp_mag(f, 140, 1)
            build = smoothstep(np.maximum(t, 0) / 0.012)
            return dec * tone * build
        ir = shaped_noise(n, g, seed + ch, n=512, hop=128)
        # a few early reflections
        r = rng(seed + 10 + ch)
        for _ in range(7):
            d = int(r.uniform(0.004, 0.045) * SR)
            ir[d] += r.uniform(-1, 1) * 0.25 * np.std(ir[:int(0.08 * SR)]) * 6
        ir = np.concatenate([np.zeros(int(predelay * SR)), ir])
        out.append(ir)
    ir = np.array(out)
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    return ir


def reverb(send, ir, xmix=0.3):
    n = N + ir.shape[1]
    nfft = 1 << int(np.ceil(np.log2(n)))
    a = send[0] * (1 - xmix) + send[1] * xmix
    b = send[1] * (1 - xmix) + send[0] * xmix
    L = np.fft.irfft(np.fft.rfft(a, nfft) * np.fft.rfft(ir[0], nfft), nfft)[:N]
    R = np.fft.irfft(np.fft.rfft(b, nfft) * np.fft.rfft(ir[1], nfft), nfft)[:N]
    return np.vstack([L, R])


# ---------------------------------------------------------------------------
# loudness (BS.1770 K-weighting + gating, applied in the frequency domain)
# ---------------------------------------------------------------------------

def _biquad_mag(f, b, a):
    z = np.exp(-1j * 2 * np.pi * f / SR)
    return np.abs((b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z))


def k_weight(x):
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return fft_filter(x, lambda f: _biquad_mag(f, b1, a1) * _biquad_mag(f, b2, a2))


def lufs(x):
    y = k_weight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = []
    for s in range(0, y.shape[1] - blk + 1, hop):
        ms.append(np.sum(np.mean(y[:, s:s + blk] ** 2, axis=1)))
    ms = np.array(ms)
    lk = -0.691 + 10 * np.log10(ms + 1e-20)
    g = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = ms[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(np.mean(g2))


def short_term(x, t0, t1):
    y = k_weight(x[:, int(t0 * SR):int(t1 * SR)])
    return -0.691 + 10 * np.log10(np.sum(np.mean(y ** 2, axis=1)) + 1e-20)


def limiter(x, ceil_db=CEIL_DB, win_ms=5.0):
    """stereo-linked look-ahead peak limiter: centred min-filter of the required
    gain followed by a box average of the same width (never exceeds the need)."""
    from numpy.lib.stride_tricks import sliding_window_view
    c = db(ceil_db)
    pk = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    L = int(win_ms * 1e-3 * SR)
    m = sliding_window_view(np.pad(need, (L, L), mode="edge"), 2 * L + 1).min(axis=1)
    cs = np.concatenate([[0.0], np.cumsum(np.pad(m, (L, L), mode="edge"))])
    sm = (cs[2 * L + 1:] - cs[:-2 * L - 1]) / (2 * L + 1)
    gain = np.minimum(sm, need)
    return x * gain, gain


# ---------------------------------------------------------------------------
# the film
# ---------------------------------------------------------------------------

def build():
    music, sfx, amb = Bus("music"), Bus("sfx"), Bus("ambience")

    # ================= 0.00 - 2.00  HOOK =================
    t_end = 2.0
    n = int(t_end * SR) + int(0.03 * SR)
    t = np.arange(n) / SR
    swell = 0.3 + 0.7 * smoothstep(t / 1.7)
    drone = (0.55 * np.sin(2 * np.pi * 55.0 * t) + 0.35 * np.sin(2 * np.pi * 55.18 * t + 1.0)
             + 0.30 * (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * 82.41 * t + 0.3))  # triangle E2
             + 0.12 * np.sin(2 * np.pi * 110.0 * t + 0.7) + 0.05 * np.sin(2 * np.pi * 164.8 * t))
    drone *= swell
    env = np.ones(n)
    env[:int(0.03 * SR)] = fade(int(0.03 * SR), "in")  # loop seam: from silence
    cut = int(t_end * SR) - int(0.025 * SR)
    env[cut:cut + int(0.025 * SR)] = fade(int(0.025 * SR), "out")
    env[cut + int(0.025 * SR):] = 0
    drone = drone * env
    st = np.vstack([drone, drone])
    music.add(st, 0.0, gain=db(-16.5), send=0.15)
    cue(0.0, "drone_in (loop seam)", "soft")

    # three notification blips: E5 + slightly detuned E5 (+7 cents)
    for i, tb in enumerate([0.15, 0.85, 1.55]):
        nb = int(0.7 * SR)
        tt = np.arange(nb) / SR
        f = 659.255
        b = (np.sin(2 * np.pi * f * tt) + 0.8 * np.sin(2 * np.pi * f * 2 ** (7 / 1200) * tt + 0.5)
             + 0.07 * np.sin(2 * np.pi * 2 * f * tt))
        e = np.exp(-tt / 0.11) * (1 - np.exp(-tt / 0.0025))
        b = apply_edges(b * e, 0, int(0.02 * SR))
        sfx.add(b, tb, gain=db(-25 - i * 0.5), pan=0.08, send=0.35)
        cue(tb, f"blip_{i + 1} (red pulse)")

    # held breath: soft inhale then a faint airy hold that tightens to the blink
    def hb_gain(tt, f):
        e = np.where(tt < 0.5, smoothstep(tt / 0.35) * (1 - 0.6 * smoothstep((tt - 0.3) / 0.2)), 0.4 + 0.35 * smoothstep((tt - 0.5) / 1.5))
        shape = bp_mag(f, 900 + 500 * np.clip(tt, 0, 2), 0.7) * 0.8 + 0.5 * bp_mag(f, 2600, 1.5)
        return e * shape * hp_mag(f, 200, 2) * lp_mag(f, 5000, 2)
    hb = np.vstack([shaped_noise(n, hb_gain, 11), shaped_noise(n, hb_gain, 12)])
    hb *= env
    amb.add(hb, 0.0, gain=db(-41), send=0.05)
    cue(0.05, "held_breath", "soft")
    cue(2.0, "blink_cut (S1->S2)", "soft")

    # ================= 2.00 - 12.80  ACT 1: river of paper =================
    a0, a1, fo = 2.0, 12.0, 0.8
    n_act = int((a1 + fo - a0) * SR) + 1
    ta = np.arange(n_act) / SR + a0
    # master envelope for act-1 ambience/sfx: 40 ms hard-cut in, 0.8 s fade out from 12.0
    act_env = smoothstep((ta - a0) / 0.04) * (1 - smoothstep((ta - a1) / fo))

    # water bed: STFT-shaped brown/pink noise, slow cutoff/level modulation and a
    # smoothed random (time x band) babble field; L/R partly decorrelated.
    def water_gain(seed):
        nb = 28
        field = np.array([smooth_random(11.0, 4.0, seed * 100 + b, 600) for b in range(nb)])  # (bands, time)
        def g(tt, f):
            T = tt + a0
            fc = 850 * (1 + 0.3 * np.sin(2 * np.pi * 0.11 * T + seed) + 0.15 * np.sin(2 * np.pi * 0.31 * T))
            fc = fc * np.where(T > 7.0, 0.8, 1.0)  # S3 insert: a little more muffled
            base = (np.maximum(f, 20) / 200.0) ** -0.55 * lp_mag(f, fc, 2) * hp_mag(f, 70, 2)
            bi = np.clip((np.log2(np.maximum(f, 50) / 50) / np.log2(8000 / 50) * (nb - 1)).astype(int), 0, nb - 1)
            ti = np.clip(((T - a0) / 11.0 * 599).astype(int), 0, 599)
            bab = np.exp(0.55 * field[bi, ti])
            lev = 1 + 0.18 * np.sin(2 * np.pi * 0.17 * T + seed * 2)
            return base * bab * lev
        return g
    common = shaped_noise(n_act, water_gain(1), 101)
    wl = shaped_noise(n_act, water_gain(2), 102)
    wr = shaped_noise(n_act, water_gain(3), 103)
    water = np.vstack([0.55 * common + 0.75 * wl, 0.55 * common + 0.75 * wr]) * act_env
    water /= np.std(water[:, int(1 * SR):int(5 * SR)])
    w_lvl = np.where(ta > 7.0, db(-1.5), 1.0)  # slightly lower in the insert
    amb.add(water * w_lvl, a0, gain=db(-30), send=0.06)
    cue(2.0, "water_in", "soft")

    # water bubbles / gurgles (rising-pitch bubble model), avoiding hard cues
    hard_times = [3.6, 5.2, 7.4]
    r = rng(200)
    tb = 2.05
    while tb < 12.6:
        tb += r.exponential(1 / (11.0 if tb < 7 else 7.0))
        if any(abs(tb - h) < 0.07 for h in hard_times) or tb > 12.6:
            continue
        f0 = np.exp(r.uniform(np.log(260), np.log(1000)))
        tau = r.uniform(0.008, 0.03)
        nb = int(tau * 7 * SR)
        tt = np.arange(nb) / SR
        fi = f0 * (1 + 1.4 * tt / (tau * 7))
        s = np.sin(2 * np.pi * np.cumsum(fi) / SR) * np.exp(-tt / tau)
        s[:48] *= fade(48, "in")
        g = db(r.uniform(-44, -34)) * float(act_env[min(n_act - 1, int((tb - a0) * SR))])
        amb.add(s, tb, gain=g, pan=r.uniform(-0.7, 0.7), send=0.1)

    # paper rustle: crackle grains cut from 4 pre-filtered noise bands
    r = rng(300)
    band_c = [1100, 2200, 3800, 6000]
    band_buf = [fft_filter(r.standard_normal(SR), lambda f, c=c: bp_mag(f, c, 1.3) * lp_mag(f, 9000, 2)) for c in band_c]
    band_buf = [b / np.std(b) for b in band_buf]
    rust = np.zeros((2, n_act))

    def grain_into(buf, tpos, length, amp, pan, band, rr, atk=0.0008):
        s0 = int((tpos - a0) * SR)
        ng = max(16, int(length * SR))
        if s0 < 0 or s0 + ng >= buf.shape[1]:
            return
        off = rr.integers(0, SR - ng)
        g = band_buf[band][off:off + ng].copy()
        e = np.exp(-np.arange(ng) / (ng / 3.5))
        na = max(4, int(atk * SR))
        e[:na] *= fade(na, "in")
        e[-8:] *= fade(8, "out")
        gl, gr = pan_gains(pan)
        buf[0, s0:s0 + ng] += g * e * amp * gl
        buf[1, s0:s0 + ng] += g * e * amp * gr

    tg = 2.0
    while tg < 12.8:
        dens = 70 * (0.65 + 0.35 * np.sin(2 * np.pi * 0.23 * tg) + 0.2 * np.sin(2 * np.pi * 0.71 * tg + 1))
        dens *= 0.6 if tg > 7.0 else 1.0
        tg += r.exponential(1 / max(dens, 5))
        if any(abs(tg - h) < 0.05 for h in hard_times):
            continue
        band = r.choice(4, p=[0.3, 0.33, 0.25, 0.12])
        grain_into(rust, tg, np.exp(r.uniform(np.log(0.003), np.log(0.03))), np.exp(r.normal(0, 0.5)),
                   r.uniform(-0.8, 0.8), band, r)
    # slower "sheets sliding" swishes
    tg = 2.0
    while tg < 12.6:
        tg += r.exponential(0.55)
        ln = r.uniform(0.15, 0.5)
        s0 = int((tg - a0) * SR)
        ng = int(ln * SR)
        if s0 + ng >= n_act:
            break
        c = r.uniform(900, 2600)
        sw = fft_filter(r.standard_normal(ng), lambda f: bp_mag(f, c, 1.1) * lp_mag(f, 7000, 2))
        sw = sw / np.std(sw) * np.hanning(ng) * 0.9
        gl, gr = pan_gains(r.uniform(-0.8, 0.8))
        rust[0, s0:s0 + ng] += sw * gl
        rust[1, s0:s0 + ng] += sw * gr
    rust *= act_env
    sfx.add(rust, a0, gain=db(-34.5), send=0.08)
    cue(2.0, "paper_rustle_in", "soft")

    # tears at 3.6 and 5.2 s: fibrous rip = dense micro-fibre grains + body noise
    def tear(seed, length=0.36):
        rr = rng(seed)
        n_t = int(length * SR)
        out = np.zeros(n_t)
        tt = np.arange(n_t) / SR
        envl = (0.55 + 0.45 * np.exp(-tt / 0.03)) * (1 - smoothstep((tt - 0.18) / (length - 0.18)))
        envl *= 1 + 0.35 * smooth_random(length, 30, seed + 1, n_t)
        body = fft_filter(rr.standard_normal(n_t), lambda f: bp_mag(f, 2600, 0.8) + 0.5 * bp_mag(f, 800, 1.2))
        body = body / np.std(body) * envl * 0.35
        out += body
        tp = 0.0
        while tp < length - 0.01:
            rate = 380 + 300 * np.sin(np.pi * tp / length)
            tp += rr.exponential(1 / rate)
            s0 = int(tp * SR)
            ng = int(rr.uniform(0.0006, 0.004) * SR)
            if s0 + ng >= n_t:
                break
            band = rr.choice(4, p=[0.2, 0.35, 0.3, 0.15])
            off = rr.integers(0, SR - ng)
            g = band_buf[band][off:off + ng] * np.exp(-np.arange(ng) / (ng / 3))
            out[s0:s0 + ng] += g * np.exp(np.clip(rr.normal(0, 0.45), -1.2, 0.9)) * envl[s0] * 0.9
        # initial snap: the first fibre gives
        ns = int(0.012 * SR)
        snap = fft_filter(rr.standard_normal(ns), lambda f: bp_mag(f, 2000, 0.6)) * np.exp(-np.arange(ns) / (0.0025 * SR))
        out[:ns] += snap / np.std(snap) * 0.95
        out[:24] *= fade(24, "in")
        out[-int(0.03 * SR):] *= fade(int(0.03 * SR), "out")
        out = fft_filter(out, lambda f: lp_mag(f, 8500, 2) * hp_mag(f, 250, 2))
        return out

    def bloop(seed, f_a=240.0, f_b=105.0, length=0.45):
        rr = rng(seed)
        nb = int(length * SR)
        tt = np.arange(nb) / SR
        fi = f_b + (f_a - f_b) * np.exp(-tt / 0.09)
        s = np.sin(2 * np.pi * np.cumsum(fi) / SR) * (1 - np.exp(-tt / 0.012)) * np.exp(-tt / 0.12)
        # a couple of small bubbles riding it
        for _ in range(3):
            ts = rr.uniform(0.02, 0.2)
            f0 = rr.uniform(350, 700)
            s0 = int(ts * SR)
            nb2 = int(0.08 * SR)
            t2 = np.arange(nb2) / SR
            bb = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 2 * t2)) / SR) * np.exp(-t2 / 0.015) * 0.15
            bb[:32] *= fade(32, "in")
            s[s0:s0 + nb2] += bb[: max(0, min(nb2, nb - s0))]
        s[-int(0.03 * SR):] *= fade(int(0.03 * SR), "out")
        return s

    for i, (tt0, pan) in enumerate([(3.6, 0.18), (5.2, 0.05)]):
        sfx.add(tear(400 + i), tt0, gain=db(-20.5), pan=pan, send=0.12)
        cue(tt0, f"tear_{i + 1}")
        sfx.add(bloop(410 + i, 240 - 20 * i, 100 - 8 * i), tt0 + 0.4, gain=db(-25), pan=pan, send=0.12)
        cue(tt0 + 0.4, f"sink_bloop_{i + 1}", "soft")

    # 7.4 wet grab: squelch (falling resonance) + wet crinkle + drips after
    def grab(seed):
        rr = rng(seed)
        length = 0.55
        ng = int(length * SR)
        def g(tt, f):
            fc = 450 + 1000 * np.exp(-np.maximum(tt, 0) / 0.07)
            e = np.exp(-np.maximum(tt, 0) / 0.09) * smoothstep(tt / 0.004)
            return e * (bp_mag(f, fc, 3.0) * 1.4 + 0.25 * bp_mag(f, 1800, 0.8)) * hp_mag(f, 150, 2)
        sq = shaped_noise(ng, g, seed, n=256, hop=64)
        sq /= np.max(np.abs(sq)) + 1e-9
        out = sq * 0.9
        tp = 0.0
        while tp < 0.32:
            tp += rr.exponential(1 / 160)
            s0 = int(tp * SR)
            n2 = int(rr.uniform(0.001, 0.008) * SR)
            band = rr.choice(3, p=[0.45, 0.4, 0.15])
            off = rr.integers(0, SR - n2)
            gg = band_buf[band][off:off + n2] * np.exp(-np.arange(n2) / (n2 / 3))
            gg[:6] *= fade(6, "in")
            out[s0:s0 + n2] += gg * 0.16 * np.exp(rr.normal(0, 0.4)) * np.exp(-tp / 0.25)
        out[:16] *= fade(16, "in")
        out[-int(0.04 * SR):] *= fade(int(0.04 * SR), "out")
        return fft_filter(out, lambda f: lp_mag(f, 6500, 2) * hp_mag(f, 120, 2))
    sfx.add(grab(500), 7.4, gain=db(-21), pan=-0.05, send=0.12)
    cue(7.4, "wet_grab")

    def drip(f0, seed, tau=0.025):
        nb = int(tau * 6 * SR)
        tt = np.arange(nb) / SR
        fi = f0 * (1 + 0.45 * (1 - np.exp(-tt / 0.012)))  # bubble rises in pitch
        s = np.sin(2 * np.pi * np.cumsum(fi) / SR) * np.exp(-tt / tau)
        s[:40] *= fade(40, "in")
        s[-40:] *= fade(40, "out")
        return s
    r = rng(510)
    for k in range(4):  # water dripping off the lifted page
        td = 7.55 + k * 0.13 + r.uniform(0, 0.08)
        sfx.add(drip(r.uniform(900, 1500), 0), td, gain=db(-35 - 2 * k), pan=r.uniform(-0.3, 0.3), send=0.2)

    # 8.3-10.4 ink sliding off: wet trickle with falling centre + drips falling in pitch
    i0, i1 = 8.3, 10.4
    ni = int((i1 - i0 + 0.3) * SR)
    def ink_gain(tt, f):
        u = np.clip(tt / (i1 - i0), 0, 1)
        fc = 2600 * (900 / 2600) ** u
        e = smoothstep(tt / 0.3) * (1 - smoothstep((tt - (i1 - i0 - 0.35)) / 0.5))
        return e * bp_mag(f, fc, 2.2) * lp_mag(f, 6000, 2)
    trick = np.vstack([shaped_noise(ni, ink_gain, 520, n=512, hop=128), shaped_noise(ni, ink_gain, 522, n=512, hop=128)])
    flick = 0.6 + 0.4 * np.abs(smooth_random(i1 - i0 + 0.3, 45, 521, ni))
    trick = trick / (np.std(trick) + 1e-9) * flick
    sfx.add(trick, i0, gain=db(-38), send=0.15)
    r = rng(530)
    td = i0 + 0.12
    while td < i1:
        u = (td - i0) / (i1 - i0)
        fc = 2000 * (750 / 2000) ** u
        sfx.add(drip(fc * r.uniform(0.85, 1.15), 0, tau=r.uniform(0.012, 0.03)), td,
                gain=db(r.uniform(-38, -33)), pan=r.uniform(-0.35, 0.35), send=0.25)
        td += r.exponential(1 / 7.5) + 0.03
    cue(i0, "ink_slide_start", "soft")

    # 10.8-12.0 page drifts away right: soft whoosh, falling centre, pan -> right
    w0, w1 = 10.8, 12.0
    nw = int((w1 - w0 + 0.2) * SR)
    def wh_gain(tt, f):
        u = np.clip(tt / (w1 - w0), 0, 1)
        fc = 1300 * (450 / 1300) ** u
        e = smoothstep(tt / 0.3) * (1 - smoothstep((tt - 0.35) / 0.85))
        return e * bp_mag(f, fc, 1.2) * lp_mag(f, 5000, 2)
    wh = shaped_noise(nw, wh_gain, 540)
    wh /= np.std(wh) + 1e-9
    pp = np.linspace(0.0, 0.7, nw)
    gl, gr = pan_gains(pp)
    sfx.add(np.vstack([wh * gl, wh * gr]), w0, gain=db(-35), send=0.15)
    sfx.add(bloop(545, 200, 95, 0.5), 11.75, gain=db(-33), pan=0.6, send=0.2)
    cue(w0, "page_drifts_away", "soft")
    cue(12.0, "water_paper_fade_out", "soft")

    # act-1 piano: A minor, low, sparse, minor-second rubs (kept off the hard cues)
    act1 = [
        (2.30, ["A2", "E3"], 0.30), (3.05, ["B3", "C4"], 0.18),
        (4.35, ["F2", "C3"], 0.27), (4.95, ["E4", "F4"], 0.14),
        (6.00, ["D3", "A3"], 0.25), (6.55, ["Bb3"], 0.16),
        (7.05, ["E2", "B2"], 0.28), (8.20, ["G#3", "A3"], 0.16),
        (9.35, ["F3", "E4"], 0.18), (10.60, ["A2", "E3", "C4"], 0.22),
        (11.40, ["Bb3"], 0.12),
    ]
    for k, (tn, notes, v) in enumerate(act1):
        for j, nn in enumerate(notes):
            m = nm(nn)
            s = piano(m, vel=v, seed=k * 10 + j, decay_scale=0.75, max_len=5.0, bright=0.8)
            music.add(s, tn + j * 0.028, gain=db(-4), pan=piano_pan(m), send=0.32)

    # ================= 12.00 - 16.00  TURNING POINT =================
    def breath_gain(tt, f):
        x = np.maximum(tt, 0)
        e = smoothstep(x / 0.045) * np.exp(-np.maximum(x - 0.06, 0) / 0.45) * (1 - smoothstep((x - 1.0) / 0.25))
        sh = 1.0 - 0.18 * np.clip(x, 0, 1.2)  # formants relax downward
        spec = (0.9 * bp_mag(f, 650 * sh, 1.6) + 0.6 * bp_mag(f, 1350 * sh, 2.0) + 0.35 * bp_mag(f, 2500 * sh, 2.5)
                + 0.25 * bp_mag(f, 400, 0.6))
        return e * spec * hp_mag(f, 160, 2) * lp_mag(f, 4200, 2)
    nbr = int(1.35 * SR)
    flutter = 1 + 0.12 * smooth_random(1.35, 9, 601, nbr)
    brc = shaped_noise(nbr, breath_gain, 600, n=512, hop=128)
    brs = shaped_noise(nbr, breath_gain, 602, n=512, hop=128)
    pk = np.max(np.abs(brc)) + 1e-9
    br = np.vstack([brc + 0.3 * brs, brc - 0.3 * brs]) * flutter / pk  # mostly centred, a little width
    br = apply_edges(br, 24, int(0.05 * SR))
    sfx.add(br, 12.6, gain=db(-21), send=0.18)
    cue(12.6, "exhale")

    # faint room tone 12.0 -> 29.0 (fades in under the water fade, out at the cut)
    r0, r1 = 12.0, 29.0
    nr = int((r1 - r0) * SR)
    def room_gain(tt, f):
        return (np.maximum(f, 30) / 100) ** -0.5 * lp_mag(f, 1800, 2) * hp_mag(f, 45, 2)
    room = np.vstack([shaped_noise(nr, room_gain, 610), shaped_noise(nr, room_gain, 611)])
    room /= np.std(room)
    tr = np.arange(nr) / SR
    renv = smoothstep(tr / 0.8) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.07 * tr))
    renv[-int(0.06 * SR):] *= fade(int(0.06 * SR), "out")
    amb.add(room * renv, r0, gain=db(-56), send=0.0)
    cue(12.8, "near_silence (room tone)", "soft")

    # ================= 16.00 - 22.00  ACT 2: words grow =================
    # soft swish as she smooths the sheet
    nsw = int(0.5 * SR)
    sw = fft_filter(rng(700).standard_normal(nsw), lambda f: bp_mag(f, 1500, 0.9) * lp_mag(f, 6000, 2))
    sw = sw / np.std(sw) * np.hanning(nsw) ** 1.5
    sfx.add(sw, 16.3, gain=db(-40), pan=0.1, send=0.1)
    cue(16.3, "smooth_sheet", "soft")

    # pencil-scratch grains while each line grows (~0.6 s)
    pen_buf = fft_filter(rng(710).standard_normal(SR), lambda f: (bp_mag(f, 4200, 1.0) + 0.45 * bp_mag(f, 1600, 1.4)) * lp_mag(f, 8000, 2))
    pen_buf /= np.std(pen_buf)

    def pencil(seed, length=0.6):
        rr = rng(seed)
        n_p = int(length * SR)
        out = np.zeros(n_p)
        tp = 0.0
        while tp < length - 0.05:
            sl = rr.uniform(0.045, 0.12)
            s0 = int(tp * SR)
            ns = min(int(sl * SR), n_p - s0)
            if ns < 64:
                break
            off = rr.integers(0, SR - ns)
            e = np.ones(ns)
            e[:int(0.008 * SR)] = fade(int(0.008 * SR), "in")
            e[-int(0.015 * SR):] *= fade(int(0.015 * SR), "out")
            grit = 0.55 + 0.45 * np.abs(smooth_random(sl, 450, int(rr.integers(1 << 30)), ns))
            out[s0:s0 + ns] += pen_buf[off:off + ns] * e * grit * np.exp(rr.normal(0, 0.25))
            tp += sl + rr.uniform(0.012, 0.045)
        out[-int(0.03 * SR):] *= fade(int(0.03 * SR), "out")
        return out

    lines = [(16.8, 17.5, "C5"), (18.3, 18.9, "E5"), (19.5, 20.0, "G5"), (20.5, 21.1, "A5")]
    for k, (ls, lf, note) in enumerate(lines):
        p = pencil(720 + k, length=min(0.6, lf - ls - 0.06))
        npn = len(p)
        pp = np.linspace(-0.35, 0.35, npn)
        gl, gr = pan_gains(pp)
        sfx.add(np.vstack([p * gl, p * gr]), ls, gain=db(-36), send=0.08)
        cue(ls, f"line_{k + 1}_pencil", "soft")
        m = nm(note)
        s = piano(m, vel=0.42, seed=300 + k, decay_scale=0.9, max_len=5.5, bright=1.0)
        music.add(s, lf, gain=db(-0.5), pan=0.12 + 0.05 * k, send=0.34)
        cue(lf, f"leaf_{k + 1}_{note}")

    # soft warm accompaniment (F major / lydian), kept >= 150 ms off the leaf notes
    act2 = [
        (16.00, ["F2", "C3", "A3"], 0.20), (18.15, ["A2", "E3", "G3"], 0.15),
        (19.30, ["F2", "C3", "B3"], 0.15), (20.30, ["C3", "G3", "D4"], 0.14),
        (21.55, ["F2", "C3", "E3", "A3"], 0.15),
    ]
    for k, (tn, notes, v) in enumerate(act2):
        for j, nn in enumerate(notes):
            m = nm(nn)
            s = piano(m, vel=v, seed=400 + k * 10 + j, decay_scale=0.85, max_len=5.0, bright=0.75)
            music.add(s, tn + j * 0.035, gain=db(-3), pan=piano_pan(m), send=0.34)
    cue(16.0, "act2_piano_returns", "soft")

    # ================= 22.00 - 29.00  BRAND =================
    # shimmer as the page lifts: glass partials cascading upward
    shim = ["C6", "F6", "A6", "E6", "G6", "C7", "A6", "E7", "G6", "C7"]
    r = rng(800)
    for k, nn in enumerate(shim):
        ts = 22.0 + k * 0.1 + r.uniform(0, 0.03)
        g = glass(midi_hz(nm(nn)), amp=1.0, decay=r.uniform(1.6, 2.6), attack=r.uniform(0.03, 0.07), seed=k)
        music.add(g, ts, gain=db(-33 + 2 * np.sin(np.pi * k / 9)), pan=r.uniform(-0.7, 0.7), send=0.6)
    cue(22.0, "shimmer_page_lifts", "soft")
    # air lift under the shimmer
    nl = int(1.6 * SR)
    def lift_gain(tt, f):
        u = np.clip(tt / 1.2, 0, 1)
        fc = 700 * (3200 / 700) ** u
        e = smoothstep(tt / 0.7) * (1 - smoothstep((tt - 0.9) / 0.7))
        return e * bp_mag(f, fc, 1.6)
    lift = np.vstack([shaped_noise(nl, lift_gain, 810), shaped_noise(nl, lift_gain, 811)])
    lift /= np.std(lift) + 1e-9
    amb.add(lift, 22.0, gain=db(-46), send=0.3)
    # star twinkles as the sea turns to stars (stop before the chord)
    for k, (ts, nn) in enumerate([(23.35, "E7"), (23.62, "A6"), (23.9, "C7"), (24.12, "G6")]):
        music.add(glass(midi_hz(nm(nn)), decay=1.4, attack=0.025, seed=50 + k), ts, gain=db(-41), pan=[-0.6, 0.5, -0.2, 0.7][k], send=0.6)
    cue(23.5, "sea_to_stars_twinkles", "soft")

    # pad 1: Fmaj7 swell 22.0 -> 24.5, filter opening
    p_t0, p_t1 = 22.0, 24.95
    lp1 = p_t1 - p_t0
    np1 = int(lp1 * SR)
    tp = np.arange(np1) / SR
    env1 = smoothstep(tp / 2.4) ** 1.3 * (1 - smoothstep((tp - 2.5) / 0.45))
    fc1 = 450 + 1300 * smoothstep(tp / 2.5)
    pad1 = sum(pad_voice(midi_hz(nm(nn)), lp1, env1, fc1, seed=k) for k, nn in enumerate(["F3", "C4", "E4", "A4"]))
    music.add(pad1, p_t0, gain=db(-25.5), send=0.4)
    cue(22.0, "pad_swell_start", "soft")

    # THE WARM CHORD at 24.5: Fmaj9, wide (F1 + C2 low; A3 E4 G4 C5 in the middle)
    t_ch = 24.5
    chord = [("F1", 0.000, 0.42), ("C2", 0.000, 0.37), ("A3", 0.000, 0.40), ("E4", 0.010, 0.38),
             ("G4", 0.018, 0.36), ("C5", 0.026, 0.34)]
    damp = 29.0
    for j, (nn, dt, v) in enumerate(chord):
        m = nm(nn)
        s = piano(m, vel=v, dur=damp - (t_ch + dt), seed=900 + j, decay_scale=1.3, max_len=4.65, bright=1.0)
        music.add(s, t_ch + dt, gain=db(-6.5), pan=piano_pan(m) * 0.8, send=0.36)
    cue(t_ch, "WARM_CHORD Fmaj9 (CV reveal)")

    # pad 2: the chord as a pad, soft attack landing with the piano, through 29.0
    p2_t0 = t_ch - 0.04
    lp2 = damp - p2_t0
    np2 = int(lp2 * SR)
    tp = np.arange(np2) / SR
    env2 = smoothstep(tp / 0.35) * (1 - 0.45 * smoothstep((tp - 1.2) / 3.0))
    env2[-int(0.08 * SR):] *= fade(int(0.08 * SR), "out")  # drop at the cut to black
    fc2 = 2000 - 900 * smoothstep(tp / 4.0)
    pad2 = sum(pad_voice(midi_hz(nm(nn)), lp2, env2, fc2, seed=20 + k)
               for k, nn in enumerate(["F2", "C3", "A3", "E4", "G4"]))
    music.add(pad2, p2_t0, gain=db(-26.5), send=0.4)

    # 27.6 one soft bell on the URL
    bl = bell(midi_hz(nm("C6")), decay=2.2, seed=1)
    bl = apply_edges(bl[:int((damp - 27.6) * SR)], 0, int(0.08 * SR))  # dropped by the cut to black
    music.add(bl, 27.6, gain=db(-21), pan=0.15, send=0.45)
    cue(27.6, "url_bell C6")
    cue(29.0, "cut_to_black", "soft")

    # ================= 29.27 (frame 878): one high soft piano note =================
    t_last = 878 / FPS
    s = piano(nm("E6"), vel=0.36, seed=999, decay_scale=0.30, max_len=30.0 - t_last, bright=1.0)
    music.add(s, t_last, gain=db(-1), pan=0.1, send=0.12)
    cue(t_last, "calm_eye_note E6 (frame 878)")
    return music, sfx, amb


def write_wav(path, x, seed=1):
    """16-bit stereo with TPDF dither (deterministic)."""
    r = rng(seed)
    d = (r.random(x.shape) - r.random(x.shape)) / 32768.0
    y = np.clip(np.round((x + d) * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(y.T.copy().tobytes())


def spectrogram_png(x, path, cues):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return
    mono = x.mean(axis=0)
    n, hop = 2048, 480
    X = np.abs(stft(mono, n, hop))
    W, H = 1500, 420
    f = np.fft.rfftfreq(n, 1 / SR)
    fl = np.geomspace(30, 16000, H)
    bins = np.clip(np.searchsorted(f, fl), 0, len(f) - 1)
    S = 20 * np.log10(X[:, bins] + 1e-9)
    frames = np.linspace(0, S.shape[0] - 1, W).astype(int)
    S = S[frames].T[::-1]
    S = np.clip((S - (np.percentile(S, 99.9) - 85)) / 85, 0, 1)
    # dark-purple -> magenta -> orange -> pale yellow
    stops = np.array([[0.02, 0.02, 0.06], [0.25, 0.07, 0.40], [0.72, 0.18, 0.42], [0.98, 0.55, 0.20], [1.0, 0.97, 0.75]])
    xs = np.linspace(0, 1, len(stops))
    rgb = np.stack([np.interp(S, xs, stops[:, c]) for c in range(3)], -1)
    img = Image.fromarray((rgb * 255).astype(np.uint8))
    dr = ImageDraw.Draw(img)
    total = x.shape[1] / SR
    for c in cues:
        px = int(c["t"] / total * W)
        col = (255, 90, 90) if c["kind"] == "hard" else (90, 160, 255)
        dr.line([(px, 0), (px, 10)], fill=col, width=1)
    for s in range(0, 31, 2):
        px = int(s / total * (W - 1))
        dr.line([(px, H - 6), (px, H)], fill=(255, 255, 255))
        dr.text((px + 2, H - 16), f"{s}", fill=(255, 255, 255))
    img.save(path)


def main():
    music, sfx, amb = build()
    ir = make_ir()
    # cut to black: the reverb tail drops 6 dB at 29.0 and breathes until the
    # frame-878 note, then is drawn down so that note can decay to ~-40 dB by 30.0
    tt = np.arange(N) / SR
    tail_db = -6.0 * smoothstep((tt - 29.0) / 0.08) - 26.0 * smoothstep((tt - 29.3) / 0.55)
    tail_env = db(tail_db)
    stems = {}
    for bus in (music, sfx, amb):
        wet = reverb(bus.send, ir) * tail_env
        stems[bus.name] = bus.dry + wet
    mix = stems["music"] + stems["sfx"] + stems["ambience"]
    # DC / sub-rumble removal (zero-phase high-pass 22 Hz) + very end fade (loop seam)
    hp = lambda f: hp_mag(f, 22, 2)
    for k in stems:
        stems[k] = fft_filter(stems[k], hp)
        stems[k] -= stems[k].mean(axis=1, keepdims=True)
    mix = sum(stems.values())
    end_f = int(0.015 * SR)
    start_f = int(0.03 * SR)
    for arr in list(stems.values()) + [mix]:
        arr[:, -end_f:] *= fade(end_f, "out")
        arr[:, :start_f] *= fade(start_f, "in")

    # loudness: iterate gain -> limiter -> measure
    g = db(TARGET_LUFS - lufs(mix))
    for _ in range(4):
        out, gain_curve = limiter(mix * g)
        L = lufs(out)
        g *= db(TARGET_LUFS - L)
    out, gain_curve = limiter(mix * g)
    out -= out.mean(axis=1, keepdims=True)
    assert out.shape == (2, N)

    os.makedirs(STEMS, exist_ok=True)
    write_wav(os.path.join(HERE, "score.wav"), out, seed=1)
    for i, (k, v) in enumerate(stems.items()):
        write_wav(os.path.join(STEMS, f"{k}.wav"), np.clip(v * g, -1, 1), seed=10 + i)
    CUES.sort(key=lambda c: c["t"])
    with open(os.path.join(HERE, "cues.json"), "w") as f:
        json.dump(CUES, f, indent=1)
    spectrogram_png(out, os.path.join(STEMS, "spectrogram.png"), CUES)

    pk = 20 * np.log10(np.max(np.abs(out)))
    print(f"score.wav: {out.shape[1] / SR:.3f} s, peak {pk:.2f} dBFS, integrated {lufs(out):.2f} LUFS, "
          f"max limiter GR {-20 * np.log10(gain_curve.min()):.2f} dB, master gain {20 * np.log10(g):+.1f} dB")
    secs = [(0, 2, "hook"), (2, 7, "S2 river"), (7, 12, "S3 insert"), (12.4, 13.8, "exhale"),
            (13.8, 16, "near-silence"), (16, 22, "act 2"), (22, 24.4, "lift/pad"), (24.5, 27, "warm chord"),
            (27, 29, "tail+bell"), (29.0, 29.26, "black"), (29.27, 30, "E6 note")]
    for a, b, name in secs:
        seg = out[:, int(a * SR):int(b * SR)]
        print(f"  {name:<13} {a:5.2f}-{b:5.2f}s  loudness {short_term(out, a, b):6.1f} LUFS  "
              f"peak {20 * np.log10(np.max(np.abs(seg)) + 1e-12):6.1f} dBFS")
    for k, v in stems.items():
        vv = v * g
        print(f"  stem {k:<9} loudness {lufs(vv):6.1f} LUFS  peak {20 * np.log10(np.max(np.abs(vv))):6.1f} dBFS")


if __name__ == "__main__":
    main()
