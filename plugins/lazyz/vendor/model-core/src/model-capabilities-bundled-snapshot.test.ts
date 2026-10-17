import { describe, expect, test } from "bun:test"

import type { ModelCapabilitiesSnapshot, ModelCapabilitiesSnapshotEntry } from "./model-capabilities"
import { getBundledModelCapabilitiesSnapshot, getModelCapabilities } from "./model-capabilities"
import bundledModelCapabilitiesSnapshotJson from "../test/fixtures/model-capabilities.generated.json"

function createSnapshot(
  models: ModelCapabilitiesSnapshot["models"],
): ModelCapabilitiesSnapshot {
  return {
    generatedAt: "test",
    sourceUrl: "https://models.dev/api.json",
    models,
  }
}

const KIMI_K2_5_ENTRY: ModelCapabilitiesSnapshotEntry = {
  id: "kimi-k2.5",
  family: "kimi-thinking",
  reasoning: true,
  temperature: true,
  toolCall: true,
  modalities: { input: ["text", "image", "video"], output: ["text"] },
  limit: { context: 256000, output: 256000 },
}

const GPT_5_4_MINI_ENTRY: ModelCapabilitiesSnapshotEntry = {
  id: "gpt-5-4-mini",
  family: "gpt-mini",
  reasoning: true,
  temperature: false,
  toolCall: true,
  modalities: { input: ["text", "image"], output: ["text"] },
  limit: { context: 400000, input: 272000, output: 128000 },
}

describe("bundled model capabilities snapshot", () => {
  test("copies authentic snapshot metadata to provider-native model IDs", () => {
    // given
    const snapshot = createSnapshot({
      "kimi-k2.5": KIMI_K2_5_ENTRY,
      "gpt-5-4-mini": GPT_5_4_MINI_ENTRY,
    })

    // when
    const result = getBundledModelCapabilitiesSnapshot(snapshot)

    // then
    expect(result.models["k2p5"]).toEqual({ ...KIMI_K2_5_ENTRY, id: "k2p5" })
    expect(result.models["gpt-5.4-mini"]).toEqual({
      ...GPT_5_4_MINI_ENTRY,
      id: "gpt-5.4-mini",
    })
    expect(result.models["kimi-k2.5"]).toBe(KIMI_K2_5_ENTRY)
    expect(result.models["gpt-5-4-mini"]).toBe(GPT_5_4_MINI_ENTRY)
  })

  test("preserves exact canonical entries instead of replacing them with metadata aliases", () => {
    // given
    const canonicalKimiEntry = { ...KIMI_K2_5_ENTRY, id: "k2p5", limit: { output: 1 } }
    const canonicalGptEntry = { ...GPT_5_4_MINI_ENTRY, id: "gpt-5.4-mini", limit: { output: 2 } }
    const snapshot = createSnapshot({
      "kimi-k2.5": KIMI_K2_5_ENTRY,
      "k2p5": canonicalKimiEntry,
      "gpt-5-4-mini": GPT_5_4_MINI_ENTRY,
      "gpt-5.4-mini": canonicalGptEntry,
    })

    // when
    const result = getBundledModelCapabilitiesSnapshot(snapshot)

    // then
    expect(result.models["k2p5"]).toBe(canonicalKimiEntry)
    expect(result.models["gpt-5.4-mini"]).toBe(canonicalGptEntry)
  })

  test("does not mutate input metadata or invent aliases without authentic source entries", () => {
    // given
    const snapshot = createSnapshot({ "kimi-k2.5": KIMI_K2_5_ENTRY })
    const originalSnapshot = structuredClone(snapshot)

    // when
    const result = getBundledModelCapabilitiesSnapshot(snapshot)
    result.models["k2p5"]!.modalities!.input!.push("audio")
    result.models["k2p5"]!.limit!.output = 1

    // then
    expect(snapshot).toEqual(originalSnapshot)
    expect(result.models["gpt-5.4-mini"]).toBeUndefined()
    expect(result.models["gpt-5-4-mini"]).toBeUndefined()
  })

  test("keeps GPT-4.1 OpenAI variants marked as supporting tool calls", () => {
    // given
    const bundledSnapshot = getBundledModelCapabilitiesSnapshot(bundledModelCapabilitiesSnapshotJson)
    const modelIDs = [
      "openai/gpt-4.1",
      "openai/gpt-4.1-mini",
      "openai/gpt-4.1-nano",
    ]

    // when
    const results = modelIDs.map((modelID) =>
      getModelCapabilities({
        providerID: "openai",
        modelID,
        bundledSnapshot,
      }),
    )

    // then
    for (const result of results) {
      expect(result.toolCall).toBe(true)
      expect(result.diagnostics).toMatchObject({
        resolutionMode: "snapshot-backed",
        snapshot: { source: "bundled-snapshot" },
        toolCall: { source: "bundled-snapshot" },
      })
    }
  })
})
