#!/usr/bin/env bash
# Deploy on the server itself: pull main and rebuild the containers.
# GitHub Actions runs it on every push to main and on a manual workflow run.
# It's the only command allowed for the Actions key (command= in authorized_keys).
set -euo pipefail

# The body is a block, so bash reads all of it before git pull replaces this file.
{
	cd /srv/sublya

	# One deploy at a time for all the sites: parallel builds choke the small server,
	# so a deploy of any site waits here for the previous one.
	exec 9>/tmp/sites-deploy.lock
	flock 9

	# .env is made once by hand from .env.example and never comes from git
	if [[ ! -f .env ]]; then
		echo "no /srv/sublya/.env: fill one in from .env.example" >&2
		exit 1
	fi

	git pull --ff-only --quiet
	git log -1 --oneline
	mkdir -p data
	docker compose -f deploy/docker-compose.yml up -d --build --quiet-pull --remove-orphans
	docker image prune -f >/dev/null
	exit
}
