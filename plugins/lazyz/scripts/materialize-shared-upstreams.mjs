import { isCliEntry } from "./entry-guard.mjs";

// LazyZ: frontend skill references are already materialized and committed under
// skills/frontend/references/. Upstream ran this step to refresh them from
// shared-skills git submodules (open-design, taste-skill, ui-ux-pro-max,
// designpowers) that LazyZ does not ship. This script is a no-op so the build
// chain does not fail.
export async function materializeSharedUpstreams({ strict }) {
	process.stdout.write("[materialize-shared-upstreams] no-op in LazyZ (frontend refs already committed)\n");
	return { skipped: false };
}

if (isCliEntry(import.meta.url)) {
	const strict = process.env.OMO_MATERIALIZE_STRICT === "1" || process.argv.includes("--strict");
	const result = await materializeSharedUpstreams({ strict });
	if (result.skipped && strict) process.exit(1);
}

