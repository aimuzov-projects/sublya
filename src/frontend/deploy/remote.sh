#!/usr/bin/env bash
# The deploy on the server itself: pull main and rebuild the container.
# GitHub Actions call it on every push to main and on a manual run of the workflow.
# For the key from Actions it's the only command allowed (command= in authorized_keys).
set -euo pipefail

# The body sits in a block: bash reads it whole before git pull replaces this file.
{
	cd /srv/sublya-site

	# Two pushes in a row mustn't build at the same time: the second one waits for the first.
	exec 9>/tmp/sublya-site-deploy.lock
	flock 9

	git pull --ff-only --quiet
	git log -1 --oneline
	docker compose -f deploy/docker-compose.yml up -d --build --quiet-pull
	docker image prune -f >/dev/null
	exit
}
