import * as assert from "assert";
import * as vscode from "vscode";

import { convertRequestToOpenAI } from "../utils";

interface OpenAIToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}
interface ConvertedMessage {
	role: "user" | "assistant" | "tool";
	content?: string;
	name?: string;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

suite("Synthetic Chat Provider Extension", () => {
	suite("provider", () => {

	});

		suite("convertRequest", () => {
		test("should convert request with tools", () => {
			const mockTools: vscode.LanguageModelChatTool[] = [
				{
					name: "read_file",
					description: "Read file contents",
					inputSchema: {
						type: "object",
						required: ["filePath"],
						properties: {
							filePath: { type: "string" }
						}
					}
				}
			];

			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelTextPart("Read a file")],
				name: "test-user"
			}];

			const result = convertRequestToOpenAI(messages, mockTools);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.ok(result.tools, "Should include tools in request");
			assert.strictEqual(result.tools!.length, 1, "Should have correct number of tools");
			assert.strictEqual((result.tools![0] as any).function.name, "read_file", "Should have correct tool name");
		});

		test("should convert request without tools", () => {
			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelTextPart("Hello")],
				name: "test-user"
			}];

			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.tools, undefined, "Should not include tools when not provided");
		});			test("should convert user message with text content", () => {
				const messages: vscode.LanguageModelChatRequestMessage[] = [{
					role: vscode.LanguageModelChatMessageRole.User,
					content: [new vscode.LanguageModelTextPart("Hello, how are you?")],
					name: "test-user"
				}];			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.messages![0].role, "user");
			assert.strictEqual(result.messages![0].content, "Hello, how are you?");
			assert.strictEqual(result.messages![0].name, "test-user");
		});

		test("should convert assistant message with text content", () => {
			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: vscode.LanguageModelChatMessageRole.Assistant,
				content: [new vscode.LanguageModelTextPart("I'm doing well, thank you!")],
				name: undefined
			}];

			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.messages![0].role, "assistant");
			assert.strictEqual(result.messages![0].content, "I'm doing well, thank you!");
			assert.strictEqual(result.messages![0].name, undefined);
		});

		test("should convert assistant message with tool calls", () => {
			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: vscode.LanguageModelChatMessageRole.Assistant,
				content: [
					new vscode.LanguageModelTextPart("I'll call a tool"),
					new vscode.LanguageModelToolCallPart("call-123", "getWeather", { location: "Boston" })
				],
				name: undefined
			}];

			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.messages![0].role, "assistant");
			assert.strictEqual(result.messages![0].content, "I'll call a tool");

			const assistantMessage = result.messages![0] as any;
			assert.ok(assistantMessage.tool_calls);
			assert.strictEqual(assistantMessage.tool_calls.length, 1);
			assert.strictEqual(assistantMessage.tool_calls[0].id, "call-123");
			assert.strictEqual(assistantMessage.tool_calls[0].type, "function");
			assert.strictEqual(assistantMessage.tool_calls[0].function.name, "getWeather");
			assert.strictEqual(assistantMessage.tool_calls[0].function.arguments, JSON.stringify({ location: "Boston" }));
		});

		test("should convert tool result message", () => {
			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: vscode.LanguageModelChatMessageRole.User, // Tool results are typically sent as user messages
				content: [
					new vscode.LanguageModelToolResultPart("call-123", [
						new vscode.LanguageModelTextPart("The weather in Boston is sunny")
					])
				],
				name: undefined
			}];

			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.messages![0].role, "tool");
			assert.strictEqual(result.messages![0].content, "The weather in Boston is sunny");
			assert.strictEqual((result.messages![0] as any).tool_call_id, "call-123");
		});

		test("should handle multiple text parts", () => {
			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: vscode.LanguageModelChatMessageRole.User,
				content: [
					new vscode.LanguageModelTextPart("Hello,"),
					new vscode.LanguageModelTextPart(" how are you?"),
					new vscode.LanguageModelTextPart(" I'm doing well.")
				],
				name: "multi-part-user"
			}];

			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.messages![0].content, "Hello, how are you? I'm doing well.");
		});

		test("should handle mixed content types", () => {
			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: vscode.LanguageModelChatMessageRole.Assistant,
				content: [
					new vscode.LanguageModelTextPart("I have a response and a tool call:"),
					new vscode.LanguageModelToolCallPart("call-456", "getTime", { format: "24h" }),
					new vscode.LanguageModelTextPart(" Please use the tool.")
				],
				name: undefined
			}];

			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.messages![0].role, "assistant");
			assert.strictEqual(result.messages![0].content, "I have a response and a tool call: Please use the tool.");

			const assistantMessage = result.messages![0] as any;
			assert.ok(assistantMessage.tool_calls);
			assert.strictEqual(assistantMessage.tool_calls.length, 1);
			assert.strictEqual(assistantMessage.tool_calls[0].id, "call-456");
			assert.strictEqual(assistantMessage.tool_calls[0].function.name, "getTime");
			assert.strictEqual(assistantMessage.tool_calls[0].function.arguments, JSON.stringify({ format: "24h" }));
		});

		test("should handle unknown role by defaulting to user", () => {
			// Create a message with an unknown role
			const messages: vscode.LanguageModelChatRequestMessage[] = [{
				role: 999 as vscode.LanguageModelChatMessageRole, // Unknown role
				content: [new vscode.LanguageModelTextPart("Unknown role message")],
				name: undefined
			}];

			const result = convertRequestToOpenAI(messages);

			assert.strictEqual(result.stream, true);
			assert.ok(result.messages);
			assert.strictEqual(result.messages!.length, 1);
			assert.strictEqual(result.messages![0].role, "user");
			assert.strictEqual(result.messages![0].content, "Unknown role message");
		});
	});

	suite("token counting", () => {
		test("should provide token count for text string", async () => {
			// Mock the provideTokenCount method
			const mockProvider = {
				provideTokenCount: async (model: any, text: string | vscode.LanguageModelChatRequestMessage, token: vscode.CancellationToken) => {
					return 44;
				}
			};

			const result = await mockProvider.provideTokenCount(
				{ id: "test-model" } as vscode.LanguageModelChatInformation,
				"test text",
				new vscode.CancellationTokenSource().token
			);

			assert.strictEqual(result, 44, "Should return fixed token count");
		});

		test("should provide token count for chat message", async () => {
			// Mock the provideTokenCount method
			const mockProvider = {
				provideTokenCount: async (model: any, text: string | vscode.LanguageModelChatRequestMessage, token: vscode.CancellationToken) => {
					return 44;
				}
			};

			const message: vscode.LanguageModelChatRequestMessage = {
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelTextPart("test message")],
				name: "test-user"
			};

			const result = await mockProvider.provideTokenCount(
				{ id: "test-model" } as vscode.LanguageModelChatInformation,
				message,
				new vscode.CancellationTokenSource().token
			);

			assert.strictEqual(result, 44, "Should return fixed token count for message");
		});
	});

});
