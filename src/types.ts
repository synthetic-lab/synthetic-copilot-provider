import { z, ZodLazy } from "zod";

const ModelModalitySpec = z.literal("text").or(z.literal("image")).or(z.literal("file"));

const QuantizationSpec = z.literal("int4")
  .or(z.literal("int8"))
  .or(z.literal("fp4"))
  .or(z.literal("fp6"))
  .or(z.literal("fp8"))
  .or(z.literal("fp16"))
  .or(z.literal("bf16"))
  .or(z.literal("fp32"));

const SamplingParameterSpec = z.literal("temperature")
  .or(z.literal("top_p"))
  .or(z.literal("top_k"))
  .or(z.literal("repetition_penalty"))
  .or(z.literal("frequency_penalty"))
  .or(z.literal("presence_penalty"))
  .or(z.literal("stop"))
  .or(z.literal("seed"));

const ModelFeatureSpec = z.literal("tools")
  .or(z.literal("json_mode"))
  .or(z.literal("structured_outputs"))
  .or(z.literal("web_search"))
  .or(z.literal("reasoning"));

const SyntheticModelDetailsSchema = z.object({
	// Synthetic specific params
	always_on: z.boolean(),
	provider: z.string(),

	// Required OpenRouter params
	id: z.string(),
	hugging_face_id: z.string(),
	name: z.string(),
	input_modalities: z.array(ModelModalitySpec),
	output_modalities: z.array(ModelModalitySpec),
	context_length: z.number(),
	pricing: z.object({
		prompt: z.string(),
		completion: z.string(),
		image: z.string(),
		request: z.string(),
		input_cache_reads: z.string(),
		input_cache_writes: z.string(),
	}),

	// Required OpenRouter params that are not provided for non-self-hosted models.
	created: z.number().optional(),
	max_output_length: z.number().optional(),
	quantization: QuantizationSpec.optional(),
	supported_sampling_parameters: z.array(SamplingParameterSpec).optional(),
	supported_features: z.array(ModelFeatureSpec).optional(),

	// Opetional OpenRouter params.
	description: z.string().optional(),
	openrouter: z.object({
		slug: z.string(),
	}).optional(),
	datacenters: z.array(z.object({
		country_code: z.string(),
	})).optional(),
});
export type SyntheticModelDetails = z.infer<typeof SyntheticModelDetailsSchema>;

// Zod schema for validating the SyntheticModelsResponse
export const SyntheticModelsResponseSchema = z.object({
	data: z.array(SyntheticModelDetailsSchema),
});

// Zod schema for validating the models.dev API response
const SyntheticModelDevDetailsSchema = z.object({
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
});
export type SyntheticModelDevDetails = z.infer<typeof SyntheticModelDevDetailsSchema>;

export const SyntheticModelsDevApiResponseSchema = z.object({
	synthetic: z.object({
		models: z.record(z.string(), SyntheticModelDevDetailsSchema),
	}),
});
