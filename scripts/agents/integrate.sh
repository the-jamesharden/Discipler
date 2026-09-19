#!/usr/bin/env bash
# The integrator's one act: bring a PASSed ticket branch into the integration
# branch, prove the combination, and only then make the merge permanent.
#
#   scripts/agents/integrate.sh <ticket path>              merge, test, commit
#   scripts/agents/integrate.sh <ticket path> --continue   after resolving conflicts or fixing the combination
#   scripts/agents/integrate.sh <ticket path> --abort      back out, leaving the integration branch as it was
#   scripts/agents/integrate.sh <ticket path> --times 1    how many back-to-back full runs (default 3)
#
# Run it from the main checkout, on the integration branch, with a clean tree. It
# takes many minutes: start it in the background and read its output.
#
# The merge is made with --no-commit and tested BEFORE it is committed, so a red
# combination never becomes history that has to be reverted: --abort is always
# safe, and a revert could never un-say the Ticket-Path trailer that tells every
# later ticket its blocker is met.
. "$(dirname "$0")/lib.sh"

parse_ticket "${1:-}"
shift
MODE="start"
TIMES=3
VITEST_ARGS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --continue) MODE="continue"; shift ;;
    --abort) MODE="abort"; shift ;;
    --times) TIMES="$2"; shift 2 ;;
    --) shift; VITEST_ARGS="$*"; break ;;
    *) die "unknown argument $1" ;;
  esac
done

[ "$(git rev-parse --show-toplevel)" = "$MAIN_CHECKOUT" ] || die "integrate from the main checkout ($MAIN_CHECKOUT), never from a ticket worktree"
cd "$MAIN_CHECKOUT"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$INTEGRATION_BRANCH" ] ||
  die "the main checkout is on $(git rev-parse --abbrev-ref HEAD), not $INTEGRATION_BRANCH. Switch to it yourself; this script will not."

MSG_FILE="$STATE_DIR/merge-message-$TICKET_NAME.txt"
MERGING="$(git rev-parse -q --verify MERGE_HEAD 2>/dev/null || true)"

if [ "$MODE" = "abort" ]; then
  [ -n "$MERGING" ] || die "no merge is in progress"
  git merge --abort
  rm -f "$MSG_FILE"
  echo "aborted. $INTEGRATION_BRANCH is as it was; $TICKET_BRANCH is untouched."
  exit 0
fi

branch_exists "$TICKET_BRANCH" || die "no branch $TICKET_BRANCH"
SHA="$(git rev-parse "$TICKET_BRANCH")"

# --- only reviewed code --------------------------------------------------------

verdict="$(receipt_verdict "$SHA")"
[ "$verdict" = "PASS" ] || die "$TICKET_BRANCH @ $(git rev-parse --short "$SHA") has ${verdict:-no review}. Only a PASS for this exact commit may be integrated. A commit made after a review needs a new one."
is_integrated "$TICKET_PATH" "$INTEGRATION_BRANCH" && die "$TICKET_PATH is already integrated"
if [ -d "$TICKET_WORKTREE" ] && [ -n "$(git -C "$TICKET_WORKTREE" status --porcelain)" ]; then
  die "$TICKET_WORKTREE has uncommitted changes that the review never saw"
fi

# --- the merge, not yet committed ---------------------------------------------

if [ "$MODE" = "start" ]; then
  [ -z "$MERGING" ] || die "a merge is already in progress. Finish it with --continue or back out with --abort."
  [ -z "$(git status --porcelain)" ] || { git status --short >&2; die "the main checkout has uncommitted changes. They are somebody's work: deal with them first, by hand."; }

  title="$(ticket_text "$TICKET_PATH" "$INTEGRATION_BRANCH" | sed -n '1s/^# *//p')"
  cat >"$MSG_FILE" <<EOF
Merge $EFFORT ticket $title

Ticket-Path: $TICKET_PATH
Ticket-Branch: $TICKET_BRANCH
Reviewed-Commit: $SHA
Review-Verdict: PASS
EOF

  if ! git merge --no-ff --no-commit "$TICKET_BRANCH" >&2; then
    cat >&2 <<EOF

Conflicts. Nothing is committed.
$(git diff --name-only --diff-filter=U | sed 's/^/  /')

Resolve them so that BOTH tickets' behaviour survives. Read both tickets before
choosing; never take one side of a file wholesale to make the conflict go away.
Then:   scripts/agents/integrate.sh $TICKET_PATH --continue
Or:     scripts/agents/integrate.sh $TICKET_PATH --abort
EOF
    exit 3
  fi
else
  [ -n "$MERGING" ] || die "no merge is in progress to continue"
  [ "$MERGING" = "$SHA" ] || die "the merge in progress is of $MERGING, not of $TICKET_BRANCH @ $SHA"
  [ -z "$(git diff --name-only --diff-filter=U)" ] || die "there are still unresolved conflicts"
  [ -f "$MSG_FILE" ] || die "the merge message is missing; --abort and start again"
fi

# --- prove the combination, then commit ---------------------------------------

note "testing the merged tree: $TIMES back-to-back run(s) of ${VITEST_ARGS:-the whole suite}"
# shellcheck disable=SC2086
if ! "$(dirname "$0")/locked-tests.sh" --times "$TIMES" -- $VITEST_ARGS; then
  cat >&2 <<EOF

Red. Nothing is committed, and $INTEGRATION_BRANCH is unchanged.

First rule out the environment: docs/agents/test-environment.md.
If the two tickets only disagree where they meet, fix the meeting point here, then:
        scripts/agents/integrate.sh $TICKET_PATH --continue
If the ticket itself is wrong, back out and send it back to its own branch:
        scripts/agents/integrate.sh $TICKET_PATH --abort
        (then a reviewer records CHANGES, and a fix session runs on $TICKET_BRANCH)
EOF
  exit 4
fi

printf 'Tested: %s x%s, green, on the merged tree\n' "${VITEST_ARGS:-whole suite}" "$TIMES" >>"$MSG_FILE"
AGENT_ROLE=integrator git commit --quiet --cleanup=strip -F "$MSG_FILE"
rm -f "$MSG_FILE"

echo "integrated: $TICKET_PATH"
echo "            $INTEGRATION_BRANCH is now $(git rev-parse --short HEAD)"
echo "next:       scripts/agents/status.sh $EFFORT        (what this unblocked)"
echo "            scripts/agents/remove-worktree.sh $TICKET_PATH"
