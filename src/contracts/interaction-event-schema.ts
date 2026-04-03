import { z } from "zod";

const nonEmptyStringSchema = z.string().min(1);

const assistantResponseStartedEventType = "assistant_response_started";
const assistantStreamChunkEventType = "assistant_stream_chunk";
const assistantResponseCompletedEventType = "assistant_response_completed";
const executionItemStartedEventType = "execution_item_started";
const executionItemChunkEventType = "execution_item_chunk";
const executionItemCompletedEventType = "execution_item_completed";
const requestCompletedEventType = "request_completed";
const sessionInitializedEventType = "session_initialized";
const userPromptReceivedEventType = "user_prompt_received";
const sessionStateChangedEventType = "session_state_changed";
const conversationClearedEventType = "conversation_cleared";
const promptInterruptedEventType = "prompt_interrupted";
const commandEffectEventType = "command_effect";

const interactionEventTypeValues = [
  assistantResponseStartedEventType,
  assistantStreamChunkEventType,
  assistantResponseCompletedEventType,
  executionItemStartedEventType,
  executionItemChunkEventType,
  executionItemCompletedEventType,
  requestCompletedEventType,
  sessionInitializedEventType,
  userPromptReceivedEventType,
  sessionStateChangedEventType,
  conversationClearedEventType,
  promptInterruptedEventType,
  commandEffectEventType,
] as const;

export const interactionEventTypeSchema = z.enum(interactionEventTypeValues);

export const interactionEventEnvelopeFieldsSchema = z
  .object({
    timestamp: z.string().datetime(),
    sessionId: nonEmptyStringSchema,
    turnId: nonEmptyStringSchema,
    requestId: nonEmptyStringSchema,
  })
  .strict();

export const assistantChannelSchema = z.enum(["output_text", "reasoning_text"]);
export const assistantFormatSchema = z.enum(["markdown", "plain_text"]);
const assistantToolCallFinishReasonValue = "tool_calls";
const assistantNonToolCallFinishReasonValues = [
  "stop",
  "max_tokens",
  "interrupted",
  "error",
  "content_filter",
] as const;
const assistantFinishReasonValues = [
  assistantToolCallFinishReasonValue,
  ...assistantNonToolCallFinishReasonValues,
] as const;
export const assistantFinishReasonSchema = z.enum(assistantFinishReasonValues);

const assistantContinuationValues = ["none", "awaiting_execution"] as const;
const assistantNonToolCallsContinuationValue = assistantContinuationValues[0];
const assistantToolCallsContinuationValue = assistantContinuationValues[1];
export const assistantContinuationSchema = z.enum(assistantContinuationValues);

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

export const assistantUsageStatsSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);

export const assistantNonToolCallFinishReasonSchema = z.enum(
  assistantNonToolCallFinishReasonValues,
);

export const plannedExecutionIdsSchema = z
  .array(nonEmptyStringSchema)
  .min(1, {
    message: "plannedExecutionIds must be non-empty when finishReason is tool_calls",
  })
  .refine((value) => new Set(value).size === value.length, {
    message: "plannedExecutionIds must be de-duplicated when finishReason is tool_calls",
  });

const assistantResponseCompletedPayloadBaseSchema = z.object({
  responseId: nonEmptyStringSchema,
  usage: assistantUsageStatsSchema.optional(),
  errorCode: nonEmptyStringSchema.optional(),
});

export const assistantResponseCompletedToolCallsPayloadSchema =
  assistantResponseCompletedPayloadBaseSchema
    .extend({
      finishReason: z.literal(assistantToolCallFinishReasonValue),
      continuation: z.literal(assistantToolCallsContinuationValue),
      plannedExecutionIds: plannedExecutionIdsSchema,
    })
    .strict();

export const assistantResponseCompletedNonToolCallsPayloadSchema =
  assistantResponseCompletedPayloadBaseSchema
    .extend({
      finishReason: assistantNonToolCallFinishReasonSchema,
      continuation: z.literal(assistantNonToolCallsContinuationValue),
    })
    .strict();

