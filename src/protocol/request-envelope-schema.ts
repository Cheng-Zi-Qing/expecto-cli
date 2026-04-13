import { z } from "zod";

const nonEmptyString = z.string().min(1);

export const requestEnvelopeSchema = z.object({
  protocolVersion: nonEmptyString,
  requestId: nonEmptyString,
  sessionId: nonEmptyString,
  type: nonEmptyString,
  payload: z.record(z.string(), z.unknown()),
}).passthrough();

export type RequestEnvelope = z.infer<typeof requestEnvelopeSchema>;
