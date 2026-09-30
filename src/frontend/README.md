# Sublya site

The landing page of [Sublya](https://sublya.aimuzov.online), a Telegram bot that burns
TikTok-style subtitles into videos. Built with [Astro](https://astro.build) into a static page:
the deck, the step scenes and the rest of the motion are small scripts, everything else is
plain HTML.

The bot itself lives in [sublya/bot](https://github.com/sublya/bot); the demo script expects it
cloned next to this one as `bot/`.

## Look at it

```bash
npm install
npm run dev
```

`npm run build` puts the finished site in `dist/`.

```
src/
  pages/index.astro      # the page, put together from the components
  components/            # Header, Stage (first screen and the demo deck), Steps, Features, Final, Footer
  scripts/               # the deck player, the step scenes, the glow, the dodging button
  styles/                # one file per component, all global: the scripts build part of the markup
  data/demos.json        # the demos in the deck, checked against src/content.config.ts
  assets/fonts/          # Montserrat, preloaded and hashed by the build
public/media/<name>/     # one demo: the video as sent and the four styles, with posters
```

## Demo videos

The demo is a deck of cards: each is a real video as it was sent, plus the same video with
subtitles in each of the four styles. The page shuffles the deck, and a swipe shows the next
one. `demo/<name>.txt` is the exact text of a demo; its line breaks are the screen breaks.

To add a demo, write its text, build it, then fill in its note in `src/data/demos.json`: the
build fails while a note is empty. The bot repository has to sit next to this one (or
`SUBLYA_BOT_DIR` has to point at it) with `STT_API_KEY` in its `.env`:

```bash
SUBLYA_FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg demo/make-demo.sh name video.mp4
# footage shot on the move: SUBLYA_CRF=31 keeps each file around 3 MB
```

Rendering goes through the bot's Docker image, so the font and ffmpeg are the same as in
production. Recognition costs a fraction of a cent.

The videos keep their names across rebuilds, so their URLs carry a version from
`demos.json`; CSS, JS and fonts get hashed names from the build.

## Deploy

sublya.aimuzov.online is served by the skator.ru server: `deploy/vps.sh` builds the site and
runs it there in an nginx container behind the server's Caddy. The domain has an A record for
the server, and the skator `deploy/Caddyfile` has its `sublya.aimuzov.online` block. Run the
script by hand after merging into `main`.

GitHub Pages keeps a mirror at sublya.github.io/site, on every push to `main`:
`.github/workflows/pages.yml` builds the site with `SITE_BASE=/site` and publishes `dist/`.
Links and media go through `withBase()` from `src/scripts/base.js`, so both builds find their
files. The Pages settings have no custom domain, or github.io would redirect to the domain.

## License

[MIT](LICENSE)
