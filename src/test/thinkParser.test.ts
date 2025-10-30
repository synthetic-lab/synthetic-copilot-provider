import * as assert from "assert";

import { ThinkSegment, ThinkTagParser } from "../thinkParser";

suite("ThinkTagParser", () => {
	test("parses inline thinking blocks", () => {
		const parser = new ThinkTagParser();

		const segments: ThinkSegment[] = [];
		segments.push(...parser.push("Hello<think>Reason</think>World"));
		segments.push(...parser.flush());

		const merged = mergeSegments(segments);

		assert.deepStrictEqual(merged, [
			{ kind: "text", value: "Hello" },
			{ kind: "thinking", value: "Reason" },
			{ kind: "text", value: "World" }
		]);
	});

	test("supports streamed content across chunks", () => {
		const parser = new ThinkTagParser();

		const segments: ThinkSegment[] = [];
		segments.push(...parser.push("Before <think>partial"));
		segments.push(...parser.push(" reasoning"));
		segments.push(...parser.push("</think> after"));
		segments.push(...parser.flush());

		const merged = mergeSegments(segments);

		assert.deepStrictEqual(merged, [
			{ kind: "text", value: "Before " },
			{ kind: "thinking", value: "partial reasoning" },
			{ kind: "text", value: " after" }
		]);
	});

	test("handles multiple thinking sections", () => {
		const parser = new ThinkTagParser();

		const segments: ThinkSegment[] = [];
		segments.push(...parser.push("<think>First</think> middle <think>Second</think>"));
		segments.push(...parser.flush());

		const merged = mergeSegments(segments);

		assert.deepStrictEqual(merged, [
			{ kind: "thinking", value: "First" },
			{ kind: "text", value: " middle " },
			{ kind: "thinking", value: "Second" }
		]);
	});
});

function mergeSegments(segments: ThinkSegment[]): ThinkSegment[] {
	if (segments.length === 0) {
		return [];
	}

	const result: ThinkSegment[] = [];
	let current = { ...segments[0] };

	for (let i = 1; i < segments.length; i++) {
		const segment = segments[i];
		if (segment.kind === current.kind) {
			current.value += segment.value;
			continue;
		}

		if (current.value.length > 0) {
			result.push({ ...current });
		}
		current = { ...segment };
	}

	if (current.value.length > 0) {
		result.push({ ...current });
	}

	return result;
}
