import * as vscode from "vscode";
import { SyntheticChatModelProvider } from "./provider";
import { showTemperatureConfigUI } from "./config";

export async function activate(context: vscode.ExtensionContext) {
	console.log("[Synthetic] Extension activating...");
	const ext = vscode.extensions.getExtension("synthetic-vscode-chat");
	const extVersion = ext?.packageJSON?.version ?? "unknown";
	const vscodeVersion = vscode.version;
	const ua = `synthetic-vscode-chat/${extVersion} VSCode/${vscodeVersion}`;

	const provider = new SyntheticChatModelProvider(context.secrets, ua);

	// Register the Synthetic provider IMMEDIATELY — don't block activation.
	vscode.lm.registerLanguageModelChatProvider("synthetic", provider);
	console.log("[Synthetic] Provider registered, extension activated");

	// Prefetch models in the BACKGROUND (non-blocking).
	// If VS Code calls provideLanguageModelChatInformation before prefetch completes,
	// the fetch lock ensures only one fetch runs and both paths wait for the same result.
	provider.prefetchModels().catch((err) => {
		console.warn("[Synthetic] Model prefetch failed (will retry on demand):", err);
	});

	context.subscriptions.push(
		vscode.commands.registerCommand("synthetic.manage", async () => {
			const existing = await context.secrets.get("synthetic.apiKey");
			const apiKey = await vscode.window.showInputBox({
				title: "Synthetic API Key",
				prompt: existing ? "Update your Synthetic API key" : "Enter your Synthetic API key",
				ignoreFocusOut: true,
				password: true,
				value: existing ?? "",
			});
			if (apiKey === undefined) {
				return;
			}
			if (!apiKey.trim()) {
				await context.secrets.delete("synthetic.apiKey");
				vscode.window.showInformationMessage("Synthetic API key cleared.");
				return;
			}
			await context.secrets.store("synthetic.apiKey", apiKey.trim());
			vscode.window.showInformationMessage("Synthetic API key saved.");
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("synthetic.configureTemperature", async () => {
			await showTemperatureConfigUI(context.secrets);
		})
	);
}

export function deactivate() {}
