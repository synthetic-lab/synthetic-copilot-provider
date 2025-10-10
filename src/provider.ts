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
import {
	SyntheticModelsService,
	BASE_URL
} from "./syntheticModels";

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
			}; const openai = new OpenAI({
				baseURL: BASE_URL,
				apiKey: apiKey,
				defaultHeaders: { 'User-Agent': this.userAgent }
			});

			const stream = await openai.chat.completions.create(openAIRequest);

			for await (const chunk of stream) {
				if (token.isCancellationRequested) {
					break;
				}
				const choice = chunk.choices[0];
				if (!choice) {
					continue;
				}
				const delta = choice.delta;
				// Handle text content
				const content = delta?.content;
				if (content) {
					progress.report(new vscode.LanguageModelTextPart(content));
				}

				// Handle tool calls
				const toolCalls = delta?.tool_calls;
				if (toolCalls && toolCalls.length > 0) {
					for (const toolCall of toolCalls) {
						if (toolCall.id && toolCall.function?.name) {
							// Parse function arguments if provided, otherwise use empty object
							let input: object = {};
							if (toolCall.function.arguments) {
								try {
									input = JSON.parse(toolCall.function.arguments);
								} catch (error) {
									console.warn("[Synthetic Model Provider] Failed to parse tool call arguments:", error);
									// Use empty object if parsing fails
									input = {};
								}
							}
							const toolCallPart = new vscode.LanguageModelToolCallPart(
								toolCall.id,
								toolCall.function.name,
								input
							);
							progress.report(toolCallPart);
						}
					}
				}
			}
		} catch (error) {
			console.error("[Synthetic Model Provider] Error during chat completion:", error);
			throw error;
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
		text: string | LanguageModelChatRequestMessage,
		token: CancellationToken
	): Promise<number> {
		return provideTokenCount(model, text, token);
	}
}
