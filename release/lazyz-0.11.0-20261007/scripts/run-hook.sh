#!/usr/bin/env sh
# LazyZ hook launcher with diagnostics.
#
# Wraps every hook command in hooks/hooks.json so that failures are explained
# to the user instead of failing silently. Checks:
#   1. Node.js is installed and reachable
#   2. The component dist/cli.js exists (i.e. `npm run build` was run)
#   3. Bun is available (only warns; needed for rebuilding, not for runtime)
#
# Usage:
#   scripts/run-hook.sh <component-dist-cli.js> [hook-args...]
#
# Example hooks.json entry:
#   "command": "sh \"${ZCODE_PLUGIN_ROOT}/scripts/run-hook.sh\" \"${ZCODE_PLUGIN_ROOT}/components/bootstrap/dist/cli.js\" hook session-start"

set -e

cli_path="$1"
shift || true

# --- 1. Node.js check -------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
	echo "[LazyZ] Node.js was not found on your PATH." >&2
	echo "[LazyZ] LazyZ hooks require Node.js 20+." >&2
	echo "[LazyZ] Install it from https://nodejs.org/ and restart ZCode." >&2
	exit 0
fi

node_version=$(node -e "process.stdout.write(process.versions.node)" 2>/dev/null || echo "unknown")
node_major=$(echo "$node_version" | cut -d. -f1)

if [ "$node_major" != "unknown" ] && [ "$node_major" -lt 20 ] 2>/dev/null; then
	echo "[LazyZ] Node.js ${node_version} is older than the required v20." >&2
	echo "[LazyZ] Some hooks may fail. Upgrade at https://nodejs.org/." >&2
fi

# --- 2. dist/cli.js check ---------------------------------------------------
if [ ! -f "$cli_path" ]; then
	plugin_root=$(dirname "$(dirname "$cli_path")")
	echo "[LazyZ] Hook component not built: $cli_path" >&2
	echo "[LazyZ] Run the build to enable LazyZ hooks:" >&2
	echo "[LazyZ]   cd \"${ZCODE_PLUGIN_ROOT:-$plugin_root/..}\" && npm install && npm run build" >&2
	echo "[LazyZ] (requires Node.js 20+ and Bun)" >&2

	# Bun hint (non-fatal)
	if ! command -v bun >/dev/null 2>&1; then
		echo "[LazyZ] Bun is also required for the build step. Install: curl -fsSL https://bun.sh/install | bash" >&2
	fi
	exit 0
fi

# --- 3. Run the hook --------------------------------------------------------
exec node "$cli_path" "$@"
