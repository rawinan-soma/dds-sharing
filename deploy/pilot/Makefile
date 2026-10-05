# The Pilot's deploy (ADR 0022, #101): deploy/pilot/README.md's steps as
# targets, run from the laptop. From the repository root:
#
#   make -C deploy/pilot env HOST=<ssh host>        # once: the server's .env
#   make -C deploy/pilot deploy HOST=<ssh host>     # every time: build … check
#   make -C deploy/pilot rollback HOST=<ssh host> TAG=<sha>
#
# Every target deploys a commit, never the working tree: TAG defaults to the
# tip of the `pilot` branch. HOST has no default, so no command reaches a
# server it did not name. `make -n <target>` prints what it would run.

SHELL := /bin/bash

TAG   ?= $(shell git rev-parse --short pilot)
IMAGE := rawinan/dds-sharing-pilot
ROOT  := $(shell git rev-parse --show-toplevel)

# Expanded here, run on the server, where `~` is the server's home. Every file
# is named by absolute path, so $(DC) can sit on the right of a pipe.
D  := ~/dds-pilot
DC := docker compose --project-name dds-pilot --env-file $(D)/.env --env-file $(D)/release.env -f $(D)/docker-compose.yml -f $(D)/compose.pilot.yml

.DEFAULT_GOAL := help

# Every target but help and build talks to the server, so it must be named on
# the command line (a `make rollback` passes it on to its sub-make).
ifneq ($(filter-out help build,$(or $(MAKECMDGOALS),help)),)
ifneq ($(origin HOST),command line)
$(error HOST is required: make $(MAKECMDGOALS) HOST=<ssh host>)
endif
endif
.PHONY: help env build sync run seed check deploy rollback ps logs board dc down retire

help:
	@echo 'Once:       env [FORCE=1]    seed USERNAME=<you> EMAIL=<you@…>'
	@echo 'Deploy:     deploy           (build, sync, run, check)'
	@echo 'Roll back:  rollback TAG=<sha>'
	@echo 'Steps:      build  sync  run  check'
	@echo 'Operate:    ps  logs  board  dc ARGS="<compose args>"'
	@echo 'Stop:       down (the kill switch)    retire (deletes the Pilot)'
	@echo 'Every target but build needs HOST=<ssh host>.'
	@echo 'Now:        TAG=$(TAG)'

# Step 2. write-env.sh runs on the server without being copied there. It
# refuses to replace an existing .env; FORCE=1 replaces it (new secrets).
env:
	ssh -t $(HOST) "bash -c $$(printf '%q' "$$(cat $(ROOT)/deploy/pilot/write-env.sh)") write-env.sh $(if $(FORCE),--force)"

# Step 1. The committed tree at TAG, for the server's architecture; untracked
# files cannot reach the image, and .dockerignore keeps any .env out.
build:
	@[ "$$(git -C $(ROOT) branch --show-current)" != pilot ] || git -C $(ROOT) diff --quiet HEAD || echo 'note: uncommitted changes are not deployed'
	git -C $(ROOT) archive --format=tar $(TAG) | \
	  docker buildx build --platform linux/amd64 \
	    -t $(IMAGE):$(TAG) -t $(IMAGE):latest --push -

# Step 3. The compose files at TAG, so a rollback gets its own compose too.
sync:
	@ssh $(HOST) 'test -f $(D)/.env' || { echo 'No .env on $(HOST): run `make env` first.' >&2; exit 1; }
	@docker buildx imagetools inspect $(IMAGE):$(TAG) >/dev/null || { echo '$(IMAGE):$(TAG) is not on Docker Hub: run `make build TAG=$(TAG)`.' >&2; exit 1; }
	git -C $(ROOT) archive --format=tar $(TAG) docker-compose.yml compose.pilot.yml docker/postgres-init | \
	  ssh $(HOST) 'mkdir -p $(D) && tar -x -C $(D)'
	ssh $(HOST) "echo PILOT_TAG=$(TAG) > $(D)/release.env && $(DC) config --quiet && echo config ok"

