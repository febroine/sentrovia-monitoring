#!/usr/bin/env bash
# out/contact.png: one still per beat (payoff moments from docs/shotlist.md)
set -euo pipefail
cd "$(dirname "$0")/.."
D=out/cache/contact; mkdir -p "$D"
T="0.2 0.9 1.9 2.8 4.0 6.6 8.0 9.4 11.2 12.4 14.8 16.2 17.6 19.6 21.6 23.2 24.0 25.4 27.3 28.5 29.6"
L=""
for t in $T; do
  f=$(python3 -c "print(round($t*30))")
  node tools/still.js --f "$f" --scale 0.5 --dir "$D" --tag c >/dev/null
  L="$L $D/c_f$(printf %04d "$f").png:$(python3 -c "s=$t;print(f'{int(s//60)}:{s%60:04.1f}')")"
done
python3 tools/contact.py out/contact.png $L --cols 4
