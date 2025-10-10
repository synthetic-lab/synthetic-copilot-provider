

import * as vscode from "vscode";
import { z } from "zod";

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
	limit?: {
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

// Zod schema for validating the SyntheticModelsResponse
export const SyntheticModelsResponseSchema = z.object({
	object: z.string(),
	data: z.array(z.object({
		id: z.string(),
		object: z.string(),
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
