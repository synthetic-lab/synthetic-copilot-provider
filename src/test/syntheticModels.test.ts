import * as assert from "assert";
import * as vscode from "vscode";
import { SyntheticModelsService, BASE_URL, DEFAULT_CONTEXT_LENGTH, DEFAULT_MAX_OUTPUT_TOKENS } from "../syntheticModels";

suite("Synthetic Models Service Tests", () => {
	let modelsService: SyntheticModelsService;

	setup(() => {
		modelsService = new SyntheticModelsService("test-user-agent");
	});

	test("should create service with user agent", () => {
		const service = new SyntheticModelsService("custom-user-agent");
		assert.ok(service, "Service should be created");
	});

	test("should return undefined for missing API key when silent", async () => {
		// Mock secret storage
		const mockSecrets = {
			get: async (key: string) => {
				if (key === "synthetic.apiKey") return undefined;
				return undefined;
			},
			store: async (key: string, value: string) => {},
			delete: async (key: string) => {},
			onDidChange: {
				// @ts-ignore - Mock event emitter
				dispose: () => {}
			}
		} as unknown as vscode.SecretStorage;

		const result = await modelsService.ensureApiKey(mockSecrets, true);
		assert.strictEqual(result, undefined, "Should return undefined when API key is missing and silent is true");
	});

	test("should handle fetch models error", async () => {
		const apiKey = "test-api-key";

		// Mock fetch to return error
		const originalFetch = global.fetch;
		global.fetch = async () => {
			return {
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				text: async () => "Invalid API key"
			} as Response;
		};

		try {
			await modelsService.fetchModels(apiKey);
			assert.fail("Should have thrown an error");
		} catch (error) {
			assert.ok(error instanceof Error, "Should throw an Error");
			assert.match((error as Error).message, /Failed to fetch Synthetic models/, "Error message should indicate failure");
		} finally {
			global.fetch = originalFetch;
		}
	});

	test("should handle hydrateModelId with missing model details", async () => {
		const result = await modelsService.hydrateModelId("nonexistent-model");
		assert.strictEqual(result, null, "Should return null for non-existent model");
	});

	test("should handle hydrateModelId with tool_call false", async () => {
		// Mock fetch to return model details with tool_call: false
		const originalFetch = global.fetch;
		global.fetch = async () => {
			return {
				ok: true,
				json: async () => ({
					synthetic: {
						models: {
							"test-model": {
								id: "test-model",
								name: "Test Model",
								tool_call: false,
								modalities: { input: ["text"], output: ["text"] },
								limit: { context: 1000, output: 500 }
							}
						}
					}
				})
			} as Response;
		};

		try {
			const result = await modelsService.hydrateModelId("test-model");
			assert.strictEqual(result, null, "Should return null for model with tool_call: false");
		} finally {
			global.fetch = originalFetch;
		}
	});

	test("should hydrate model with tool_call true", async () => {
		// Mock fetch to return valid model details
		const originalFetch = global.fetch;
		global.fetch = async () => {
			return {
				ok: true,
				json: async () => ({
					synthetic: {
						models: {
							"test-model": {
								id: "test-model",
								name: "Test Model",
								tool_call: true,
								modalities: { input: ["text", "image"], output: ["text"] },
								limit: { context: 2000, output: 1000 }
							}
						}
					}
				})
			} as Response;
		};

		try {
			const result = await modelsService.hydrateModelId("test-model");
			assert.ok(result, "Should return hydrated model info");
			assert.strictEqual(result?.name, "Test Model", "Should have correct name");
			assert.strictEqual(result?.maxInputTokens, 2000, "Should have correct context length");
			assert.strictEqual(result?.maxOutputTokens, 1000, "Should have correct max output tokens");
			assert.strictEqual(result?.capabilities?.toolCalling, true, "Should support tool calling");
			assert.strictEqual(result?.capabilities?.imageInput, true, "Should support image input");
		} finally {
			global.fetch = originalFetch;
		}
	});

	test("should use default values when model details are incomplete", async () => {
		// Mock fetch to return model details with missing fields
		const originalFetch = global.fetch;
		global.fetch = async () => {
			return {
				ok: true,
				json: async () => ({
					synthetic: {
						models: {
							"test-model": {
								id: "test-model",
								name: "Test Model",
								tool_call: true,
								modalities: { input: ["text"], output: ["text"] }
								// Missing limit field
							}
						}
					}
				})
			} as Response;
		};

		try {
			const result = await modelsService.hydrateModelId("test-model");
			assert.ok(result, "Should return hydrated model info");
			assert.strictEqual(result?.maxInputTokens, DEFAULT_CONTEXT_LENGTH, "Should use default context length");
			assert.strictEqual(result?.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, "Should use default max output tokens");
		} finally {
			global.fetch = originalFetch;
		}
	});

	test("should prepare language model chat information with no API key", async () => {
		const mockSecrets = {
			get: async (key: string) => undefined,
			store: async (key: string, value: string) => {},
			delete: async (key: string) => {},
			onDidChange: {
				// @ts-ignore - Mock event emitter
				dispose: () => {}
			}
		} as unknown as vscode.SecretStorage;

		const mockToken = new vscode.CancellationTokenSource().token;

		const result = await modelsService.prepareLanguageModelChatInformation(
			mockSecrets,
			{ silent: true },
			mockToken
		);

		assert.deepStrictEqual(result, [], "Should return empty array when no API key is available");
	});

	test("should handle network errors in hydrateModelId", async () => {
		// Mock fetch to throw network error
		const originalFetch = global.fetch;
		global.fetch = async () => {
			throw new Error("Network error");
		};

		try {
			const result = await modelsService.hydrateModelId("test-model");
			assert.strictEqual(result, null, "Should return null on network error");
		} finally {
			global.fetch = originalFetch;
		}
	});
});