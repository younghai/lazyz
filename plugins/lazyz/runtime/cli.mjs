#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { CliUsageError, parseFlags } from "./arguments.mjs";
import { runDoctor } from "./doctor.mjs";
import { resolvePluginRoot } from "./paths.mjs";
import { applySetupPlan, buildSetupPlan } from "./setup.mjs";
import { ZCODE_HOST_CONTRACT } from "./zcode-contract.mjs";

const HELP = `LazyZ command line

Usage:
  lazyz doctor [--json]
  lazyz capabilities [--json]
  lazyz setup [--target zcode|codex] [--dry-run] [--yes] [--json]
  lazyz ulw-loop <subcommand> [args]
  lazyz codegraph sweep --dry-run [--json]
  lazyz help | --help | -h
`;

function writeResult(value, json) {
	if (json) {
		process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
		return;
	}
	process.stdout.write(`${value.product ?? "LazyZ"}: ${value.ok === false ? "issues found" : "ok"}\n`);
	for (const check of value.checks ?? []) process.stdout.write(`  ${check.status.toUpperCase()} ${check.id}${check.message ? `: ${check.message}` : ""}\n`);
}

async function doctorCommand(args, context) {
	const parsed = parseFlags(args, new Map([["--json", "boolean"]]));
	if (parsed.positional.length > 0) throw new CliUsageError("doctor does not accept positional arguments");
	const report = await runDoctor(context);
	writeResult(report, parsed.flags.has("--json"));
	return report.ok ? 0 : 1;
}

async function setupCommand(args, context) {
	const parsed = parseFlags(
		args,
		new Map([
			["--dry-run", "boolean"],
			["--yes", "boolean"],
			["--json", "boolean"],
			["--target", "value"],
		]),
	);
	if (parsed.positional.length > 0) throw new CliUsageError("setup does not accept positional arguments");
	const target = parsed.flags.get("--target") ?? "zcode";
	if (target !== "zcode" && target !== "codex") throw new CliUsageError("--target must be zcode or codex");
	const dryRun = parsed.flags.has("--dry-run");
	if (!dryRun && !parsed.flags.has("--yes")) {
		throw new CliUsageError("setup requires explicit consent: pass --yes, or inspect changes with --dry-run");
	}
	const plan = await buildSetupPlan({ ...context, dryRun, target });
	const report = dryRun ? plan : await applySetupPlan(plan);
	if (parsed.flags.has("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	else process.stdout.write(`[LazyZ] ${dryRun ? "planned" : "completed"} ${target} setup (${plan.operations.length} operations)\n`);
	return 0;
}

function ulwLoopCommand(args, pluginRoot) {
	const entrypoint = join(pluginRoot, "components", "ulw-loop", "dist", "cli.js");
	const result = spawnSync(process.execPath, [entrypoint, "ulw-loop", ...args], { stdio: "inherit" });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function codegraphCommand(args, pluginRoot) {
	if (args[0] !== "sweep") throw new CliUsageError("codegraph requires the sweep subcommand");
	const parsed = parseFlags(
		args.slice(1),
		new Map([
			["--dry-run", "boolean"],
			["--json", "boolean"],
		]),
	);
	if (parsed.positional.length > 0 || !parsed.flags.has("--dry-run")) {
		throw new CliUsageError("the LazyZ root surface only permits codegraph sweep --dry-run");
	}
	const entrypoint = join(pluginRoot, "components", "codegraph", "dist", "cli.js");
	const result = spawnSync(process.execPath, [entrypoint, ...args], { stdio: "inherit" });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

export async function runCli(args = process.argv.slice(2), env = process.env) {
	const command = args[0];
	if (command === undefined || command === "help" || command === "--help" || command === "-h") {
		process.stdout.write(HELP);
		return 0;
	}
	const context = { env, home: env.HOME?.trim() || homedir(), pluginRoot: resolvePluginRoot(env) };
	if (command === "doctor") return doctorCommand(args.slice(1), context);
	if (command === "capabilities") {
		const parsed = parseFlags(args.slice(1), new Map([["--json", "boolean"]]));
		if (parsed.positional.length > 0) throw new CliUsageError("capabilities does not accept positional arguments");
		process.stdout.write(parsed.flags.has("--json")
			? `${JSON.stringify(ZCODE_HOST_CONTRACT, null, 2)}\n`
			: `LazyZ: ZCode ${ZCODE_HOST_CONTRACT.sourceVersion} source contract (${ZCODE_HOST_CONTRACT.reviewedAt})\nDirect process hooks; inherited agent model; governed agents run in foreground.\nStop continuation limit: ${ZCODE_HOST_CONTRACT.stopConsecutiveBlockLimit}. Installed host is not probed.\n`);
		return 0;
	}
	if (command === "setup") return setupCommand(args.slice(1), context);
	if (command === "ulw-loop") return ulwLoopCommand(args.slice(1), context.pluginRoot);
	if (command === "codegraph") return codegraphCommand(args.slice(1), context.pluginRoot);
	throw new CliUsageError(`unknown command: ${command}`);
}

runCli()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error) => {
		if (error instanceof CliUsageError) {
			process.stderr.write(`[LazyZ] ${error.message}\n${HELP}`);
			process.exitCode = 2;
			return;
		}
		process.stderr.write(`[LazyZ] ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
