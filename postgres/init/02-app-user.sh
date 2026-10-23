#!/bin/bash
set -euo pipefail
if [[ ! "${APP_DB_PASSWORD:-}" =~ ^[a-zA-Z0-9_-]{20,}$ ]]; then
  echo "APP_DB_PASSWORD phai >= 20 ky tu, chi chu so va _ -" >&2
  exit 1
fi
if [[ ! "${MONITOR_DB_PASSWORD:-}" =~ ^[a-zA-Z0-9_-]{20,}$ ]]; then
  echo "MONITOR_DB_PASSWORD phai >= 20 ky tu, chi chu so va _ -" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE library_app WITH LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT CONNECT ON DATABASE library_db TO library_app;
GRANT USAGE ON SCHEMA public TO library_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO library_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO library_app;
CREATE ROLE library_monitor WITH LOGIN PASSWORD '${MONITOR_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT pg_monitor TO library_monitor;
GRANT CONNECT ON DATABASE library_db TO library_monitor;
SQL
