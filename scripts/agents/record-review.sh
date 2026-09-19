#!/usr/bin/env bash
# The reviewer's last act: a receipt for the exact commit that was reviewed.
#
#   scripts/agents/record-review.sh <ticket path> PASS    <review file>
#   scripts/agents/record-review.sh <ticket path> CHANGES <review file>
#
# The receipt is keyed by commit sha and kept in the shared .git directory, off
# every branch. integrate.sh merges a branch only if its head has a PASS receipt,
# so any commit made after a review leaves the branch unreviewed again without
# anybody having to remember that it did.
#
# This stops accidents, not forgery: anything that can write to .git could write a
# receipt. Only a reviewer runs this script; an implementer never does.
. "$(dirname "$0")/lib.sh"

parse_ticket "${1:-}"
VERDICT_ARG="${2:-}"
REVIEW_FILE="${3:-}"

case "$VERDICT_ARG" in
  PASS) VERDICT="PASS" ;;
  CHANGES | "CHANGES REQUIRED") VERDICT="CHANGES REQUIRED" ;;
  *) die "the verdict is PASS or CHANGES" ;;
esac
[ -f "$REVIEW_FILE" ] || die "give the review as a file: BLOCKING, NON-BLOCKING, TESTS MISSING, VERDICT"
branch_exists "$TICKET_BRANCH" || die "no branch $TICKET_BRANCH"

# A dirty worktree means the head commit is not the whole of the work -- or that
# the reviewer edited something, which a reviewer does not do.
if [ -d "$TICKET_WORKTREE" ] && [ -n "$(git -C "$TICKET_WORKTREE" status --porcelain)" ]; then
  git -C "$TICKET_WORKTREE" status --short >&2
  die "$TICKET_WORKTREE has uncommitted changes. A review is of a commit. If the reviewer made them, discard them; if the implementer left them, that is a finding."
fi

grep -q "VERDICT: $VERDICT" "$REVIEW_FILE" || die "the review file does not end in 'VERDICT: $VERDICT'"
if [ "$VERDICT" = "PASS" ] && sed -n '/^BLOCKING/,/^NON-BLOCKING/p' "$REVIEW_FILE" | grep -E '^[[:space:]]*[-*0-9]' >/dev/null; then
  die "the review lists BLOCKING findings and says PASS. It is one or the other."
fi

SHA="$(git rev-parse "$TICKET_BRANCH")"
cp "$REVIEW_FILE" "$REVIEWS_DIR/$SHA.md"
cat >"$(receipt_file "$SHA")" <<EOF
{
  "ticket": "$TICKET_PATH",
  "branch": "$TICKET_BRANCH",
  "commit": "$SHA",
  "against": "$(git rev-parse "$INTEGRATION_BRANCH")",
  "verdict": "$VERDICT",
  "recorded": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "recorded: $VERDICT for $TICKET_BRANCH @ $(git rev-parse --short "$SHA")"
echo "review:   $REVIEWS_DIR/$SHA.md"
if [ "$VERDICT" = "PASS" ]; then
  echo "next:     scripts/agents/integrate.sh $TICKET_PATH      (from the main checkout)"
else
  echo "next:     a fix session on the SAME branch:"
  echo "          cd '$TICKET_WORKTREE' && claude \"\$(scripts/agents/prompt.sh fixer $TICKET_PATH)\""
fi