# Step 4. Safe to repeat: re-applies the app role's password (replacing
# docker/postgres-init's dev one) and restarts only what changed. `ssh -t` gives
# Compose a terminal, so it shows its progress display rather than a line per
# layer.
run: sync
	ssh -t $(HOST) "$(DC) pull app cloudflared && $(DC) up -d --wait postgres"
	ssh $(HOST) "set -a && . $(D)/.env && echo \"ALTER ROLE dds_app_login PASSWORD :'pw';\" | $(DC) exec -T postgres psql -q -U postgres -d dds_sharing -v ON_ERROR_STOP=1 -v pw=\"\$$APP_DB_PASSWORD\""
	ssh -t $(HOST) "$(DC) up -d --remove-orphans && $(DC) ps"

# The Pilot's one Reviewer (§17.5); interactive.
seed:
	@[ -n "$(USERNAME)" ] && [ -n "$(EMAIL)" ] || { echo 'Usage: make seed USERNAME=<you> EMAIL=<you@…>' >&2; exit 1; }
	ssh -t $(HOST) "$(DC) exec app node dist/cli/reviewer.js seed --username $(USERNAME) --email $(EMAIL)"

# #101's checks that need no person. Runs them all, then fails if any failed.
check:
	@fail=0; \
	url=$$(ssh $(HOST) "grep '^FRONTEND_URL=' $(D)/.env | cut -d= -f2-"); \
	if body=$$(curl -fsS "$$url/api/health") && grep -q '"insecureFlags":\[\]' <<<"$$body"; \
	  then echo "ok    $$url/api/health through the tunnel, no insecure flags"; \
	  else echo "FAIL  $$url/api/health: $$body"; fail=1; fi; \
	addr=$$(ssh -G $(HOST) | awk '/^hostname /{print $$2}'); \
	open=; for p in 3000 3100 5432 6379 9000 9001; do nc -z -w 3 $$addr $$p 2>/dev/null && open="$$open $$p"; done; \
	if [ -z "$$open" ]; \
	  then echo "ok    app, Bull Board, Postgres, Redis, MinIO closed from the tailnet"; \
	  else echo "FAIL  open from the tailnet:$$open"; fail=1; fi; \
	published=$$(ssh $(HOST) "$(DC) ps --format '{{.Ports}}'" | grep -o '[^ ,]*->' | grep -v '^127\.0\.0\.1:'); \
	if [ -z "$$published" ]; \
	  then echo "ok    nothing published beyond loopback"; \
	  else echo "FAIL  published beyond loopback: $$published"; fail=1; fi; \
	if [ "$$(ssh $(HOST) 'timedatectl show -p NTPSynchronized --value')" = yes ]; \
	  then echo "ok    NTP synchronized"; \
	  else echo "FAIL  NTP not synchronized"; fail=1; fi; \
	echo "running: $$(ssh $(HOST) 'cat $(D)/release.env')"; \
	exit $$fail

deploy: build run
	@sleep 5
	$(MAKE) check

# An older commit whose image is already on Docker Hub.
rollback:
	@[ "$(origin TAG)" = "command line" ] || { echo 'Usage: make rollback TAG=<sha>' >&2; exit 1; }
	$(MAKE) run check TAG=$(TAG)

ps:
	ssh $(HOST) "$(DC) ps"

# cloudflared logs to Docker; the app to hour files under /logs (spec §14.5).
logs:
	ssh $(HOST) "$(DC) logs --tail 50 cloudflared"
	ssh $(HOST) "$(DC) exec app sh -c 'tail -n 100 \$$(ls -t /logs/* | head -1)'"

# Bull Board, loopback only, at http://localhost:3100 until you exit.
board:
	ssh -N -L 3100:127.0.0.1:3100 $(HOST)

dc:
	ssh -t $(HOST) "$(DC) $(ARGS)"

# The kill switch: the tunnel stops with the rest.
down:
	ssh $(HOST) "$(DC) down"

# Deletes every trace of what the Pilot released; it has no backup (ADR 0022).
retire:
	@read -rp 'Type "retire the pilot" to delete its volumes and ~/dds-pilot: ' a; [ "$$a" = 'retire the pilot' ] || { echo 'Not retired.'; exit 1; }
	ssh $(HOST) "$(DC) down --volumes && rm -rf $(D)"
	@echo 'Still by hand: delete the tunnel in Cloudflare and $(IMAGE) on Docker Hub.'
