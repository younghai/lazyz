import type { InlineExtension } from "../core/extensions/types.ts";
import humanGateExtension from "./human-gate.ts";
import llamaExtension from "./llama/index.ts";

export const builtInExtensions: InlineExtension[] = [
	{ name: "human-gate", factory: humanGateExtension, hidden: true },
	{ name: "llama.cpp", factory: llamaExtension, hidden: true },
];
