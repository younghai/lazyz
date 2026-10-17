import type { VariantTable } from "./types"
import defaultPrompt from "../prompts/atlas/default.md" with { type: "text" }
import geminiPrompt from "../prompts/atlas/gemini.md" with { type: "text" }
import glmPrompt from "../prompts/atlas/glm.md" with { type: "text" }
import gptPrompt from "../prompts/atlas/gpt.md" with { type: "text" }
import kimiPrompt from "../prompts/atlas/kimi.md" with { type: "text" }
import kimiK27Prompt from "../prompts/atlas/kimi-k2-7.md" with { type: "text" }
import opus47Prompt from "../prompts/atlas/opus-4-7.md" with { type: "text" }

export const atlasPromptVariants = {
  "opus-4-7": {
    kind: "bundled",
    content: opus47Prompt,
    filePath: "packages/prompts-core/prompts/atlas/opus-4-7.md",
  },
  gpt: {
    kind: "bundled",
    content: gptPrompt,
    filePath: "packages/prompts-core/prompts/atlas/gpt.md",
  },
  gemini: {
    kind: "bundled",
    content: geminiPrompt,
    filePath: "packages/prompts-core/prompts/atlas/gemini.md",
  },
  "kimi-k2-7": {
    kind: "bundled",
    content: kimiK27Prompt,
    filePath: "packages/prompts-core/prompts/atlas/kimi-k2-7.md",
  },
  kimi: {
    kind: "bundled",
    content: kimiPrompt,
    filePath: "packages/prompts-core/prompts/atlas/kimi.md",
  },
  glm: {
    kind: "bundled",
    content: glmPrompt,
    filePath: "packages/prompts-core/prompts/atlas/glm.md",
  },
  default: {
    kind: "bundled",
    content: defaultPrompt,
    filePath: "packages/prompts-core/prompts/atlas/default.md",
  },
} satisfies VariantTable
