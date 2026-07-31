#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-3000}"
BASE_URL="http://127.0.0.1:${API_PORT}"
SMOKE_JWKS_PORT="${SMOKE_JWKS_PORT:-18080}"
SMOKE_JWKS_BASE_URL="${SMOKE_JWKS_BASE_URL:-http://127.0.0.1:${SMOKE_JWKS_PORT}}"
SMOKE_OIDC_ISSUER_URL="${SMOKE_OIDC_ISSUER_URL:-http://host.docker.internal:${SMOKE_JWKS_PORT}/realms/barber}"
SMOKE_OIDC_JWKS_URL="${SMOKE_OIDC_JWKS_URL:-${SMOKE_OIDC_ISSUER_URL}/protocol/openid-connect/certs}"
SMOKE_OIDC_AUDIENCE="${SMOKE_OIDC_AUDIENCE:-barber-core-api}"
SMOKE_JWKS_STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/barber-core-api-smoke.XXXXXX")"
SMOKE_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/barber-core-api-smoke-env.XXXXXX")"
SMOKE_COMPOSE_CONFIG_FILE="$(mktemp "${TMPDIR:-/tmp}/barber-core-api-smoke-compose.XXXXXX")"
SMOKE_RUNTIME_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/barber-core-api-smoke-runtime.XXXXXX")"

cleanup() {
  if [[ -n "${SMOKE_JWKS_PID:-}" ]]; then
    kill "${SMOKE_JWKS_PID}" >/dev/null 2>&1 || true
    wait "${SMOKE_JWKS_PID}" >/dev/null 2>&1 || true
  fi

  rm -rf "${SMOKE_JWKS_STATE_DIR}"
  rm -f \
    "${SMOKE_ENV_FILE}" \
    "${SMOKE_COMPOSE_CONFIG_FILE}" \
    "${SMOKE_RUNTIME_ENV_FILE}" \
    /tmp/barber-core-api-auth-me.json \
    /tmp/barber-core-api-authenticated-probe.json \
    /tmp/barber-core-api-jwks-health.log \
    /tmp/barber-core-api-jwks-fetch.log \
    /tmp/barber-core-api-professional.json \
    /tmp/barber-core-api-service.json \
    /tmp/barber-core-api-list.json \
    /tmp/barber-core-api-forbidden.json
}

trap cleanup EXIT INT TERM

cat >"${SMOKE_ENV_FILE}" <<EOF
OIDC_ISSUER_URL=${SMOKE_OIDC_ISSUER_URL}
OIDC_JWKS_URL=${SMOKE_OIDC_JWKS_URL}
OIDC_AUDIENCE=${SMOKE_OIDC_AUDIENCE}
EOF

node scripts/smoke-jwks-fixture.mjs serve "${SMOKE_JWKS_STATE_DIR}" "${SMOKE_JWKS_PORT}" "${SMOKE_OIDC_ISSUER_URL}" &
SMOKE_JWKS_PID="$!"

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

log_smoke_oidc_configuration() {
  docker compose --env-file "${SMOKE_ENV_FILE}" config >"${SMOKE_COMPOSE_CONFIG_FILE}"
  echo "Smoke Compose OIDC configuration:"
  node -e "const fs = require('node:fs'); const lines = fs.readFileSync(process.argv[1], 'utf8').split('\n').filter((line) => line.includes('OIDC_')); process.stdout.write(lines.join('\n') + '\n');" "${SMOKE_COMPOSE_CONFIG_FILE}"
}

recreate_api_with_smoke_oidc() {
  docker compose --env-file "${SMOKE_ENV_FILE}" up -d --no-deps --force-recreate api >/dev/null
}

capture_api_runtime_oidc_configuration() {
  docker compose exec -T api node -e "console.log(JSON.stringify({ issuer: process.env.OIDC_ISSUER_URL, jwks: process.env.OIDC_JWKS_URL, audience: process.env.OIDC_AUDIENCE }))" >"${SMOKE_RUNTIME_ENV_FILE}"
  cat "${SMOKE_RUNTIME_ENV_FILE}"
}

