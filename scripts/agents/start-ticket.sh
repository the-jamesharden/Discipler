#!/usr/bin/env bash
# The orchestrator's one act: give a ticket its own branch and its own worktree,
# cut from the latest integration branch, and print the command that starts its
# implementer.
#
#   scripts/agents/start-ticket.sh .scratch/manual-pairing/issues/03-a-pairing-checked-without-being-formed.md
#
# It refuses a ticket that is not READY (blocked, held by a `Touches:` tag, not
# `ready-for-agent`, or already started), and it never touches an existing
# worktree. Run it from the main checkout.
. "$(dirname "$0")/lib.sh"

parse_ticket "${1:-}"
cd "$MAIN_CHECKOUT"

integration_exists "$INTEGRATION_BRANCH" || die "no branch $INTEGRATION_BRANCH. Create it from main first."
ticket_text "$TICKET_PATH" "$INTEGRATION_BRANCH" >/dev/null ||
  die "$TICKET_PATH is not on $INTEGRATION_BRANCH. Commit the ticket there before starting it."

state="$(ticket_state "$TICKET_PATH" "$INTEGRATION_BRANCH")"
parse_ticket "$TICKET_PATH"
[ "$state" = "READY" ] || die "$TICKET_PATH is $state, not READY. See scripts/agents/status.sh $EFFORT"
[ ! -e "$TICKET_WORKTREE" ] || die "$TICKET_WORKTREE already exists. Nothing was changed."

mkdir -p "$WORKTREES_DIR"
git worktree add -b "$TICKET_BRANCH" "$TICKET_WORKTREE" "$INTEGRATION_BRANCH" >&2

# .agent/ holds what this worktree is for. Ignored through the shared
# info/exclude, so it is never committed and never shows as untracked.
grep -qxF '.agent/' "$GIT_COMMON_DIR/info/exclude" 2>/dev/null || echo '.agent/' >>"$GIT_COMMON_DIR/info/exclude"
mkdir -p "$TICKET_WORKTREE/.agent"
printf '%s\n' "$TICKET_PATH" >"$TICKET_WORKTREE/.agent/ticket"
printf '%s\n' "$TICKET_PORT" >"$TICKET_WORKTREE/.agent/port"
git rev-parse "$INTEGRATION_BRANCH" >"$TICKET_WORKTREE/.agent/base"

# Copies, never symlinks: a link back into the main checkout would be a way for one
# ticket to edit what every other ticket reads.
if [ -f "$MAIN_CHECKOUT/.env.local" ]; then
  cp "$MAIN_CHECKOUT/.env.local" "$TICKET_WORKTREE/.env.local"
else
  note "warning: no .env.local in the main checkout; the worktree has none either."
fi

# The design sources the tickets cite are gitignored, so a worktree has none until
# they are copied in. Read-only, because they are references and not the work.
for design in pair-popup design-as-committed design-current; do
  if [ -d "$MAIN_CHECKOUT/.lavish/$design" ]; then
    mkdir -p "$TICKET_WORKTREE/.lavish"
    cp -R "$MAIN_CHECKOUT/.lavish/$design" "$TICKET_WORKTREE/.lavish/$design"
  fi
done
[ ! -d "$TICKET_WORKTREE/.lavish" ] || chmod -R a-w "$TICKET_WORKTREE/.lavish"

# Its own node_modules. npm's cache is shared; the installed tree is not.
note "installing dependencies in the worktree (npm ci)…"
(cd "$TICKET_WORKTREE" && npm ci --no-audit --no-fund >&2) ||
  note "warning: npm ci failed; run it by hand in $TICKET_WORKTREE before starting."

"$(dirname "$0")/prompt.sh" implementer "$TICKET_PATH" >"$TICKET_WORKTREE/.agent/implementer-prompt.md"

cat <<EOF

Ready.
  ticket    $TICKET_PATH
  branch    $TICKET_BRANCH  (from $INTEGRATION_BRANCH @ $(git rev-parse --short "$INTEGRATION_BRANCH"))
  worktree  $TICKET_WORKTREE
  port      $TICKET_PORT

Start the implementer in a NEW terminal, so its working directory is the worktree:

  cd '$TICKET_WORKTREE' && claude "\$(cat .agent/implementer-prompt.md)"

EOF