export const assistantResponseCompletedPayloadSchema = z.discriminatedUnion(
  "finishReason",
  [
    assistantResponseCompletedToolCallsPayloadSchema,
    assistantResponseCompletedNonToolCallsPayloadSchema,
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

export const executionItemStartedPayloadSchema = z
  .object({
    executionId: nonEmptyStringSchema,
    executionKind: executionKindSchema,
    title: nonEmptyStringSchema,
    origin: executionOriginSchema,
  })
  .strict();

export const executionItemChunkPayloadSchema = z
  .object({
    executionId: nonEmptyStringSchema,
    stream: executionStreamSchema,
    output: z.string(),
  })
  .strict();

export const executionItemCompletedPayloadSchema = z
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

export const requestCompletedStatusSchema = z.enum([
  "completed",
  "interrupted",
  "error",
]);

export const requestCompletedPayloadSchema = z
  .object({
    status: requestCompletedStatusSchema,
    errorCode: nonEmptyStringSchema.optional(),
  })
  .strict();

export const sessionInitializedPayloadSchema = z
  .object({
    sessionId: nonEmptyStringSchema,
  })
  .strict();

export const userPromptReceivedPayloadSchema = z
  .object({
    prompt: z.string(),
  })
  .strict();

// Session-level events: not scoped to a specific turn/request
export const sessionLevelEventEnvelopeFieldsSchema = z
  .object({
    timestamp: z.string().datetime(),
    sessionId: nonEmptyStringSchema,
  })
  .strict();

export const sessionStateSchema = z.enum(["ready", "streaming", "interrupted", "error"]);

export const sessionStateChangedPayloadSchema = z
  .object({
    state: sessionStateSchema,
  })
  .strict();

export const conversationClearedPayloadSchema = z.object({}).strict();

export const commandEffectKindSchema = z.enum(["open_theme_picker"]);

export const commandEffectPayloadSchema = z
  .object({
    kind: commandEffectKindSchema,
  })
  .strict();

export const promptInterruptedPayloadSchema = z
  .object({
    prompt: z.string(),
  })
  .strict();

type InteractionEventTypeValue = z.infer<typeof interactionEventTypeSchema>;

const buildSessionLevelEventSchema = <
  TEventType extends InteractionEventTypeValue,
  TPayload extends z.ZodTypeAny,
>(
  eventType: TEventType,
  payloadSchema: TPayload,
) =>
  sessionLevelEventEnvelopeFieldsSchema
    .extend({
      eventType: z.literal(eventType),
      payload: payloadSchema,
    })
    .strict();

const buildEventSchema = <
  TEventType extends InteractionEventTypeValue,
  TPayload extends z.ZodTypeAny,
>(
  eventType: TEventType,
  payloadSchema: TPayload,
) =>
  interactionEventEnvelopeFieldsSchema
    .extend({
      eventType: z.literal(eventType),
      payload: payloadSchema,
    })
    .strict();

export const assistantResponseStartedEventSchema = buildEventSchema(
  assistantResponseStartedEventType,
  assistantResponseStartedPayloadSchema,
);

export const assistantStreamChunkEventSchema = buildEventSchema(
  assistantStreamChunkEventType,
  assistantStreamChunkPayloadSchema,
);

export const assistantResponseCompletedEventSchema = buildEventSchema(
  assistantResponseCompletedEventType,
  assistantResponseCompletedPayloadSchema,
);

export const executionItemStartedEventSchema = buildEventSchema(
  executionItemStartedEventType,
  executionItemStartedPayloadSchema,
);

export const executionItemChunkEventSchema = buildEventSchema(
  executionItemChunkEventType,
  executionItemChunkPayloadSchema,
);

export const executionItemCompletedEventSchema = buildEventSchema(
  executionItemCompletedEventType,
  executionItemCompletedPayloadSchema,
);

export const requestCompletedEventSchema = buildEventSchema(
  requestCompletedEventType,
  requestCompletedPayloadSchema,
);

export const sessionInitializedEventSchema = buildSessionLevelEventSchema(
  sessionInitializedEventType,
  sessionInitializedPayloadSchema,
);

export const userPromptReceivedEventSchema = buildEventSchema(
  userPromptReceivedEventType,
  userPromptReceivedPayloadSchema,
);

export const sessionStateChangedEventSchema = buildSessionLevelEventSchema(
  sessionStateChangedEventType,
  sessionStateChangedPayloadSchema,
);

export const conversationClearedEventSchema = buildSessionLevelEventSchema(
  conversationClearedEventType,
  conversationClearedPayloadSchema,
);

export const promptInterruptedEventSchema = buildSessionLevelEventSchema(
  promptInterruptedEventType,
  promptInterruptedPayloadSchema,
);

export const commandEffectEventSchema = buildSessionLevelEventSchema(
  commandEffectEventType,
  commandEffectPayloadSchema,
);

export const interactionEventSchema = z.discriminatedUnion("eventType", [
  assistantResponseStartedEventSchema,
  assistantStreamChunkEventSchema,
  assistantResponseCompletedEventSchema,
  executionItemStartedEventSchema,
  executionItemChunkEventSchema,
  executionItemCompletedEventSchema,
  requestCompletedEventSchema,
  sessionInitializedEventSchema,
  userPromptReceivedEventSchema,
  sessionStateChangedEventSchema,
  conversationClearedEventSchema,
  promptInterruptedEventSchema,
  commandEffectEventSchema,
]);

export type InteractionEventType = z.infer<typeof interactionEventTypeSchema>;
export type InteractionEventEnvelopeFields = z.infer<
  typeof interactionEventEnvelopeFieldsSchema
>;
export type AssistantChannel = z.infer<typeof assistantChannelSchema>;
export type AssistantFormat = z.infer<typeof assistantFormatSchema>;
export type AssistantFinishReason = z.infer<typeof assistantFinishReasonSchema>;
export type AssistantContinuation = z.infer<typeof assistantContinuationSchema>;
export type AssistantResponseStartedPayload = z.infer<
  typeof assistantResponseStartedPayloadSchema
>;
export type AssistantStreamChunkPayload = z.infer<
  typeof assistantStreamChunkPayloadSchema
>;
export type AssistantUsageStats = z.infer<typeof assistantUsageStatsSchema>;
export type AssistantNonToolCallFinishReason = z.infer<
  typeof assistantNonToolCallFinishReasonSchema
>;
export type PlannedExecutionIds = z.infer<typeof plannedExecutionIdsSchema>;
export type AssistantResponseCompletedPayload = z.infer<
  typeof assistantResponseCompletedPayloadSchema
>;
export type ExecutionKind = z.infer<typeof executionKindSchema>;
export type ExecutionStream = z.infer<typeof executionStreamSchema>;
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;
export type ExecutionOrigin = z.infer<typeof executionOriginSchema>;
export type ExecutionItemStartedPayload = z.infer<
  typeof executionItemStartedPayloadSchema
>;
export type ExecutionItemChunkPayload = z.infer<
  typeof executionItemChunkPayloadSchema
>;
export type ExecutionItemCompletedPayload = z.infer<
  typeof executionItemCompletedPayloadSchema
>;
export type RequestCompletedStatus = z.infer<typeof requestCompletedStatusSchema>;
export type RequestCompletedPayload = z.infer<typeof requestCompletedPayloadSchema>;
export type SessionInitializedPayload = z.infer<typeof sessionInitializedPayloadSchema>;
export type UserPromptReceivedPayload = z.infer<typeof userPromptReceivedPayloadSchema>;
export type AssistantResponseStartedEvent = z.infer<
  typeof assistantResponseStartedEventSchema
>;
export type AssistantStreamChunkEvent = z.infer<
  typeof assistantStreamChunkEventSchema
>;
export type AssistantResponseCompletedEvent = z.infer<
  typeof assistantResponseCompletedEventSchema
>;
export type ExecutionItemStartedEvent = z.infer<
  typeof executionItemStartedEventSchema
>;
export type ExecutionItemChunkEvent = z.infer<typeof executionItemChunkEventSchema>;
export type ExecutionItemCompletedEvent = z.infer<
  typeof executionItemCompletedEventSchema
>;
export type RequestCompletedEvent = z.infer<typeof requestCompletedEventSchema>;
export type SessionInitializedEvent = z.infer<typeof sessionInitializedEventSchema>;
export type UserPromptReceivedEvent = z.infer<typeof userPromptReceivedEventSchema>;
export type SessionLevelEventEnvelopeFields = z.infer<typeof sessionLevelEventEnvelopeFieldsSchema>;
export type SessionState = z.infer<typeof sessionStateSchema>;
export type SessionStateChangedPayload = z.infer<typeof sessionStateChangedPayloadSchema>;
export type ConversationClearedPayload = z.infer<typeof conversationClearedPayloadSchema>;
export type PromptInterruptedPayload = z.infer<typeof promptInterruptedPayloadSchema>;
export type SessionStateChangedEvent = z.infer<typeof sessionStateChangedEventSchema>;
export type ConversationClearedEvent = z.infer<typeof conversationClearedEventSchema>;
export type PromptInterruptedEvent = z.infer<typeof promptInterruptedEventSchema>;
export type CommandEffectKind = z.infer<typeof commandEffectKindSchema>;
export type CommandEffectPayload = z.infer<typeof commandEffectPayloadSchema>;
export type CommandEffectEvent = z.infer<typeof commandEffectEventSchema>;
export type InteractionEvent = z.infer<typeof interactionEventSchema>;