assert_runtime_oidc_configuration() {
  node -e "
    const fs = require('node:fs');
    const runtime = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const expected = {
      issuer: process.argv[2],
      jwks: process.argv[3],
      audience: process.argv[4],
    };
    const mismatches = [];
    if (runtime.issuer !== expected.issuer) mismatches.push(['API issuer', runtime.issuer, expected.issuer]);
    if (runtime.jwks !== expected.jwks) mismatches.push(['API JWKS URL', runtime.jwks, expected.jwks]);
    if (runtime.audience !== expected.audience) mismatches.push(['API audience', runtime.audience, expected.audience]);
    if (mismatches.length > 0) {
      console.error('Smoke OIDC configuration mismatch:');
      for (const [label, actual, wanted] of mismatches) {
        console.error(label + ': ' + String(actual));
        console.error('Expected ' + label + ': ' + String(wanted));
      }
      process.exit(1);
    }
  " "${SMOKE_RUNTIME_ENV_FILE}" "${SMOKE_OIDC_ISSUER_URL}" "${SMOKE_OIDC_JWKS_URL}" "${SMOKE_OIDC_AUDIENCE}"
}

wait_for_internal_jwks_reachability() {
  local script="$1"
  local description="$2"
  local output_file="$3"

  for _ in $(seq 1 15); do
    if docker compose exec -T api node -e "${script}" >"${output_file}" 2>&1; then
      echo "API internal ${description} is ready"
      return 0
    fi

    sleep 1
  done

  echo "Timed out waiting for API internal ${description}" >&2
  cat "${output_file}" >&2 || true
  docker compose logs --no-color --tail=80 api >&2 || true
  return 1
}

wait_for_authenticated_request() {
  local name="$1"
  local token="$2"
  local output_file="$3"
  local expected_subject="$4"
  local expected_role="$5"

  for _ in $(seq 1 5); do
    local status
    status="$(
      curl -sS -o "${output_file}" -w '%{http_code}' \
        "${BASE_URL}/api/v1/auth/me" \
        -H "Authorization: Bearer ${token}"
    )"

    if [[ "${status}" == "200" ]]; then
      node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (json.subject !== process.argv[2]) process.exit(1); if (!Array.isArray(json.roles) || !json.roles.includes(process.argv[3])) process.exit(1);" "${output_file}" "${expected_subject}" "${expected_role}"
      echo "${name} authenticated request is ready: ${BASE_URL}/api/v1/auth/me"
      return 0
    fi

    if [[ "${status}" == "503" ]]; then
      echo "Authenticated probe returned transient 503." >&2
      echo "API issuer: ${SMOKE_OIDC_ISSUER_URL}" >&2
      echo "Token issuer: ${SMOKE_OIDC_ISSUER_URL}" >&2
      echo "API JWKS URL: ${SMOKE_OIDC_JWKS_URL}" >&2
      echo "Expected JWKS URL: ${SMOKE_OIDC_JWKS_URL}" >&2
      echo "API audience: ${SMOKE_OIDC_AUDIENCE}" >&2
      cat "${output_file}" >&2 || true
      docker compose logs --no-color --tail=40 api >&2 || true
      sleep 1
      continue
    fi

    echo "Expected ${name} authenticated probe to return 200 or transient 503, got ${status}" >&2
    cat "${output_file}" >&2 || true
    return 1
  done

  echo "Timed out waiting for ${name} authenticated request readiness" >&2
  echo "API issuer: ${SMOKE_OIDC_ISSUER_URL}" >&2
  echo "Token issuer: ${SMOKE_OIDC_ISSUER_URL}" >&2
  echo "API JWKS URL: ${SMOKE_OIDC_JWKS_URL}" >&2
  echo "Expected JWKS URL: ${SMOKE_OIDC_JWKS_URL}" >&2
  cat "${output_file}" >&2 || true
  docker compose logs --no-color --tail=60 api >&2 || true
  return 1
}

wait_for_url "JWKS fixture" "${SMOKE_JWKS_BASE_URL}/healthz"
log_smoke_oidc_configuration
recreate_api_with_smoke_oidc
wait_for_url "Liveness" "${BASE_URL}/health/live"
wait_for_url "Readiness" "${BASE_URL}/health/ready"
wait_for_url "OpenAPI" "${BASE_URL}/docs/json"
capture_api_runtime_oidc_configuration
assert_runtime_oidc_configuration

