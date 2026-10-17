import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const pluginRoot = resolve(import.meta.dirname, "..");
const sourceCli = join(pluginRoot, "runtime", "cli.mjs");

function runCli(args, options = {}) {
	return spawnSync(process.execPath, [sourceCli, ...args], {
		cwd: options.cwd ?? pluginRoot,
		env: {
			...process.env,
			HOME: options.home ?? process.env.HOME,
			LAZYZ_ARTIFACT_MODE: options.artifactMode ?? "development",
			LAZYZ_PLUGIN_ROOT: options.pluginRoot ?? pluginRoot,
		},
		encoding: "utf8",
	});
}

async function makePluginFixture() {
	const root = await mkdtemp(join(tmpdir(), "lazyz-cli-test-"));
	mkdirSync(join(root, ".zcode-plugin"), { recursive: true });
	mkdirSync(join(root, "hooks"), { recursive: true });
	mkdirSync(join(root, "agents"), { recursive: true });
	for (const path of [
		"dist/cli/index.js",
		"components/bootstrap/dist/cli.js",
		"components/codegraph/dist/cli.js",
		"components/ulw-loop/dist/cli.js",
	]) {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), "#!/usr/bin/env node\n", { mode: 0o755 });
	}
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@lazyz/plugin", version: "1.2.3" }));
	writeFileSync(join(root, ".zcode-plugin", "plugin.json"), JSON.stringify({ name: "lazyz", version: "1.2.3" }));
	writeFileSync(join(root, "hooks", "hooks.json"), JSON.stringify({ hooks: {} }));
	writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
	writeFileSync(join(root, "agents", "executor.md"), "executor\n");
	return root;
}

test("Given a healthy payload, when doctor emits JSON, then it exits zero with machine-readable checks", async () => {
	const fixture = await makePluginFixture();
	const home = await mkdtemp(join(tmpdir(), "lazyz-home-"));
	const result = runCli(["doctor", "--json"], { home, pluginRoot: fixture });
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(result.stdout);
	assert.equal(report.ok, true);
	assert.equal(report.version, "1.2.3");
	assert.ok(report.checks.some((check) => check.id === "entrypoints" && check.status === "pass"));
	assert.deepEqual(report.mutationPlan.codex, []);
});

test("Given a hook manifest referencing a missing local command, when doctor runs, then it fails that entrypoint", async () => {
	const fixture = await makePluginFixture();
	writeFileSync(
		join(fixture, "hooks", "hooks.json"),
		JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: 'node "${ZCODE_PLUGIN_ROOT}/components/missing/dist/cli.js" hook' }] }] } }),
	);
	const result = runCli(["doctor", "--json"], { pluginRoot: fixture });
	assert.equal(result.status, 1);
	const entrypoints = JSON.parse(result.stdout).checks.find((check) => check.id === "entrypoints");
	assert.deepEqual(entrypoints.invalid, ["components/missing/dist/cli.js: missing or unreadable"]);
});

test("Given an MCP manifest referencing an empty local command, when doctor runs, then it fails while ignoring remote MCPs", async () => {
	const fixture = await makePluginFixture();
	mkdirSync(join(fixture, "components", "empty", "dist"), { recursive: true });
	writeFileSync(join(fixture, "components", "empty", "dist", "serve.js"), "");
	writeFileSync(
		join(fixture, ".mcp.json"),
		JSON.stringify({
			mcpServers: {
				remote: { url: "https://example.invalid/mcp" },
				local: { command: "node", args: ["components/empty/dist/serve.js"] },
			},
		}),
	);
	const result = runCli(["doctor", "--json"], { pluginRoot: fixture });
	assert.equal(result.status, 1);
	const entrypoints = JSON.parse(result.stdout).checks.find((check) => check.id === "entrypoints");
	assert.deepEqual(entrypoints.invalid, ["components/empty/dist/serve.js: empty file"]);
});

test("Given a missing runtime entrypoint, when doctor runs, then it exits one", async () => {
	const fixture = await makePluginFixture();
	writeFileSync(join(fixture, "dist", "cli", "index.js.removed"), "missing");
	const { rmSync } = await import("node:fs");
	rmSync(join(fixture, "dist", "cli", "index.js"));
	const result = runCli(["doctor", "--json"], { pluginRoot: fixture });
	assert.equal(result.status, 1);
	assert.equal(JSON.parse(result.stdout).ok, false);
});

test("Given CLI source newer than the built entrypoint, when doctor runs, then it reports stale dist", async () => {
	const fixture = await makePluginFixture();
	mkdirSync(join(fixture, "runtime"));
	writeFileSync(join(fixture, "runtime", "cli.mjs"), "source\n");
	const old = new Date(1_000);
	const recent = new Date(2_000);
	utimesSync(join(fixture, "dist", "cli", "index.js"), old, old);
	utimesSync(join(fixture, "runtime", "cli.mjs"), recent, recent);
	const result = runCli(["doctor", "--json"], { pluginRoot: fixture });
	assert.equal(result.status, 1);
	const freshness = JSON.parse(result.stdout).checks.find((check) => check.id === "cli-dist-freshness");
	assert.equal(freshness.status, "fail");
});

