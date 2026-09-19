#!/usr/bin/env bash
# What a reviewer reads: the ticket, and exactly what its branch adds to the
# integration branch. Nothing is changed by running this.
#
#   scripts/agents/review-diff.sh .scratch/manual-pairing/issues/03-….md            summary
#   scripts/agents/review-diff.sh .scratch/manual-pairing/issues/03-….md --full     the whole diff
#
# The diff is three-dot: from where the branch left the integration branch to its
# head. Work other tickets have integrated since is not in it, and is not this
# review's business; the integrator's test run is what covers the combination.
. "$(dirname "$0")/lib.sh"

parse_ticket "${1:-}"
MODE="${2:-}"
branch_exists "$TICKET_BRANCH" || die "no branch $TICKET_BRANCH for $TICKET_PATH"

HEAD_SHA="$(git rev-parse "$TICKET_BRANCH")"
RANGE="$INTEGRATION_BRANCH...$TICKET_BRANCH"

if [ -d "$TICKET_WORKTREE" ] && [ -n "$(git -C "$TICKET_WORKTREE" status --porcelain)" ]; then
  note "warning: $TICKET_WORKTREE has uncommitted changes. They are not part of what is reviewed."
fi

cat <<EOF
Ticket:    $TICKET_PATH
Branch:    $TICKET_BRANCH
Reviewing: $HEAD_SHA
Against:   $INTEGRATION_BRANCH (merge base $(git merge-base "$INTEGRATION_BRANCH" "$TICKET_BRANCH" | cut -c1-9))
Review so far for this commit: $(v="$(receipt_verdict "$HEAD_SHA")"; echo "${v:-none}")

Commits:
$(git log --oneline "$INTEGRATION_BRANCH..$TICKET_BRANCH" | sed 's/^/  /')

Files:
$(git diff --stat "$RANGE" | sed 's/^/  /')

Tests added or changed:
$(git diff --name-only "$RANGE" -- tests | sed 's/^/  /')
EOF

if [ "$MODE" = "--full" ]; then
  printf '\n'
  git --no-pager diff "$RANGE"
else
  printf '\nThe whole diff:  scripts/agents/review-diff.sh %s --full\nOne file:        git diff %s -- <path>\n' "$TICKET_PATH" "$RANGE"
fi
