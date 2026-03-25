import { z } from "zod";

export const sideEffectScopeSchema = z.enum([
  "workspace",
  "user-home",
  "system",
  "remote",
  "external",
]);

export const toolResultErrorSchema = z.object({
  message: z.string().min(1),
  code: z.string().min(1).optional(),
  recoverable: z.boolean().optional(),
});

export const toolResultMetadataSchema = z.object({
  durationMs: z.number().nonnegative(),
  tokensUsed: z.number().int().nonnegative().optional(),
  sideEffects: z.array(sideEffectScopeSchema),
});

export const toolResultSchema = z
  .object({
    tool: z.string().min(1),
    success: z.boolean(),
    data: z.unknown().optional(),
    error: toolResultErrorSchema.optional(),
    metadata: toolResultMetadataSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.success && !value.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error is required when success is false",
        path: ["error"],
      });
    }

    if (value.success && value.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error must be absent when success is true",
        path: ["error"],
      });
    }
  });

export type SideEffectScope = z.infer<typeof sideEffectScopeSchema>;
export type ToolResultError = z.infer<typeof toolResultErrorSchema>;
export type ToolResultMetadata = z.infer<typeof toolResultMetadataSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
