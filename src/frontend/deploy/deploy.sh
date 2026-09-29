#!/usr/bin/env bash
# Builds the site image locally and ships it to the server over ssh: the server has 1 vCPU
# and doesn't build anything itself.
#
# Usage: deploy/deploy.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
host="${SUBLYA_HOST:-root@skator.ru}"
remote="${SUBLYA_REMOTE_DIR:-/opt/sublya/site}"
image="sublya-site:latest"

# the server is amd64, while the build usually runs on an arm64 Mac
docker build --platform linux/amd64 -t "$image" "$root"
docker save "$image" | gzip | ssh "$host" 'gunzip | docker load'

ssh "$host" "mkdir -p $remote"
scp "$root/deploy/docker-compose.yml" "$host:$remote/"
ssh "$host" "cd $remote && docker compose up -d --remove-orphans && docker image prune -f"

sleep 3
curl -fsS -o /dev/null -w 'https://sublya.aimuzov.online %{http_code}\n' https://sublya.aimuzov.online/ ||
	echo "not answering yet: check DNS and the Caddy block in the skator repository"
