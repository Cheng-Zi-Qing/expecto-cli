import { randomUUID } from "node:crypto";

import type { DomainEvent, DomainFact } from "./domain-event-schema.ts";
import { PROTOCOL_VERSION } from "./protocol-version.ts";

export type ProtocolEmitterOptions = {
  onEvent: (event: DomainEvent) => void;
};

export type ProtocolEmitter = {
  emit: (fact: DomainFact) => void;
};

export function createProtocolEmitter(
  options: ProtocolEmitterOptions,
): ProtocolEmitter {
  const sequenceCounters = new Map<string, number>();

  return {
    emit(fact: DomainFact): void {
      const currentSequence = (sequenceCounters.get(fact.sessionId) ?? 0) + 1;
      sequenceCounters.set(fact.sessionId, currentSequence);

      const event: DomainEvent = {
        protocolVersion: PROTOCOL_VERSION,
        eventId: randomUUID(),
        sessionId: fact.sessionId,
        eventType: fact.eventType,
        sequence: currentSequence,
        timestamp: fact.timestamp,
        ...(fact.causation ? { causation: fact.causation } : {}),
        payload: fact.payload,
      };

      options.onEvent(event);
    },
  };
}
