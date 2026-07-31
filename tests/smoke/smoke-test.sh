#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-3000}"
BASE_URL="http://127.0.0.1:${API_PORT}"

wait_for_url() {
  local name="$1"
  local url="$2"

  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$name is ready: $url"
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for $name: $url" >&2
  return 1
}

wait_for_url "Liveness" "${BASE_URL}/health/live"
wait_for_url "Readiness" "${BASE_URL}/health/ready"
wait_for_url "OpenAPI" "${BASE_URL}/docs/json"

curl -fsS "${BASE_URL}/health" | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (json.service !== 'barber-core-api') process.exit(1); })"
curl -fsS "${BASE_URL}/docs/json" | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (json.openapi !== '3.1.0') process.exit(1); })"

echo "Smoke tests passed."

