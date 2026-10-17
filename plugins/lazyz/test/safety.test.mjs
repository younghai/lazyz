import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function runScript(name, args) {
	return spawnSync(process.execPath, [join(pluginRoot, "scripts", name), ...args], {
		cwd: pluginRoot,
		encoding: "utf8",
	});
}

function hasTestFile(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory() && hasTestFile(path)) return true;
		if (entry.isFile() && /\.test\.(?:[cm]?js|tsx?)$/.test(entry.name)) return true;
	}
	return false;
}

test("SessionStart does not invoke the Codex config migrator", () => {
	// Given: the distributed hook manifest.
	const manifest = JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8"));

	// When: SessionStart commands are collected.
	const commands = manifest.hooks.SessionStart.flatMap((group) => group.hooks.flatMap((hook) => [hook.command, ...(hook.args ?? [])]));

	// Then: startup contains no config-migration command.
	assert.equal(commands.some((command) => command.includes("migrate-codex-config")), false);
});

test("clean-checkout skill synchronization has no ignored vendor dependency", (context) => {
	// Given: the root package contract and skill synchronization entrypoint.
	const packageJson = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8"));
	const syncScript = readFileSync(join(pluginRoot, "scripts", "sync-skills.mjs"), "utf8");
	const checkout = mkdtempSync(join(tmpdir(), "lazyz-clean-checkout-"));
	context.after(() => rmSync(checkout, { recursive: true, force: true }));
	for (const relativePath of [
		"scripts/entry-guard.mjs",
		"scripts/sync-skills.mjs",
		"components/comment-checker/skills/comment-checker",
		"components/lsp/skills/lsp",
		"components/rules/skills/rules",
		"components/ulw-loop/skills/ulw-loop",
		"components/ultrawork/skills/ulw-plan",
		"components/ultrawork/skills/ultrawork",
	]) {
		cpSync(join(pluginRoot, relativePath), join(checkout, relativePath), { recursive: true });
	}
	mkdirSync(join(checkout, "skills", "directly-committed"), { recursive: true });
	writeFileSync(join(checkout, "skills", "directly-committed", "SKILL.md"), "committed\n");

	// When: local paths are inspected and synchronization runs without ignored vendor inputs.
	const localInputs = [
		...packageJson.workspaces,
		...Object.values(packageJson.dependencies ?? {}).filter((value) => value.startsWith("file:")),
	];
	const result = spawnSync(process.execPath, [join(checkout, "scripts", "sync-skills.mjs")], {
		cwd: checkout,
		encoding: "utf8",
	});

	// Then: the build relies only on committed skill inputs and preserves direct skills.
	assert.equal(localInputs.some((value) => value.includes("vendor/shared-skills")), false);
	assert.equal(syncScript.includes("@oh-my-opencode/shared-skills"), false);
	assert.equal(syncScript.includes("sharedSkillsRootPath"), false);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(join(checkout, "skills", "ulw-loop", "SKILL.md")), true);
	assert.equal(existsSync(join(checkout, "skills", "directly-committed", "SKILL.md")), true);
	const synchronizedPlanSkill = readFileSync(join(checkout, "skills", "ulw-plan", "SKILL.md"), "utf8");
	assert.equal(synchronizedPlanSkill, readFileSync(join(pluginRoot, "skills", "ulw-plan", "SKILL.md"), "utf8"));
});

