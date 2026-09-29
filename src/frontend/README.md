# Sublya site

The landing page of [Sublya](https://sublya.aimuzov.online), a Telegram bot that burns
TikTok-style subtitles into videos. Plain HTML, CSS and JS, no build step.

The bot itself lives in a separate repository, cloned next to this one as `bot/`.

## Look at it

```bash
python3 -m http.server 8765
```

## Demo videos

`media/` holds a synthetic demo: the macOS voice Milena reads Pushkin's "Winter Morning"
over a drifting gradient, and the bot's engine burns subtitles in each of the four styles.
No real person appears in it. To rebuild it, the bot repository has to sit next to this one
(or `SUBLYA_BOT_DIR` has to point at it) with `STT_API_KEY` in its `.env`:

```bash
SUBLYA_FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg SUBLYA_FFPROBE=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe demo/make-demo.sh
```

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
