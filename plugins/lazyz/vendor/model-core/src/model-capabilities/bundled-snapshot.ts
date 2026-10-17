import { SUPPLEMENTAL_MODEL_CAPABILITIES } from "./supplemental-entries"
import type { ModelCapabilitiesSnapshot, ModelCapabilitiesSnapshotEntry } from "./types"

const BUNDLED_SNAPSHOT_METADATA_ALIASES = [
	{ canonicalModelID: "gpt-5.4-mini", snapshotModelID: "gpt-5-4-mini" },
	{ canonicalModelID: "k2p5", snapshotModelID: "kimi-k2.5" },
] as const

function copySnapshotEntry(
	entry: ModelCapabilitiesSnapshotEntry,
	id: string,
): ModelCapabilitiesSnapshotEntry {
	return {
		...entry,
		id,
		...(entry.modalities
			? {
				modalities: {
					...(entry.modalities.input ? { input: [...entry.modalities.input] } : {}),
					...(entry.modalities.output ? { output: [...entry.modalities.output] } : {}),
				},
			}
			: {}),
		...(entry.limit ? { limit: { ...entry.limit } } : {}),
	}
}

export function getBundledModelCapabilitiesSnapshot(
	snapshotJson: ModelCapabilitiesSnapshot,
): ModelCapabilitiesSnapshot {
	const models = {
		...snapshotJson.models,
		...SUPPLEMENTAL_MODEL_CAPABILITIES,
	}

	for (const { canonicalModelID, snapshotModelID } of BUNDLED_SNAPSHOT_METADATA_ALIASES) {
		if (models[canonicalModelID]) continue

		const snapshotEntry = snapshotJson.models[snapshotModelID]
		if (!snapshotEntry) continue

		models[canonicalModelID] = copySnapshotEntry(snapshotEntry, canonicalModelID)
	}

	return {
		...snapshotJson,
		models,
	}
}
