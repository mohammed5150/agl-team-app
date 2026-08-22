#!/bin/bash
set -euo pipefail

# Prepares Claude Code on the web sessions: project deps for eslint/vitest,
# plus Deno so `deno check supabase/functions/**` works. Local sessions are
# left alone.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install

# deno.land is blocked by the egress policy here; the npm distribution ships
# the same binary as a platform package, so install it from the registry.
if ! command -v deno >/dev/null 2>&1; then
  npm install -g deno
fi

# Deno fetches npm:/jsr: modules itself and must trust the session proxy's CA.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -f /root/.ccr/ca-bundle.crt ]; then
  echo 'export DENO_CERT=/root/.ccr/ca-bundle.crt' >> "$CLAUDE_ENV_FILE"
fi

deno --version
