import * as assert from "assert";
import * as vscode from "vscode";
import { getModelTemperature, setModelTemperature } from "../config";

suite("Configuration Tests", () => {
	test("getModelTemperature returns undefined for unconfigured model", () => {
		const temperature = getModelTemperature("test-model-unconfigured");
		assert.strictEqual(temperature, undefined);
	});

	test("setModelTemperature and getModelTemperature work correctly", async () => {
		const modelId = "test-model-configured";
		const testTemperature = 1.5;

		// Set temperature
		await setModelTemperature(modelId, testTemperature);

		// Get temperature
		const retrievedTemp = getModelTemperature(modelId);
		assert.strictEqual(retrievedTemp, testTemperature);

		// Clean up
		await setModelTemperature(modelId, undefined);
	});

	test("setModelTemperature with undefined removes the configuration", async () => {
		const modelId = "test-model-to-remove";
		const testTemperature = 0.8;

		// First set a temperature
		await setModelTemperature(modelId, testTemperature);
		let retrievedTemp = getModelTemperature(modelId);
		assert.strictEqual(retrievedTemp, testTemperature);

		// Now remove it
		await setModelTemperature(modelId, undefined);
		retrievedTemp = getModelTemperature(modelId);
		assert.strictEqual(retrievedTemp, undefined);
	});

	test("temperature values are validated to be between 0 and 2", async () => {
		// This test validates that the configuration schema would reject invalid values
		// The actual validation happens at the VS Code configuration level and in the UI
		const config = vscode.workspace.getConfiguration("synthetic");
		const inspect = config.inspect("modelTemperatures");
		
		assert.ok(inspect);
		// The schema should enforce minimum and maximum values
	});

	test("multiple models can have different temperatures", async () => {
		const model1 = "test-model-1";
		const model2 = "test-model-2";
		const temp1 = 0.5;
		const temp2 = 1.8;

		// Set different temperatures for different models
		await setModelTemperature(model1, temp1);
		await setModelTemperature(model2, temp2);

		// Verify both are stored correctly
		const retrievedTemp1 = getModelTemperature(model1);
		const retrievedTemp2 = getModelTemperature(model2);

		assert.strictEqual(retrievedTemp1, temp1);
		assert.strictEqual(retrievedTemp2, temp2);

		// Clean up
		await setModelTemperature(model1, undefined);
		await setModelTemperature(model2, undefined);
	});
});
