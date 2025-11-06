

import { z } from "zod";

export interface SyntheticModelItem {
	id: string;
	name: string;
	provider: string;
	always_on?: boolean;
	hugging_face_id?: string;
	input_modalities: string[];
	output_modalities: string[];
	context_length?: number;
	max_output_length?: number;
	pricing?: {
		prompt: string;
		completion: string;
		image?: string;
		request?: string;
		input_cache_reads?: string;
		input_cache_writes?: string;
	};
	created?: number;
	quantization?: string;
	supported_sampling_parameters?: string[];
	supported_features?: string[];
	openrouter?: {
		slug: string;
	};
	datacenters?: Array<{
		country_code: string;
	}>;
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
	limit?: {
		context: number;
		output: number;
	};
}


/**
 * Response envelope for the router models listing.
 */
export interface SyntheticModelsResponse {
	data: SyntheticModelItem[];
}

// Zod schema for validating the SyntheticModelsResponse
export const SyntheticModelsResponseSchema = z.object({
	data: z.array(z.object({
		id: z.string(),
		name: z.string(),
		provider: z.string(),
		always_on: z.boolean().optional(),
		hugging_face_id: z.string().optional(),
		input_modalities: z.array(z.string()),
		output_modalities: z.array(z.string()),
		context_length: z.number().optional(),
		max_output_length: z.number().optional(),
		pricing: z.object({
			prompt: z.string(),
			completion: z.string(),
			image: z.string().optional(),
			request: z.string().optional(),
			input_cache_reads: z.string().optional(),
			input_cache_writes: z.string().optional(),
		}).optional(),
		created: z.number().optional(),
		quantization: z.string().optional(),
		supported_sampling_parameters: z.array(z.string()).optional(),
		supported_features: z.array(z.string()).optional(),
		openrouter: z.object({
			slug: z.string(),
		}).optional(),
		datacenters: z.array(z.object({
			country_code: z.string(),
		})).optional(),
	})),
});

// Infer the TypeScript type directly from the schema
export type ValidatedSyntheticModelsResponse = z.infer<typeof SyntheticModelsResponseSchema>;

// Zod schema for validating the model details API response
export const ModelDetailsApiResponseSchema = z.object({
	synthetic: z.object({
		models: z.record(z.string(), z.object({
			id: z.string(),
			name: z.string(),
			attachment: z.boolean(),
			reasoning: z.boolean(),
			temperature: z.boolean(),
			tool_call: z.boolean(),
			knowledge: z.string().optional(),
			release_date: z.string().optional(),
			last_updated: z.string().optional(),
			modalities: z.object({
				input: z.array(z.string()),
				output: z.array(z.string()),
			}),
			open_weights: z.boolean(),
			cost: z.object({
				input: z.number(),
				output: z.number(),
			}),
			limit: z.object({
				context: z.number(),
				output: z.number(),
			}).optional(),
		})),
	}),
});

// Infer the TypeScript type directly from the schema
export type ValidatedModelDetailsApiResponse = z.infer<typeof ModelDetailsApiResponseSchema>;
