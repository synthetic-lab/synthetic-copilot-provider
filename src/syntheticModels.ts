import type { SyntheticModelItem, SyntheticModelsResponse, SyntheticModelDetails } from "./types";

const BASE_URL = "https://api.synthetic.new/openai/v1";
const DEFAULT_CONTEXT_LENGTH = 128000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

/**
 * Service for handling model fetching and hydration from Synthetic API
 */
export class SyntheticModelsService {
    private _modelDetailsCache: Record<string, SyntheticModelDetails> | null = null;

    constructor(private readonly userAgent: string) {}

    /**
     * Fetch the list of models and supplementary metadata from Synthetic.
     * @param apiKey The Synthetic API key used to authenticate.
     */
    async fetchModels(apiKey: string): Promise<{ models: SyntheticModelItem[] }> {
        console.debug("[Synthetic Model Provider] fetchModels called with apiKey:", apiKey);
        try {
            const response = await fetch(`${BASE_URL}/models`, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "User-Agent": this.userAgent,
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("[Synthetic Model Provider] Failed to fetch Synthetic models", {
                    status: response.status,
                    statusText: response.statusText,
                    detail: errorText,
                });
                throw new Error(
                    `Failed to fetch Synthetic models: ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${errorText ? `\n${errorText}` : ""}`
                );
            }

            const data = await response.json() as SyntheticModelsResponse;
            const models = data?.data ?? [];
            console.debug("[Synthetic Model Provider] fetchModels succeeded", { count: models.length });
            return { models };
        } catch (error) {
            if (error instanceof Error) {
                console.error("[Synthetic Model Provider] Failed to fetch Synthetic models", error);
                throw error;
            }
            console.error("[Synthetic Model Provider] Failed to fetch Synthetic models", error);
            console.debug("[Synthetic Model Provider] fetchModels throwing error");
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
                const data = await response!.json() as { synthetic: { models: Record<string, SyntheticModelDetails> } };
                this._modelDetailsCache = data.synthetic.models;
            }
            const modelDetails = this._modelDetailsCache![modelId];

            if (!modelDetails) {
                console.debug('[Synthetic Model Provider] Model details not found for model ID', modelId);
                return null;
            }

            // Filter out models where tool_call is false
            if (!modelDetails.tool_call) {
                console.debug('[Synthetic Model Provider] Model does not support tool calling, skipping', modelId);
                return null;
            }

            console.debug('[Synthetic Model Provider] Hydrating model details for model ID', modelId);

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
            console.error('[Synthetic Model Provider] Failed to load model details', error);
            return null;
        }
    }
}
