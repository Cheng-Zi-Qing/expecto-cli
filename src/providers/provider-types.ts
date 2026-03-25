import { z } from "zod";

export const modelRoleSchema = z.enum([
  "main",
  "fast",
  "reviewer",
  "planner",
  "summarizer",
  "observer",
]);

export const providerMessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
]);

export const providerMessageSchema = z.object({
  role: providerMessageRoleSchema,
  content: z.string().min(1),
});

export const providerRequestSchema = z.object({
  role: modelRoleSchema,
  mode: z.enum(["fast", "balanced", "strict"]),
  model: z.string().min(1),
  messages: z.array(providerMessageSchema).min(1),
});

export const providerResponseSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  outputText: z.string(),
  stopReason: z.string().min(1),
});

export const providerCapabilitiesSchema = z.object({
  supportsTools: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsStructuredOutput: z.boolean(),
  supportsVision: z.boolean(),
  supportsLongContext: z.boolean().optional(),
});

export type ModelRole = z.infer<typeof modelRoleSchema>;
export type ProviderMessageRole = z.infer<typeof providerMessageRoleSchema>;
export type ProviderMessage = z.infer<typeof providerMessageSchema>;
export type ProviderRequest = z.infer<typeof providerRequestSchema> & {
  signal?: AbortSignal;
};
export type ProviderResponse = z.infer<typeof providerResponseSchema>;
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export type ModelProvider = {
  id: string;
  capabilities: ProviderCapabilities;
  complete(request: ProviderRequest): Promise<ProviderResponse>;
};
