#!/usr/bin/env bash
# Builds one demo for the landing page from a video and its exact text. The page draws the
# subtitles itself over the video as sent, so the bot's engine only finds the word timings:
# public/media/<name>/ gets the video and its posters, src/frontend/data/words/<name>.json the
# timings and src/frontend/data/demos.json the entry.
# Needs ffmpeg, Docker, python3 and STT_API_KEY in the .env at the repository root.
# Recognition costs a fraction of a cent.
#
# Usage: demo/make-demo.sh name video.mp4 [demo/name.txt]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
usage="usage: make-demo.sh name video.mp4 [text.txt]"
name="${1:?$usage}"
source="${2:?$usage}"
text="${3:-$here/$name.txt}"
out="$root/public/media/$name"
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

# the bot image has the same ffmpeg and Montserrat as production, so the timings and the poster
# come out as the bot would make them; the transcript is cached in $work, so recognition runs once
docker build -q -t sublya-bot -f "$root/deploy/bot.Dockerfile" "$root" >/dev/null
bot=(docker run --rm --env-file "$root/.env" -v "$work:/w" sublya-bot
  node src/bot/core/cli.ts /w/demo.mp4 --text /w/text.txt)
"${bot[@]}" --words /w/words.json >/dev/null
cp "$work/words.json" "$root/src/frontend/data/words/$name.json"

# the poster is a frame of the classic style: the deck shows it until the video plays
"${bot[@]}" --style classic -o /w/classic.mp4 >/dev/null
"$ffmpeg" -v error -y -ss 1.6 -i "$work/classic.mp4" -frames:v 1 -q:v 4 "$out/poster.jpg"
"$ffmpeg" -v error -y -ss 1.6 -i "$out/before.mp4" -frames:v 1 -q:v 4 "$out/before.jpg"
# the page shows these small: the deck poster at most 300 px wide, the steps frame at 92; the JPEGs
# stay for link previews, where WebP isn't everywhere yet
"$ffmpeg" -v error -y -i "$out/poster.jpg" -vf scale=540:-2 -c:v libwebp -quality 72 "$out/poster.webp"
"$ffmpeg" -v error -y -i "$out/before.jpg" -vf scale=400:-2 -c:v libwebp -quality 72 "$out/before.webp"

# the page asks for /media/<name>/*?v=<version>: new files, new URLs, whatever browsers cached
version="$(cat "$out"/*.mp4 "$out"/*.jpg | shasum | cut -c1-8)"
duration="$("$ffprobe" -v error -show_entries format=duration -of csv=p=0 "$out/before.mp4")"
python3 - "$root/src/frontend/data/demos.json" "$name" "$version" "$duration" <<'EOF'
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
    json.dump(demos, f, ensure_ascii=False, indent="\t")
    f.write("\n")
EOF
echo "$name: version $version, ${duration}s"
ls -lh "$out"
