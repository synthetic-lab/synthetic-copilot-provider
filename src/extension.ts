import * as vscode from "vscode";
import { SyntheticChatModelProvider } from "./provider";

export function activate(context: vscode.ExtensionContext) {
	// Build a descriptive User-Agent to help quantify API usage
	const ext = vscode.extensions.getExtension("synthetic-vscode-chat");
	const extVersion = ext?.packageJSON?.version ?? "unknown";
	const vscodeVersion = vscode.version;
	// Keep UA minimal: only extension version and VS Code version
	const ua = `synthetic-vscode-chat/${extVersion} VSCode/${vscodeVersion}`;

	const provider = new SyntheticChatModelProvider(context.secrets, ua);
	// Register the Synthetic provider under the vendor id used in package.json
	vscode.lm.registerLanguageModelChatProvider("synthetic", provider);
	// Management command to configure API key
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
				return; // user canceled
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
}

export function deactivate() { }
