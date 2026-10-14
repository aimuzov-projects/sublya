#!/usr/bin/env bash
# Собирает одно демо для лендинга из видео и его точного текста. Страница сама
# рисует субтитры поверх видео как есть, поэтому движок бота только находит
# тайминги слов. Результат:
# - public/media/<name>/ -- видео и его постеры;
# - src/frontend/data/words/<name>.json -- тайминги;
# - src/frontend/data/demos.json -- запись о демо.
#
# Нужны ffmpeg, Docker, python3 и STT_API_KEY в .env в корне репозитория.
# Распознавание стоит доли цента.
#
# Использование: demo/make-demo.sh name video.mp4 [demo/name.txt]
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
# веб-версии: лёгкие и начинают играть, ещё не докачавшись до конца
# трясущаяся съёмка с велосипеда или прогулки плохо жмётся: чтобы файл остался
# лёгким, поднимаем SUBLYA_CRF
web=(-c:v libx264 -preset slow -crf "${SUBLYA_CRF:-27}" -pix_fmt yuv420p -movflags +faststart)

mkdir -p "$out"
"$ffmpeg" -v error -y -i "$source" -vf "scale=720:-2" "${web[@]}" -c:a aac -b:a 96k "$work/demo.mp4"
cp "$work/demo.mp4" "$out/before.mp4"
cp "$text" "$work/text.txt"

# в образе бота те же ffmpeg и Montserrat, что в проде, поэтому тайминги и постер
# получаются такими, какими их сделал бы бот; транскрипт кешируется в $work, так что
# распознавание запускается один раз
docker build -q -t sublya-bot -f "$root/deploy/bot.Dockerfile" "$root" >/dev/null
bot=(docker run --rm --env-file "$root/.env" -v "$work:/w" sublya-bot
  node src/bot/core/cli.ts /w/demo.mp4 --text /w/text.txt)
"${bot[@]}" --words /w/words.json >/dev/null
cp "$work/words.json" "$root/src/frontend/data/words/$name.json"

# постер -- кадр классического стиля: колода показывает его, пока видео не заиграет
"${bot[@]}" --style classic -o /w/classic.mp4 >/dev/null
"$ffmpeg" -v error -y -ss 1.6 -i "$work/classic.mp4" -frames:v 1 -q:v 4 "$out/poster.jpg"
"$ffmpeg" -v error -y -ss 1.6 -i "$out/before.mp4" -frames:v 1 -q:v 4 "$out/before.jpg"
# на странице они маленькие: постер колоды максимум 300 px в ширину, кадр в шагах
# -- 92; JPEG остаются для превью ссылок, где WebP поддерживается ещё не везде
"$ffmpeg" -v error -y -i "$out/poster.jpg" -vf scale=540:-2 -c:v libwebp -quality 72 "$out/poster.webp"
"$ffmpeg" -v error -y -i "$out/before.jpg" -vf scale=400:-2 -c:v libwebp -quality 72 "$out/before.webp"

# страница запрашивает /media/<name>/*?v=<version>: новые файлы -- новые URL,
# что бы ни лежало в кеше браузеров
version="$(cat "$out"/*.mp4 "$out"/*.jpg | shasum | cut -c1-8)"
duration="$("$ffprobe" -v error -show_entries format=duration -of csv=p=0 "$out/before.mp4")"
python3 - "$root/src/frontend/data/demos.json" "$name" "$version" "$duration" <<'EOF'
import json, os, sys
path, name, version, duration = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
demos = json.load(open(path)) if os.path.exists(path) else []
entry = next((d for d in demos if d["id"] == name), None)
if entry is None:
    # подпись под плеером пишется руками потом; пока её нет, сборка падает
    entry = {"id": name, "note": ""}
    demos.append(entry)
entry.update(v=version, duration=round(duration, 1))
with open(path, "w") as f:
    json.dump(demos, f, ensure_ascii=False, indent="\t")
    f.write("\n")
EOF
echo "$name: version $version, ${duration}s"
ls -lh "$out"
