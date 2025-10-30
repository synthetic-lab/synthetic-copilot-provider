import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart,
	Progress,
} from "vscode";
import OpenAI from "openai";
import {
	convertRequestToOpenAI,
	provideTokenCount
} from "./utils";
import { ThinkSegment, ThinkTagParser } from "./thinkParser";
import {
	SyntheticModelsService,
	BASE_URL
} from "./syntheticModels";
import { getModelTemperature } from "./config";

export class SyntheticChatModelProvider implements LanguageModelChatProvider {
	private _modelsService: SyntheticModelsService;
	/**
	 * Create a provider using the given secret storage for the API key.
	 * @param secrets VS Code secret storage.
	 */
	constructor(private readonly secrets: vscode.SecretStorage, private readonly userAgent: string) {
		this._modelsService = new SyntheticModelsService(userAgent);
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		const info = await this._modelsService.prepareLanguageModelChatInformation(this.secrets, { silent: options.silent ?? false }, _token);
		return info;
	}

	/**
	 * Returns the response for a chat request, passing the results to the progress callback.
	 * The {@linkcode LanguageModelChatProvider} must emit the response parts to the progress callback as they are received from the language model.
	 * @param model The language model to use
	 * @param messages The messages to include in the request
	 * @param options Options for the request
	 * @param progress The progress to emit the streamed response chunks to
	 * @param token A cancellation token for the request
	 * @returns A promise that resolves when the response is complete. Results are actually passed to the progress callback.
	 */
	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken
	): Promise<void> {

		const apiKey = await this._modelsService.ensureApiKey(this.secrets, true);
		if (!apiKey) {
			throw new Error("Synthetic API key not found");
		}

		try {
			const openAIRequest: OpenAI.ChatCompletionCreateParamsStreaming = {
				...convertRequestToOpenAI(messages, options.tools as vscode.LanguageModelChatTool[]),
				model: model.id
			};

			// Apply custom temperature if configured
			const customTemperature = getModelTemperature(model.id);
			if (customTemperature !== undefined) {
				openAIRequest.temperature = customTemperature;
			}

			const openai = new OpenAI({
				baseURL: BASE_URL,
				apiKey: apiKey,
				defaultHeaders: { 'User-Agent': this.userAgent }
			});

			const stream = await openai.chat.completions.create(openAIRequest);
			const thinkParser = new ThinkTagParser();
			const toolCallStates = new Map<number, ToolCallAccumulator>();
			const emitToolCallIfReady = (index: number, state: ToolCallAccumulator) => {
				if (state.emitted) {
					return;
				}
				if (!state.id || !state.name) {
					console.warn(
						`[Synthetic Model Provider] Tool call state incomplete (missing id or name) for index ${index} when finalizing:`,
						state
					);
					return;
				}

				let input: object = {};
				const rawArgs = state.argumentsBuffer.trim();
				if (rawArgs.length > 0) {
					try {
						input = JSON.parse(rawArgs);
					} catch (error) {
						console.error(
							`[Synthetic Model Provider] Failed to parse aggregated tool call arguments for ${state.name} (${state.id}) at index ${index}:`,
							rawArgs,
							error
						);
						return;
					}
				}

				const toolCallPart = new vscode.LanguageModelToolCallPart(state.id, state.name, input);
				progress.report(toolCallPart);
				state.emitted = true;
			};

			for await (const chunk of stream) {
				if (token.isCancellationRequested) {
					break;
				}
				const choice = chunk.choices[0];
				if (!choice) {
					continue;
				}
				const choiceData = choice as unknown as {
					delta?: Record<string, unknown>;
					message?: Record<string, unknown>;
				};
				const delta = choiceData.delta ?? choiceData.message;
				if (!delta) {
					continue;
				}

				// Handle thinking content when provided
				this.reportThinkingParts(delta, progress);

				// Handle text content
				const contentValue = (delta as { content?: unknown }).content;
				const content = extractTextContent(contentValue);
				const segments = thinkParser.push(content);
				if (segments.length > 0) {
					this.emitContentSegments(segments, progress);
				}

				// Handle tool calls
				const toolCalls = (delta as { tool_calls?: unknown }).tool_calls;
				if (Array.isArray(toolCalls) && toolCalls.length > 0) {
					for (const toolCall of toolCalls) {
						if (!toolCall || typeof toolCall !== "object") {
							console.warn("[Synthetic Model Provider] Skipping malformed tool call payload:", toolCall);
							continue;
						}

						const toolCallRecord = toolCall as {
							id?: string | null;
							index?: number;
							type?: string;
							function?: { name?: string; arguments?: string };
						};

						const index = Number.isInteger(toolCallRecord.index) ? toolCallRecord.index! : 0;
						const state = toolCallStates.get(index) ?? { argumentsBuffer: "", emitted: false };
						if (!toolCallStates.has(index)) {
							toolCallStates.set(index, state);
						}

						if (typeof toolCallRecord.id === "string" && toolCallRecord.id.length > 0) {
							state.id = toolCallRecord.id;
						}

						const functionRecord = toolCallRecord.function;
						if (functionRecord?.name) {
							state.name = functionRecord.name;
						}
						if (typeof functionRecord?.arguments === "string" && functionRecord.arguments.length > 0) {
							state.argumentsBuffer += functionRecord.arguments;
						}
					}
				}

				const finishReason = (choice as { finish_reason?: string }).finish_reason;
				if (finishReason === "tool_calls") {
					for (const [index, state] of toolCallStates.entries()) {
							emitToolCallIfReady(index, state);
					}
				}
			}

			const remainingSegments = thinkParser.flush();
			if (remainingSegments.length > 0) {
				this.emitContentSegments(remainingSegments, progress);
			}

			for (const [index, state] of toolCallStates.entries()) {
				if (!state.emitted) {
						emitToolCallIfReady(index, state);
				}
			}
		} catch (error) {
			console.error("[Synthetic Model Provider] Error during chat completion:", error);

			// Emit user-friendly error message
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			vscode.window.showInformationMessage(
				`Failed to get completion from Synthetic: ${errorMessage}. Please check your API key and connection.`
			);

			throw error;
		}
	}

	private reportThinkingParts(delta: unknown, progress: Progress<LanguageModelResponsePart>): void {
		if (!delta || typeof delta !== "object") {
			return;
		}

		const thinkingChunks = collectThinkingChunks(delta as Record<string, unknown>);
		if (thinkingChunks.length === 0) {
			return;
		}

		for (const chunk of thinkingChunks) {
			this.emitThinkingChunk(progress, chunk);
		}
	}

	private emitContentSegments(segments: ThinkSegment[], progress: Progress<LanguageModelResponsePart>): void {
		let textBuffer = "";
		let thinkingBuffer = "";

		const flushText = () => {
			if (textBuffer.length === 0) {
				return;
			}
			progress.report(new vscode.LanguageModelTextPart(textBuffer));
			textBuffer = "";
		};

		const flushThinking = () => {
			if (thinkingBuffer.length === 0) {
				return;
			}
			this.emitThinkingChunk(progress, thinkingBuffer);
			thinkingBuffer = "";
		};

		for (const segment of segments) {
			if (!segment.value || segment.value.length === 0) {
				continue;
			}

			if (segment.kind === "thinking") {
				flushText();
				thinkingBuffer += segment.value;
				continue;
			}

			flushThinking();
			textBuffer += segment.value;
		}

		flushThinking();
		flushText();
	}

	private emitThinkingChunk(progress: Progress<LanguageModelResponsePart>, chunk: string): void {
		if (!chunk || chunk.length === 0) {
			return;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const thinkingCtor = (vscode as any).LanguageModelChatThinkingPart ?? (vscode as any).LanguageModelThinkingPart;
		if (thinkingCtor) {
			try {
				progress.report(new thinkingCtor(chunk));
				return;
			} catch (error) {
				console.warn("[Synthetic Model Provider] Failed to create thinking part, falling back to text part:", error);
			}
		}

		progress.report(new vscode.LanguageModelTextPart(chunk));
	}

	/**
	 * Returns the number of tokens for a given text using the model specific tokenizer logic
	 * @param model The language model to use
	 * @param text The text to count tokens for
	 * @param token A cancellation token for the request
	 * @returns A promise that resolves to the number of tokens
	 */
	async provideTokenCount(
		model: LanguageModelChatInformation,
		text: string | LanguageModelChatRequestMessage,
		token: CancellationToken
	): Promise<number> {
		return provideTokenCount(model, text, token);
	}
}

