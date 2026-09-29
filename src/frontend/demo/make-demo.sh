#!/usr/bin/env bash
# Builds one demo for the landing page from a video and its exact text: the bot's engine
# burns subtitles in every style into public/media/<name>/, and src/data/demos.json gets
# the entry.
# Needs ffmpeg, Docker, python3 and the bot repository next to this one (SUBLYA_BOT_DIR,
# default ../bot) with STT_API_KEY in its .env. Recognition costs a fraction of a cent.
#
# Usage: demo/make-demo.sh name video.mp4 [demo/name.txt]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
site="$(cd "$here/.." && pwd)"
bot="$(cd "${SUBLYA_BOT_DIR:-$site/../bot}" && pwd)"
usage="usage: make-demo.sh name video.mp4 [text.txt]"
name="${1:?$usage}"
source="${2:?$usage}"
text="${3:-$here/$name.txt}"
out="$site/public/media/$name"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

ffmpeg="${SUBLYA_FFMPEG:-ffmpeg}"
ffprobe="${SUBLYA_FFPROBE:-ffprobe}"
# the web versions: small, and playable before they're fully downloaded
# shaky footage from a bike or a walk compresses badly: raise SUBLYA_CRF to keep it light
web=(-c:v libx264 -preset slow -crf "${SUBLYA_CRF:-27}" -pix_fmt yuv420p -movflags +faststart)

mkdir -p "$out"
"$ffmpeg" -v error -y -i "$source" -vf "scale=720:-2" "${web[@]}" -c:a aac -b:a 96k "$work/demo.mp4"
cp "$work/demo.mp4" "$out/before.mp4"
cp "$text" "$work/text.txt"

# the bot image has the same ffmpeg and Montserrat as production, so the demo looks the same
docker build -q -t sublya-bot "$bot" >/dev/null
for style in classic big box single; do
  docker run --rm --env-file "$bot/.env" -v "$work:/w" sublya-bot \
    python -m sublya.core /w/demo.mp4 --text /w/text.txt --style "$style" -o "/w/$style.mp4" >/dev/null
  "$ffmpeg" -v error -y -i "$work/$style.mp4" "${web[@]}" -c:a copy "$out/$style.mp4"
done

for file in before classic; do
  "$ffmpeg" -v error -y -ss 1.6 -i "$out/$file.mp4" -frames:v 1 -q:v 4 "$out/$file.jpg"
done
mv "$out/classic.jpg" "$out/poster.jpg"

# the page asks for /media/<name>/*?v=<version>: new files, new URLs, whatever browsers cached
version="$(cat "$out"/*.mp4 "$out"/*.jpg | shasum | cut -c1-8)"
duration="$("$ffprobe" -v error -show_entries format=duration -of csv=p=0 "$out/before.mp4")"
python3 - "$site/src/data/demos.json" "$name" "$version" "$duration" <<'EOF'
import json, os, sys
path, name, version, duration = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
demos = json.load(open(path)) if os.path.exists(path) else []
entry = next((d for d in demos if d["id"] == name), None)
if entry is None:
    # the note under the player is written by hand afterwards; the build fails until it is
    entry = {"id": name, "note": ""}
    demos.append(entry)
entry.update(v=version, duration=round(duration, 1))
with open(path, "w") as f:
    json.dump(demos, f, ensure_ascii=False, indent=2)
    f.write("\n")
EOF
echo "$name: version $version, ${duration}s"
ls -lh "$out"
