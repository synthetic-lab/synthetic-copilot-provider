import * as vscode from "vscode";
import type { SyntheticModelItem, SyntheticModelsResponse, SyntheticModelDetails, ValidatedSyntheticModelsResponse, ValidatedModelDetailsApiResponse } from "./types";
import { SyntheticModelsResponseSchema, ModelDetailsApiResponseSchema } from "./types";
import { CancellationToken, LanguageModelChatInformation } from "vscode";
import { z } from "zod";

export const BASE_URL = "https://api.synthetic.new/openai/v1";
export const DEFAULT_CONTEXT_LENGTH = 128000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
export const MAX_TOOLS = 128;

export const DEFAULT_MODEL_DETAILS = {
	tooltip: "Synthetic",
	family: "synthetic",
	detail: "Synthetic.new",
	version: "1.0.0",
	maxInputTokens: DEFAULT_CONTEXT_LENGTH,
	maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
	capabilities: {
		toolCalling: false,
		imageInput: false,
	},
} satisfies Partial<import("vscode").LanguageModelChatInformation>;

/**
 * Service for handling model fetching and hydration from Synthetic API
 */
export class SyntheticModelsService {
    private _modelDetailsCache: Record<string, SyntheticModelDetails> | null = null;

    constructor(private readonly userAgent: string) {}

    /**
     * Ensure an API key exists in SecretStorage, optionally prompting the user when not silent.
     * @param secrets VS Code secret storage.
     * @param silent If true, do not prompt the user.
     */
    async ensureApiKey(secrets: vscode.SecretStorage, silent: boolean): Promise<string | undefined> {
        let apiKey = await secrets.get("synthetic.apiKey");
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
    async fetchModels(apiKey: string): Promise<{ models: SyntheticModelItem[] }> {
			try {
				const response = await fetch(`${BASE_URL}/models`, {
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"User-Agent": this.userAgent,
					},
				});            if (!response.ok) {
                const errorText = await response.text();
                // console.error("[Synthetic Model Provider] Failed to fetch Synthetic models", {
                //     status: response.status,
                //     statusText: response.statusText,
                //     detail: errorText,
                // });
                throw new Error(
                    `Failed to fetch Synthetic models: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${errorText ? `\n${errorText}` : ""}`
                );
            }

            // Fetch and PARSE the data using the schema
            const rawData = await response.json();
            let data: ValidatedSyntheticModelsResponse;

            try {
                data = SyntheticModelsResponseSchema.parse(rawData); // This line validates!
            } catch (validationError) {
                throw new Error(
                    `Invalid API response format from Synthetic: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
                );
            }

            const models = data?.data;
            if (!models || models.length === 0) {
                throw new Error("No models data found in validated API response");
            }
            return { models };
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw error;
        }
    }

	/**
	 * Hydrate model information using the model details from https://models.dev/api.json
	 * @param modelId The model ID to hydrate
	 * @returns The hydrated model information or null if not found or tool_call is false
	 */
	async hydrateModelId(modelId: string): Promise<Partial<import("vscode").LanguageModelChatInformation> | null> {
		try {
			if (!this._modelDetailsCache) {
				let response;
				const maxRetries = 3;
				let attempt = 0;
				while (attempt < maxRetries) {
					try {
						const controller = new AbortController();
						const timeoutId = setTimeout(() => controller.abort(), 5000);

						response = await fetch('https://models.dev/api.json', {
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
							throw err;
						}
						// Optionally add a delay before retrying
						await new Promise(res => setTimeout(res, 500 * attempt));
					}
				}

				// Fetch and PARSE the data using the schema
				const rawData = await response!.json();
				let data: ValidatedModelDetailsApiResponse;

				try {
					data = ModelDetailsApiResponseSchema.parse(rawData); // This line validates!
				} catch (validationError) {
					throw new Error(
						`Invalid model details API response format: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
					);
				}

				this._modelDetailsCache = data.synthetic.models;
			}
			const modelDetails = this._modelDetailsCache![modelId];

			if (!modelDetails) {
				return null;
			}

			// Filter out models where tool_call is false
			if (!modelDetails.tool_call) {
				return null;
			}


			// Map model details to LanguageModelChatInformation properties
			const hydratedInfo: Partial<import("vscode").LanguageModelChatInformation> = {
				name: modelDetails.name,
				tooltip: modelDetails.name,
				family: "synthetic",
				version: "1.0.0",
				maxInputTokens: modelDetails.limit?.context || DEFAULT_CONTEXT_LENGTH,
				maxOutputTokens: modelDetails.limit?.output || DEFAULT_MAX_OUTPUT_TOKENS,
				capabilities: {
					toolCalling: modelDetails.tool_call || false,
					imageInput: modelDetails.modalities?.input?.includes('image') || false,
				},
			};

			return hydratedInfo;
		} catch (error) {
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

		const { models } = await this.fetchModels(apiKey);

		const infos: LanguageModelChatInformation[] = await Promise.all(
			models.map(async (m) => {

				// Try to hydrate model information
				const hydratedInfo = await this.hydrateModelId(m.id);

				// Use hydrated information if available, otherwise fall back to defaults
				const modelInfo = { ...DEFAULT_MODEL_DETAILS, ...hydratedInfo };

				const contextLen = modelInfo.maxInputTokens || DEFAULT_CONTEXT_LENGTH;
				const maxOutput = modelInfo.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS;

				return {
					id: m.id,
					name: modelInfo.name || m.id,
					tooltip: modelInfo.tooltip || "Synthetic",
					detail: modelInfo.detail || "Synthetic.new",
					family: modelInfo.family || "synthetic",
					version: modelInfo.version || "1.0.0",
					maxInputTokens: contextLen,
					maxOutputTokens: maxOutput,
					capabilities: {
						toolCalling: modelInfo.capabilities?.toolCalling || false,
						imageInput: modelInfo.capabilities?.imageInput || false,
					},
				} satisfies LanguageModelChatInformation;
			})
		);

		return infos;
	}
}