import * as assert from "assert";
import * as vscode from "vscode";
import { SyntheticModelsService, BASE_URL, DEFAULT_CONTEXT_LENGTH, DEFAULT_MAX_OUTPUT_TOKENS } from "../syntheticModels";
import { SyntheticModelsResponseSchema, ModelDetailsApiResponseSchema } from "../types";
import { z } from "zod";

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
								attachment: false,
								reasoning: false,
								temperature: true,
								tool_call: true,
								modalities: { input: ["text", "image"], output: ["text"] },
								open_weights: false,
								cost: { input: 0.001, output: 0.002 },
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
		// Mock fetch to return model details with missing optional fields
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
								attachment: false,
								reasoning: false,
								temperature: true,
								tool_call: true,
								modalities: { input: ["text"], output: ["text"] },
								open_weights: false,
								cost: { input: 0.001, output: 0.002 }
								// Missing limit field - should use defaults
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

	suite("Zod Validation Tests", () => {
		const validApiResponse = {
			"object": "list",
			"data": [
				{
					"id": "hf:zai-org/GLM-4.6",
					"object": "model"
				},
				{
					"id": "hf:zai-org/GLM-4.5",
					"object": "model"
				},
				{
					"id": "hf:NousResearch/Hermes-4-405B-FP8",
					"object": "model"
				}
			]
		};

		test("should validate correct API response format", async () => {
			const apiKey = "test-api-key";

			// Mock fetch to return valid response
			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => validApiResponse
				} as Response;
			};

			try {
				const result = await modelsService.fetchModels(apiKey);
				assert.ok(result, "Should return result object");
				assert.ok(result.models, "Should return models array");
				assert.strictEqual(result.models.length, 3, "Should return 3 models");
				assert.strictEqual(result.models[0].id, "hf:zai-org/GLM-4.6", "Should have correct first model ID");
				assert.strictEqual(result.models[0].object, "model", "Should have correct object type");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should reject API response missing required 'object' field", async () => {
			const apiKey = "test-api-key";
			const invalidResponse = {
				"data": [
					{
						"id": "hf:zai-org/GLM-4.6"
						// Missing 'object' field
					}
				]
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => invalidResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown a validation error");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /Invalid API response format/, "Error message should indicate validation failure");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should reject API response missing required 'id' field", async () => {
			const apiKey = "test-api-key";
			const invalidResponse = {
				"data": [
					{
						"object": "model"
						// Missing 'id' field
					}
				]
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => invalidResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown a validation error");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /Invalid API response format/, "Error message should indicate validation failure");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should reject API response with wrong data type for 'object' field", async () => {
			const apiKey = "test-api-key";
			const invalidResponse = {
				"data": [
					{
						"id": "hf:zai-org/GLM-4.6",
						"object": 123 // Should be string, not number
					}
				]
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => invalidResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown a validation error");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /Invalid API response format/, "Error message should indicate validation failure");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should reject API response with wrong data type for 'id' field", async () => {
			const apiKey = "test-api-key";
			const invalidResponse = {
				"data": [
					{
						"id": 123, // Should be string, not number
						"object": "model"
					}
				]
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => invalidResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown a validation error");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /Invalid API response format/, "Error message should indicate validation failure");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should reject API response missing 'data' field", async () => {
			const apiKey = "test-api-key";
			const invalidResponse = {
				// Missing 'data' field
				"object": "list"
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => invalidResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown a validation error");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /Invalid API response format/, "Error message should indicate validation failure");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should reject API response with 'data' as non-array", async () => {
			const apiKey = "test-api-key";
			const invalidResponse = {
				"data": "not-an-array" // Should be array, not string
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => invalidResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown a validation error");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /Invalid API response format/, "Error message should indicate validation failure");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should reject API response with 'object' as non-string", async () => {
			const apiKey = "test-api-key";
			const invalidResponse = {
				"object": 123, // Should be string, not number
				"data": []
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => invalidResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown a validation error");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /Invalid API response format/, "Error message should indicate validation failure");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should throw error when data array is empty", async () => {
			const apiKey = "test-api-key";
			const emptyResponse = {
				"object": "list",
				"data": []
			};

			const originalFetch = global.fetch;
			global.fetch = async () => {
				return {
					ok: true,
					json: async () => emptyResponse
				} as Response;
			};

			try {
				await modelsService.fetchModels(apiKey);
				assert.fail("Should have thrown an error for empty data array");
			} catch (error) {
				assert.ok(error instanceof Error, "Should throw an Error");
				assert.match((error as Error).message, /No models data found/, "Error message should indicate no models found");
			} finally {
				global.fetch = originalFetch;
			}
		});

		test("should validate schema directly using Zod", () => {
			// Test valid data
			const validResult = SyntheticModelsResponseSchema.safeParse(validApiResponse);
			assert.ok(validResult.success, "Valid data should pass validation");
			if (validResult.success) {
				assert.strictEqual(validResult.data.data.length, 3, "Should parse 3 models");
				assert.strictEqual(validResult.data.data[0].id, "hf:zai-org/GLM-4.6", "Should parse first model ID correctly");
			}

			// Test invalid data
			const invalidData = { data: [{ id: "test" }] }; // Missing object field
			const invalidResult = SyntheticModelsResponseSchema.safeParse(invalidData);
			assert.ok(!invalidResult.success, "Invalid data should fail validation");
			if (!invalidResult.success) {
				assert.ok(invalidResult.error instanceof z.ZodError, "Should return ZodError");
			}
		});

	suite("Model Details Zod Validation Tests", () => {
			test("should validate correct model details API response format", async () => {
				const validModelDetailsResponse = {
					synthetic: {
						models: {
							"test-model": {
								id: "test-model",
								name: "Test Model",
								attachment: false,
								reasoning: false,
								temperature: true,
								tool_call: true,
								modalities: { input: ["text"], output: ["text"] },
								open_weights: false,
								cost: { input: 0.001, output: 0.002 },
								limit: { context: 2000, output: 1000 }
							}
						}
					}
				};

				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => validModelDetailsResponse
					} as Response;
				};

				try {
					const result = await modelsService.hydrateModelId("test-model");
					assert.ok(result, "Should return hydrated model info");
					assert.strictEqual(result?.name, "Test Model", "Should have correct name");
					assert.strictEqual(result?.maxInputTokens, 2000, "Should have correct context length");
					assert.strictEqual(result?.maxOutputTokens, 1000, "Should have correct max output tokens");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should reject model details response missing required fields", async () => {
				const invalidModelDetailsResponse = {
					synthetic: {
						models: {
							"test-model": {
								id: "test-model",
								name: "Test Model"
								// Missing many required fields
							}
						}
					}
				};

				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => invalidModelDetailsResponse
					} as Response;
				};

				try {
					const result = await modelsService.hydrateModelId("test-model");
					assert.strictEqual(result, null, "Should return null when validation fails");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should reject model details response with wrong data types", async () => {
				const invalidModelDetailsResponse = {
					synthetic: {
						models: {
							"test-model": {
								id: "test-model",
								name: "Test Model",
								attachment: "false", // Should be boolean, not string
								reasoning: false,
								temperature: true,
								tool_call: true,
								modalities: { input: ["text"], output: ["text"] },
								open_weights: false,
								cost: { input: 0.001, output: 0.002 },
								limit: { context: 2000, output: 1000 }
							}
						}
					}
				};

				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => invalidModelDetailsResponse
					} as Response;
				};

				try {
					const result = await modelsService.hydrateModelId("test-model");
					assert.strictEqual(result, null, "Should return null when validation fails");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should validate model details schema directly using Zod", () => {
				const validModelDetails = {
					synthetic: {
						models: {
							"test-model": {
								id: "test-model",
								name: "Test Model",
								attachment: false,
								reasoning: false,
								temperature: true,
								tool_call: true,
								modalities: { input: ["text"], output: ["text"] },
								open_weights: false,
								cost: { input: 0.001, output: 0.002 },
								limit: { context: 2000, output: 1000 }
							}
						}
					}
				};

				// Test valid data
				const validResult = ModelDetailsApiResponseSchema.safeParse(validModelDetails);
				assert.ok(validResult.success, "Valid model details should pass validation");
				if (validResult.success) {
					assert.ok(validResult.data.synthetic.models["test-model"], "Should parse model details correctly");
					assert.strictEqual(validResult.data.synthetic.models["test-model"].name, "Test Model", "Should parse model name correctly");
				}

				// Test invalid data
				const invalidModelDetails = {
					synthetic: {
						models: {
							"test-model": {
								id: "test-model"
								// Missing many required fields
							}
						}
					}
				};
				const invalidResult = ModelDetailsApiResponseSchema.safeParse(invalidModelDetails);
				assert.ok(!invalidResult.success, "Invalid model details should fail validation");
				if (!invalidResult.success) {
					assert.ok(invalidResult.error instanceof z.ZodError, "Should return ZodError");
				}
			});
		});

	suite("Real-world Hydration Function Tests", () => {
			const realApiResponse = {
				"synthetic": {
					"id": "synthetic",
					"env": [
						"SYNTHETIC_API_KEY"
					],
					"npm": "@ai-sdk/openai-compatible",
					"api": "https://api.synthetic.new/v1",
					"name": "Synthetic",
					"doc": "https://synthetic.new/pricing",
					"models": {
						"hf:Qwen/Qwen3-235B-A22B-Instruct-2507": {
							"id": "hf:Qwen/Qwen3-235B-A22B-Instruct-2507",
							"name": "Qwen 3 235B Instruct",
							"attachment": false,
							"reasoning": false,
							"temperature": true,
							"tool_call": true,
							"knowledge": "2025-04",
							"release_date": "2025-04-28",
							"last_updated": "2025-07-21",
							"modalities": {
								"input": [
									"text"
								],
								"output": [
									"text"
								]
							},
							"open_weights": true,
							"cost": {
								"input": 0.2,
								"output": 0.6
							},
							"limit": {
								"context": 256000,
								"output": 32000
							}
						},
						"hf:Qwen/Qwen2.5-Coder-32B-Instruct": {
							"id": "hf:Qwen/Qwen2.5-Coder-32B-Instruct",
							"name": "Qwen2.5-Coder-32B-Instruct",
							"attachment": false,
							"reasoning": false,
							"temperature": true,
							"tool_call": false,
							"knowledge": "2024-10",
							"release_date": "2024-11-11",
							"last_updated": "2024-11-11",
							"modalities": {
								"input": [
									"text"
								],
								"output": [
									"text"
								]
							},
							"open_weights": true,
							"cost": {
								"input": 0.8,
								"output": 0.8
							},
							"limit": {
								"context": 32768,
								"output": 32768
							}
						}
					}
				}
			};

			test("should hydrate model with tool_call support from real API data", async () => {
				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => realApiResponse
					} as Response;
				};

				try {
					const result = await modelsService.hydrateModelId("hf:Qwen/Qwen3-235B-A22B-Instruct-2507");
					assert.ok(result, "Should return hydrated model info");
					assert.strictEqual(result?.name, "Qwen 3 235B Instruct", "Should have correct model name");
					assert.strictEqual(result?.tooltip, "Qwen 3 235B Instruct", "Should have correct tooltip");
					assert.strictEqual(result?.family, "synthetic", "Should have correct family");
					assert.strictEqual(result?.version, "1.0.0", "Should have correct version");
					assert.strictEqual(result?.maxInputTokens, 256000, "Should have correct context length from API");
					assert.strictEqual(result?.maxOutputTokens, 32000, "Should have correct max output tokens from API");
					assert.strictEqual(result?.capabilities?.toolCalling, true, "Should support tool calling");
					assert.strictEqual(result?.capabilities?.imageInput, false, "Should not support image input");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should return null for model without tool_call support", async () => {
				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => realApiResponse
					} as Response;
				};

				try {
					const result = await modelsService.hydrateModelId("hf:Qwen/Qwen2.5-Coder-32B-Instruct");
					assert.strictEqual(result, null, "Should return null for model with tool_call: false");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should return null for non-existent model", async () => {
				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => realApiResponse
					} as Response;
				};

				try {
					const result = await modelsService.hydrateModelId("non-existent-model");
					assert.strictEqual(result, null, "Should return null for non-existent model");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should handle multiple hydration calls with caching", async () => {
				const originalFetch = global.fetch;
				let fetchCount = 0;

				global.fetch = async () => {
					fetchCount++;
					return {
						ok: true,
						json: async () => realApiResponse
					} as Response;
				};

				try {
					// First call should fetch and cache
					const result1 = await modelsService.hydrateModelId("hf:Qwen/Qwen3-235B-A22B-Instruct-2507");
					assert.ok(result1, "First call should succeed");
					assert.strictEqual(fetchCount, 1, "Should have made one fetch call");

					// Second call should use cache
					const result2 = await modelsService.hydrateModelId("hf:Qwen/Qwen3-235B-A22B-Instruct-2507");
					assert.ok(result2, "Second call should succeed");
					assert.strictEqual(fetchCount, 1, "Should not make additional fetch calls due to caching");

					// Third call for different model should use cache
					const result3 = await modelsService.hydrateModelId("hf:Qwen/Qwen2.5-Coder-32B-Instruct");
					assert.strictEqual(result3, null, "Third call should return null (no tool support)");
					assert.strictEqual(fetchCount, 1, "Should still not make additional fetch calls");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should validate real API response structure with Zod", async () => {
				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => realApiResponse
					} as Response;
				};

				try {
					// This should succeed without throwing validation errors
					const result = await modelsService.hydrateModelId("hf:Qwen/Qwen3-235B-A22B-Instruct-2507");
					assert.ok(result, "Real API response should pass Zod validation");
				} finally {
					global.fetch = originalFetch;
				}
			});

			test("should handle all optional fields correctly", async () => {
				const originalFetch = global.fetch;
				global.fetch = async () => {
					return {
						ok: true,
						json: async () => realApiResponse
					} as Response;
				};

				try {
					const result = await modelsService.hydrateModelId("hf:Qwen/Qwen3-235B-A22B-Instruct-2507");
					assert.ok(result, "Should return hydrated model info");

					// Verify that optional fields are handled correctly
					const modelDetails = realApiResponse.synthetic.models["hf:Qwen/Qwen3-235B-A22B-Instruct-2507"];

					// Check that knowledge field was present in API but doesn't affect hydration
					assert.strictEqual(modelDetails.knowledge, "2025-04", "API should have knowledge field");

					// Check that release_date and last_updated were present but don't affect hydration
					assert.strictEqual(modelDetails.release_date, "2025-04-28", "API should have release_date");
					assert.strictEqual(modelDetails.last_updated, "2025-07-21", "API should have last_updated");

					// Check that cost fields were present but don't affect hydration
					assert.strictEqual(modelDetails.cost.input, 0.2, "API should have input cost");
					assert.strictEqual(modelDetails.cost.output, 0.6, "API should have output cost");

					// Check that open_weights was present but doesn't affect hydration
					assert.strictEqual(modelDetails.open_weights, true, "API should have open_weights");
				} finally {
					global.fetch = originalFetch;
				}
			});
		});
	});
});