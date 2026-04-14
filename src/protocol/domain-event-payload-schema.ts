import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);

export const assistantChannelSchema = z.enum(["output_text", "reasoning_text"]);
export const assistantFormatSchema = z.enum(["markdown", "plain_text"]);
export const assistantContinuationSchema = z.enum(["none", "awaiting_execution"]);
export const assistantNonToolCallFinishReasonSchema = z.enum([
  "stop",
  "max_tokens",
  "interrupted",
  "error",
  "content_filter",
]);
export const assistantUsageStatsSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);

export const plannedExecutionIdsSchema = z
  .array(nonEmptyStringSchema)
  .min(1, {
    message: "plannedExecutionIds must be non-empty when finishReason is tool_calls",
  })
  .refine((value) => new Set(value).size === value.length, {
    message: "plannedExecutionIds must be de-duplicated when finishReason is tool_calls",
  });

export const assistantResponseStartedPayloadSchema = z
  .object({
    responseId: nonEmptyStringSchema,
  })
  .strict();

export const assistantStreamChunkPayloadSchema = z
  .object({
    responseId: nonEmptyStringSchema,
    channel: assistantChannelSchema,
    format: assistantFormatSchema,
    delta: z.string(),
  })
  .strict();

const assistantResponseCompletedPayloadBaseSchema = z.object({
  responseId: nonEmptyStringSchema,
  usage: assistantUsageStatsSchema.optional(),
  errorCode: nonEmptyStringSchema.optional(),
});

export const assistantResponseCompletedPayloadSchema = z.discriminatedUnion(
  "finishReason",
  [
    assistantResponseCompletedPayloadBaseSchema
      .extend({
        finishReason: z.literal("tool_calls"),
        continuation: z.literal("awaiting_execution"),
        plannedExecutionIds: plannedExecutionIdsSchema,
      })
      .strict(),
    assistantResponseCompletedPayloadBaseSchema
      .extend({
        finishReason: assistantNonToolCallFinishReasonSchema,
        continuation: z.literal("none"),
      })
      .strict(),
  ],
);

export const executionKindSchema = z.enum(["command", "tool", "system"]);
export const executionStreamSchema = z.enum(["stdout", "stderr", "system"]);
export const executionStatusSchema = z.enum(["success", "error", "interrupted"]);

export const executionOriginSchema = z
  .object({})
  .catchall(z.unknown())
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "origin must be a non-empty object",
      });
    }
  });

export const executionStartedPayloadSchema = z
  .object({
    executionId: nonEmptyStringSchema,
    executionKind: executionKindSchema,
    title: nonEmptyStringSchema,
    origin: executionOriginSchema,
  })
  .strict();

export const executionChunkPayloadSchema = z
  .object({
    executionId: nonEmptyStringSchema,
    stream: executionStreamSchema,
    output: z.string(),
  })
  .strict();

export const executionCompletedPayloadSchema = z
  .object({
    executionId: nonEmptyStringSchema,
    status: executionStatusSchema,
    summary: nonEmptyStringSchema.refine((value) => !/[\r\n]/.test(value), {
      message: "summary must be a single line",
    }),
    exitCode: z.number().int().nonnegative().optional(),
    errorCode: nonEmptyStringSchema.optional(),
  })
  .strict();

const requestTerminalPayloadSchema = z
  .object({
    code: nonEmptyStringSchema,
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict();

export const requestSucceededPayloadSchema = z.object({}).strict();
export const requestFailedPayloadSchema = requestTerminalPayloadSchema;
export const requestRejectedPayloadSchema = requestTerminalPayloadSchema;

export const sessionStartedPayloadSchema = z
  .object({
    mode: z.string().min(1),
    entryKind: z.enum(["interactive", "print", "continue", "resume"]),
  })
  .strict();

export const userPromptReceivedPayloadSchema = z
  .object({
    prompt: z.string(),
  })
  .strict();

export type AssistantNonToolCallFinishReason = z.infer<
  typeof assistantNonToolCallFinishReasonSchema
>;
export type AssistantUsageStats = z.infer<typeof assistantUsageStatsSchema>;
export type ExecutionKind = z.infer<typeof executionKindSchema>;
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type ExecutionStream = z.infer<typeof executionStreamSchema>;
