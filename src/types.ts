

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