test("every tested component ships at least one local test file", () => {
	// Given: every active component package in the plugin.
	const componentsRoot = join(pluginRoot, "components");
	const testedComponents = readdirSync(componentsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.filter((entry) => {
			const packagePath = join(componentsRoot, entry.name, "package.json");
			if (!existsSync(packagePath)) return false;
			const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
			return typeof packageJson.scripts?.test === "string";
		});

	// When: their committed component-local trees are inspected.
	const missing = testedComponents
		.filter((entry) => !hasTestFile(join(componentsRoot, entry.name)))
		.map((entry) => entry.name);

	// Then: no test script can silently execute zero tests.
	assert.deepEqual(missing, []);
});

test("component scripts iterate package manifests instead of every directory", () => {
	const packageJson = JSON.parse(readFileSync(join(pluginRoot, "package.json"), "utf8"));
	assert.match(packageJson.scripts["test:components"], /components\/\*\/package\.json/);
	assert.match(packageJson.scripts["typecheck:components"], /components\/\*\/package\.json/);
});

test("prune evidence does not follow a directory symlink outside the workspace", () => {
	// Given: old evidence outside the workspace, reachable through a symlink.
	const workspace = mkdtempSync(join(tmpdir(), "lazyz-prune-workspace-"));
	const outside = mkdtempSync(join(tmpdir(), "lazyz-prune-outside-"));
	const evidenceDir = join(workspace, ".omo", "evidence");
	const outsideFile = join(outside, "keep.txt");
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(outsideFile, "outside evidence\n");
	utimesSync(outsideFile, new Date(0), new Date(0));
	symlinkSync(outside, join(evidenceDir, "escape"), "dir");

	// When: pruning expired evidence.
	const result = runScript("prune-evidence.mjs", ["--cwd", workspace, "--days", "0"]);

	// Then: no file outside the workspace is removed.
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(outsideFile), true);
	rmSync(workspace, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
});

test("prune evidence does not truncate a ledger symlink outside the workspace", () => {
	// Given: an external ledger linked at the normal ledger path.
	const workspace = mkdtempSync(join(tmpdir(), "lazyz-ledger-workspace-"));
	const outside = mkdtempSync(join(tmpdir(), "lazyz-ledger-outside-"));
	const ledgerDir = join(workspace, ".omo", "start-work");
	const outsideLedger = join(outside, "ledger.jsonl");
	const content = Array.from({ length: 10_010 }, (_, index) => `{"line":${index}}`).join("\n");
	mkdirSync(ledgerDir, { recursive: true });
	writeFileSync(outsideLedger, content);
	symlinkSync(outsideLedger, join(ledgerDir, "ledger.jsonl"), "file");

	// When: ledger retention runs.
	const result = runScript("prune-evidence.mjs", ["--cwd", workspace]);

	// Then: the external ledger remains byte-for-byte unchanged.
	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(outsideLedger, "utf8"), content);
	rmSync(workspace, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
});

test("prune evidence still removes expired regular files inside the workspace", () => {
	// Given: expired evidence stored as a regular workspace file.
	const workspace = mkdtempSync(join(tmpdir(), "lazyz-prune-confined-"));
	const evidenceDir = join(workspace, ".omo", "evidence");
	const evidenceFile = join(evidenceDir, "expired.txt");
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(evidenceFile, "expired evidence\n");
	utimesSync(evidenceFile, new Date(0), new Date(0));

	// When: pruning expired evidence.
	const result = runScript("prune-evidence.mjs", ["--cwd", workspace, "--days", "0"]);

	// Then: the confined file is removed normally.
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(evidenceFile), false);
	rmSync(workspace, { recursive: true, force: true });
});

test("secret redaction does not follow symlinks outside the workspace", () => {
	// Given: an external secret reachable through the evidence directory.
	const workspace = mkdtempSync(join(tmpdir(), "lazyz-redact-workspace-"));
	const outside = mkdtempSync(join(tmpdir(), "lazyz-redact-outside-"));
	const evidenceDir = join(workspace, ".omo", "evidence");
	const outsideFile = join(outside, "secret.txt");
	const secret = "token=abcdefghijklmnopqrstuvwxyz123456";
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(outsideFile, secret);
	symlinkSync(outside, join(evidenceDir, "escape"), "dir");

	// When: in-place redaction runs.
	const result = runScript("redact-secrets.mjs", ["--cwd", workspace, "--fix"]);

	// Then: the file outside the workspace is untouched.
	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(outsideFile, "utf8"), secret);
	rmSync(workspace, { recursive: true, force: true });
	rmSync(outside, { recursive: true, force: true });
});

test("secret redaction still masks regular files inside the workspace", () => {
	// Given: a secret stored in a regular evidence file.
	const workspace = mkdtempSync(join(tmpdir(), "lazyz-redact-confined-"));
	const evidenceDir = join(workspace, ".omo", "evidence");
	const evidenceFile = join(evidenceDir, "secret.txt");
	mkdirSync(evidenceDir, { recursive: true });
	writeFileSync(evidenceFile, "token=abcdefghijklmnopqrstuvwxyz123456");

	// When: in-place redaction runs.
	const result = runScript("redact-secrets.mjs", ["--cwd", workspace, "--fix"]);

	// Then: the confined secret is masked normally.
	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(evidenceFile, "utf8"), "token=REDACTED");
	rmSync(workspace, { recursive: true, force: true });
});
