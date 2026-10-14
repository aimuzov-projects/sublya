<p align="center">
	<a href="README.md"><img src="https://img.shields.io/badge/English-555?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCAzMCI+PGNsaXBQYXRoIGlkPSJ0Ij48cGF0aCBkPSJNMzAsMTVoMzB2MTV6djE1aC0zMHpoLTMwdi0xNXp2LTE1aDMweiIvPjwvY2xpcFBhdGg+PHBhdGggZD0iTTAsMHYzMGg2MHYtMzB6IiBmaWxsPSIjMDEyMTY5Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIGNsaXAtcGF0aD0idXJsKCN0KSIgc3Ryb2tlPSIjQzgxMDJFIiBzdHJva2Utd2lkdGg9IjQiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMTAiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNDODEwMkUiIHN0cm9rZS13aWR0aD0iNiIvPjwvc3ZnPg==" alt="English"></a>
	<img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-fe2c55?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDYiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoOXYzSDB6Ii8+PHBhdGggZmlsbD0iIzAwMzlhNiIgZD0iTTAgMmg5djJIMHoiLz48cGF0aCBmaWxsPSIjZDUyYjFlIiBkPSJNMCA0aDl2MkgweiIvPjwvc3ZnPg==" alt="Русский">
</p>

<p align="center">
	<a href="https://sublya.aimuzov.online"><img src=".github/assets/banner.jpg" alt="Сабля: Telegram-бот для субтитров как в тиктоке" width="100%"></a>
</p>

<p align="center">
	<a href="https://github.com/aimuzov-projects/sublya/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/aimuzov-projects/sublya/deploy.yml?branch=main&label=deploy" alt="Deploy"></a>
	<a href="https://sublya.aimuzov.online"><img src="https://img.shields.io/website?url=https%3A%2F%2Fsublya.aimuzov.online&label=site" alt="Сайт"></a>
	<a href="https://t.me/sublyarobot"><img src="https://img.shields.io/badge/Telegram-@sublyarobot-26a5e4?logo=telegram&logoColor=white" alt="Бот в Telegram"></a>
	<a href="package.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Faimuzov-projects%2Fsublya%2Fmain%2Fpackage.json&query=%24.engines.node&label=node&logo=nodedotjs&logoColor=white&color=5fa04e" alt="Node"></a>
	<a href="https://grammy.dev"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/sublya/grammy?label=grammY&color=009dca" alt="grammY"></a>
	<a href="https://astro.build"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/sublya/dev/astro?logo=astro&logoColor=white&color=bc52ee" alt="Astro"></a>
	<a href="https://svelte.dev"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/sublya/dev/svelte?logo=svelte&logoColor=white&color=ff3e00" alt="Svelte"></a>
	<a href="LICENSE"><img src="https://img.shields.io/github/license/aimuzov-projects/sublya" alt="Лицензия"></a>
</p>

<h3 align="center">Субтитры как в тиктоке одним сообщением</h3>
<p align="center">Пришли видео Telegram-боту и получи его обратно: на экране пара слов, произносимое подсвечено</p>

<table>
	<tr>
		<td width="50%" align="center"><img src=".github/assets/home.jpg" alt="Лендинг"><br><b>Сайт</b> для посетителей</td>
		<td width="50%" align="center"><img src=".github/assets/demo.jpg" alt="Колода демо"><br><b>Демо</b> со стилями на лету</td>
	</tr>
</table>

