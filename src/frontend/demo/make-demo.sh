#!/usr/bin/env bash
# Builds the landing page demo: a synthetic voice reads a poem over a drifting gradient,
# then the bot's engine burns subtitles in every style. Needs macOS (the `say` voice),
# ffmpeg, Docker and the bot repository next to this one (SUBLYA_BOT_DIR, default ../bot)
# with STT_API_KEY in its .env. Recognition costs a fraction of a cent.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
site="$(cd "$here/.." && pwd)"
bot="$(cd "${SUBLYA_BOT_DIR:-$site/../bot}" && pwd)"
media="$site/media"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

ffmpeg="${SUBLYA_FFMPEG:-ffmpeg}"
ffprobe="${SUBLYA_FFPROBE:-ffprobe}"

# a pause after each line, so the voice breathes like a person reading aloud
speech="$(sed 's/$/ [[slnc 450]]/' "$here/poem.txt")"
say -v Milena -r 150 -o "$work/voice.aiff" "$speech"

"$ffmpeg" -v error -y -i "$work/voice.aiff" -af "apad=pad_dur=0.8" -ar 44100 -ac 1 "$work/voice.wav"
dur="$("$ffprobe" -v error -show_entries format=duration -of csv=p=0 "$work/voice.wav")"

"$ffmpeg" -v error -y \
  -f lavfi -i "gradients=s=720x1280:r=30:d=$dur:type=radial:speed=0.02:seed=7:c0=0x2a1250:c1=0x7a2a78:c2=0x14506a:c3=0x3b2a8a:nb_colors=4,gblur=sigma=60" \
  -i "$work/voice.wav" \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k \
  -movflags +faststart -shortest "$work/demo.mp4"

mkdir -p "$media"
cp "$work/demo.mp4" "$media/before.mp4"
cp "$here/poem.txt" "$work/poem.txt"
# the bot image has the same ffmpeg and Montserrat as production, so the demo looks the same
docker build -q -t sublya-bot "$bot" >/dev/null
for style in classic big box single; do
  docker run --rm --env-file "$bot/.env" -v "$work:/w" sublya-bot \
    python -m sublya.core /w/demo.mp4 --text /w/poem.txt --style "$style" -o "/w/$style.mp4" >/dev/null
  # smaller files for the web; the page plays them muted until tapped
  "$ffmpeg" -v error -y -i "$work/$style.mp4" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
    -c:a copy -movflags +faststart "$media/$style.mp4"
done
for name in before classic; do
  "$ffmpeg" -v error -y -ss 2.2 -i "$media/$name.mp4" -frames:v 1 -q:v 4 "$media/$name.jpg"
done
mv "$media/classic.jpg" "$media/poster.jpg"
ls -lh "$media"
