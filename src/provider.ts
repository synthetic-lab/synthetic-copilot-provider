import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	LanguageModelChatRequestHandleOptions,
	LanguageModelResponsePart,
	Progress,
} from "vscode";

import type { SyntheticModelItem, SyntheticModelsResponse, SyntheticModelDetails } from "./types";

import axios, { AxiosError } from "axios";

import { convertTools, convertMessages, tryParseJSONObject, validateRequest } from "./utils";

const BASE_URL = "https://api.synthetic.new/openai/v1";
const DEFAULT_MAX_OUTPUT_TOKENS = 16000;
const DEFAULT_CONTEXT_LENGTH = 128000;
const MAX_TOOLS = 128;

const DEFAULT_MODEL_DETAILS = {
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
} satisfies Partial<LanguageModelChatInformation>;

export class SyntheticChatModelProvider implements LanguageModelChatProvider {
	private _modelDetailsCache: Record<string, SyntheticModelDetails> | null = null;

	/** Buffer for assembling streamed tool calls by index. */
	private _toolCallBuffers: Map<number, { id?: string; name?: string; args: string }> = new Map<
		number,
		{ id?: string; name?: string; args: string }
	>();

	/** Indices for which a tool call has been fully emitted. */
	private _completedToolCallIndices = new Set<number>();

	/** Track if we emitted any assistant text before seeing tool calls (SSE-like begin-tool-calls hint). */
	private _hasEmittedAssistantText = false;

	/** Track if we emitted the begin-tool-calls whitespace flush. */
	private _emittedBeginToolCallsHint = false;

	// Lightweight tokenizer state for tool calls embedded in text
	private _textToolParserBuffer = "";
	private _textToolActive:
		| undefined
		| {
			name?: string;
			index?: number;
			argBuffer: string;
			emitted?: boolean;
		};
	private _emittedTextToolCallKeys = new Set<string>();
	private _emittedTextToolCallIds = new Set<string>();

	/**
	 * Create a provider using the given secret storage for the API key.
	 * @param secrets VS Code secret storage.
	 */
	constructor(private readonly secrets: vscode.SecretStorage, private readonly userAgent: string) { }

	/** Roughly estimate tokens for VS Code chat messages (text only) */
	private estimateMessagesTokens(msgs: readonly vscode.LanguageModelChatMessage[]): number {
		let total = 0;
		for (const m of msgs) {
			for (const part of m.content) {
				if (part instanceof vscode.LanguageModelTextPart) {
					total += Math.ceil(part.value.length / 4);
				}
			}
		}
		return total;
	}

	/** Rough token estimate for tool definitions by JSON size */
	private estimateToolTokens(tools: { type: string; function: { name: string; description?: string; parameters?: object } }[] | undefined): number {
		if (!tools || tools.length === 0) { return 0; }
		try {
			const json = JSON.stringify(tools);
			return Math.ceil(json.length / 4);
		} catch {
			return 0;
		}
	}

	/**
	 * Get the list of available language models contributed by this provider
	 * @param options Options which specify the calling context of this function
	 * @param token A cancellation token which signals if the user cancelled the request or not
	 * @returns A promise that resolves to the list of available language models
	 */
	async prepareLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		console.debug("[Synthetic Model Provider] prepareLanguageModelChatInformation invoked", {
			silent: options.silent,
		});
		const apiKey = await this.ensureApiKey(options.silent);
		if (!apiKey) {
			console.debug("[Synthetic Model Provider] No API key available, returning empty provider list");
			return [];
		}

		const { models } = await this.fetchModels(apiKey);
		console.debug("[Synthetic Model Provider] Retrieved models", { count: models.length });

