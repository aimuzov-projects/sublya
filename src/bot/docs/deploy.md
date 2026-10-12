# Deploy

The production bot runs on the projects server (1 vCPU, 2 GB RAM), which it shares with other
projects. The repository is cloned to `/srv/sublya-bot` there, and `deploy/docker-compose.yml`
builds and runs the stack. Ports 80/443 and the domains belong to the shared Caddy from
[infra-server](https://github.com/aimuzov-projects/infra-server).

Every push to `main` deploys it: `.github/workflows/deploy.yml` runs the tests, then logs into
the server with the `DEPLOY_SSH_KEY` secret. That key is bound to `deploy/remote.sh` in the
server's `authorized_keys`:

```
command="git -C /srv/sublya-bot pull --ff-only --quiet && /srv/sublya-bot/deploy/remote.sh",restrict ssh-ed25519 ... github-actions@sublya-bot
```

The script pulls `main` and rebuilds the containers. To deploy without a push:
`gh workflow run deploy.yml`.

## Why there's a tunnel

The server is in Russia: `api.telegram.org`, Telegram's data centres and OpenRouter don't
answer from it. infra-server runs a shared VPN exit, the `vpn` container with a SOCKS proxy on
`vpn:1080`. The Bot API server talks MTProto and has no setting for a SOCKS proxy, so instead
of teaching every client about the proxy, three containers share one network namespace:

- `tunnel` runs [tun2socks](https://github.com/xjasonlyu/tun2socks): a TUN device with the
  default route, and everything that goes into it leaves through `socks5://vpn:1080`;
- `telegram-bot-api` listens on `127.0.0.1:8081` inside that namespace;
- `bot` talks to it at `127.0.0.1:8081` and reaches OpenRouter the same way.

If the bot stops getting updates, check the proxy first, from the server:

```bash
docker run --rm --network vpn curlimages/curl -sS -o /dev/null -w '%{http_code}\n' -x socks5h://vpn:1080 https://api.telegram.org
```

## First deploy

1. `git clone https://github.com/sublya/bot.git /srv/sublya-bot` on the server.
2. Create `/srv/sublya-bot/.env` from `.env.example`. `TELEGRAM_API_URL` and `DATA_DIR` are set
   by the compose file.
3. If the bot has been polling the public Bot API, log it out once:
   `curl https://api.telegram.org/bot$BOT_TOKEN/logOut`. If it ran against another local
   Bot API server, call `close` on that one instead.
4. `/srv/sublya-bot/deploy/remote.sh`, then add the Actions key as above.

## Files on the server

```
/srv/sublya-bot/
  .env                 # secrets, made by hand
  data/                # SQLite and job files; jobs are removed after 24 hours
```

The bot needs no open ports: it polls Telegram through the local Bot API server. The only way
in is the admin Mini App: `tunnel` also joins the `edge` network, and the shared Caddy proxies
`https://sublya.aimuzov.online/admin` to `sublya-tunnel:8090`. That block lives in
infra-server's `sites/sublya.caddy`. Set `ADMIN_URL` to that address in the server's `.env`.

The site is served next to it, see [sublya/site](https://github.com/sublya/site).
