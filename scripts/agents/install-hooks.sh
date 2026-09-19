#!/usr/bin/env bash
# Installs one pre-commit hook into the shared .git/hooks, where every worktree of
# this repository runs it.
#
#   scripts/agents/install-hooks.sh
#
# It stops three accidents:
#   a commit straight onto main               (set ALLOW_MAIN_COMMIT=1 to mean it)
#   a commit straight onto integration/*      (a merge in progress, or AGENT_ROLE=integrator, may)
#   a commit on a ticket branch made from a checkout that is not that ticket's worktree
#
# It refuses to replace a hook it did not write.
. "$(dirname "$0")/lib.sh"

HOOK="$GIT_COMMON_DIR/hooks/pre-commit"
MARK="# installed by scripts/agents/install-hooks.sh"

if [ -f "$HOOK" ] && ! grep -qF "$MARK" "$HOOK"; then
  die "$HOOK exists and is not ours. Merge the two by hand."
fi

mkdir -p "$GIT_COMMON_DIR/hooks"
cat >"$HOOK" <<EOF
#!/usr/bin/env bash
$MARK
branch="\$(git symbolic-ref --short -q HEAD)" || exit 0
top="\$(git rev-parse --show-toplevel)"

refuse() { printf 'commit refused: %s\n' "\$*" >&2; exit 1; }

case "\$branch" in
  main)
    [ -n "\${ALLOW_MAIN_COMMIT:-}" ] || refuse "main takes pull requests, not commits. ALLOW_MAIN_COMMIT=1 if you mean it."
    ;;
  integration/*)
    if [ -z "\${AGENT_ROLE:-}" ] && ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
      refuse "\$branch takes reviewed merges through scripts/agents/integrate.sh. Ticket work belongs on its own agent/ branch. AGENT_ROLE=integrator (or orchestrator) if this is workflow upkeep."
    fi
    ;;
  agent/*)
    [ -f "\$top/.agent/ticket" ] || refuse "\$branch is a ticket branch, and this checkout (\$top) is not a ticket worktree."
    ticket="\$(cat "\$top/.agent/ticket")"
    effort="\$(printf '%s' "\$ticket" | cut -d/ -f2)"
    file="\${ticket##*/}"
    [ "\$branch" = "agent/\$effort-\${file%.md}" ] || refuse "this worktree belongs to \$ticket, and the branch is \$branch."
    ;;
esac
EOF
chmod +x "$HOOK"
echo "installed $HOOK"