Бот — [@sublyarobot](https://t.me/sublyarobot), лендинг — [sublya.aimuzov.online](https://sublya.aimuzov.online). Оба на TypeScript в одном репозитории: бот на [grammY](https://grammy.dev), который Node запускает без сборки, и статический сайт на [Astro](https://astro.build) с островами на [Svelte](https://svelte.dev).

## Что внутри

- **Бот**: на входе видео, кружок или видеофайл, на выходе то же видео с прожжёнными субтитрами. Кружок возвращается кружком, и строки не вылезают за его край.
- **Свой текст**: стих или сценарий в подписи к видео заменяет услышанное и сохраняет тайминги, переносы строк становятся сменой экрана. Проглоченные, пропущенные или лишние слова синхронизацию не ломают.
- **Кнопки «Исправить текст» и «Стиль»** под результатом перерендеривают видео из сохранённого транскрипта, без повторного распознавания. Четыре стиля: «Классика», «Крупно», «Плашка», «По слову».
- **Лимиты**: новых видео на пользователя в день и распознанных минут в день на весь бот. У админов лимита нет, перерендеры бесплатные.
- **Поддержка**: если подключена форум-группа, у каждого пользователя в ней своя тема со всей перепиской, а что команда пишет в тему, бот отправляет пользователю от своего имени.
- **Админка**: Telegram Mini App с пользователями, видео, ошибками и балансом OpenRouter, `/admin` открывает её админам. Telegram подписывает initData Mini App токеном бота, и эта подпись — вся аутентификация.
- **Сайт**: лендинг с колодой настоящих демо. Страница играет видео как его прислали и рисует поверх субтитры бота, поэтому стиль переключается мгновенно, а карточка качает одно видео.

## Как видео становится субтитрами

1. ffmpeg достаёт аудио 16 кГц моно и находит паузы через `silencedetect`.
2. OpenAI-совместимый `audio/transcriptions` (по умолчанию OpenRouter, Whisper large v3 turbo, около $0.0002 за минуту) возвращает слова со временем начала и конца.
3. Начала слов прижимаются к паузам: распознаватель ошибается на пару сотен миллисекунд, а конец паузы — ровно начало следующего слова. Подробно: [docs/alignment.md](docs/alignment.md).
4. Если в подписи есть эталонный текст, его слова заменяют услышанные с сохранением таймингов.
5. Слова собираются в экраны до 3 слов и 24 символов, короткое слово держится со следующим на одной строке, на каждое слово своё ASS-событие, и ffmpeg с libass прожигает их в видео.

## Как устроено

- [`src/bot`](src/bot): бот. `core/` ничего не знает про Telegram: аудио, распознавание, выравнивание, генерация ASS и CLI. Рядом хендлеры grammY, очередь задач в SQLite на встроенном `node:sqlite`, воркер, который рендерит по одному видео, темы поддержки и админка на `node:http`.
- [`src/frontend`](src/frontend): сайт на Astro, это `srcDir` в `astro.config.mjs`. Колода, сцены шагов, карточки с караоке и убегающая кнопка — острова на Svelte, остальное статичный HTML.
- [`src/shared`](src/shared): экраны, пресеты стилей и типограф, общие для бота и сайта.
- [`src/bot/core/fixtures`](src/bot/core/fixtures): настоящая запись с выверенными вручную таймингами и `golden/` — что из неё сделал бот на Python до переписывания. Движок на TypeScript совпадает с ним до последней цифры, ASS — байт в байт.

Импорты идут через `#bot/*`, `#frontend/*` и `#shared/*`. Файлы называются в kebab-case.

## Запуск

Стек и раскладка как в [infra-site-template](https://github.com/aimuzov-projects/infra-site-template), конфиги Prettier, stylelint и oxlint и шаги CI берутся из [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit). Node берётся из [`mise.toml`](mise.toml).

```sh
cp .env.example .env   # боту нужны BOT_TOKEN и STT_API_KEY, сайту ничего
npm ci
npm run dev            # сайт
npm run bot            # бот через публичный Bot API
```

Перед коммитом те же проверки, что в CI:

```sh
npm run format:check && npm run lint:js && npm run lint:css && npm run check && npm test
```

Тестам рендера нужен ffmpeg с libass, без него они пропускаются. В `ffmpeg` из Homebrew libass нет, в `ffmpeg-full` есть:

```sh
export SUBLYA_FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg SUBLYA_FFPROBE=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe
```

`docker compose up -d --build` поднимает бота рядом с локальным Bot API, как на проде: без него бот не скачает файлы больше 20 МБ. Бота, который до этого работал через публичный Bot API, нужно один раз разлогинить, иначе локальный сервер его не заберёт: `curl https://api.telegram.org/bot$BOT_TOKEN/logOut`.

### CLI

Движок работает без Telegram:

```sh
node --env-file=.env src/bot/core/cli.ts video.mov --text poem.txt --style big
```

Транскрипт кэшируется в `work/<video>/transcript.json` рядом с видео, так что пробовать другие тексты и стили бесплатно. `--retranscribe` распознаёт заново, `--words file.json` вместо рендера пишет выровненные слова.

### Демо-видео

`demo/<name>.txt` — точный текст демо, переносы строк в нём становятся сменой экрана. `demo/make-demo.sh` берёт видео и текст, находит тайминги слов через Docker-образ бота и рендерит постер:

```sh
SUBLYA_FFMPEG=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg demo/make-demo.sh name video.mp4
```

Потом подпись под плеером пишется в [`src/frontend/data/demos.json`](src/frontend/data/demos.json): пока она пустая, сборка падает. Видео не меняют имён, поэтому в их адресах стоит версия из `demos.json`.

## Настройки

Всё берётся из окружения, список в [`.env.example`](.env.example).

| Переменная                             | По умолчанию                    | Что это                                                                                                       |
| -------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `BOT_TOKEN`                            | обязательна                     | токен от @BotFather                                                                                           |
| `STT_API_KEY`                          | обязательна                     | ключ сервиса распознавания                                                                                    |
| `STT_API_URL`                          | `https://openrouter.ai/api/v1`  | любой OpenAI-совместимый адрес, например Groq                                                                 |
| `STT_MODEL`                            | `openai/whisper-large-v3-turbo` | модель Whisper, которая отдаёт тайминги слов                                                                  |
| `STT_LAG`                              | подобрана под вид таймингов     | насколько поздно распознаватель ставит начало слова, в секундах                                               |
| `DEFAULT_LANG`                         | `ru`                            | язык речи для тех, кто не выбирал его в `/lang`; пусто — автоопределение, которое путает русский с английским |
| `STT_DAILY_MINUTES`                    | `300`                           | распознанных минут в день на весь бот                                                                         |
| `DAILY_VIDEOS`                         | `10`                            | новых видео на пользователя в день                                                                            |
| `BONUS_VIDEOS`                         | `10`                            | сколько видео на сегодня добавляет кнопка «+N» в админке                                                      |
| `ADMIN_IDS`                            | пусто                           | id в Telegram, которым приходят ошибки, `/stats` и админка                                                    |
| `ADMIN_URL`                            | пусто                           | публичный адрес админки; пусто — её веб-сервер выключен                                                       |
| `ADMIN_PORT`                           | `8090`                          | порт веб-сервера админки                                                                                      |
| `SUPPORT_CHAT_ID`                      | пусто                           | форум-группа с ботом-админом для тем поддержки                                                                |
| `TELEGRAM_API_URL`                     | пусто                           | локальный Bot API                                                                                             |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` |                                 | с my.telegram.org, для локального Bot API                                                                     |
| `DATA_DIR`                             | `data`                          | база SQLite и файлы задач, удаляются через сутки                                                              |
| `SUBLYA_FFMPEG`, `SUBLYA_FFPROBE`      | из `PATH`                       | ffmpeg должен быть с libass                                                                                   |
| `SUBLYA_FONTS_DIR`                     |                                 | где libass ищет Montserrat ExtraBold                                                                          |

Опечатка в числе или в `ADMIN_IDS` останавливает запуск, а не превращается в пустую настройку.

## Content Security Policy

Сборка кладёт в каждую страницу CSP с хешами скриптов и стилей Astro (`security.csp` в `astro.config.mjs`). Из внешних источников только Яндекс Метрика, и её сниппет — отдельный файл [`public/metrika.js`](public/metrika.js): `is:inline`-скрипты Astro не хеширует, и браузер бы его заблокировал. Атрибутов `style=""` в разметке нет: острова ставят стили через CSSOM, а его политика пропускает.

## Деплой

Сервер projects из [infra-server](https://github.com/aimuzov-projects/infra-server): пуш в `main` запускает `deploy.yml`, тот прогоняет проверки и заходит по SSH, где ключ привязан к [`deploy/remote.sh`](deploy/remote.sh). Скрипт подтягивает `main` в `/srv/sublya` и пересобирает [`deploy/docker-compose.yml`](deploy/docker-compose.yml): сайт в nginx, бот, локальный Bot API и туннель tun2socks, который выводит трафик бота к Telegram и OpenRouter через общий VPN-выход. Домен и TLS на общем Caddy, он же отправляет `/admin` боту. Секреты лежат в `/srv/sublya/.env`, база и файлы задач — в `/srv/sublya/data`. Подробности и первый деплой: [docs/deploy.md](docs/deploy.md).

Откатить: `git revert` плохого коммита в `main` и пуш.

## Лицензия

Код под [MIT](LICENSE). На содержимое сайта (тексты, демо-видео, названия) она не распространяется: все права защищены.