		const infos: LanguageModelChatInformation[] = await Promise.all(
			models.map(async (m) => {
				console.debug("[Synthetic Model Provider] Preparing language model metadata", { modelId: m.id });

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

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		console.debug("[Synthetic Model Provider] provideLanguageModelChatInformation invoked", {
			silent: options.silent,
		});
		const info = await this.prepareLanguageModelChatInformation({ silent: options.silent ?? false }, _token);
		console.debug("[Synthetic Model Provider] provideLanguageModelChatInformation completed: ", info);
		return info;
	}

	/**
	 * Fetch the list of models and supplementary metadata from Synthetic.
	 * @param apiKey The Synthetic API key used to authenticate.
	 */
	private async fetchModels(
		apiKey: string
	): Promise<{ models: SyntheticModelItem[] }> {
		console.debug("[Synthetic Model Provider] fetchModels called with apiKey:", apiKey);
		try {
			const response = await axios.get<SyntheticModelsResponse>(`${BASE_URL}/models`, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"User-Agent": this.userAgent,
				},
				responseType: "json",
			});
			const models = response.data?.data ?? [];
			console.debug("[Synthetic Model Provider] fetchModels succeeded", { count: models.length });
			return { models };
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const err = error as AxiosError;
				const status = err.response?.status ?? "unknown";
				const statusText = err.response?.statusText ?? "";
				const detail = typeof err.response?.data === "string"
					? err.response.data
					: err.response?.data ? JSON.stringify(err.response.data) : err.message;
				console.error("[Synthetic Model Provider] Failed to fetch Synthetic models", {
					status,
					statusText,
					detail,
				});
				throw new Error(
					`Failed to fetch Synthetic models: ${status}${statusText ? ` ${statusText}` : ""}${detail ? `\n${detail}` : ""}`
				);
			}
			console.error("[Synthetic Model Provider] Failed to fetch Synthetic models", error);
			console.debug("[Synthetic Model Provider] fetchModels throwing error");
			throw error;
		}
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
		messages: readonly LanguageModelChatMessage[],
		options: LanguageModelChatRequestHandleOptions,
		progress: Progress<LanguageModelResponsePart>,
		token: CancellationToken
	): Promise<void> {
		console.debug("[Synthetic Model Provider] provideLanguageModelChatResponse invoked", {
			modelId: model.id,
			messageCount: messages.length,
			toolCount: options.tools?.length ?? 0,
		});

		this._toolCallBuffers.clear();
		this._completedToolCallIndices.clear();
		this._hasEmittedAssistantText = false;
		this._emittedBeginToolCallsHint = false;
		this._textToolParserBuffer = "";
		this._textToolActive = undefined;
		this._emittedTextToolCallKeys.clear();
		this._emittedTextToolCallIds.clear();


		let requestBody: Record<string, unknown> | undefined;
		const trackingProgress: Progress<LanguageModelResponsePart> = {
			report: (part) => {
				console.debug("[Synthetic Model Provider] Reporting progress part", { partType: part.constructor?.name });
				try {
					progress.report(part);
				} catch (e) {
					console.error("[Synthetic Model Provider] Progress.report failed", {
						modelId: model.id,
						error: e instanceof Error ? { name: e.name, message: e.message } : String(e),
					});
				}
			},
		};
		try {
			const apiKey = await this.ensureApiKey(true);
			if (!apiKey) {
				throw new Error("Synthetic API key not found");
			}

			console.debug("[Synthetic Model Provider] Obtained API key (hidden) for chat request");
			const openaiMessages = convertMessages(messages);

			console.debug("[Synthetic Model Provider] Converted messages", { count: openaiMessages.length });
			validateRequest(messages);

			console.debug("[Synthetic Model Provider] Request validated");
			const toolConfig = convertTools(options);

			console.debug("[Synthetic Model Provider] Tool configuration prepared", {
				hasTools: Boolean(toolConfig.tools?.length),
				hasChoice: Boolean(toolConfig.tool_choice),
			});
			if (options.tools && options.tools.length > MAX_TOOLS) {
				throw new Error(`Cannot have more than ${MAX_TOOLS} tools per request.`);
			}

			const inputTokenCount = this.estimateMessagesTokens(messages);
			const toolTokenCount = this.estimateToolTokens(toolConfig.tools);
			const tokenLimit = Math.max(1, model.maxInputTokens);
			if (inputTokenCount + toolTokenCount > tokenLimit) {
				console.error("[Synthetic Model Provider] Message exceeds token limit", { total: inputTokenCount + toolTokenCount, tokenLimit });
				console.debug("[Synthetic Model Provider] Token limit exceeded", { inputTokenCount, toolTokenCount, tokenLimit });
				throw new Error("Message exceeds token limit.");
			}

			requestBody = {
				model: model.id,
				messages: openaiMessages,
				stream: true,
				max_tokens: Math.min(options.modelOptions?.max_tokens || 4096, model.maxOutputTokens),
				temperature: options.modelOptions?.temperature ?? 0.7,
			};

			console.debug("[Synthetic Model Provider] Final request body computed", {
				model: requestBody.model,
				hasTools: Boolean((requestBody as Record<string, unknown>).tools),
				maxTokens: requestBody.max_tokens,
				temperature: requestBody.temperature,
			});
			// Allow-list model options
			if (options.modelOptions) {
				const mo = options.modelOptions as Record<string, unknown>;
				if (typeof mo.stop === "string" || Array.isArray(mo.stop)) {
					(requestBody as Record<string, unknown>).stop = mo.stop;
				}
				if (typeof mo.frequency_penalty === "number") {
					(requestBody as Record<string, unknown>).frequency_penalty = mo.frequency_penalty;
				}
				if (typeof mo.presence_penalty === "number") {
					(requestBody as Record<string, unknown>).presence_penalty = mo.presence_penalty;
				}
				console.debug("[Synthetic Model Provider] Applied optional modelOptions", mo);
			}

			if (toolConfig.tools) {
				(requestBody as Record<string, unknown>).tools = toolConfig.tools;
			}
			if (toolConfig.tool_choice) {
				(requestBody as Record<string, unknown>).tool_choice = toolConfig.tool_choice;
			}
			console.debug("[Synthetic Model Provider] Prepared headers for chat request");
			const response = await fetch(`${BASE_URL}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"User-Agent": this.userAgent,
				},
				body: JSON.stringify(requestBody),
			});

			console.debug("[Synthetic Model Provider] Issued chat request, awaiting response");
			if (!response.ok) {
				const errorText = await response.text();
				console.error("[Synthetic Model Provider] API error response", errorText);
				throw new Error(
					`Synthetic API error: ${response.status} ${response.statusText}${errorText ? `\n${errorText}` : ""}`
				);
			}
			console.debug("[Synthetic Model Provider] Streaming response ready, beginning processing");
			if (!response.body) {
				throw new Error("No response body from Synthetic API");
			}
			console.debug("[Synthetic Model Provider] Starting streaming response processing");
			await this.processStreamingResponse(response.body, trackingProgress, token);
		} catch (err) {
			console.error("[Synthetic Model Provider] Chat request failed", {
				modelId: model.id,
				messageCount: messages.length,
				error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
			});
			throw err;
		}
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
		text: string | LanguageModelChatMessage,
		_token: CancellationToken
	): Promise<number> {
		if (typeof text === "string") {
			return Math.ceil(text.length / 4);
		} else {
			let totalTokens = 0;
			for (const part of text.content) {
				if (part instanceof vscode.LanguageModelTextPart) {
					totalTokens += Math.ceil(part.value.length / 4);
				}
			}
			return totalTokens;
		}
	}

	/**
	 * Ensure an API key exists in SecretStorage, optionally prompting the user when not silent.
	 * @param silent If true, do not prompt the user.
	 */
	private async ensureApiKey(silent: boolean): Promise<string | undefined> {
		let apiKey = await this.secrets.get("synthetic.apiKey");
		if (!apiKey && !silent) {
			const entered = await vscode.window.showInputBox({
				title: "Synthetic API Key",
				prompt: "Enter your Synthetic API key",
				ignoreFocusOut: true,
				password: true,
			});
			if (entered && entered.trim()) {
				apiKey = entered.trim();
				await this.secrets.store("synthetic.apiKey", apiKey);
			}
		}
		return apiKey;
	}

	/**
	 * Hydrate model information using the model details from https://models.dev/api.json
	 * @param modelId The model ID to hydrate
	 * @returns The hydrated model information or null if not found or tool_call is false
	 */
	private async hydrateModelId(modelId: string): Promise<Partial<LanguageModelChatInformation> | null> {
		try {
			if (!this._modelDetailsCache) {
				let response;
				const maxRetries = 3;
				let attempt = 0;
				while (attempt < maxRetries) {
					try {
						response = await axios.get('https://models.dev/api.json', { timeout: 5000 });
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
				this._modelDetailsCache = response!.data.synthetic.models;
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
			const hydratedInfo: Partial<LanguageModelChatInformation> = {
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

	/**
	 * Read and parse the streaming (SSE-like) response and report parts.
	 * @param responseBody The readable stream body.
	 * @param progress Progress reporter for streamed parts.
	 * @param token Cancellation token.
	 */
	private async processStreamingResponse(
		responseBody: ReadableStream<Uint8Array>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken,
	): Promise<void> {
		const reader = responseBody.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			console.debug("[Synthetic Model Provider] processStreamingResponse loop start");
			while (!token.isCancellationRequested) {
				const { done, value } = await reader.read();
				if (done) { break; }

				buffer += decoder.decode(value, { stream: true });
				console.debug("[Synthetic Model Provider] Decoded chunk", { bufferLength: buffer.length });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) {
						console.debug("[Synthetic Model Provider] Skipping non-data line", { line });
						continue;
					}
					const data = line.slice(6);
					if (data === "[DONE]") {
						console.debug("[Synthetic Model Provider] Received [DONE]");
						// Do not throw on [DONE]; any incomplete/empty buffers are ignored.
						await this.flushToolCallBuffers(progress, /*throwOnInvalid*/ false);
						// Flush any in-progress text-embedded tool call (silent if incomplete)
						await this.flushActiveTextToolCall(progress);
						continue;
					}

					try {
						console.debug("[Synthetic Model Provider] Processing delta line");
						const parsed = JSON.parse(data);
						await this.processDelta(parsed, progress);
					} catch {
						// Silently ignore malformed SSE lines temporarily
					}
				}
			}
		} finally {
			reader.releaseLock();
			// Clean up any leftover tool call state
			this._toolCallBuffers.clear();
			this._completedToolCallIndices.clear();
			this._hasEmittedAssistantText = false;
			this._emittedBeginToolCallsHint = false;
			this._textToolParserBuffer = "";
			this._textToolActive = undefined;
			this._emittedTextToolCallKeys.clear();
		}
	}

	/**
	 * Handle a single streamed delta chunk, emitting text and tool call parts.
	 * @param delta Parsed SSE chunk from the Router.
	 * @param progress Progress reporter for parts.
	 */
	private async processDelta(
		delta: Record<string, unknown>,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	): Promise<boolean> {
		let emitted = false;
		const choice = (delta.choices as Record<string, unknown>[] | undefined)?.[0];
		if (!choice) { return false; }

		const deltaObj = choice.delta as Record<string, unknown> | undefined;

		// report thinking progress if backend provides it and host supports it
		try {
			const maybeThinking = (choice as Record<string, unknown> | undefined)?.thinking ?? (deltaObj as Record<string, unknown> | undefined)?.thinking;
			if (maybeThinking !== undefined) {
				const vsAny = (vscode as unknown as Record<string, unknown>);
				const ThinkingCtor = vsAny["LanguageModelThinkingPart"] as
					| (new (text: string, id?: string, metadata?: unknown) => unknown)
					| undefined;
				if (ThinkingCtor) {
					let text = "";
					let id: string | undefined;
					let metadata: unknown;
					if (maybeThinking && typeof maybeThinking === "object") {
						const mt = maybeThinking as Record<string, unknown>;
						text = typeof mt["text"] === "string" ? (mt["text"] as string) : "";
						id = typeof mt["id"] === "string" ? (mt["id"] as string) : undefined;
						metadata = mt["metadata"];
					} else if (typeof maybeThinking === "string") {
						text = maybeThinking;
					}
					if (text) {
						progress.report(new (ThinkingCtor as new (text: string, id?: string, metadata?: unknown) => unknown)(text, id, metadata) as unknown as vscode.LanguageModelResponsePart);
						emitted = true;
					}
				}
			}
		} catch {
			// ignore errors here temporarily
		}
		if (deltaObj?.content) {
			const content = String(deltaObj.content);
			const res = this.processTextContent(content, progress);
			if (res.emittedText) {
				this._hasEmittedAssistantText = true;
			}
			if (res.emittedAny) {
				emitted = true;
			}
		}

		if (deltaObj?.tool_calls) {
			const toolCalls = deltaObj.tool_calls as Array<Record<string, unknown>>;

			// SSEProcessor-like: if first tool call appears after text, emit a whitespace
			// to ensure any UI buffers/linkifiers are flushed without adding visible noise.
			if (!this._emittedBeginToolCallsHint && this._hasEmittedAssistantText && toolCalls.length > 0) {
				progress.report(new vscode.LanguageModelTextPart(" "));
				this._emittedBeginToolCallsHint = true;
			}

			for (const tc of toolCalls) {
				const idx = (tc.index as number) ?? 0;
				// Ignore any further deltas for an index we've already completed
				if (this._completedToolCallIndices.has(idx)) {
					continue;
				}
				const buf = this._toolCallBuffers.get(idx) ?? { args: "" };
				if (tc.id && typeof tc.id === "string") {
					buf.id = tc.id as string;
				}
				const func = tc.function as Record<string, unknown> | undefined;
				if (func?.name && typeof func.name === "string") {
					buf.name = func.name as string;
				}
				if (typeof func?.arguments === "string") {
					buf.args += func.arguments as string;
				}
				this._toolCallBuffers.set(idx, buf);

				// Emit immediately once arguments become valid JSON to avoid perceived hanging
				await this.tryEmitBufferedToolCall(idx, progress);
			}
		}

		const finish = (choice.finish_reason as string | undefined) ?? undefined;
		if (finish === "tool_calls" || finish === "stop") {
			// On both 'tool_calls' and 'stop', emit any buffered calls and throw on invalid JSON
			await this.flushToolCallBuffers(progress, /*throwOnInvalid*/ true);
		}
		return emitted;
	}

	/**
	 * Process streamed text content for inline tool-call control tokens and emit text/tool calls.
	 * Returns which parts were emitted for logging/flow control.
	 */
	private processTextContent(
		input: string,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	): { emittedText: boolean; emittedAny: boolean } {
		const BEGIN = "<|tool_call_begin|>";
		const ARG_BEGIN = "<|tool_call_argument_begin|>";
		const END = "<|tool_call_end|>";

		let data = this._textToolParserBuffer + input;
		let emittedText = false;
		let emittedAny = false;
		let visibleOut = "";

		while (data.length > 0) {
			if (!this._textToolActive) {
				const b = data.indexOf(BEGIN);
				if (b === -1) {
					// No tool-call start: emit visible portion, but keep any partial BEGIN prefix as buffer
					const longestPartialPrefix = ((): number => {
						for (let k = Math.min(BEGIN.length - 1, data.length - 1); k > 0; k--) {
							if (data.endsWith(BEGIN.slice(0, k))) { return k; }
						}
						return 0;
					})();
					if (longestPartialPrefix > 0) {
						const visible = data.slice(0, data.length - longestPartialPrefix);
						if (visible) { visibleOut += this.stripControlTokens(visible); }
						this._textToolParserBuffer = data.slice(data.length - longestPartialPrefix);
						data = "";
						break;
					} else {
						// All visible, clean other control tokens
						visibleOut += this.stripControlTokens(data);
						data = "";
						break;
					}
				}
				// Emit text before the token
				const pre = data.slice(0, b);
				if (pre) {
					visibleOut += this.stripControlTokens(pre);
				}
				// Advance past BEGIN
				data = data.slice(b + BEGIN.length);

				// Find the delimiter that ends the name/index segment
				const a = data.indexOf(ARG_BEGIN);
				const e = data.indexOf(END);
				let delimIdx = -1;
				let delimKind: "arg" | "end" | undefined = undefined;
				if (a !== -1 && (e === -1 || a < e)) { delimIdx = a; delimKind = "arg"; }
				else if (e !== -1) { delimIdx = e; delimKind = "end"; }
				else {
					// Incomplete header; keep for next chunk (re-add BEGIN so we don't lose it)
					this._textToolParserBuffer = BEGIN + data;
					data = "";
					break;
				}

				const header = data.slice(0, delimIdx).trim();
				const m = header.match(/^([A-Za-z0-9_\-.]+)(?::(\d+))?/);
				const name = m?.[1] ?? undefined;
				const index = m?.[2] ? Number(m?.[2]) : undefined;
				this._textToolActive = { name, index, argBuffer: "", emitted: false };
				// Advance past delimiter token
				if (delimKind === "arg") {
					data = data.slice(delimIdx + ARG_BEGIN.length);
				} else /* end */ {
					// No args, finalize immediately
					data = data.slice(delimIdx + END.length);
					const did = this.emitTextToolCallIfValid(progress, this._textToolActive, "{}");
					if (did) {
						this._textToolActive.emitted = true;
						emittedAny = true;
					}
					this._textToolActive = undefined;
				}
				continue;
			}

			// We are inside arguments, collect until END and emit as soon as JSON becomes valid
			const e2 = data.indexOf(END);
			if (e2 === -1) {
				// No end marker yet, accumulate and check for early valid JSON
				this._textToolActive.argBuffer += data;
				// Early emit when JSON becomes valid and we haven't emitted yet
				if (!this._textToolActive.emitted) {
					const did = this.emitTextToolCallIfValid(progress, this._textToolActive, this._textToolActive.argBuffer);
					if (did) {
						this._textToolActive.emitted = true;
						emittedAny = true;
					}
				}
				data = "";
				break;
			} else {
				this._textToolActive.argBuffer += data.slice(0, e2);
				// Consume END
				data = data.slice(e2 + END.length);
				// Final attempt to emit if not already
				if (!this._textToolActive.emitted) {
					const did = this.emitTextToolCallIfValid(progress, this._textToolActive, this._textToolActive.argBuffer);
					if (did) {
						emittedAny = true;
					}
				}
				this._textToolActive = undefined;
				continue;
			}
		}

		// Emit any visible text
		const textToEmit = visibleOut;
		if (textToEmit && textToEmit.length > 0) {
			progress.report(new vscode.LanguageModelTextPart(textToEmit));
			emittedText = true;
			emittedAny = true;
		}

		// Store leftover for next chunk
		this._textToolParserBuffer = data;

		return { emittedText, emittedAny };
	}

	private emitTextToolCallIfValid(
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		call: { name?: string; index?: number; argBuffer: string; emitted?: boolean },
		argText: string,
	): boolean {
		const name = call.name ?? "unknown_tool";
		const parsed = tryParseJSONObject(argText);
		if (!parsed.ok) {
			return false;
		}
		const canonical = JSON.stringify(parsed.value);
		const key = `${name}:${canonical}`;
		// identity-based dedupe when index is present
		if (typeof call.index === "number") {
			const idKey = `${name}:${call.index}`;
			if (this._emittedTextToolCallIds.has(idKey)) {
				return false;
			}
			// Mark identity as emitted
			this._emittedTextToolCallIds.add(idKey);
		} else if (this._emittedTextToolCallKeys.has(key)) {
			return false;
		}
		this._emittedTextToolCallKeys.add(key);
		const id = `tct_${Math.random().toString(36).slice(2, 10)}`;
		progress.report(new vscode.LanguageModelToolCallPart(id, name, parsed.value));
		return true;
	}

	private async flushActiveTextToolCall(
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
	): Promise<void> {
		if (!this._textToolActive) {
			return;
		}
		const argText = this._textToolActive.argBuffer;
		const parsed = tryParseJSONObject(argText);
		if (!parsed.ok) {
			return;
		}
		// Emit (dedupe ensures we don't double-emit)
		this.emitTextToolCallIfValid(progress, this._textToolActive, argText);
		this._textToolActive = undefined;
	}

	/**
	 * Try to emit a buffered tool call when a valid name and JSON arguments are available.
	 * @param index The tool call index from the stream.
	 * @param progress Progress reporter for parts.
	 */
	private async tryEmitBufferedToolCall(
		index: number,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>
	): Promise<void> {
		const buf = this._toolCallBuffers.get(index);
		if (!buf) {
			return;
		}
		if (!buf.name) {
			return;
		}
		const canParse = tryParseJSONObject(buf.args);
		if (!canParse.ok) {
			return;
		}
		const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
		const parameters = canParse.value;
		try {
			const canonical = JSON.stringify(parameters);
			this._emittedTextToolCallKeys.add(`${buf.name}:${canonical}`);
		} catch { /* ignore */ }
		progress.report(new vscode.LanguageModelToolCallPart(id, buf.name, parameters));
		this._toolCallBuffers.delete(index);
		this._completedToolCallIndices.add(index);
	}

	/**
	 * Flush all buffered tool calls, optionally throwing if arguments are not valid JSON.
	 * @param progress Progress reporter for parts.
	 * @param throwOnInvalid If true, throw when a tool call has invalid JSON args.
	 */
	private async flushToolCallBuffers(
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		throwOnInvalid: boolean,
	): Promise<void> {
		if (this._toolCallBuffers.size === 0) {
			return;
		}
		for (const [idx, buf] of Array.from(this._toolCallBuffers.entries())) {
			const parsed = tryParseJSONObject(buf.args);
			if (!parsed.ok) {
				if (throwOnInvalid) {
					console.error("[Synthetic Model Provider] Invalid JSON for tool call", { idx, snippet: (buf.args || "").slice(0, 200) });
					throw new Error("Invalid JSON for tool call");
				}
				// When not throwing (e.g. on [DONE]), drop silently to reduce noise
				continue;
			}
			const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
			const name = buf.name ?? "unknown_tool";
			try {
				const canonical = JSON.stringify(parsed.value);
				this._emittedTextToolCallKeys.add(`${name}:${canonical}`);
			} catch { /* ignore */ }
			progress.report(new vscode.LanguageModelToolCallPart(id, name, parsed.value));
			this._toolCallBuffers.delete(idx);
			this._completedToolCallIndices.add(idx);
		}
	}

	/** Strip provider control tokens like <|tool_calls_section_begin|> and <|tool_call_begin|> from streamed text. */
	private stripControlTokens(text: string): string {
		try {
			// Remove section markers and explicit tool call begin/argument/end markers that some backends stream as text
			return text
				.replace(/<\|[a-zA-Z0-9_-]+_section_(?:begin|end)\|>/g, "")
				.replace(/<\|tool_call_(?:argument_)?(?:begin|end)\|>/g, "");
		} catch {
			return text;
		}
	}

}
