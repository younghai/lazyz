#!/usr/bin/env sh
# LazyZ subagent installer — copies plugin agents/*.md into ~/.zcode/agents/
# so ZCode discovers them as subagent_type values for the Agent tool.
#
# Background: ZCode records but does NOT execute the plugin `agents/` manifest
# field. The only discovery path that works today is the user-level
# ~/.zcode/agents/ directory (Beta). This script bridges that gap.
#
# Usage:
#   sh scripts/install-agents.sh           # copy
#   sh scripts/install-agents.sh --symlink # symlink instead (live updates)
#
# Re-runnable; overwrites existing files with the same name.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$PLUGIN_ROOT/agents"
DEST_DIR="${HOME}/.zcode/agents"

MODE="copy"
if [ "${1:-}" = "--symlink" ]; then
  MODE="symlink"
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "[$0] source not found: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

count=0
for src in "$SRC_DIR"/*.md; do
  [ -f "$src" ] || continue
  name="$(basename "$src")"
  dest="$DEST_DIR/$name"

  if [ "$MODE" = "symlink" ]; then
    ln -sf "$src" "$dest"
  else
    cp -f "$src" "$dest"
  fi
  count=$((count + 1))
done

echo "[LazyZ] installed $count subagent(s) to $DEST_DIR (mode: $MODE)"
echo "[LazyZ] restart ZCode for the Agent tool to pick up new subagent_type values."
