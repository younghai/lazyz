import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { codexUltraworkPromptVariants, ultraworkPromptVariants } from "./index"

describe("ultrawork prompt variants", () => {
  test("#given package surface #when inspected #then OpenCode and Codex ultrawork variants are exported", () => {
    // given
    const codexPromptPath = "packages/prompts-core/prompts/ultrawork/codex.md"
    const localCodexPromptUrl = new URL("../prompts/ultrawork/codex.md", import.meta.url)

    // when
    const ultraworkVariantNames = Object.keys(ultraworkPromptVariants)
    const codexVariant = codexUltraworkPromptVariants.codex

    // then
    expect(ultraworkVariantNames).toEqual(["planner", "gpt", "gemini", "glm", "default"])
    expect(codexVariant.kind).toBe("bundled")
    expect(codexVariant.filePath).toBe(codexPromptPath)
    expect(codexVariant.content).toBe(readFileSync(localCodexPromptUrl, "utf8"))
  })
})
