#!/bin/sh
# Runs once, the first time the Postgres data volume is initialised.
#
# Each service gets its own database AND its own login role that owns only
# that database. ms-learning therefore cannot read the users table even if it
# were compromised — the same isolation you would get from separate database
# servers, without running several.
#
# Passwords come from the environment (see .env.example); nothing is hardcoded.
set -eu

: "${IDENTITY_DB_PASSWORD:?IDENTITY_DB_PASSWORD must be set}"
: "${LEARNING_DB_PASSWORD:?LEARNING_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v identity_pw="$IDENTITY_DB_PASSWORD" -v learning_pw="$LEARNING_DB_PASSWORD" <<-'SQL'
  CREATE ROLE identity LOGIN PASSWORD :'identity_pw';
  CREATE DATABASE identity OWNER identity;
  REVOKE ALL ON DATABASE identity FROM PUBLIC;

  CREATE ROLE learning LOGIN PASSWORD :'learning_pw';
  CREATE DATABASE learning OWNER learning;
  REVOKE ALL ON DATABASE learning FROM PUBLIC;
SQL

echo "[init] created databases: identity, learning"
