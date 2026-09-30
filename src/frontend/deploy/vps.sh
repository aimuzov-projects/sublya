#!/usr/bin/env bash
# Builds the site and puts it on the skator.ru server, next to the bot. This is the fallback
# for when GitHub Pages can't serve the domain: sublya.aimuzov.online then needs an A record
# for the server instead of the CNAME to sublya.github.io, and the skator Caddyfile needs
# its sublya.aimuzov.online block.
#
# Usage: deploy/vps.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
host="${SUBLYA_HOST:-root@skator.ru}"
remote="${SUBLYA_REMOTE_DIR:-/opt/sublya/site}"

cd "$root"
npm run build

ssh "$host" "mkdir -p $remote/dist"
scp deploy/docker-compose.yml deploy/nginx.conf "$host:$remote/"
# the whole dist/ at once, so the page never refers to files that aren't there yet
tar czf - -C dist . | ssh "$host" "rm -rf $remote/dist.new && mkdir $remote/dist.new && tar xzf - -C $remote/dist.new && rm -rf $remote/dist.old && mv $remote/dist $remote/dist.old && mv $remote/dist.new $remote/dist && rm -rf $remote/dist.old"
ssh "$host" "cd $remote && docker compose up -d --remove-orphans && docker compose restart site"

sleep 2
ssh "$host" "docker exec skator-caddy wget -qO- http://sublya-site/ | grep -c '<title>'" >/dev/null &&
	echo "sublya-site answers inside the server" ||
	echo "sublya-site doesn't answer: check 'docker compose logs' in $remote" >&2
