#!/usr/bin/env bash
# SessionStart hook — injects the superpowers using-superpowers skill as
# session context. Must stay fast and non-blocking: it runs in the critical
# path of session initialization and is subject to the hook timeout.
#
# The native dev stack for Claude Code web sessions (MariaDB + api/vendor +
# api/.env) is NOT provisioned here — apt/DB setup is slow enough to blow the
# hook timeout and stall session init. It is provisioned on-demand instead, by
# the DB-dependent npm scripts via tools/ensure-dev-stack.{mjs,sh}.
set -euo pipefail

SKILLS_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}/.claude/skills"

# A desktop session in a worktree reads .claude/skills from the main checkout,
# not from the worktree. Nothing updates that checkout when a PR merges, so a
# skill added since then is missing from every session. Fast-forward it to
# origin/main, but only when it is on main with no uncommitted changes to
# tracked files; a local commit makes the --ff-only merge refuse. There is no
# fetch, to keep the hook fast: worktrees share refs, so origin/main is as
# fresh as the last fetch from any of them.
fast_forward_main_checkout() {
    local main_dir
    main_dir=$(git -C "${CLAUDE_PROJECT_DIR:-.}" worktree list --porcelain | sed -n '1s/^worktree //p')
    [ -n "$main_dir" ] || return 0
    [ "$(git -C "$main_dir" symbolic-ref --short -q HEAD)" = main ] || return 0
    [ -z "$(git -C "$main_dir" status --porcelain --untracked-files=no)" ] || return 0
    git -C "$main_dir" merge --ff-only -q origin/main
}
fast_forward_main_checkout >/dev/null 2>&1 || true

using_superpowers_content=$(cat "${SKILLS_DIR}/using-superpowers/SKILL.md" 2>&1 || echo "Error reading using-superpowers skill")

escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

escaped=$(escape_for_json "$using_superpowers_content")
context="<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n**Below is the full content of your 'superpowers:using-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${escaped}\n</EXTREMELY_IMPORTANT>"

printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$context"
