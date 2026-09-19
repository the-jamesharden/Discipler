#!/usr/bin/env bash
# Prints a role's prompt for one ticket, with the ticket's FULL PATH and everything
# that follows from it filled in.
#
#   scripts/agents/prompt.sh implementer <ticket path>
#   scripts/agents/prompt.sh reviewer    <ticket path>
#   scripts/agents/prompt.sh fixer       <ticket path>
#   scripts/agents/prompt.sh integrator  <ticket path>
#   scripts/agents/prompt.sh orchestrator <effort>
#
# The templates are docs/agents/prompts/<role>.md.
. "$(dirname "$0")/lib.sh"

ROLE="${1:-}"
TEMPLATE="$(git rev-parse --show-toplevel)/docs/agents/prompts/$ROLE.md"
[ -f "$TEMPLATE" ] || die "no such role '$ROLE'. Roles: implementer, reviewer, fixer, integrator, orchestrator"

if [ "$ROLE" = "orchestrator" ]; then
  EFFORT="${2:-}"
  [ -n "$EFFORT" ] || die "name the effort: scripts/agents/prompt.sh orchestrator manual-pairing"
  sed -e "s|{{EFFORT}}|$EFFORT|g" \
    -e "s|{{INTEGRATION_BRANCH}}|integration/$EFFORT|g" \
    -e "s|{{MAIN_CHECKOUT}}|$MAIN_CHECKOUT|g" "$TEMPLATE"
  exit 0
fi

parse_ticket "${2:-}"

BUDGET="$(ticket_field "$TICKET_PATH" "$INTEGRATION_BRANCH" Budget)"
REVIEW_FILE="(no review has been recorded for this commit)"
if branch_exists "$TICKET_BRANCH"; then
  candidate="$REVIEWS_DIR/$(git rev-parse "$TICKET_BRANCH").md"
  [ ! -f "$candidate" ] || REVIEW_FILE="$candidate"
fi

sed -e "s|{{TICKET_PATH}}|$TICKET_PATH|g" \
  -e "s|{{EFFORT}}|$EFFORT|g" \
  -e "s|{{SPEC_PATH}}|.scratch/$EFFORT/spec.md|g" \
  -e "s|{{BRANCH}}|$TICKET_BRANCH|g" \
  -e "s|{{WORKTREE}}|$TICKET_WORKTREE|g" \
  -e "s|{{PORT}}|$TICKET_PORT|g" \
  -e "s|{{INTEGRATION_BRANCH}}|$INTEGRATION_BRANCH|g" \
  -e "s|{{MAIN_CHECKOUT}}|$MAIN_CHECKOUT|g" \
  -e "s|{{BUDGET}}|${BUDGET:-not stated on the ticket}|g" \
  -e "s|{{REVIEW_FILE}}|$REVIEW_FILE|g" "$TEMPLATE"
