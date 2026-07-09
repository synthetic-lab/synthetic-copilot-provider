"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyntheticModelsDevApiResponseSchema = exports.SyntheticModelsResponseSchema = void 0;
var zod_1 = require("zod");
var ModelModalitySpec = zod_1.z.literal("text").or(zod_1.z.literal("image")).or(zod_1.z.literal("file"));
var QuantizationSpec = zod_1.z
    .literal("int4")
    .or(zod_1.z.literal("int8"))
    .or(zod_1.z.literal("fp4"))
    .or(zod_1.z.literal("fp6"))
    .or(zod_1.z.literal("fp8"))
    .or(zod_1.z.literal("fp16"))
    .or(zod_1.z.literal("bf16"))
    .or(zod_1.z.literal("fp32"))
    .or(zod_1.z.literal("nvfp4"))
    .or(zod_1.z.literal("mxfp4"));
var SamplingParameterSpec = zod_1.z
    .literal("temperature")
    .or(zod_1.z.literal("top_p"))
    .or(zod_1.z.literal("top_k"))
    .or(zod_1.z.literal("repetition_penalty"))
    .or(zod_1.z.literal("frequency_penalty"))
    .or(zod_1.z.literal("presence_penalty"))
    .or(zod_1.z.literal("stop"))
    .or(zod_1.z.literal("seed"));
var ModelFeatureSpec = zod_1.z
    .literal("tools")
    .or(zod_1.z.literal("json_mode"))
    .or(zod_1.z.literal("structured_outputs"))
    .or(zod_1.z.literal("web_search"))
    .or(zod_1.z.literal("reasoning"));
var SyntheticModelDetailsSchema = zod_1.z.object({
    // Synthetic specific params
    always_on: zod_1.z.boolean().optional(),
    provider: zod_1.z.string(),
    // Required OpenRouter params
    id: zod_1.z.string(),
    hugging_face_id: zod_1.z.string().optional(),
    name: zod_1.z.string(),
    input_modalities: zod_1.z.array(ModelModalitySpec),
    output_modalities: zod_1.z.array(ModelModalitySpec),
    context_length: zod_1.z.number().optional(),
    pricing: zod_1.z
        .object({
        prompt: zod_1.z.string().optional(),
        completion: zod_1.z.string().optional(),
        image: zod_1.z.string().optional(),
        request: zod_1.z.string().optional(),
        input_cache_reads: zod_1.z.string().optional(),
        input_cache_writes: zod_1.z.string().optional(),
    })
        .optional(),
    // Required OpenRouter params that are not provided for non-self-hosted models.
    created: zod_1.z.number().optional(),
    max_output_length: zod_1.z.number().optional(),
    quantization: QuantizationSpec.optional(),
    supported_sampling_parameters: zod_1.z.array(SamplingParameterSpec).optional(),
    supported_features: zod_1.z.array(ModelFeatureSpec).optional(),
    // Opetional OpenRouter params.
    description: zod_1.z.string().optional(),
    openrouter: zod_1.z
        .object({
        slug: zod_1.z.string(),
    })
        .optional(),
    datacenters: zod_1.z
        .array(zod_1.z.object({
        country_code: zod_1.z.string(),
    }))
        .optional(),
});
// Zod schema for validating the SyntheticModelsResponse
exports.SyntheticModelsResponseSchema = zod_1.z.object({
    data: zod_1.z.array(SyntheticModelDetailsSchema),
});
// Zod schema for validating the models.dev API response
var SyntheticModelDevDetailsSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    attachment: zod_1.z.boolean(),
    reasoning: zod_1.z.boolean(),
    temperature: zod_1.z.boolean(),
    tool_call: zod_1.z.boolean(),
    knowledge: zod_1.z.string().optional(),
    release_date: zod_1.z.string().optional(),
    last_updated: zod_1.z.string().optional(),
    modalities: zod_1.z.object({
        input: zod_1.z.array(zod_1.z.string()),
        output: zod_1.z.array(zod_1.z.string()),
    }),
    open_weights: zod_1.z.boolean(),
    cost: zod_1.z.object({
        input: zod_1.z.number(),
        output: zod_1.z.number(),
    }),
    limit: zod_1.z
        .object({
        context: zod_1.z.number(),
        output: zod_1.z.number(),
    })
        .optional(),
});
exports.SyntheticModelsDevApiResponseSchema = zod_1.z.object({
    synthetic: zod_1.z.object({
        models: zod_1.z.record(zod_1.z.string(), SyntheticModelDevDetailsSchema),
    }),
});
