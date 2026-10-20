#!/usr/bin/env bash
# Full production render: score -> landscape + vertical video -> mux -> loop check, poster, contact sheet.
#   bash tools/finalize.sh            (full quality)
#   SCALE=0.5 bash tools/finalize.sh  (animatic quality, 960x540 / 540x960)
set -euo pipefail
cd "$(dirname "$0")/.."
SCALE="${SCALE:-1}"
WORKERS="${WORKERS:-$(nproc)}"
mkdir -p out/cache
[ -f audio/score.wav ] || python3 audio/score.py
AUDIO=audio/score.wav
SUFFIX=""; [ "$SCALE" != "1" ] && SUFFIX="_s${SCALE}"

node tools/render.js --mode landscape --scale "$SCALE" --workers "$WORKERS" --out "out/cache/video_landscape${SUFFIX}.mp4"
node tools/render.js --mode vertical  --scale "$SCALE" --workers "$WORKERS" --out "out/cache/video_vertical${SUFFIX}.mp4"

mux() { ffmpeg -y -loglevel error -i "$1" -i "$AUDIO" -map 0:v -map 1:a -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart -t 30 "$2"; echo "$2"; }
if [ "$SCALE" = "1" ]; then
  mux out/cache/video_landscape.mp4 out/final.mp4
  mux out/cache/video_vertical.mp4 out/final_vertical.mp4
  # loop check: last 2 s -> first 2 s, twice, so the seam is seen in context
  ffmpeg -y -loglevel error -i out/final.mp4 -filter_complex \
    "[0:v]trim=28:30,setpts=PTS-STARTPTS[a];[0:v]trim=0:2,setpts=PTS-STARTPTS[b];[0:a]atrim=28:30,asetpts=PTS-STARTPTS[c];[0:a]atrim=0:2,asetpts=PTS-STARTPTS[d];\
     [a][c][b][d]concat=n=2:v=1:a=1[v1][a1];[v1]split[v2][v3];[a1]asplit[a2][a3];[v2][a2][v3][a3]concat=n=2:v=1:a=1[v][au]" \
    -map "[v]" -map "[au]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 160k out/loop_check.mp4
  echo out/loop_check.mp4
  node tools/still.js --t "${POSTER_T:-28.6}" --scale 1 --dir out/cache --tag poster && mv out/cache/poster_f*.png out/poster.png
  bash tools/contact.sh
else
  mux "out/cache/video_landscape${SUFFIX}.mp4" "out/animatic.mp4"
fi
