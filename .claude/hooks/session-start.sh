#!/usr/bin/env bash
# SessionStart hook — injects the superpowers using-superpowers skill as
# session context. Must stay fast and non-blocking: it runs in the critical
# path of session initialization and is subject to the hook timeout.
#
# The Docker-free dev stack for Claude Code web sessions (MariaDB + config.php)
# is NOT provisioned here — apt/DB setup is slow enough to blow the hook timeout
# and stall session init. It is provisioned on-demand instead, by the
# DB-dependent npm scripts via tools/ensure-dev-stack.{mjs,sh}.
set -euo pipefail

SKILLS_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}/.claude/skills"

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
