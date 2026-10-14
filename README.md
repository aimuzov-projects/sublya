<p align="center">
	<img src="https://img.shields.io/badge/English-fe2c55?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCAzMCI+PGNsaXBQYXRoIGlkPSJ0Ij48cGF0aCBkPSJNMzAsMTVoMzB2MTV6djE1aC0zMHpoLTMwdi0xNXp2LTE1aDMweiIvPjwvY2xpcFBhdGg+PHBhdGggZD0iTTAsMHYzMGg2MHYtMzB6IiBmaWxsPSIjMDEyMTY5Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIGNsaXAtcGF0aD0idXJsKCN0KSIgc3Ryb2tlPSIjQzgxMDJFIiBzdHJva2Utd2lkdGg9IjQiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMTAiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNDODEwMkUiIHN0cm9rZS13aWR0aD0iNiIvPjwvc3ZnPg==" alt="English">
	<a href="README.ru.md"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-555?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDYiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoOXYzSDB6Ii8+PHBhdGggZmlsbD0iIzAwMzlhNiIgZD0iTTAgMmg5djJIMHoiLz48cGF0aCBmaWxsPSIjZDUyYjFlIiBkPSJNMCA0aDl2MkgweiIvPjwvc3ZnPg==" alt="Русский"></a>
</p>

<p align="center">
	<a href="https://sublya.aimuzov.online"><img src=".github/assets/banner.en.jpg" alt="Sublya: a Telegram bot for TikTok-style subtitles" width="100%"></a>
</p>

<p align="center">
	<a href="https://github.com/aimuzov-projects/sublya/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/aimuzov-projects/sublya/deploy.yml?branch=main&label=deploy" alt="Deploy"></a>
	<a href="https://sublya.aimuzov.online"><img src="https://img.shields.io/website?url=https%3A%2F%2Fsublya.aimuzov.online&label=site" alt="Site status"></a>
	<a href="https://t.me/sublyarobot"><img src="https://img.shields.io/badge/Telegram-@sublyarobot-26a5e4?logo=telegram&logoColor=white" alt="Telegram bot"></a>
	<a href="package.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Faimuzov-projects%2Fsublya%2Fmain%2Fpackage.json&query=%24.engines.node&label=node&logo=nodedotjs&logoColor=white&color=5fa04e" alt="Node"></a>
	<a href="https://grammy.dev"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/sublya/grammy?label=grammY&color=009dca" alt="grammY"></a>
	<a href="https://astro.build"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/sublya/dev/astro?logo=astro&logoColor=white&color=bc52ee" alt="Astro"></a>
	<a href="https://svelte.dev"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/sublya/dev/svelte?logo=svelte&logoColor=white&color=ff3e00" alt="Svelte"></a>
	<a href="LICENSE"><img src="https://img.shields.io/github/license/aimuzov-projects/sublya" alt="License"></a>
</p>

<h3 align="center">TikTok-style subtitles in one message</h3>
<p align="center">Send a video to a Telegram bot, get it back with two or three words on screen and the spoken one lit up</p>

<table>
	<tr>
		<td width="50%" align="center"><img src=".github/assets/home.jpg" alt="Landing page"><br><b>Site</b> for visitors</td>
		<td width="50%" align="center"><img src=".github/assets/demo.jpg" alt="Demo deck"><br><b>Demo</b> with the styles switched on the fly</td>
	</tr>
</table>

