/**
 * OpenAI function-call entry emitted by assistant messages.
 */
export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

/**
 * OpenAI function tool definition used to advertise tools.
 */
export interface OpenAIFunctionToolDef {
	type: "function";
	function: { name: string; description?: string; parameters?: object };
}

/**
 * OpenAI-style chat message used for router requests.
 */
export interface OpenAIChatMessage {
	role: OpenAIChatRole;
	content?: string;
	name?: string;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

export interface SyntheticModelItem {
	id: string;
	object: string;
}

/**
 * Model details from https://models.dev/api.json
 */
export interface SyntheticModelDetails {
	id: string;
	name: string;
	attachment: boolean;
	reasoning: boolean;
	temperature: boolean;
	tool_call: boolean;
	knowledge?: string;
	release_date?: string;
	last_updated?: string;
	modalities: {
		input: string[];
		output: string[];
	};
	open_weights: boolean;
	cost: {
		input: number;
		output: number;
	};
	limit: {
		context: number;
		output: number;
	};
}


/**
 * Response envelope for the router models listing.
 */
export interface SyntheticModelsResponse {
	object: string;
	data: SyntheticModelItem[];
}

/**
 * Buffer used to accumulate streamed tool call parts until arguments are valid JSON.
 */
export interface ToolCallBuffer {
	id?: string;
	name?: string;
	args: string;
}

/** OpenAI-style chat roles. */
export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";