function collectThinkingChunks(delta: Record<string, unknown>): string[] {
	const rawChunks: string[] = [];

	const pushChunk = (value: string) => {
		if (value.length === 0) {
			return;
		}
		if (value.trim().length === 0) {
			rawChunks.push(value);
			return;
		}
		const last = rawChunks[rawChunks.length - 1];
		if (last !== value) {
			rawChunks.push(value);
		}
	};

	const collect = (value: unknown) => {
		if (value === undefined || value === null) {
			return;
		}
		if (typeof value === "string") {
			pushChunk(value);
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				collect(item);
			}
			return;
		}
		if (typeof value === "object") {
			const obj = value as Record<string, unknown>;
			if ("text" in obj) {
				collect(obj.text);
			}
			if ("content" in obj) {
				collect(obj.content);
			}
			if ("value" in obj) {
				collect(obj.value);
			}
			if ("reasoning" in obj) {
				collect(obj.reasoning);
			}
		}
	};

	collect(delta.reasoning);
	collect(delta.reasoning_content);

	return rawChunks;
}

function extractTextContent(contentValue: unknown): string | undefined {
	const chunks: string[] = [];

	const collect = (value: unknown) => {
		if (value === undefined || value === null) {
			return;
		}
		if (typeof value === "string") {
			chunks.push(value);
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				collect(item);
			}
			return;
		}
		if (typeof value === "object") {
			const obj = value as Record<string, unknown>;
			if (typeof obj.text === "string") {
				chunks.push(obj.text);
			}
			if (typeof obj.value === "string") {
				chunks.push(obj.value);
			}
			if (typeof obj.content === "string") {
				chunks.push(obj.content);
			}
			if (Array.isArray(obj.content)) {
				collect(obj.content);
			}
		}
	};

	collect(contentValue);

	if (chunks.length === 0) {
		return undefined;
	}

	const joined = chunks.join("");
	return joined.length > 0 ? joined : undefined;
}

interface ToolCallAccumulator {
	id?: string;
	name?: string;
	argumentsBuffer: string;
	emitted: boolean;
}
