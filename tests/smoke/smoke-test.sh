#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-3000}"
BASE_URL="http://127.0.0.1:${API_PORT}"
SMOKE_JWKS_PORT="${SMOKE_JWKS_PORT:-18080}"
SMOKE_JWKS_BASE_URL="${SMOKE_JWKS_BASE_URL:-http://127.0.0.1:${SMOKE_JWKS_PORT}}"

cleanup() {
  rm -f /tmp/barber-core-api-auth-me.json /tmp/barber-core-api-professional.json /tmp/barber-core-api-service.json /tmp/barber-core-api-list.json /tmp/barber-core-api-forbidden.json
}

trap cleanup EXIT

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

wait_for_url "JWKS fixture" "${SMOKE_JWKS_BASE_URL}/healthz"
wait_for_url "Liveness" "${BASE_URL}/health/live"
wait_for_url "Readiness" "${BASE_URL}/health/ready"
wait_for_url "OpenAPI" "${BASE_URL}/docs/json"

curl -fsS "${BASE_URL}/health" | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (json.service !== 'barber-core-api') process.exit(1); })"
curl -fsS "${BASE_URL}/docs/json" | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (json.openapi !== '3.1.0') process.exit(1); })"
curl -fsS "${BASE_URL}/docs/json" | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (json.components?.securitySchemes?.bearerAuth?.scheme !== 'bearer') process.exit(1); })"

auth_status="$(curl -sS -o /tmp/barber-core-api-auth-me.json -w '%{http_code}' "${BASE_URL}/api/v1/auth/me")"
if [[ "$auth_status" != "401" ]]; then
  echo "Expected /api/v1/auth/me without credentials to return 401, got ${auth_status}" >&2
  exit 1
fi
node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-auth-me.json', 'utf8')); if (json.code !== 'AUTHENTICATION_REQUIRED') process.exit(1);"

admin_token="$(
  curl -fsS "${SMOKE_JWKS_BASE_URL}/token?roles=admin&subject=smoke-admin" \
    | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (!json.accessToken) process.exit(1); process.stdout.write(json.accessToken); })"
)"
barber_token="$(
  curl -fsS "${SMOKE_JWKS_BASE_URL}/token?roles=barber&subject=smoke-barber" \
    | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (!json.accessToken) process.exit(1); process.stdout.write(json.accessToken); })"
)"

professional_status="$(
  curl -sS -o /tmp/barber-core-api-professional.json -w '%{http_code}' \
    -X POST "${BASE_URL}/api/v1/professionals" \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'Content-Type: application/json' \
    --data '{"name":"Smoke Barber","bio":"Fluxo vertical minimo"}'
)"
if [[ "$professional_status" != "201" ]]; then
  echo "Expected authenticated professional creation to return 201, got ${professional_status}" >&2
  exit 1
fi

service_status="$(
  curl -sS -o /tmp/barber-core-api-service.json -w '%{http_code}' \
    -X POST "${BASE_URL}/api/v1/services" \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'Content-Type: application/json' \
    --data '{"name":"Smoke Cut","durationMinutes":30,"priceCents":4500}'
)"
if [[ "$service_status" != "201" ]]; then
  echo "Expected authenticated service creation to return 201, got ${service_status}" >&2
  exit 1
fi

professional_id="$(node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-professional.json', 'utf8')); if (!json.id) process.exit(1); process.stdout.write(json.id);")"
service_id="$(node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-service.json', 'utf8')); if (!json.id) process.exit(1); process.stdout.write(json.id);")"

capability_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X PUT "${BASE_URL}/api/v1/professionals/${professional_id}/services/${service_id}" \
    -H "Authorization: Bearer ${admin_token}"
)"
if [[ "$capability_status" != "204" ]]; then
  echo "Expected capability association to return 204, got ${capability_status}" >&2
  exit 1
fi

list_status="$(
  curl -sS -o /tmp/barber-core-api-list.json -w '%{http_code}' \
    "${BASE_URL}/api/v1/professionals/${professional_id}/services?page=1&pageSize=20" \
    -H "Authorization: Bearer ${barber_token}"
)"
if [[ "$list_status" != "200" ]]; then
  echo "Expected nested service list to return 200, got ${list_status}" >&2
  exit 1
fi
node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-list.json', 'utf8')); if (json.totalItems !== 1) process.exit(1); if (json.items?.[0]?.id !== process.argv[1]) process.exit(1);" "${service_id}"

forbidden_status="$(
  curl -sS -o /tmp/barber-core-api-forbidden.json -w '%{http_code}' \
    -X POST "${BASE_URL}/api/v1/services" \
    -H "Authorization: Bearer ${barber_token}" \
    -H 'Content-Type: application/json' \
    --data '{"name":"Forbidden Write","durationMinutes":30,"priceCents":4500}'
)"
if [[ "$forbidden_status" != "403" ]]; then
  echo "Expected barber write denial to return 403, got ${forbidden_status}" >&2
  exit 1
fi
node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-forbidden.json', 'utf8')); if (json.code !== 'INSUFFICIENT_PERMISSIONS') process.exit(1);"

echo "Smoke tests passed."
