import { z } from "zod";

const nonEmptyString = z.string().min(1);

const causationSchema = z.object({
  requestId: nonEmptyString,
});

export const domainEventSchema = z.object({
  protocolVersion: nonEmptyString,
  eventId: nonEmptyString,
  sessionId: nonEmptyString,
  eventType: nonEmptyString,
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  causation: causationSchema.optional(),
  payload: z.record(z.string(), z.unknown()),
}).passthrough();

export const domainFactSchema = z.object({
  eventType: nonEmptyString,
  sessionId: nonEmptyString,
  timestamp: z.string().datetime(),
  causation: causationSchema.optional(),
  payload: z.record(z.string(), z.unknown()),
});

export const protocolErrorSchema = z.object({
  protocolVersion: nonEmptyString,
  error: z.object({
    code: nonEmptyString,
    message: z.string(),
  }),
});

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainFact = z.infer<typeof domainFactSchema>;
export type Causation = z.infer<typeof causationSchema>;
export type ProtocolError = z.infer<typeof protocolErrorSchema>;
