# Sublya site

The landing page of [Sublya](https://sublya.aimuzov.online), a Telegram bot that burns
TikTok-style subtitles into videos. Plain HTML, CSS and JS, no build step.

The bot itself lives in [sublya/bot](https://github.com/sublya/bot); the demo script expects it cloned next to this one as `bot/`.

## Look at it

```bash
docker run --rm -p 8765:80 -v "$PWD:/usr/share/nginx/html:ro" nginx:alpine
```

## Demo videos

The demo is a deck of cards: each is a real video as it was sent, plus the same video with
subtitles in each of the four styles. The page shuffles the deck, and a swipe shows the next
one. `media/<name>/` holds the files of one demo, `media/demos.json` lists them with the note
shown under the player, and `demo/<name>.txt` is the exact text; its line breaks are the
screen breaks.

To add a demo, write its text, build it, then fill in its note in `media/demos.json`. The bot
repository has to sit next to this one (or `SUBLYA_BOT_DIR` has to point at it) with
`STT_API_KEY` in its `.env`:

```bash
SUBLYA_FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg demo/make-demo.sh name video.mp4
# footage shot on the move: SUBLYA_CRF=31 keeps each file around 3 MB
```

Serving the files needs HTTP range requests: without them the player can't seek, and
switching styles jumps back to the start. nginx has them, `python3 -m http.server` doesn't.

Rendering goes through the bot's Docker image, so the font and ffmpeg are the same as in
production. Recognition costs a fraction of a cent.

## Deploy

GitHub Pages, on every push to `main`: `.github/workflows/pages.yml` copies the page, the
fonts and the demo into the artifact and adds the commit to the CSS and JS URLs, since Pages
caches everything for ten minutes. The domain comes from the `CNAME` file it writes.

## License

[MIT](LICENSE)
