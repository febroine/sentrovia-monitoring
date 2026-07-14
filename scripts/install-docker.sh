#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
PREPARE_ONLY=false

if [[ "${1:-}" == "--prepare-only" ]]; then
  PREPARE_ONLY=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--prepare-only]" >&2
  exit 1
fi

random_secret() {
  od -An -N48 -tx1 /dev/urandom | tr -d ' \n'
}

read_env_value() {
  local name="$1"
  sed -n "s/^[[:space:]]*${name}[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n 1 | tr -d '\r' | sed 's/^"//;s/"$//'
}

assert_safe_secret() {
  local name="$1"
  local value
  value="$(read_env_value "$name")"
  local normalized
  normalized="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"

  if [[ ${#value} -lt 32 || "$normalized" == *change-me* || "$normalized" == *example* || "$normalized" == *placeholder* ]]; then
    echo "$name in .env is missing, too short, or a placeholder." >&2
    echo "Existing secrets are never rotated automatically." >&2
    exit 1
  fi
}

initialize_environment() {
  if [[ -f "$ENV_FILE" ]]; then
    assert_safe_secret "AUTH_SECRET"
    assert_safe_secret "APP_ENCRYPTION_SECRET"
    assert_safe_secret "POSTGRES_PASSWORD"
    [[ -n "$(read_env_value APP_URL)" ]] || { echo "APP_URL is missing from .env." >&2; exit 1; }
    echo "Using the existing .env file. Secrets were not changed."
    return
  fi

  umask 077
  cat > "$ENV_FILE" <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$(random_secret)
POSTGRES_DB=uptimemonitoring

APP_URL=http://localhost:3000
AUTH_SECRET=$(random_secret)
APP_ENCRYPTION_SECRET=$(random_secret)

WORKER_CONCURRENCY=20
WORKER_POLL_INTERVAL_MS=10000
MONITOR_ALLOW_PRIVATE_TARGETS=true
EOF
  echo "Created .env with cryptographically strong secrets."
}

command -v docker >/dev/null 2>&1 || { echo "Docker was not found in PATH." >&2; exit 1; }
docker compose version >/dev/null

cd "$PROJECT_ROOT"
echo "Sentrovia Docker installer"
initialize_environment
if [[ "$PREPARE_ONLY" == true ]]; then
  echo "Environment preparation completed. Docker startup was skipped."
  exit 0
fi
docker compose up -d --build
docker compose ps
echo "Sentrovia is starting at http://localhost:3000"
