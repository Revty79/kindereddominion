#!/bin/sh
# Run only in an owner-authorized disposable Docker environment.
set -eu
: "${KINDRED_PORT:?Choose an unused loopback host port}"
KINDRED_REVISION="$(git rev-parse HEAD)"
export KINDRED_REVISION
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait
curl --fail "http://127.0.0.1:${KINDRED_PORT}/healthz"
curl --fail "http://127.0.0.1:${KINDRED_PORT}/" >/dev/null
docker compose exec -T game sh -c 'test "$(id -u)" != 0 && test ! -d /usr/share/nginx/html/artwork-source && test ! -d /usr/share/nginx/html/src'
if curl --fail "http://127.0.0.1:${KINDRED_PORT}/assets/cards/nature/art-sprout-ce9b71e2b4447e2c.webp" >/dev/null 2>&1; then
  echo "Unpublished test illustration was served" >&2
  exit 1
fi
docker compose restart game
docker compose up -d --wait
echo "Docker build, health, non-root serving, restart and unpublished-asset checks passed. Run browser acceptance against this port, then stop the isolated stack with docker compose down."