The bot is [@sublyarobot](https://t.me/sublyarobot), the landing page lives at [sublya.aimuzov.online](https://sublya.aimuzov.online). Both are TypeScript in one repository: a [grammY](https://grammy.dev) bot that Node runs without a build, and a static [Astro](https://astro.build) site with [Svelte](https://svelte.dev) islands.

The bot and the site speak Russian, so the names below are translated.

## What's inside

- **Bot**: a video, a video note or a video file in, the same video with burned-in subtitles out. A video note comes back as a video note, with the lines kept inside its circle.
- **Your exact text**: a poem or a script in the caption replaces what was heard and keeps the timings; its line breaks become screen breaks. Mumbled, skipped or extra words don't break the sync.
- **Fix and style buttons** under the result re-render the video from the cached transcript, without calling the recogniser again. Four styles: Classic, Big, Plate, One word.
- **Quotas**: new videos per user per day and recognised minutes per day for the whole bot. Admins have no limit, re-renders are free.
- **Support**: with a forum group set up, every user gets a topic with their whole dialogue, and what the team writes there goes back to the user from the bot.
- **Admin panel**: a Telegram Mini App with users, videos, errors and the OpenRouter balance; `/admin` opens it for admins. Telegram signs the Mini App's initData with the bot token, and that signature is the whole authentication.
- **Site**: the landing page with a deck of real demo videos. The page plays the video as it was sent and draws the bot's subtitles over it, so a style switch is instant and a card downloads one video.

## How a video becomes subtitles

1. ffmpeg extracts 16 kHz mono audio and finds pauses with `silencedetect`.
2. An OpenAI-compatible `audio/transcriptions` endpoint (OpenRouter by default, Whisper large v3 turbo, about $0.0002 a minute) returns words with start and end times.
3. Word starts are snapped to the pauses: recognisers are off by a couple of hundred milliseconds, while the end of a pause is exactly where the next word begins. Details: [docs/alignment.md](docs/alignment.md).
4. If the caption has a reference text, its wording replaces what was heard and keeps the timings.
5. Words are grouped into screens of up to 3 words and 24 characters, a short word stays on the line of the next one, one ASS event per word, and ffmpeg with libass burns them into the video.

## How it is built

- [`src/bot`](src/bot): the bot. `core/` knows nothing of Telegram: audio, recognition, alignment, the ASS writer and a CLI. Next to it the grammY handlers, the SQLite job queue on the built-in `node:sqlite`, the worker that renders one video at a time, support topics and the admin panel on `node:http`.
- [`src/frontend`](src/frontend): the Astro site, the `srcDir` in `astro.config.mjs`. The deck, the step scenes, the karaoke cards and the dodging button are Svelte islands, the rest is static HTML.
- [`src/shared`](src/shared): screens, style presets and the typograph, the same for the bot and the site.
- [`src/bot/core/fixtures`](src/bot/core/fixtures): a real recording with hand-checked timings, plus `golden/`, what the Python bot made of it before the rewrite. The TypeScript engine matches it to the last digit, the ASS byte for byte.

Imports go through `#bot/*`, `#frontend/*` and `#shared/*`. Files are named in kebab-case.

## Running

Stack and layout follow [infra-site-template](https://github.com/aimuzov-projects/infra-site-template); the Prettier, stylelint and oxlint configs and the CI steps come from [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit). Node comes from [`mise.toml`](mise.toml).

```sh
cp .env.example .env   # BOT_TOKEN and STT_API_KEY for the bot; the site needs none
npm ci
npm run dev            # the site
npm run bot            # the bot, polling the public Bot API
```

Before committing, the same checks as in CI:

```sh
npm run format:check && npm run lint:js && npm run lint:css && npm run check && npm test
```

The e2e tests in [`e2e`](e2e) build the site and open it in Chromium with the shared checks of [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit): the sitemap pages answer without console errors and pass axe, Yandex Metrica waits for the first interaction. The browser is installed once with `npx playwright install chromium`, then `npm run test:e2e`.

Render tests need ffmpeg with libass and are skipped otherwise. Homebrew's `ffmpeg` has no libass, `ffmpeg-full` does:

```sh
export SUBLYA_FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg SUBLYA_FFPROBE=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe
```

`docker compose up -d --build` starts the bot next to a local Bot API server, as in production: without it the bot can't download files over 20 MB. A bot that has been polling the public Bot API has to be logged out of it once, otherwise the local server can't take it over: `curl https://api.telegram.org/bot$BOT_TOKEN/logOut`.

### CLI

The engine works without Telegram:

```sh
node --env-file=.env src/bot/core/cli.ts video.mov --text poem.txt --style big
```

The transcript is cached in `work/<video>/transcript.json` next to the video, so trying other texts and styles is free; `--retranscribe` asks the recogniser again, `--words file.json` writes the aligned words instead of rendering.

### Demo videos

`demo/<name>.txt` is the exact text of a demo, its line breaks are the screen breaks. `demo/make-demo.sh` takes the video and the text, finds the word timings with the bot's Docker image and renders the poster:

```sh
SUBLYA_FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg demo/make-demo.sh name video.mp4
```

Then the note under the player goes into [`src/frontend/data/demos.json`](src/frontend/data/demos.json): the build fails while it is empty. The videos keep their names, so their URLs carry a version from `demos.json`.

## Configuration

Everything comes from the environment; [`.env.example`](.env.example) lists it.

| Variable                               | Default                         | Meaning                                                                                                   |
| -------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `BOT_TOKEN`                            | required                        | token from @BotFather                                                                                     |
| `STT_API_KEY`                          | required                        | key for the transcription endpoint                                                                        |
| `STT_API_URL`                          | `https://openrouter.ai/api/v1`  | any OpenAI-compatible base URL, e.g. Groq                                                                 |
| `STT_MODEL`                            | `openai/whisper-large-v3-turbo` | a Whisper model that returns word timestamps                                                              |
| `STT_LAG`                              | tuned per timing kind           | how late the recogniser places word starts, seconds                                                       |
| `DEFAULT_LANG`                         | `ru`                            | speech language for users who never ran `/lang`; empty for autodetect, which can take Russian for English |
| `STT_DAILY_MINUTES`                    | `300`                           | recognised minutes per day for the whole bot                                                              |
| `DAILY_VIDEOS`                         | `10`                            | new videos per user per day                                                                               |
| `BONUS_VIDEOS`                         | `10`                            | videos the admin panel's "+N" button adds to a user's quota for today                                     |
| `ADMIN_IDS`                            | empty                           | Telegram user ids that get errors, `/stats` and the admin panel                                           |
| `ADMIN_URL`                            | empty                           | public address of the admin Mini App; empty keeps its web server off                                      |
| `ADMIN_PORT`                           | `8090`                          | port of the admin panel's web server                                                                      |
| `SUPPORT_CHAT_ID`                      | empty                           | forum group with the bot as admin, for support topics                                                     |
| `TELEGRAM_API_URL`                     | empty                           | local Bot API server                                                                                      |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` |                                 | from my.telegram.org, for the local Bot API server                                                        |
| `DATA_DIR`                             | `data`                          | SQLite database and job files, removed after 24 hours                                                     |
| `SUBLYA_FFMPEG`, `SUBLYA_FFPROBE`      | from `PATH`                     | ffmpeg must have libass                                                                                   |
| `SUBLYA_FONTS_DIR`                     |                                 | where libass looks for Montserrat ExtraBold, `src/bot/fonts` by default                                   |

A typo in a number or in `ADMIN_IDS` stops the start instead of turning into an empty setting.

## Content Security Policy

The build puts a CSP with hashes of Astro's scripts and styles into every page (`security.csp` in `astro.config.mjs`). The only outside source is Yandex Metrica, and its snippet is a file of its own, [`public/metrika.js`](public/metrika.js): Astro doesn't hash `is:inline` scripts, and the browser would block it. No `style=""` attributes in the markup: the islands set styles through the CSSOM, which the policy allows.

## Deployment

The projects server from [infra-server](https://github.com/aimuzov-projects/infra-server): merging the release PR that release-please keeps open runs `deploy.yml`, which runs the checks and logs in over SSH, where the key runs the shared [`deploy/site.sh`](https://github.com/aimuzov-projects/infra-server/blob/main/deploy/site.sh) of infra-server. It pulls `main` into `/srv/sublya` and rebuilds [`deploy/docker-compose.yml`](deploy/docker-compose.yml): the site in nginx, the bot, the local Bot API server and a tun2socks tunnel that takes the bot's traffic to Telegram and OpenRouter out through the shared VPN exit. The domain and TLS are on the shared Caddy, which also sends `/admin` to the bot. Secrets live in `/srv/sublya/.env`, the database and job files in `/srv/sublya/data`. Details and the first deploy: [docs/deploy.md](docs/deploy.md).

Once an hour [`monitor.yml`](.github/workflows/monitor.yml) checks from outside that the site answers and that `/admin/api/health` does: the bot asks Telegram for `getMe` through the local Bot API server and the tunnel. A failed run is the alert, GitHub emails it.

To roll back fast, run Deploy by hand with the previous tag: `gh workflow run deploy.yml -f tag=v1.2.3`. A fix of the bad commit goes out through the release PR like any change.

## License

The code is licensed under [MIT](LICENSE). Site content (texts, demo videos, names) is not covered by it: all rights reserved.