test("Given setup dry-run, when no target is selected, then it plans ZCode without writing", async () => {
	const fixture = await makePluginFixture();
	const home = await mkdtemp(join(tmpdir(), "lazyz-home-"));
	const result = runCli(["setup", "--dry-run", "--json"], { home, pluginRoot: fixture });
	assert.equal(result.status, 0, result.stderr);
	const plan = JSON.parse(result.stdout);
	assert.equal(plan.target, "zcode");
	assert.equal(plan.dryRun, true);
	assert.equal(readFileSync(join(fixture, "agents", "executor.md"), "utf8"), "executor\n");
	assert.equal(spawnSync("test", ["-e", join(home, ".zcode", "agents", "executor.md")]).status, 1);
});

test("Given an existing user-owned agent, when setup is approved, then it is backed up before atomic replacement", async () => {
	const fixture = await makePluginFixture();
	const home = await mkdtemp(join(tmpdir(), "lazyz-home-"));
	const agents = join(home, ".zcode", "agents");
	mkdirSync(agents, { recursive: true });
	writeFileSync(join(agents, "executor.md"), "user version\n");
	const result = runCli(["setup", "--yes", "--json"], { home, pluginRoot: fixture });
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(result.stdout);
	assert.equal(readFileSync(join(agents, "executor.md"), "utf8"), "executor\n");
	assert.equal(readFileSync(report.backupDir + "/executor.md", "utf8"), "user version\n");
	assert.deepEqual(JSON.parse(readFileSync(join(home, ".local", "bin", "lazyz.lazyz-owned.json"), "utf8")), {
		marker: "LAZYZ_GENERATED_CLI_LINK",
		owner: "lazyz",
		path: join(home, ".local", "bin", "lazyz"),
	});
});

test("Given Codex is not selected explicitly, when setup runs, then no Codex path is touched", async () => {
	const fixture = await makePluginFixture();
	const home = await mkdtemp(join(tmpdir(), "lazyz-home-"));
	mkdirSync(join(home, ".codex"), { recursive: true });
	writeFileSync(join(home, ".codex", "config.toml"), "user = true\n");
	const result = runCli(["setup", "--yes", "--json"], { home, pluginRoot: fixture });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(join(home, ".codex", "config.toml"), "utf8"), "user = true\n");
});

test("Given a local ulw-loop component, when dispatched, then LazyZ forwards arguments directly", async () => {
	const fixture = await makePluginFixture();
	const capture = join(fixture, "captured.json");
	writeFileSync(
		join(fixture, "components", "ulw-loop", "dist", "cli.js"),
		`import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));`,
	);
	const result = runCli(["ulw-loop", "status", "--json"], { pluginRoot: fixture });
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")), ["ulw-loop", "status", "--json"]);
});

test("Given codegraph sweep dry-run, when invoked, then LazyZ delegates to the component without changing arguments", async () => {
	const fixture = await makePluginFixture();
	const capture = join(fixture, "codegraph-args.json");
	writeFileSync(
		join(fixture, "components", "codegraph", "dist", "cli.js"),
		`import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2)));`,
	);
	const result = runCli(["codegraph", "sweep", "--dry-run", "--json"], { pluginRoot: fixture });
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(readFileSync(capture, "utf8")), ["sweep", "--dry-run", "--json"]);
});

test("Given experimental memory is requested without policy, when doctor runs, then it reports an unsupported security gate", async () => {
	const fixture = await makePluginFixture();
	const result = spawnSync(process.execPath, [sourceCli, "doctor", "--json"], {
		env: { ...process.env, LAZYZ_ARTIFACT_MODE: "development", LAZYZ_EXPERIMENTAL_MEMORY: "1", LAZYZ_PLUGIN_ROOT: fixture },
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	const memory = JSON.parse(result.stdout).checks.find((check) => check.id === "experimental-memory");
	assert.deepEqual(memory, {
		enabled: false,
		experimental: true,
		id: "experimental-memory",
		message: "unsupported: policy manifest is required; no memory runtime was loaded",
		status: "warn",
	});
});

test("Given a user-owned legacy omo link, when doctor runs, then it never claims ownership", async () => {
	const fixture = await makePluginFixture();
	const home = await mkdtemp(join(tmpdir(), "lazyz-home-"));
	const bin = join(home, ".local", "bin");
	mkdirSync(bin, { recursive: true });
	symlinkSync("/usr/bin/true", join(bin, "omo"));
	const result = runCli(["doctor", "--json"], { home, pluginRoot: fixture });
	const legacy = JSON.parse(result.stdout).checks.find((check) => check.id === "legacy-omo");
	assert.equal(legacy.status, "warn");
	assert.equal(legacy.owned, false);
});

test("Given a marker-owned legacy omo link, when approved setup runs, then only that legacy link is retired", async () => {
	const fixture = await makePluginFixture();
	const home = await mkdtemp(join(tmpdir(), "lazyz-home-"));
	const bin = join(home, ".local", "bin");
	const legacy = join(bin, "omo");
	mkdirSync(bin, { recursive: true });
	symlinkSync("/usr/bin/true", legacy);
	writeFileSync(`${legacy}.lazyz-owned.json`, JSON.stringify({ owner: "lazyz", path: legacy }));
	const result = runCli(["setup", "--yes", "--json"], { home, pluginRoot: fixture });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(legacy), false);
	assert.equal(existsSync(`${legacy}.lazyz-owned.json`), false);
});

test("Given the CLI build, when invoked, then dist/cli/index.js is executable", () => {
	execFileSync(process.execPath, [join(pluginRoot, "scripts", "build-cli.mjs")], { cwd: pluginRoot });
	chmodSync(join(pluginRoot, "dist", "cli", "index.js"), 0o755);
	const result = spawnSync(process.execPath, [join(pluginRoot, "dist", "cli", "index.js"), "--help"], {
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /lazyz doctor/);
});
