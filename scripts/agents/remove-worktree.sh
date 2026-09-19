#!/usr/bin/env bash
# Take down a ticket's worktree and branch once its work is on the integration
# branch. It refuses anything that could lose work.
#
#   scripts/agents/remove-worktree.sh <ticket path>
#
# It never forces. A ticket that is being abandoned rather than integrated is
# removed by hand, by somebody who has looked at what is in it.
. "$(dirname "$0")/lib.sh"

parse_ticket "${1:-}"
cd "$MAIN_CHECKOUT"

is_integrated "$TICKET_PATH" "$INTEGRATION_BRANCH" ||
  die "$TICKET_PATH is not integrated into $INTEGRATION_BRANCH, so its branch is the only copy of its work. Nothing was removed."

if [ -d "$TICKET_WORKTREE" ]; then
  if [ -n "$(git -C "$TICKET_WORKTREE" status --porcelain)" ]; then
    git -C "$TICKET_WORKTREE" status --short >&2
    die "$TICKET_WORKTREE has uncommitted changes. Nothing was removed."
  fi
  # The design copies were made read-only, and a directory without its write bit
  # cannot be emptied.
  [ ! -d "$TICKET_WORKTREE/.lavish" ] || chmod -R u+w "$TICKET_WORKTREE/.lavish"
  git worktree remove "$TICKET_WORKTREE"
  echo "removed worktree $TICKET_WORKTREE"
fi

if branch_exists "$TICKET_BRANCH"; then
  # -d, never -D: git itself refuses if the branch holds a commit the integration
  # branch does not.
  git branch -d "$TICKET_BRANCH"
fi

git worktree prune