wait_for_internal_jwks_reachability \
  "fetch('http://host.docker.internal:${SMOKE_JWKS_PORT}/healthz').then((response)=>{if(!response.ok) process.exit(1)}).catch((error)=>{console.error(error); process.exit(1)})" \
  "JWKS health" \
  /tmp/barber-core-api-jwks-health.log
wait_for_internal_jwks_reachability \
  "fetch(process.env.OIDC_JWKS_URL).then(async (response)=>{if(!response.ok) process.exit(1); const body = await response.json(); if (!Array.isArray(body.keys) || body.keys.length === 0) process.exit(1)}).catch((error)=>{console.error(error); process.exit(1)})" \
  "JWKS fetch" \
  /tmp/barber-core-api-jwks-fetch.log

curl -fsS "${BASE_URL}/health" | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (json.service !== 'barber-core-api') process.exit(1); })"
curl -fsS "${BASE_URL}/docs/json" | node -e "process.stdin.once('data', (buf) => { const json = JSON.parse(buf.toString()); if (json.openapi !== '3.1.0') process.exit(1); if (json.components?.securitySchemes?.bearerAuth?.scheme !== 'bearer') process.exit(1); })"

auth_status="$(curl -sS -o /tmp/barber-core-api-auth-me.json -w '%{http_code}' "${BASE_URL}/api/v1/auth/me")"
if [[ "${auth_status}" != "401" ]]; then
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

wait_for_authenticated_request \
  "Admin" \
  "${admin_token}" \
  /tmp/barber-core-api-authenticated-probe.json \
  "smoke-admin" \
  "admin"

professional_status="$(
  curl -sS -o /tmp/barber-core-api-professional.json -w '%{http_code}' \
    -X POST "${BASE_URL}/api/v1/professionals" \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'Content-Type: application/json' \
    --data '{"name":"Smoke Barber","bio":"Fluxo vertical minimo"}'
)"
if [[ "${professional_status}" != "201" ]]; then
  echo "Expected authenticated professional creation to return 201, got ${professional_status}" >&2
  cat /tmp/barber-core-api-professional.json >&2 || true
  exit 1
fi

service_status="$(
  curl -sS -o /tmp/barber-core-api-service.json -w '%{http_code}' \
    -X POST "${BASE_URL}/api/v1/services" \
    -H "Authorization: Bearer ${admin_token}" \
    -H 'Content-Type: application/json' \
    --data '{"name":"Smoke Cut","durationMinutes":30,"priceCents":4500}'
)"
if [[ "${service_status}" != "201" ]]; then
  echo "Expected authenticated service creation to return 201, got ${service_status}" >&2
  cat /tmp/barber-core-api-service.json >&2 || true
  exit 1
fi

professional_id="$(node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-professional.json', 'utf8')); if (!json.id) process.exit(1); process.stdout.write(json.id);")"
service_id="$(node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-service.json', 'utf8')); if (!json.id) process.exit(1); process.stdout.write(json.id);")"

capability_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X PUT "${BASE_URL}/api/v1/professionals/${professional_id}/services/${service_id}" \
    -H "Authorization: Bearer ${admin_token}"
)"
if [[ "${capability_status}" != "204" ]]; then
  echo "Expected capability association to return 204, got ${capability_status}" >&2
  exit 1
fi

list_status="$(
  curl -sS -o /tmp/barber-core-api-list.json -w '%{http_code}' \
    "${BASE_URL}/api/v1/professionals/${professional_id}/services?page=1&pageSize=20" \
    -H "Authorization: Bearer ${barber_token}"
)"
if [[ "${list_status}" != "200" ]]; then
  echo "Expected nested service list to return 200, got ${list_status}" >&2
  cat /tmp/barber-core-api-list.json >&2 || true
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
if [[ "${forbidden_status}" != "403" ]]; then
  echo "Expected barber write denial to return 403, got ${forbidden_status}" >&2
  cat /tmp/barber-core-api-forbidden.json >&2 || true
  exit 1
fi
node -e "const fs = require('node:fs'); const json = JSON.parse(fs.readFileSync('/tmp/barber-core-api-forbidden.json', 'utf8')); if (json.code !== 'INSUFFICIENT_PERMISSIONS') process.exit(1);"

echo "Smoke tests passed."
