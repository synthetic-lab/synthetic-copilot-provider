import * as assert from "assert";
import * as vscode from "vscode";
import { convertTools } from "../utils";
import { sampletools, oaitools } from "./fixtures/tool_data";

suite("Tool Conversion Tests", () => {

	// Sample tool definitions with proper schemas (based on good.json)
	const sampleToolDefinitions = [
		{
			type: "function" as const,
			function: {
				name: "read_file",
				description: "Read the contents of a file. Line numbers are 1-indexed. This tool will truncate its output at 2000 lines and may be called repeatedly with offset and limit parameters to read larger files in chunks.",
				parameters: {
					type: "object",
					required: ["filePath"],
					properties: {
						filePath: {
							type: "string",
							description: "The absolute path to the file to read."
						},
						offset: {
							type: "number",
							description: "Optional: the 1-based line number to start reading from."
						},
						limit: {
							type: "number",
							description: "Optional: the maximum number of lines to read."
						}
					}
				}
			}
		},
		{
			type: "function" as const,
			function: {
				name: "create_file",
				description: "This is a tool for creating a new file in the workspace. The file will be created with the specified content. The directory will be created if it does not already exist. Never use this tool to edit a file that already exists.",
				parameters: {
					type: "object",
					required: ["filePath", "content"],
					properties: {
						filePath: {
							type: "string",
							description: "The absolute path to the file to create."
						},
						content: {
							type: "string",
							description: "The content to write to the file."
						}
					}
				}
			}
		},
		{
			type: "function" as const,
			function: {
				name: "grep_search",
				description: "Do a fast text search in the workspace. Use this tool when you want to search with an exact string or regex.",
				parameters: {
					type: "object",
					required: ["query", "isRegexp"],
					properties: {
						query: {
							type: "string",
							description: "The pattern to search for in files in the workspace."
						},
						isRegexp: {
							type: "boolean",
							description: "Whether the pattern is a regex."
						},
						includePattern: {
							type: "string",
							description: "Search files matching this glob pattern."
						},
						maxResults: {
							type: "number",
							description: "The maximum number of results to return."
						}
					}
				}
			}
		}
	];

	suite("Tool Definitions Tests", () => {
		test("should have proper parameter schemas", () => {
			for (const tool of sampleToolDefinitions) {
				assert.ok(tool.function.parameters, `Tool ${tool.function.name} should have parameters`);
				assert.strictEqual(tool.function.parameters.type, "object", `Tool ${tool.function.name} should have object parameters`);
				assert.ok(tool.function.parameters.properties, `Tool ${tool.function.name} should have properties`);
				assert.ok(Object.keys(tool.function.parameters.properties).length > 0, `Tool ${tool.function.name} should have at least one property`);

				// Check required parameters
				if (tool.function.parameters.required) {
					assert.ok(Array.isArray(tool.function.parameters.required), `Tool ${tool.function.name} should have array of required params`);

					// Ensure required parameters exist in properties
					for (const requiredParam of tool.function.parameters.required) {
						// @ts-ignore - TypeScript can't infer the exact property structure
						assert.ok((tool.function.parameters.properties as any)[requiredParam], `Tool ${tool.function.name} should have property for required param ${requiredParam}`);
					}
				}
			}
		});

		test("should validate read_file tool schema", () => {
			const readFileTool = sampleToolDefinitions.find(t => t.function.name === "read_file");
			assert.ok(readFileTool, "read_file tool should exist");

			const params = readFileTool!.function.parameters;
			assert.deepStrictEqual(params.required, ["filePath"], "read_file should require filePath");
			assert.ok(params.properties.filePath, "read_file should have filePath property");
			assert.ok(params.properties.offset, "read_file should have offset property");
			assert.ok(params.properties.limit, "read_file should have limit property");
		});

		test("should validate create_file tool schema", () => {
			const createFileTool = sampleToolDefinitions.find(t => t.function.name === "create_file");
			assert.ok(createFileTool, "create_file tool should exist");

			const params = createFileTool!.function.parameters;
			assert.deepStrictEqual(params.required, ["filePath", "content"], "create_file should require filePath and content");
			assert.ok(params.properties.filePath, "create_file should have filePath property");
			assert.ok(params.properties.content, "create_file should have content property");
		});

		test("should handle tools with no parameters", () => {
			// Test that tools with empty parameters still work
			const toolWithNoParams = {
				type: "function" as const,
				function: {
					name: "test_tool",
					description: "A tool with no parameters",
					parameters: { type: "object", properties: {} }
				}
			};

			assert.ok(toolWithNoParams.function.parameters, "Tool should have parameters object");
			assert.strictEqual(toolWithNoParams.function.parameters.type, "object", "Parameters should be object type");
			assert.deepStrictEqual(toolWithNoParams.function.parameters.properties, {}, "Properties should be empty");
		});
	});
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