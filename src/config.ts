import * as vscode from "vscode";

/**
 * Get the custom temperature for a given model
 * @param modelId The model ID to get the temperature for
 * @returns The custom temperature or undefined if not set
 */
export function getModelTemperature(modelId: string): number | undefined {
	const config = vscode.workspace.getConfiguration("synthetic");
	const temperatures = config.get<Record<string, number>>("modelTemperatures");
	return temperatures?.[modelId];
}

/**
 * Set the custom temperature for a given model
 * @param modelId The model ID to set the temperature for
 * @param temperature The temperature value (0-2)
 */
export async function setModelTemperature(modelId: string, temperature: number | undefined): Promise<void> {
	const config = vscode.workspace.getConfiguration("synthetic");
	const temperatures = config.get<Record<string, number>>("modelTemperatures") || {};
	
	if (temperature === undefined) {
		delete temperatures[modelId];
	} else {
		temperatures[modelId] = temperature;
	}
	
	await config.update("modelTemperatures", temperatures, vscode.ConfigurationTarget.Global);
}

/**
 * Show a UI to configure temperature for a model
 */
export async function showTemperatureConfigUI(secrets: vscode.SecretStorage): Promise<void> {
	// First, we need to get the list of available models
	const { SyntheticModelsService } = await import("./syntheticModels.js");
	const modelsService = new SyntheticModelsService("synthetic-vscode-chat/config");
	
	const apiKey = await modelsService.ensureApiKey(secrets, false);
	if (!apiKey) {
		vscode.window.showInformationMessage("Please configure your Synthetic API key first.");
		return;
	}

	try {
		const { models } = await modelsService.fetchModels(apiKey);
		
		if (!models || models.length === 0) {
			vscode.window.showInformationMessage("No models available.");
			return;
		}

		// Show quick pick to select a model
		interface ModelItem {
			label: string;
			description: string;
			modelId: string;
		}
		
		const modelItems: ModelItem[] = models.map((m) => ({
			label: m.id,
			description: getModelTemperature(m.id)?.toFixed(2) || "Default",
			modelId: m.id
		}));

		const selectedModel = await vscode.window.showQuickPick(modelItems, {
			placeHolder: "Select a model to configure temperature",
			ignoreFocusOut: true
		});

		if (!selectedModel) {
			return; // User cancelled
		}

		// Show input box for temperature
		const currentTemp = getModelTemperature(selectedModel.modelId);
		const temperatureInput = await vscode.window.showInputBox({
			title: `Set Temperature for ${selectedModel.modelId}`,
			prompt: "Enter temperature value (0-2, or leave empty to use default)",
			value: currentTemp?.toString() || "",
			validateInput: (value) => {
				if (value === "") {
					return null; // Empty is valid (means use default)
				}
				const num = parseFloat(value);
				if (isNaN(num)) {
					return "Please enter a valid number";
				}
				if (num < 0 || num > 2) {
					return "Temperature must be between 0 and 2";
				}
				return null;
			},
			ignoreFocusOut: true
		});

		if (temperatureInput === undefined) {
			return; // User cancelled
		}

		// Save the temperature
		const temperature = temperatureInput === "" ? undefined : parseFloat(temperatureInput);
		await setModelTemperature(selectedModel.modelId, temperature);

		if (temperature === undefined) {
			vscode.window.showInformationMessage(`Temperature for ${selectedModel.modelId} reset to default.`);
		} else {
			vscode.window.showInformationMessage(`Temperature for ${selectedModel.modelId} set to ${temperature}.`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		vscode.window.showErrorMessage(`Failed to configure temperature: ${errorMessage}`);
	}
}
