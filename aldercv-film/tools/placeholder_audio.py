# Animatic placeholder: soft clicks at every sync cue from the shot list (no music).
# python3 tools/placeholder_audio.py out/cache/placeholder.wav
import sys, wave, numpy as np
SR = 48000
cues = [0.15, 0.85, 1.55, 2.0, 3.6, 5.2, 7.4, 8.3, 10.6, 12.0, 12.6, 16.0, 16.8, 17.5, 18.3, 18.9, 19.5, 20.0, 20.5, 21.1,
        22.0, 24.5, 27.0, 27.6, 27.9, 29.0, 29.27]
x = np.zeros(int(SR * 30.0))
t = np.arange(int(SR * 0.12)) / SR
for c in cues:
    f = 1760 if c in (17.5, 18.9, 20.0, 21.1, 24.5) else 880
    blip = 0.3 * np.sin(2 * np.pi * f * t) * np.exp(-t * 40)
    i = int(c * SR); x[i:i + len(blip)] += blip[: len(x) - i]
y = (np.clip(x, -1, 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
print(sys.argv[1])
