# Sublya site

The landing page of [Sublya](https://sublya.aimuzov.online), a Telegram bot that burns
TikTok-style subtitles into videos. Plain HTML, CSS and JS, no build step.

The bot itself lives in [aimuzov/sublya-bot](https://github.com/aimuzov/sublya-bot); the demo script expects it cloned next to this one as `bot/`.

## Look at it

```bash
docker run --rm -p 8765:80 -v "$PWD:/usr/share/nginx/html:ro" -v "$PWD/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.29-alpine
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
```

Serving the files needs HTTP range requests: without them the player can't seek, and
switching styles jumps back to the start. nginx has them, `python3 -m http.server` doesn't.

Rendering goes through the bot's Docker image, so the font and ffmpeg are the same as in
production. Recognition costs a fraction of a cent.

## Deploy

The page is served by nginx in a small container:

```bash
docker build -t sublya-site .
docker run -d -p 8080:80 sublya-site
```

In production it sits behind the Caddy of the server it shares, see the bot's
`docs/deploy.md`.

## License

[MIT](LICENSE)
