import * as assert from "assert";
import * as vscode from "vscode";
import { provideTokenCount } from "../utils";



suite("Token Estimation Tests", () => {

    test("should count tokens for simple text string", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const text = "Hello world, this is a test!";
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, text, token);

        // "Hello world, this is a test!" should be 8 tokens with cl100k_base
        assert.strictEqual(result, 8, "Should count 8 tokens for simple text");
    });

    test("should count tokens for empty string", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const text = "";
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, text, token);

        assert.strictEqual(result, 0, "Should count 0 tokens for empty string");
    });

    test("should count tokens for text with special characters", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const text = "Hello, world! ¿Cómo estás? 12345";
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, text, token);

        // This should be more than a simple English sentence
        assert.ok(result > 0, "Should count tokens for text with special characters");
        assert.ok(result > 5, "Should have reasonable token count");
    });

    test("should count tokens for LanguageModelChatRequestMessage", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const message: vscode.LanguageModelChatRequestMessage = {
            role: vscode.LanguageModelChatMessageRole.User,
            content: [new vscode.LanguageModelTextPart("Count tokens for this message")],
            name: "test-user"
        };
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, message, token);

        // "Count tokens for this message" should be a reasonable number of tokens
        assert.ok(result > 0, "Should count tokens for message");
        assert.ok(result >= 5, "Should have reasonable token count for message");
    });

    test("should count tokens for message with multiple text parts", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const message: vscode.LanguageModelChatRequestMessage = {
            role: vscode.LanguageModelChatMessageRole.User,
            content: [
                new vscode.LanguageModelTextPart("First part "),
                new vscode.LanguageModelTextPart("and second part")
            ],
            name: "test-user"
        };
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, message, token);

        // Combined text "First part and second part" should be counted
        assert.ok(result > 0, "Should count tokens for message with multiple parts");
    });

    test("should ignore non-text parts in message", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const message: vscode.LanguageModelChatRequestMessage = {
            role: vscode.LanguageModelChatMessageRole.Assistant,
            content: [
                new vscode.LanguageModelTextPart("Text content "),
                // Simulate a tool call part (non-text) - these should be ignored
                new vscode.LanguageModelToolCallPart("call-123", "some_tool", { param: "value" })
            ],
            name: "test-assistant"
        };
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, message, token);

        // Only "Text content " should be counted, tool call should be ignored
        assert.ok(result > 0, "Should count tokens from text parts only");
        assert.ok(result < 10, "Should not include tool call in token count");
    });

    test("should handle cancellation token", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const text = "This is a long text that would take time to process";
        const tokenSource = new vscode.CancellationTokenSource();

        // Cancel immediately
        tokenSource.cancel();

        try {
            await provideTokenCount(model, text, tokenSource.token);
            assert.fail("Should throw error when cancelled");
        } catch (error) {
            assert.strictEqual((error as Error).message, "Token count operation was cancelled");
        }
    });

    test("should handle very long text", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        // Create a long text by repeating a phrase
        const longText = "This is a test. ".repeat(100);
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, longText, token);

        // Long text should have more tokens than short text
        assert.ok(result > 100, "Should count many tokens for long text");
        assert.ok(result < 1000, "Should have reasonable token count for long text");
    });

    test("should handle text with newlines and whitespace", async () => {
        const model = { id: "test-model" } as vscode.LanguageModelChatInformation;
        const text = `Line 1
Line 2
	Indented line

Multiple newlines`;
        const token = new vscode.CancellationTokenSource().token;

        const result = await provideTokenCount(model, text, token);

        assert.ok(result > 0, "Should count tokens for text with newlines");
    });
});
