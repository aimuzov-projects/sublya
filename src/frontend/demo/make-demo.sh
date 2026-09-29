#!/usr/bin/env bash
# Builds the landing page demo from a video and its exact text: the bot's engine burns
# subtitles in every style. Needs ffmpeg, Docker and the bot repository next to this one
# (SUBLYA_BOT_DIR, default ../bot) with STT_API_KEY in its .env. Recognition costs a
# fraction of a cent.
#
# Usage: demo/make-demo.sh video.mp4 [demo/text.txt]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
site="$(cd "$here/.." && pwd)"
bot="$(cd "${SUBLYA_BOT_DIR:-$site/../bot}" && pwd)"
media="$site/media"
source="${1:?usage: make-demo.sh video.mp4 [text.txt]}"
text="${2:-$here/text.txt}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

ffmpeg="${SUBLYA_FFMPEG:-ffmpeg}"
# the web versions: small, and playable before they're fully downloaded
web=(-c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart)

mkdir -p "$media"
"$ffmpeg" -v error -y -i "$source" -vf "scale=720:-2" "${web[@]}" "$work/demo.mp4"
cp "$work/demo.mp4" "$media/before.mp4"
cp "$text" "$work/text.txt"

# the bot image has the same ffmpeg and Montserrat as production, so the demo looks the same
docker build -q -t sublya-bot "$bot" >/dev/null
for style in classic big box single; do
  docker run --rm --env-file "$bot/.env" -v "$work:/w" sublya-bot \
    python -m sublya.core /w/demo.mp4 --text /w/text.txt --style "$style" -o "/w/$style.mp4" >/dev/null
  "$ffmpeg" -v error -y -i "$work/$style.mp4" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p \
    -c:a copy -movflags +faststart "$media/$style.mp4"
done

for name in before classic; do
  "$ffmpeg" -v error -y -ss 1.6 -i "$media/$name.mp4" -frames:v 1 -q:v 4 "$media/$name.jpg"
done
mv "$media/classic.jpg" "$media/poster.jpg"
ls -lh "$media"
