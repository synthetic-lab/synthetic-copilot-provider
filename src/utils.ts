import * as vscode from "vscode";
import OpenAI from 'openai';

/**
 * Convert an array of VS Code LanguageModelChatRequestMessage to a single OpenAI ChatCompletionCreateParamsStreaming
 * @param messages Array of VS Code chat messages to convert
 * @param tools Optional array of tool definitions to include in the request
 * @returns OpenAI ChatCompletionCreateParamsStreaming object with all messages collapsed into one conversation
 */
export function convertRequestToOpenAI(messages: vscode.LanguageModelChatRequestMessage[], tools?: vscode.LanguageModelChatTool[]): OpenAI.ChatCompletionCreateParamsStreaming {
	const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

	for (const message of messages) {
		// Convert role
		let openaiRole: 'system' | 'user' | 'assistant' | 'tool';
		switch (message.role) {
			case vscode.LanguageModelChatMessageRole.User:
				openaiRole = 'user';
				break;
			case vscode.LanguageModelChatMessageRole.Assistant:
				openaiRole = 'assistant';
				break;
			default:
				openaiRole = 'user'; // Default to user for unknown roles
		}

		// Convert content
		const contentParts: string[] = [];
		const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
		let toolCallId: string | undefined;
		let toolResult: string | undefined;

		for (const part of message.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				contentParts.push(part.value);
			} else if (part instanceof vscode.LanguageModelToolCallPart) {
				// Convert tool call parts
				toolCalls.push({
					id: part.callId,
					type: 'function',
					function: {
						name: part.name,
						arguments: JSON.stringify(part.input)
					}
				});
			} else if (part instanceof vscode.LanguageModelToolResultPart) {
				// Tool result parts become tool messages
				const toolResultContent: string[] = [];
				for (const resultPart of part.content) {
					if (resultPart instanceof vscode.LanguageModelTextPart) {
						toolResultContent.push(resultPart.value);
					}
				}
				toolCallId = part.callId;
				toolResult = toolResultContent.join('');
			}
		}

		// Create the OpenAI message based on content type
		if (contentParts.length > 0) {
			const messageContent = contentParts.join('');

			if (openaiRole === 'assistant' && toolCalls.length > 0) {
				// Assistant message with tool calls
				openaiMessages.push({
					role: openaiRole,
					content: messageContent,
					name: message.name || undefined,
					tool_calls: toolCalls
				} as OpenAI.ChatCompletionAssistantMessageParam);
			} else if (toolCallId && toolResult) {
				// Tool result message
				openaiMessages.push({
					role: 'tool',
					content: toolResult,
					tool_call_id: toolCallId
				} as OpenAI.ChatCompletionToolMessageParam);
			} else {
				// Standard message (user, assistant, or system)
				openaiMessages.push({
					role: openaiRole,
					content: messageContent,
					name: message.name || undefined
				});
			}
		} else if (toolCallId && toolResult) {
			// Tool result message without text content
			openaiMessages.push({
				role: 'tool',
				content: toolResult,
				tool_call_id: toolCallId
			} as OpenAI.ChatCompletionToolMessageParam);
		}
	}

	const result: any = {
		stream: true,
		messages: openaiMessages
	};

	// Include tool definitions if provided
	if (tools && tools.length > 0) {
		const toolDefs = convertTools(tools);
		if (toolDefs.tools) {
			result.tools = toolDefs.tools;
		}
		if (toolDefs.tool_choice) {
			result.tool_choice = toolDefs.tool_choice;
		}
	}

	return result;
}

/**
 * Roughly estimate tokens for VS Code chat messages (text only)
 * @param msgs Messages to estimate tokens for
 * @returns Estimated token count
 */
export function estimateMessagesTokens(msgs: readonly vscode.LanguageModelChatMessage[] | readonly vscode.LanguageModelChatRequestMessage[]): number {
	let total = 0;
	for (const m of msgs) {
		for (const part of m.content) {
			// Handle both old and new message types
			if (part instanceof vscode.LanguageModelTextPart) {
				total += Math.ceil((part as any).value.length / 4);
			} else if (typeof part === 'object' && part !== null && 'value' in part && typeof (part as any).value === 'string') {
				total += Math.ceil((part as any).value.length / 4);
			}
		}
	}
	return total;
}

/**
 * Convert VS Code tool definitions to OpenAI function tool definitions.
 * @param tools Array of VS Code LanguageModelChatTool objects
 */
export function convertTools(tools: vscode.LanguageModelChatTool[]): { tools?: any[]; tool_choice?: any } {
	if (!tools || tools.length === 0) {
		return {};
	}

	const toolDefs = tools
		.filter((t) => t && typeof t === "object")
		.map((t) => {
			const name = t.name;
			const description = typeof t.description === "string" ? t.description : "";
			const params = t.inputSchema ?? {
				type: "object",
				properties: {}
			};

			// Special case: if there are no properties, don't include additionalProperties
			const paramsWithSchema = params as any;
			if (Object.keys(paramsWithSchema.properties || {}).length === 0 && paramsWithSchema.additionalProperties === undefined) {
				delete paramsWithSchema.additionalProperties;
			}

			return {
				type: "function" as const,
				function: {
					name,
					description,
					parameters: params,
				},
			};
		});

	let tool_choice: "auto" | { type: "function"; function: { name: string } } = "auto";

	return { tools: toolDefs, tool_choice };
}





/**
 * Rough token estimate for tool definitions by JSON size
 * @param tools Tools to estimate tokens for
 * @returns Estimated token count
 */
export function estimateToolTokens(tools: { type: string; function: { name: string; description?: string; parameters?: object } }[] | undefined): number {
	if (!tools || tools.length === 0) { return 0; }
	try {
		const json = JSON.stringify(tools);
		return Math.ceil(json.length / 4);
	} catch {
		return 0;
	}
}
