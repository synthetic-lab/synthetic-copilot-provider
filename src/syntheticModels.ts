import * as vscode from "vscode";
import type { SyntheticModelDetails, SyntheticModelDevDetails } from "./types";
import { SyntheticModelsResponseSchema, SyntheticModelsDevApiResponseSchema } from "./types";
import { CancellationToken, LanguageModelChatInformation } from "vscode";
import { tryit } from "radash";

export const BASE_URL = "https://api.synthetic.new/openai/v1";
export const DEFAULT_CONTEXT_LENGTH = 128000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
export const MAX_TOOLS = 128;

type BaseCapabilities = import("vscode").LanguageModelChatInformation["capabilities"];
type ExtendedCapabilities = BaseCapabilities & { supportsThinking?: boolean };

const DEFAULT_CAPABILITIES: ExtendedCapabilities = {
	toolCalling: false,
	imageInput: false,
	supportsThinking: false,
};

export const DEFAULT_MODEL_DETAILS = {
	tooltip: "Synthetic",
	family: "synthetic",
	detail: "Synthetic.new",
	version: "1.0.0",
	maxInputTokens: DEFAULT_CONTEXT_LENGTH,
	maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
	capabilities: DEFAULT_CAPABILITIES,
} satisfies Partial<import("vscode").LanguageModelChatInformation>;

/**
 * Service for handling model fetching and hydration from Synthetic API
 */
export class SyntheticModelsService {
	private _modelDetailsCache: Record<string, SyntheticModelDevDetails> | null = null;
	// Lock to prevent parallel fetches from models.dev
	private _fetchingModelDetails: Promise<void> | null = null;
	// Cache for the list of models to avoid fetching on every request
	private _modelsCache: { models: SyntheticModelDetails[]; fetchedAt: number } | null = null;
	// Cache TTL (e.g., 5 minutes)
	private static readonly MODELS_CACHE_TTL_MS = 5 * 60 * 1000;

	constructor(private readonly userAgent: string) {}

	/**
	 * Ensure an API key exists in SecretStorage, optionally prompting the user when not silent.
	 * @param secrets VS Code secret storage.
	 * @param silent If true, do not prompt the user.
	 */
	async ensureApiKey(secrets: vscode.SecretStorage, silent: boolean): Promise<string | undefined> {
		let apiKey = await secrets.get("synthetic.apiKey");
		// Always fallback to environment variable (not a user prompt)
		if (!apiKey && process.env.SYNTHETIC_API_KEY) {
			apiKey = process.env.SYNTHETIC_API_KEY;
		}
		if (!apiKey && !silent) {
			const entered = await vscode.window.showInputBox({
				title: "Synthetic API Key",
				prompt: "Enter your Synthetic API key",
				ignoreFocusOut: true,
				password: true,
			});
			if (entered && entered.trim()) {
				apiKey = entered.trim();
				await secrets.store("synthetic.apiKey", apiKey);
			}
		}
		return apiKey;
	}

