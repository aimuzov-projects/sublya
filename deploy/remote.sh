#!/usr/bin/env bash
# The deploy on the server itself: pull main and rebuild the containers.
# GitHub Actions call it on every push to main and on a manual run of the workflow.
# For the key from Actions it's the only command allowed (command= in authorized_keys).
set -euo pipefail

# The body sits in a block: bash reads it whole before git pull replaces this file.
{
	cd /srv/sublya

	# Two pushes in a row mustn't build at the same time: the second one waits for the first.
	exec 9>/tmp/sublya-deploy.lock
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
