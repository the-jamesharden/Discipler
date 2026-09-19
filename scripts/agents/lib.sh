# Shared by every script in scripts/agents/. Sourced, never run.
#
# Written for the bash 3.2 that ships with macOS: no associative arrays, no
# mapfile. Every path is resolved from git, so a script behaves the same from the
# main checkout and from any ticket worktree.
#
# A ticket is always named by its FULL PATH, relative to the repository root:
#   .scratch/manual-pairing/issues/03-a-pairing-checked-without-being-formed.md
# Every feature numbers its tickets from 01, so a bare number names nothing.

set -euo pipefail

die() { printf 'refused: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*" >&2; }

# The shared .git directory. Every worktree of this repository sees the same one,
# which is what makes it the place for state that must not live on a branch.
GIT_COMMON_DIR="$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"

# The main checkout: where the orchestrator and the integrator work. Ticket work
# never happens here.
MAIN_CHECKOUT="$(dirname "$GIT_COMMON_DIR")"

# Ticket worktrees live beside the main checkout, never inside it, so no tool that
# walks the main checkout (tsc, vitest, next build) ever sees a second copy.
WORKTREES_DIR="${AGENT_WORKTREES_DIR:-$(dirname "$MAIN_CHECKOUT")/discipler-worktrees}"

# Review receipts, the shared-environment lock and the log. Untracked by design:
# a receipt on a branch could be edited by the branch it approves.
STATE_DIR="$GIT_COMMON_DIR/agent-workflow"
REVIEWS_DIR="$STATE_DIR/reviews"
LOCKS_DIR="$STATE_DIR/locks"
mkdir -p "$REVIEWS_DIR" "$LOCKS_DIR"

# --- a ticket path, taken apart -------------------------------------------------

# Sets TICKET_PATH (normalised, repo-relative), EFFORT, TICKET_NN, TICKET_SLUG,
# TICKET_NAME, TICKET_BRANCH, TICKET_WORKTREE, TICKET_PORT, INTEGRATION_BRANCH.
parse_ticket() {
  local given="${1:-}"
  [ -n "$given" ] || die "give the ticket's full path, e.g. .scratch/manual-pairing/issues/03-….md"

  # Accept an absolute path into any checkout, or a repo-relative one.
  case "$given" in
    /*) given=".scratch/${given##*/.scratch/}" ;;
    ./*) given="${given#./}" ;;
  esac

  case "$given" in
    .scratch/*/issues/[0-9][0-9]-*.md) ;;
    *) die "'$given' is not a ticket path. A ticket is .scratch/<effort>/issues/<NN>-<slug>.md, never a bare number." ;;
  esac

  TICKET_PATH="$given"
  EFFORT="$(printf '%s' "$given" | cut -d/ -f2)"
  local file="${given##*/}"
  file="${file%.md}"
  TICKET_NN="${file%%-*}"
  TICKET_SLUG="${file#*-}"
  TICKET_NAME="$EFFORT-$TICKET_NN-$TICKET_SLUG"
  TICKET_BRANCH="agent/$TICKET_NAME"
  TICKET_WORKTREE="$WORKTREES_DIR/$TICKET_NAME"
  INTEGRATION_BRANCH="integration/$EFFORT"
  # A stable port per ticket, so a server can only ever belong to one worktree.
  # 3000 stays the main checkout's.
  TICKET_PORT=$((3100 + 10#$TICKET_NN))
}

integration_exists() { git show-ref --verify --quiet "refs/heads/$1"; }
branch_exists() { git show-ref --verify --quiet "refs/heads/$1"; }

# The ticket file as the integration branch holds it. The integration branch is
# the one place ticket text is read from, so a ticket edited on a ticket branch
# cannot change what the orchestrator believes about blockers.
ticket_text() { git show "$2:$1" 2>/dev/null; }

ticket_field() { # <path> <branch> <Field name>
  ticket_text "$1" "$2" | sed -n "s/^\*\*$3:\*\* *//p" | head -1
}

# --- what git already knows -----------------------------------------------------

# Integrated means: a merge on the integration branch carries this ticket's path in
# a Ticket-Path trailer. True forever, including after the branch and the worktree
# are gone -- which `git branch --merged` is not.
is_integrated() { # <ticket path> <integration branch>
  # Not `grep -q`: it exits at the first match, git log dies of SIGPIPE, and under
  # pipefail that reads as "not integrated".
  git log "$2" --merges --format='%(trailers:key=Ticket-Path,valueonly)' 2>/dev/null |
    grep -Fx "$1" >/dev/null
}

is_shipped() { # <ticket path> <integration branch>
  [ "$(ticket_field "$1" "$2" Status)" = "shipped" ]
}

# A blocker is met once its work is on the integration branch, however it got there.
blocker_met() { is_shipped "$1" "$2" || is_integrated "$1" "$2"; }

# The ticket file for a number, within one effort. The only place a number is
# turned into a path, and only ever from a `Blocked by:` line inside that effort.
ticket_for_number() { # <effort> <NN> <integration branch>
  git ls-tree --name-only "$3" ".scratch/$1/issues/" 2>/dev/null | grep -E "/$2-[^/]*\.md$" | head -1
}

blockers_of() { # <ticket path> <integration branch>  ->  one NN per line
  ticket_field "$1" "$2" "Blocked by" | grep -oE '[0-9]{2}' || true
}

# --- review receipts ------------------------------------------------------------

receipt_file() { printf '%s/%s.json' "$REVIEWS_DIR" "$1"; }

receipt_verdict() { # <sha>  ->  PASS | CHANGES REQUIRED | (nothing)
  local file
  file="$(receipt_file "$1")"
  [ -f "$file" ] || return 0
  sed -n 's/.*"verdict": *"\([^"]*\)".*/\1/p' "$file" | head -1
}

# READY / BLOCKED / ... for one ticket. Derived, never stored.
ticket_state() { # <ticket path> <integration branch>
  local path="$1" integration="$2" status head verdict
  parse_ticket "$path"

  if is_shipped "$path" "$integration"; then echo "SHIPPED"; return; fi
  if is_integrated "$path" "$integration"; then echo "INTEGRATED"; return; fi

  if branch_exists "$TICKET_BRANCH"; then
    head="$(git rev-parse "$TICKET_BRANCH")"
    if [ "$head" = "$(git merge-base "$TICKET_BRANCH" "$integration")" ]; then
      echo "IN PROGRESS"; return
    fi
    verdict="$(receipt_verdict "$head")"
    case "$verdict" in
      PASS) echo "APPROVED" ;;
      "CHANGES REQUIRED") echo "CHANGES REQUIRED" ;;
      *) echo "IN PROGRESS OR AWAITING REVIEW" ;;
    esac
    return
  fi

  status="$(ticket_field "$path" "$integration" Status)"
  [ "$status" = "ready-for-agent" ] || { echo "NOT READY ($status)"; return; }

  local nn blocker
  for nn in $(blockers_of "$path" "$integration"); do
    blocker="$(ticket_for_number "$EFFORT" "$nn" "$integration")"
    [ -n "$blocker" ] || { echo "BLOCKED (no ticket $nn in $EFFORT)"; return; }
    blocker_met "$blocker" "$integration" || { echo "BLOCKED (by $blocker)"; return; }
  done

  local held
  held="$(touch_conflict "$path" "$integration")"
  [ -z "$held" ] || { echo "HELD ($held)"; return; }

  echo "READY"
}

# Two tickets that name the same thing on their `Touches:` line edit the same
# files, so only one of them may be open at a time. Open means: has a branch that
# is not yet integrated. Derived from git, so there is no lease to go stale.
touch_conflict() { # <ticket path> <integration branch>
  local path="$1" integration="$2" mine other other_touches tag
  mine="$(ticket_field "$path" "$integration" Touches)"
  [ -n "$mine" ] || return 0
  local effort
  effort="$(printf '%s' "$path" | cut -d/ -f2)"

  for other in $(git ls-tree --name-only "$integration" ".scratch/$effort/issues/"); do
    [ "$other" != "$path" ] || continue
    other_touches="$(ticket_field "$other" "$integration" Touches)"
    [ -n "$other_touches" ] || continue
    for tag in $(printf '%s' "$mine" | tr ',' ' '); do
      case " $(printf '%s' "$other_touches" | tr ',' ' ') " in
        *" $tag "*)
          local name="${other##*/}"
          name="$effort-${name%.md}"
          if branch_exists "agent/$name" && ! is_integrated "$other" "$integration"; then
            printf "'%s' is held by %s until it is integrated" "$tag" "$other"
            return 0
          fi
          ;;
      esac
    done
  done
}
