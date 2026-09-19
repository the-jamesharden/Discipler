#!/usr/bin/env bash
# Every ticket worktree: its ticket, its branch, its port, and where review stands.
#
#   scripts/agents/worktrees.sh
. "$(dirname "$0")/lib.sh"

report=""
for dir in $(git worktree list --porcelain | sed -n 's/^worktree //p'); do
  [ -f "$dir/.agent/ticket" ] || continue
  head="$(git -C "$dir" rev-parse HEAD)"
  dirty=""
  [ -z "$(git -C "$dir" status --porcelain)" ] || dirty=" (uncommitted changes)"
  verdict="$(receipt_verdict "$head")"
  report="$report$(printf '%s\n    branch   %s @ %s%s\n    worktree %s\n    port     %s\n    review   %s' \
    "$(cat "$dir/.agent/ticket")" \
    "$(git -C "$dir" rev-parse --abbrev-ref HEAD)" "$(git -C "$dir" rev-parse --short HEAD)" "$dirty" \
    "$dir" "$(cat "$dir/.agent/port" 2>/dev/null || echo '?')" \
    "${verdict:-none for this commit}")
"
done

if [ -n "$report" ]; then printf '%s' "$report"; else echo "(no ticket worktrees)"; fi
