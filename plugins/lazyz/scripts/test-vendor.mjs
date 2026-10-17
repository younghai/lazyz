import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packages = [
	"mcp-stdio-core", "utils", "git-bash-mcp", "comment-checker-core",
	"model-core", "prompts-core", "rules-engine", "telemetry-core",
	"lsp-core", "lsp-daemon", "lsp-tools-mcp",
];

// The complete upstream Codex installer needs the omitted OpenCode monorepo.
// Exercise the helpers bundled by LazyZ bootstrap, not that separate product.
const bootstrapHelpers = [
	"codex-cache-bins", "link-cached-plugin-agents", "codex-config-toml",
	"codex-config-git-bash", "git-bash", "codex-hook-trust",
];

let failed = false;
for (const name of packages) {
	run("npm", ["test"], join(root, "vendor", name));
}
run("bun", ["test", ...bootstrapHelpers.map((name) => `./src/install/${name}.test.ts`)],
	join(root, "vendor", "omo-codex"));
process.exitCode = failed ? 1 : 0;

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd, stdio: "inherit", shell: process.platform === "win32",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) failed = true;
}
