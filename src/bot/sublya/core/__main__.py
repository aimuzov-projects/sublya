"""Burns TikTok-style subtitles into a video, highlighting the word being spoken.

The recognised transcript is cached in work/<video>/transcript.json, so reruns with a
different --text or --style skip recognition.

Usage:
  python -m sublya.core IMG_4476.MOV
  python -m sublya.core IMG_4476.MOV --text poem.txt --style big
"""

import argparse
import asyncio
import json
import os
import shutil
import sys
from dataclasses import asdict
from pathlib import Path

from .align import align
from .models import DEFAULT_STYLE, STYLES, Transcript
from .render import render
from .transcribe import SttConfig, transcribe


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path)
    ap.add_argument("-o", "--output", type=Path, help="default: <video>.subs.mp4")
    ap.add_argument("--text", type=Path, help="reference text; its line breaks become page breaks")
    ap.add_argument("--style", choices=STYLES, default=DEFAULT_STYLE)
    ap.add_argument("--circle", action="store_true",
                    help="keep subtitles inside the circle a Telegram video note is cropped to")
    ap.add_argument("--lang", default=os.environ.get("DEFAULT_LANG", "ru") or "auto",
                    help="speech language, or auto; default: DEFAULT_LANG or ru")
    ap.add_argument("--lag", type=float, default=float(os.environ["STT_LAG"]) if os.environ.get("STT_LAG") else None,
                    help="how late the recogniser places word starts, seconds; default depends on the timing kind")
    ap.add_argument("--retranscribe", action="store_true", help="ignore the cached transcript")
    ap.add_argument("--words", type=Path,
                    help="write the aligned words as JSON here instead of rendering; the site draws them itself")
    args = ap.parse_args()

    video = args.video.absolute()
    out = args.output or video.with_name(f"{video.stem}.subs.mp4")
    work = video.parent / "work" / video.stem
    work.mkdir(parents=True, exist_ok=True)
    cached = work / "transcript.json"

    if args.retranscribe or not cached.exists():
        cfg = SttConfig.from_env()
        if not cfg.key:
            sys.exit("set STT_API_KEY")
        lang = None if args.lang == "auto" else args.lang
        transcript = asyncio.run(transcribe(video, work, cfg, lang))
        cached.write_text(transcript.to_json(), encoding="utf-8")
    else:
        transcript = Transcript.from_json(cached.read_text(encoding="utf-8"))

    text = args.text.read_text(encoding="utf-8") if args.text else None
    words = align(transcript, text, args.lag)
    (work / "words.tsv").write_text(
        "".join(f"{w.start:.2f}\t{w.end:.2f}\t{w.text}\n" for w in words), encoding="utf-8"
    )
    print("text:", " ".join(w.text for w in words), file=sys.stderr)
    if args.words:
        data = [{**asdict(w), "start": round(w.start, 3), "end": round(w.end, 3)} for w in words]
        args.words.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
        print(args.words)
        return
    shutil.move(render(video, words, transcript.size, work, args.style, args.circle), out)
    print(out)


if __name__ == "__main__":
    main()