	/**
	 * Fetch the list of models and supplementary metadata from Synthetic.
	 * @param apiKey The Synthetic API key used to authenticate.
	 */
	async fetchModels(apiKey: string): Promise<{ models: SyntheticModelDetails[] }> {
		// Use cached models if still fresh (skip caching in test environment)
		if (process.env.NODE_ENV !== "test") {
			const now = Date.now();
			if (this._modelsCache && now - this._modelsCache.fetchedAt < SyntheticModelsService.MODELS_CACHE_TTL_MS) {
				return { models: this._modelsCache.models };
			}
		}
		try {
			// Fetch with timeout
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
			let response;
			try {
				response = await fetch(`${BASE_URL}/models`, {
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"User-Agent": this.userAgent,
					},
					signal: controller.signal,
				});
			} finally {
				clearTimeout(timeoutId);
			}
			if (!response.ok) {
				const errorText = await response.text();
				console.error("[Synthetic Model Provider] Failed to fetch Synthetic models", {
					status: response.status,
					statusText: response.statusText,
					detail: errorText,
				});

				// Emit user-friendly error message
				vscode.window.showInformationMessage(
					`Failed to fetch models from Synthetic (${response.status}): ${response.statusText || "Network error"}. Please check your API key and internet connection.`
				);

				throw new Error(
					`Failed to fetch Synthetic models: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${errorText ? `\n${errorText}` : ""}`
				);
			}

			// Fetch and PARSE the data using the schema
			const rawData = await response.json();
			const [err, data] = tryit(() => SyntheticModelsResponseSchema.parse(rawData))();
			if (err) {
				console.error("[Synthetic Model Provider] Model data validation failed:", err);

				// Emit user-friendly error message
				vscode.window.showInformationMessage(
					`Failed to parse model data from Synthetic API. The API response format may have changed. Please try again later.`
				);

				throw new Error(
					`Invalid API response format from Synthetic: ${err instanceof Error ? err.message : "Unknown validation error"}`
				);
			}

			const models = data?.data;
			if (!models || models.length === 0) {
				throw new Error("No models data found in validated API response");
			}
			// Update cache
			this._modelsCache = { models, fetchedAt: Date.now() };
			return { models };
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw error;
		}
	}

	/**
	 * Fetch model details from models.dev API with retries. Only one fetch runs at a time.
	 */
	private async _fetchModelDetailsFromApi(): Promise<void> {
		let response: Response | null = null;
		const maxRetries = 3;
		let attempt = 0;

		while (attempt < maxRetries) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000);

				response = await fetch("https://models.dev/api.json", {
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				break;
			} catch (err) {
				attempt++;
				if (attempt >= maxRetries) {
					console.error("[Synthetic Model Provider] Failed to fetch model details after retries:", err);
					// Note: We don't emit user messages here since this is a fallback operation
					// and will be handled gracefully by returning null
					throw err;
				}
				// Optionally add a delay before retrying
				await new Promise((res) => setTimeout(res, 500 * attempt));
			}
		}

		const rawData = await response!.json();
		const [err, data] = tryit(() => SyntheticModelsDevApiResponseSchema.parse(rawData))();
		if (err) {
			console.error("[Synthetic Model Provider] Model details validation failed:", err);
			// Note: We don't emit user messages here since this is a fallback operation
			// and the main error handling in prepareLanguageModelChatInformation will handle user notification
			throw new Error(
				`Invalid model details API response format: ${err instanceof Error ? err.message : "Unknown validation error"}`
			);
		}

		this._modelDetailsCache = data.synthetic.models;
	}

	/**
	 * Build hydrated info from cached model details. Returns null if model not found or tool_call is false.
	 */
	private _buildHydratedInfo(modelId: string): Partial<import("vscode").LanguageModelChatInformation> | null {
		if (!this._modelDetailsCache) {
			return null;
		}

		const modelDetails = this._modelDetailsCache[modelId];

		if (!modelDetails) {
			return null;
		}

		// Filter out models where tool_call is false
		if (!modelDetails.tool_call) {
			return null;
		}

		// Map model details to LanguageModelChatInformation properties
		const capabilities: ExtendedCapabilities = {
			toolCalling: modelDetails.tool_call || false,
			imageInput: modelDetails.modalities?.input?.includes("image") || false,
			supportsThinking: modelDetails.reasoning || false,
		};

		const hydratedInfo: Partial<import("vscode").LanguageModelChatInformation> = {
			name: modelDetails.name,
			tooltip: modelDetails.name,
			family: "synthetic",
			version: "1.0.0",
			maxInputTokens: modelDetails.limit?.context || DEFAULT_CONTEXT_LENGTH,
			maxOutputTokens: modelDetails.limit?.output || DEFAULT_MAX_OUTPUT_TOKENS,
			capabilities,
		};

		return hydratedInfo;
	}

	/**
	 * Hydrate model information using the model details from https://models.dev/api.json
	 * @param modelId The model ID to hydrate
	 * @returns The hydrated model information or null if not found or tool_call is false
	 */
	async hydrateModelId(modelId: string): Promise<Partial<import("vscode").LanguageModelChatInformation> | null> {
		try {
			// If cache is already populated, just build info directly
			if (this._modelDetailsCache) {
				return this._buildHydratedInfo(modelId);
			}

			// Use a lock promise so parallel calls don't all race to fetch
			if (!this._fetchingModelDetails) {
				// First call — start the fetch
				this._fetchingModelDetails = this._fetchModelDetailsFromApi();
			}

			// Wait for the fetch (first caller or subsequent callers)
			await this._fetchingModelDetails;
			this._fetchingModelDetails = null;

			return this._buildHydratedInfo(modelId);
		} catch (error) {
			this._fetchingModelDetails = null;
			console.error("[Synthetic Model Provider] Failed to hydrate model ID:", modelId, error);
			return null;
		}
	}

	/**
	 * Get the list of available language models contributed by this provider
	 * @param secrets VS Code secret storage
	 * @param options Options which specify the calling context of this function
	 * @param token A cancellation token which signals if the user cancelled the request or not
	 * @returns A promise that resolves to the list of available language models
	 */
	async prepareLanguageModelChatInformation(
		secrets: vscode.SecretStorage,
		options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.ensureApiKey(secrets, options.silent);
		if (!apiKey) {
			return [];
		}

		let models;
		try {
			const result = await this.fetchModels(apiKey);
			models = result.models;
		} catch (error) {
			console.error("[Synthetic Model Provider] Failed to prepare model information:", error);

			if (!options.silent) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
				vscode.window.showInformationMessage(
					`Unable to load Synthetic models: ${errorMessage}. Please check your API key and try again.`
				);
			}

			return [];
		}

		const infos: LanguageModelChatInformation[] = [];

		// Hydrate models in parallel for speed
		const hydrationPromises = models.map(async (m) => {
			try {
				// Try to hydrate model information
				const hydratedInfo = await this.hydrateModelId(m.id);

				// Use hydrated information if available, otherwise fall back to defaults
				const modelInfo = { ...DEFAULT_MODEL_DETAILS, ...hydratedInfo };

				const contextLen = modelInfo.maxInputTokens || DEFAULT_CONTEXT_LENGTH;
				const maxOutput = modelInfo.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS;

				const supportsThinking = Boolean(
					(modelInfo.capabilities as { supportsThinking?: boolean } | undefined)?.supportsThinking
				);
				const capabilitiesFinal: ExtendedCapabilities = {
					toolCalling: modelInfo.capabilities?.toolCalling || false,
					imageInput: modelInfo.capabilities?.imageInput || false,
					supportsThinking,
				};

				const modelInfo_final = {
					id: m.id,
					name: modelInfo.name || m.id,
					tooltip: modelInfo.tooltip || "Synthetic",
					detail: modelInfo.detail || "Synthetic.new",
					family: modelInfo.family || "synthetic",
					version: modelInfo.version || "1.0.0",
					maxInputTokens: contextLen,
					maxOutputTokens: maxOutput,
					capabilities: capabilitiesFinal,
				} satisfies LanguageModelChatInformation;

				infos.push(modelInfo_final);
			} catch (error) {
				console.error(`[Synthetic Model Provider] Failed to process model ${m.id}:`, error);
				// Skip models that can't be processed - don't add them to the list
			}
		});

		// Wait for all hydration to complete in parallel
		await Promise.allSettled(hydrationPromises);

		return infos;
	}
}
