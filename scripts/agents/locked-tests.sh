#!/usr/bin/env bash
# The only way a ticket worktree runs tests that share state.
#
#   scripts/agents/locked-tests.sh                              the whole suite, once
#   scripts/agents/locked-tests.sh --times 3                    the whole suite, three times, no reset between
#   scripts/agents/locked-tests.sh -- tests/integration/pairing-over-http.test.ts
#   scripts/agents/locked-tests.sh --no-server -- tests/integration/joining-a-group.test.ts
#   scripts/agents/locked-tests.sh --reset                      force a database reset first
#
# Run it from the checkout whose code is under test. It can wait a long time for
# the lock and then run for several minutes: start it in the background and read
# its log, do not sit inside a ten-minute shell timeout.
#
# What is shared, and therefore locked: one local Supabase stack on fixed ports,
# whose schema is whatever the last `supabase db reset` applied. Two worktrees with
# different migrations cannot both be right about it.
#
# What is held under ONE lock, start to finish:
#   reset the database if this checkout's migrations are not the ones applied
#   -> build THIS checkout -> serve it on THIS checkout's port
#   -> run the tests against that port -> stop the server
# Locking only the test run would let another worktree reset the database or
# replace the server between the build and the first assertion.
#
# What needs no lock: tests/domain and tests/app. They touch no database and no
# server, and any number of worktrees may run them at once:
#   npx vitest run tests/domain tests/app
. "$(dirname "$0")/lib.sh"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# --- the lock -------------------------------------------------------------------

LOCK_FILE="$LOCKS_DIR/shared-env.lock"
HOLDER_FILE="$LOCKS_DIR/shared-env.holder"

if [ -z "${AGENT_LOCK_HELD:-}" ]; then
  if [ -f "$HOLDER_FILE" ]; then
    note "waiting for the shared test environment. Held by:"
    sed 's/^/  /' "$HOLDER_FILE" >&2
  fi
  # lockf holds the lock for exactly as long as the command lives, so a crashed or
  # killed run releases it without anybody cleaning up.
  exec lockf -k -t "${AGENT_LOCK_WAIT_SECONDS:-7200}" "$LOCK_FILE" \
    env AGENT_LOCK_HELD=1 bash "$0" ${@+"$@"}
fi

# --- arguments ------------------------------------------------------------------

TIMES=1
SERVE=1
FORCE_RESET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --times) TIMES="$2"; shift 2 ;;
    --no-server) SERVE=0; shift ;;
    --reset) FORCE_RESET=1; shift ;;
    --) shift; break ;;
    *) break ;;
  esac
done

PORT="$(cat "$ROOT/.agent/port" 2>/dev/null || echo 3100)"
WHO="$(cat "$ROOT/.agent/ticket" 2>/dev/null || echo "$ROOT ($(git rev-parse --abbrev-ref HEAD))")"
LOG_DIR="$ROOT/.agent"
[ -d "$LOG_DIR" ] || LOG_DIR="$(mktemp -d)"

printf 'who:     %s\npid:     %s\nsince:   %s\ncheckout: %s\n' "$WHO" "$$" "$(date)" "$ROOT" >"$HOLDER_FILE"

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    # The listener renames itself to next-server, and may outlive the process that
    # started it. The port is this checkout's alone, so whatever listens on it is ours.
    for pid in $(lsof -tnP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do kill "$pid" 2>/dev/null || true; done
  fi
  rm -f "$HOLDER_FILE"
}
trap cleanup EXIT

# --- the database ---------------------------------------------------------------

# The schema the database holds is recorded as a hash of the migrations that built
# it. A reset happens only when this checkout's migrations differ, because the
# suite is *most* likely to pass straight after a reset and a change is only green
# once it survives the rows earlier runs left behind.
SCHEMA_FILE="$STATE_DIR/db-schema.sha"
schema_hash() { (cd "$ROOT/supabase" && find migrations config.toml -type f | LC_ALL=C sort | xargs shasum | shasum | cut -d' ' -f1); }
WANT="$(schema_hash)"
HAVE="$(cat "$SCHEMA_FILE" 2>/dev/null || true)"

# The first run on a machine has no record. Before wiping a database somebody may
# be using, ask it: if the versions it has applied are exactly this checkout's
# migration files, it is already right, and that is recorded without a reset.
applied_matches_files() {
  node -e "
    const fs = require('fs')
    const url = (fs.readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.*)\$/m) || [])[1]
    const { Client } = require('pg')
    const client = new Client({ connectionString: url.trim() })
    client.connect()
      .then(() => client.query('select version from supabase_migrations.schema_migrations order by 1'))
      .then((result) => {
        const applied = JSON.stringify(result.rows.map((row) => row.version))
        const files = JSON.stringify(fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).map((f) => f.split('_')[0]).sort())
        return client.end().then(() => process.exit(applied === files ? 0 : 1))
      })
      .catch(() => process.exit(2))
  " 2>/dev/null
}
if [ -z "$HAVE" ] && [ "$FORCE_RESET" = 0 ] && applied_matches_files; then
  note "database: no record yet, and it already holds exactly this checkout's migrations; recording that"
  printf '%s\n' "$WANT" >"$SCHEMA_FILE"
  HAVE="$WANT"
fi

if [ "$FORCE_RESET" = 1 ] || [ "$WANT" != "$HAVE" ]; then
  note "database: migrations differ from what is applied; resetting from $ROOT"
  rm -f "$SCHEMA_FILE"
  if npx supabase db reset >"$LOG_DIR/db-reset.log" 2>&1 &&
    grep -Eq 'Reset local database|Finished supabase db reset' "$LOG_DIR/db-reset.log"; then
    printf '%s\n' "$WANT" >"$SCHEMA_FILE"
  else
    tail -20 "$LOG_DIR/db-reset.log" >&2
    die "the reset did not finish, so no migration can be assumed applied. This is usually a container that was not ready: 'npx supabase stop --no-backup' then 'npx supabase start', and run this again. It is not a test failure."
  fi
else
  note "database: already holds this checkout's migrations; not resetting"
fi

# --- this checkout's server -----------------------------------------------------

export APP_URL="http://127.0.0.1:$PORT"

if [ "$SERVE" = 1 ]; then
  squatter="$(lsof -tnP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  [ -z "$squatter" ] || die "port $PORT already has a listener (pid $squatter). It is this checkout's port, so it is a server left from an earlier run: stop it, then run this again."

  note "build: $ROOT"
  npm run build >"$LOG_DIR/build.log" 2>&1 || { tail -30 "$LOG_DIR/build.log" >&2; die "the build failed; see $LOG_DIR/build.log"; }

  note "serve: $APP_URL"
  node node_modules/next/dist/bin/next start -p "$PORT" >"$LOG_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  ready=0
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$APP_URL/login"; then ready=1; break; fi
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 1
  done
  [ "$ready" = 1 ] || { tail -20 "$LOG_DIR/server.log" >&2; die "the server did not answer on $APP_URL"; }
  # With a server up, a skipped over-HTTP suite is a failure, not a pass.
  export CI=1
else
  note "no server: over-HTTP suites will skip themselves. Do not read this run as covering them."
fi

# --- the tests ------------------------------------------------------------------

status=0
run=1
while [ "$run" -le "$TIMES" ]; do
  note "tests: run $run of $TIMES"
  npx vitest run ${@+"$@"} || { status=$?; break; }
  run=$((run + 1))
done

exit "$status"
