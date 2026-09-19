#!/usr/bin/env bash
# What can start, what is open, and what is waiting on whom.
#
#   scripts/agents/status.sh manual-pairing
#
# Nothing here is stored. Every line is derived from three things: the ticket
# files on the integration branch (Status, Blocked by, Touches), the ticket
# branches that exist, and the merges and review receipts git already holds.
. "$(dirname "$0")/lib.sh"

EFFORT_ARG="${1:-}"
[ -n "$EFFORT_ARG" ] || die "name the effort: scripts/agents/status.sh manual-pairing"
INTEGRATION="integration/$EFFORT_ARG"
integration_exists "$INTEGRATION" || die "no branch $INTEGRATION"

printf 'Effort:       %s\nIntegration:  %s @ %s\n\n' \
  "$EFFORT_ARG" "$INTEGRATION" "$(git rev-parse --short "$INTEGRATION")"

READY_LIST=""
for ticket in $(git ls-tree --name-only "$INTEGRATION" ".scratch/$EFFORT_ARG/issues/"); do
  state="$(ticket_state "$ticket" "$INTEGRATION")"
  printf '%-34s %s\n' "$state" "$ticket"
  [ "$state" = "READY" ] && READY_LIST="$READY_LIST $ticket"
done

printf '\nOpen worktrees:\n'
"$(dirname "$0")/worktrees.sh" | sed 's/^/  /'

printf '\nTo start a READY ticket:\n'
if [ -z "$READY_LIST" ]; then
  echo "  (none is ready)"
else
  for ticket in $READY_LIST; do echo "  scripts/agents/start-ticket.sh $ticket"; done
fi

cat <<'EOF'

Tickets that share a `Touches:` tag are all shown READY until one of them starts;
starting one holds the rest. Shared-state tests are serialised by
scripts/agents/locked-tests.sh, so any number of worktrees may be open, but only
two or three are sensible on this machine.
EOF
