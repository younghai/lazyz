import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionUIContext } from "../src/core/extensions/index.ts";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { builtInExtensions } from "../src/extensions/index.ts";
import { theme } from "../src/modes/interactive/theme/theme.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

const riskyBashParameters = Type.Object({ command: Type.String() });

function createRiskyBashTool(onExecute: (command: string) => void): AgentTool<typeof riskyBashParameters> {
	return {
		name: "bash",
		label: "Mock bash",
		description: "Records commands without executing them",
		parameters: riskyBashParameters,
		execute: async (_toolCallId, { command }) => {
			onExecute(command);
			return { content: [{ type: "text", text: "recorded" }], details: {} };
		},
	};
}

function createUiContext(confirm: ExtensionUIContext["confirm"]): ExtensionUIContext {
	return {
		select: async () => undefined,
		confirm,
		input: async () => undefined,
		notify: () => {},
		onTerminalInput: () => () => {},
		setStatus: () => {},
		setWorkingMessage: () => {},
		setWorkingVisible: () => {},
		setWorkingIndicator: () => {},
		setHiddenThinkingLabel: () => {},
		setWidget: () => {},
		setFooter: () => {},
		setHeader: () => {},
		setTitle: () => {},
		custom: async <T>() => await new Promise<T>(() => {}),
		pasteToEditor: () => {},
		setEditorText: () => {},
		getEditorText: () => "",
		editor: async () => undefined,
		addAutocompleteProvider: () => {},
		setEditorComponent: () => {},
		getEditorComponent: () => undefined,
		get theme() {
			return theme;
		},
		getAllThemes: () => [],
		getTheme: () => undefined,
		setTheme: () => ({ success: false, error: "Theme switching is not available in this test" }),
		getToolsExpanded: () => false,
		setToolsExpanded: () => {},
	};
}

describe("built-in human gate policy", () => {
	const harnesses: Harness[] = [];
	const fixtureRoots: string[] = [];

	afterEach(() => {
		while (harnesses.length > 0) harnesses.pop()?.cleanup();
		while (fixtureRoots.length > 0) {
			const root = fixtureRoots.pop();
			if (root) rmSync(root, { recursive: true, force: true });
		}
	});

	it("blocks a risky mock tool in a fresh headless session without trusting project extensions", async () => {
		// Given: a fresh project and agent directory with an untrusted project extension.
		const root = join(tmpdir(), `xcode-human-gate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const cwd = join(root, "project");
		const agentDir = join(root, "agent");
		mkdirSync(join(cwd, ".xcode", "extensions"), { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(cwd, ".xcode", "extensions", "project-policy.ts"),
			'export default function projectPolicy(pi) { pi.on("tool_call", () => undefined); }\n',
		);
		fixtureRoots.push(root);

		const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			extensionFactories: builtInExtensions,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
		});
		await resourceLoader.reload({ resolveProjectTrust: async () => false });
		const executed: string[] = [];
		const harness = await createHarness({
			resourceLoader,
			tools: [createRiskyBashTool((command) => executed.push(command))],
		});
		harnesses.push(harness);
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("bash", { command: "rm -rf ./mock-target" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		// When: the headless session handles the model's risky tool call.
		await harness.session.prompt("remove the mock target");

		// Then: the built-in gate intercepts it while the project remains untrusted.
		expect(settingsManager.isProjectTrusted()).toBe(false);
		expect(resourceLoader.getExtensions().extensions.map((extension) => extension.path)).not.toContain(
			join(cwd, ".xcode", "extensions", "project-policy.ts"),
		);
		expect(executed).toEqual([]);
	});

	it("requires a new approval for a different destructive target", async () => {
		// Given: an interactive session whose first destructive operation is approved.
		const executed: string[] = [];
		const confirmations: string[] = [];
		const harness = await createHarness({
			extensionFactories: builtInExtensions,
			tools: [createRiskyBashTool((command) => executed.push(command))],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({
			mode: "tui",
			uiContext: createUiContext(async (_title, message) => {
				confirmations.push(message);
				return true;
			}),
		});
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("bash", { command: "rm -rf ./target-a" }), { stopReason: "toolUse" }),
			fauxAssistantMessage(fauxToolCall("bash", { command: "rm -rf ./target-b" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		// When: a later turn requests the same operation against a different target.
		await harness.session.prompt("remove both mock targets");

		// Then: approval for A does not authorize B.
		expect(executed).toEqual(["rm -rf ./target-a", "rm -rf ./target-b"]);
		expect(confirmations).toHaveLength(2);
		expect(confirmations[0]).toContain("./target-a");
		expect(confirmations[1]).toContain("./target-b");
	});

	it("shows the complete command target in the approval prompt", async () => {
		// Given: a matched mock command whose target appears after 200 characters.
		const confirmations: string[] = [];
		const harness = await createHarness({
			extensionFactories: builtInExtensions,
			tools: [createRiskyBashTool(() => {})],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({
			mode: "tui",
			uiContext: createUiContext(async (_title, message) => {
				confirmations.push(message);
				return false;
			}),
		});
		const target = "target-beyond-200";
		const command = `sudo mock-tool ${"x".repeat(220)} ${target}`;
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("bash", { command }), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		// When: the gate renders the approval request.
		await harness.session.prompt("inspect the harmless mock command");

		// Then: the operator can see the complete target before deciding.
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]).toContain(target);
	});

	it("does not duplicate prompts when the legacy project extension is loaded", async () => {
		// Given: the built-in policy and the trusted legacy project extension are both loaded.
		const root = join(tmpdir(), `xcode-human-gate-duplicate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const cwd = join(root, "project");
		const agentDir = join(root, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		fixtureRoots.push(root);
		const settingsManager = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			extensionFactories: builtInExtensions,
			additionalExtensionPaths: [join(import.meta.dirname, "../../../.xcode/extensions/human-gate.ts")],
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
		});
		await resourceLoader.reload();
		const confirmations: string[] = [];
		const harness = await createHarness({
			resourceLoader,
			tools: [createRiskyBashTool(() => {})],
		});
		harnesses.push(harness);
		await harness.session.bindExtensions({
			mode: "tui",
			uiContext: createUiContext(async (_title, message) => {
				confirmations.push(message);
				return true;
			}),
		});
		harness.setResponses([
			fauxAssistantMessage(fauxToolCall("bash", { command: "rm -rf ./target" }), { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		// When: one risky operation is requested.
		await harness.session.prompt("remove the mock target");

		// Then: only the product-owned built-in policy prompts.
		expect(confirmations).toHaveLength(1);
	});
});
