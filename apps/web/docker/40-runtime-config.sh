#!/bin/sh
# Writes the runtime config the SPA reads before it boots (adapted from the
# boilerplate's docker/40-runtime-config.sh).
#
# Written to /tmp, not the web root, so the container can run with a
# read-only root filesystem; nginx serves /config.js from there.
# Values are JSON-escaped: an unescaped quote would break the app on load.
set -eu

CONFIG_PATH="${CONFIG_PATH:-/tmp/config.js}"

escape_json() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

ENTRIES=""
add_entry() {
    ENTRIES="${ENTRIES:+${ENTRIES}, }\"$1\": \"$(escape_json "$2")\""
    echo "[runtime-config] $1 = $2"
}

[ -n "${APP_NAME:-}" ] && add_entry APP_NAME "${APP_NAME}"
[ -n "${LABS_ENABLED:-}" ] && add_entry LABS_ENABLED "${LABS_ENABLED}"

printf 'window.__APP_CONFIG__ = { %s };\n' "${ENTRIES}" > "${CONFIG_PATH}"
