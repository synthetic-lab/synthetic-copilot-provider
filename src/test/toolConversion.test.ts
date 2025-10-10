import * as assert from "assert";
import * as vscode from "vscode";
import { convertTools, estimateMessagesTokens, estimateToolTokens } from "../utils";
import { sampletools, oaitools } from "./input_tools";

suite("Tool Conversion Tests", () => {
	test("should convert VS Code tools to OpenAI format", () => {
		const result = convertTools(sampletools);

		// Check that tools are present
		assert.ok(result.tools, "Result should have tools property");
		assert.strictEqual(result.tools!.length, sampletools.length, "Should have same number of tools");

		// Compare each tool
		for (let i = 0; i < sampletools.length; i++) {
			const expectedTool: any = oaitools[i];
			const actualTool: any = result.tools![i];

			// Check basic structure
			assert.strictEqual(actualTool.type, "function", "Tool should have type 'function'");
			assert.ok(actualTool.function, "Tool should have function property");

			// Check function name
			assert.strictEqual(actualTool.function.name, expectedTool.function.name,
				`Tool ${i} should have correct name`);

			// Check function description
			assert.strictEqual(actualTool.function.description, expectedTool.function.description,
				`Tool ${i} should have correct description`);

			// Check parameters structure
			assert.ok(actualTool.function.parameters, "Tool should have parameters");
			assert.strictEqual(actualTool.function.parameters.type, "object",
				"Parameters should have type 'object'");

			// Compare parameters object
			assert.deepStrictEqual(actualTool.function.parameters, expectedTool.function.parameters,
				`Tool ${i} parameters should match expected`);
		}
	});

	test("should handle empty tools array", () => {
		const result = convertTools([]);
		assert.deepStrictEqual(result, {}, "Should return empty object for empty array");
	});

	test("should handle undefined tools", () => {
		const result = convertTools(undefined as any);
		assert.deepStrictEqual(result, {}, "Should return empty object for undefined");
	});

	test("should handle tools with missing inputSchema", () => {
		const toolsWithMissingSchema: vscode.LanguageModelChatTool[] = [
			{
				name: "test_tool",
				description: "A tool with no schema"
			}
		];

		const result = convertTools(toolsWithMissingSchema);
		assert.ok(result.tools, "Should have tools property");
		assert.strictEqual(result.tools!.length, 1, "Should have one tool");

		const tool = result.tools![0];
		assert.strictEqual(tool.function.name, "test_tool", "Should have correct name");
		assert.strictEqual(tool.function.description, "A tool with no schema", "Should have correct description");

		// Should have default parameters structure (without additionalProperties for empty properties)
		assert.deepStrictEqual(tool.function.parameters, {
			type: "object",
			properties: {}
		}, "Should have default parameters structure");
	});
});

suite("Token Estimation Tests", () => {
	test("should estimate tokens for empty messages", () => {
		const messages: vscode.LanguageModelChatRequestMessage[] = [];
		const result = estimateMessagesTokens(messages);
		assert.strictEqual(result, 0, "Should return 0 for empty messages");
	});

	test("should estimate tokens for single message", () => {
		const messages: vscode.LanguageModelChatRequestMessage[] = [{
			role: vscode.LanguageModelChatMessageRole.User,
			content: [new vscode.LanguageModelTextPart("Hello")],
			name: "test-user"
		}];
		const result = estimateMessagesTokens(messages);
		assert.strictEqual(result, 2, "Should estimate tokens correctly");
	});

	test("should estimate tokens for multiple messages", () => {
		const messages: vscode.LanguageModelChatRequestMessage[] = [
			{
				role: vscode.LanguageModelChatMessageRole.User,
				content: [new vscode.LanguageModelTextPart("Hello")],
				name: "test-user"
			},
			{
				role: vscode.LanguageModelChatMessageRole.Assistant,
				content: [new vscode.LanguageModelTextPart("Hi there")],
				name: undefined
			}
		];
		const result = estimateMessagesTokens(messages);
		assert.strictEqual(result, 4, "Should estimate tokens correctly for multiple messages");
	});

	test("should estimate tokens for messages with multiple parts", () => {
		const messages: vscode.LanguageModelChatRequestMessage[] = [{
			role: vscode.LanguageModelChatMessageRole.User,
			content: [
				new vscode.LanguageModelTextPart("Hello,"),
				new vscode.LanguageModelTextPart(" how are you?"),
				new vscode.LanguageModelTextPart(" I'm doing well.")
			],
			name: "multi-part-user"
		}];
		const result = estimateMessagesTokens(messages);
		assert.strictEqual(result, 10, "Should estimate tokens correctly for multiple parts");
	});

	test("should estimate tokens for tool definitions - empty array", () => {
		const result = estimateToolTokens([]);
		assert.strictEqual(result, 0, "Should return 0 for empty tools array");
	});

	test("should estimate tokens for tool definitions - undefined", () => {
		const result = estimateToolTokens(undefined);
		assert.strictEqual(result, 0, "Should return 0 for undefined tools");
	});

	test("should estimate tokens for tool definitions - single tool", () => {
		const tools = [
			{
				type: "function",
				function: {
					name: "test_tool",
					description: "A test tool",
					parameters: {
						type: "object",
						properties: {
							param1: { type: "string" }
						}
					}
				}
			}
		];
		const result = estimateToolTokens(tools);
		assert.ok(result > 0, "Should return positive token count for valid tool");
	});

	test("should estimate tokens for tool definitions - multiple tools", () => {
		const tools = [
			{
				type: "function",
				function: {
					name: "tool1",
					description: "First tool",
					parameters: {
						type: "object",
						properties: {}
					}
				}
			},
			{
				type: "function",
				function: {
					name: "tool2",
					description: "Second tool",
					parameters: {
						type: "object",
						properties: {
							param1: { type: "string" }
						}
					}
				}
			}
		];
		const result = estimateToolTokens(tools);
		assert.ok(result > 0, "Should return positive token count for multiple tools");
	});

	test("should handle JSON stringify errors in tool token estimation", () => {
		// Create a circular reference to cause JSON.stringify error
		const circularObj: any = { name: "test" };
		circularObj.self = circularObj;
		const tools = [
			{
				type: "function",
				function: circularObj
			}
		];
		const result = estimateToolTokens(tools);
		assert.strictEqual(result, 0, "Should return 0 when JSON.stringify fails");
	});
});