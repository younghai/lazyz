import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolvePluginRoot(env = process.env, moduleUrl = import.meta.url) {
	const override = env.LAZYZ_PLUGIN_ROOT?.trim();
	if (override) return resolve(override);
	let cursor = dirname(fileURLToPath(moduleUrl));
	for (let depth = 0; depth < 5; depth += 1) {
		if (existsSync(join(cursor, ".zcode-plugin", "plugin.json"))) return cursor;
		cursor = dirname(cursor);
	}
	return dirname(dirname(fileURLToPath(moduleUrl)));
}

export function samePath(left, right) {
	try {
		return realpathSync(left) === realpathSync(right);
	} catch {
		return false;
	}
}
