import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readlink, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { assertSetupDirectory } from "./setup-paths.mjs";

const OWNERSHIP_MARKER = ".lazyz-owned.json";

async function exists(path) {
	try {
		await lstat(path);
		return true;
	} catch {
		return false;
	}
}

async function atomicCopy(source, target) {
	await mkdir(dirname(target), { recursive: true, mode: 0o700 });
	const temporary = join(dirname(target), `.${basename(target)}.lazyz-${process.pid}.tmp`);
	await copyFile(source, temporary, constants.COPYFILE_EXCL);
	await rename(temporary, target);
}

async function atomicSymlink(source, target) {
	await mkdir(dirname(target), { recursive: true, mode: 0o700 });
	const temporary = join(dirname(target), `.${basename(target)}.lazyz-${process.pid}.tmp`);
	await symlink(source, temporary);
	await rename(temporary, target);
}

async function sourceAgents(pluginRoot, target) {
	if (target === "zcode") {
		const names = (await readdir(join(pluginRoot, "agents"))).filter((name) => name.endsWith(".md")).sort();
		return names.map((name) => ({ name, source: join(pluginRoot, "agents", name) }));
	}
	const components = await readdir(join(pluginRoot, "components"), { withFileTypes: true });
	const agents = [];
	for (const component of components.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
		const directory = join(pluginRoot, "components", component.name, "agents");
		if (!(await exists(directory))) continue;
		for (const name of (await readdir(directory)).filter((value) => value.endsWith(".toml")).sort()) {
			agents.push({ name, source: join(directory, name) });
		}
	}
	return agents;
}

function setupPaths(home, target) {
	return target === "zcode"
		? { agents: join(home, ".zcode", "agents"), bin: join(home, ".local", "bin") }
		: { agents: join(home, ".codex", "agents"), bin: join(home, ".local", "bin") };
}

async function legacyOmoRetirement(home) {
	const target = join(home, ".local", "bin", "omo");
	const marker = `${target}.lazyz-owned.json`;
	try {
		const parsed = JSON.parse(await readFile(marker, "utf8"));
		return parsed?.owner === "lazyz" && parsed?.path === target && (await exists(target))
			? { kind: "retire-legacy-omo", marker, target }
			: null;
	} catch {
		return null;
	}
}

export async function buildSetupPlan({ dryRun, home, pluginRoot, target }) {
	const paths = setupPaths(home, target);
	const agents = await sourceAgents(pluginRoot, target);
	const legacyRetirement = await legacyOmoRetirement(home);
	return {
		target,
		dryRun,
		home,
		operations: [
			...agents.map((agent) => ({ kind: "install-agent", source: agent.source, target: join(paths.agents, agent.name) })),
			{ kind: "install-cli-link", source: join(pluginRoot, "dist", "cli", "index.js"), target: join(paths.bin, "lazyz") },
			...(legacyRetirement === null ? [] : [legacyRetirement]),
		],
		codexConfigWrites: [],
	};
}

export async function applySetupPlan(plan) {
	const stamp = new Date().toISOString().replaceAll(":", "-");
	const firstAgent = plan.operations.find((operation) => operation.kind === "install-agent");
	const agentDirectory = firstAgent === undefined ? undefined : dirname(firstAgent.target);
	const backupDir = join(agentDirectory ?? join(plan.home, ".local", "bin"), ".lazyz-backups", stamp);
	for (const operation of plan.operations) await assertSetupDirectory(plan.home, dirname(operation.target));
	await assertSetupDirectory(plan.home, backupDir);
	const installed = [];
	for (const operation of plan.operations) {
		await assertSetupDirectory(plan.home, dirname(operation.target));
		if (await exists(operation.target)) {
			await mkdir(backupDir, { recursive: true, mode: 0o700 });
			const info = await lstat(operation.target);
			if (info.isSymbolicLink()) {
				await writeFile(join(backupDir, `${basename(operation.target)}.symlink`), await readlink(operation.target));
			} else {
				await copyFile(operation.target, join(backupDir, basename(operation.target)));
			}
		}
		if (operation.kind === "retire-legacy-omo") {
			await copyFile(operation.marker, join(backupDir, basename(operation.marker)));
			await rm(operation.target, { force: true });
			await rm(operation.marker, { force: true });
			continue;
		}
		if (operation.kind === "install-cli-link") {
			await atomicSymlink(operation.source, operation.target);
			const linkMarker = `${operation.target}.lazyz-owned.json`;
			const markerTemporary = `${linkMarker}.${process.pid}.tmp`;
			await writeFile(
				markerTemporary,
				`${JSON.stringify({ marker: "LAZYZ_GENERATED_CLI_LINK", owner: "lazyz", path: operation.target })}\n`,
				{ mode: 0o600, flag: "wx" },
			);
			await rename(markerTemporary, linkMarker);
		} else await atomicCopy(operation.source, operation.target);
		const content = operation.kind === "install-agent" ? await readFile(operation.source) : Buffer.from(operation.source);
		installed.push({ path: operation.target, sha256: createHash("sha256").update(content).digest("hex") });
	}
	if (agentDirectory) {
		const markerPath = join(agentDirectory, OWNERSHIP_MARKER);
		const temporary = `${markerPath}.${process.pid}.tmp`;
		await writeFile(temporary, `${JSON.stringify({ owner: "lazyz", target: plan.target, installed }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
		await rename(temporary, markerPath);
	}
	return { ...plan, applied: true, backupDir: (await exists(backupDir)) ? backupDir : null };
}
