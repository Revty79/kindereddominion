#!/bin/sh
# Run only in an owner-authorized disposable Docker environment.
set -eu
: "${KINDRED_PORT:?Choose an unused loopback host port}"
: "${KINDRED_BACKEND_ENV_FILE:?Supply an authorized private disposable database environment}"
: "${KINDRED_MIGRATION_ENV_FILE:?Supply its separate private migration environment}"
if [ -n "$(git status --porcelain)" ]; then
  echo "Docker acceptance requires a clean Git checkout." >&2
  exit 1
fi
KINDRED_REVISION="$(git rev-parse HEAD)"
export KINDRED_REVISION
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kindred-dominion-acceptance}"
export COMPOSE_PROJECT_NAME
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait
curl --fail "http://127.0.0.1:${KINDRED_PORT}/healthz"
curl --fail "http://127.0.0.1:${KINDRED_PORT}/readyz"
curl --fail "http://127.0.0.1:${KINDRED_PORT}/" >/dev/null
docker compose exec -T game sh -c 'test "$(id -u)" != 0 && test ! -d /usr/share/nginx/html/artwork-source && test ! -d /usr/share/nginx/html/src'
docker compose exec -T backend node -e 'if (process.getuid() === 0) process.exit(1)'
if curl --fail "http://127.0.0.1:${KINDRED_PORT}/assets/cards/nature/art-sprout-ce9b71e2b4447e2c.webp" >/dev/null 2>&1; then
  echo "Unpublished test illustration was served" >&2
  exit 1
fi
docker compose restart backend game
docker compose up -d --wait
echo "Docker build, health, non-root serving, restart and unpublished-asset checks passed. Run browser acceptance against this port."
echo "Stop this acceptance stack with: docker compose -p ${COMPOSE_PROJECT_NAME} down"
