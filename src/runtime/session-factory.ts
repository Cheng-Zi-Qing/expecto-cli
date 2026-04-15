import type { ReadLine, CloseInteractiveInput } from "./interactive-input.ts";
import type { BootstrapContext } from "./bootstrap-context.ts";
import {
  RuntimeSession,
  type AssistantStepInput,
  type AssistantStepResult,
} from "./runtime-session.ts";
import type { SessionInterruptController } from "./session-interrupt.ts";
import type { DomainFact } from "../protocol/domain-event-schema.ts";
import type { CommandExecutionEffect } from "../commands/command-executor.ts";
import { createSessionId } from "./session-id.ts";
import { SessionSnapshotStore } from "./session-snapshot-store.ts";

export type SessionFactoryOptions = {
  write: (chunk: string) => void;
  readLine?: ReadLine;
  closeInput?: CloseInteractiveInput;
  assistantStep?: (input: AssistantStepInput) => Promise<AssistantStepResult | null> | AssistantStepResult | null;
  interruptController?: SessionInterruptController;
  maxTurnLimit?: number;
  emitFact?: (fact: DomainFact) => void;
  onLocalEffect?: (effect: CommandExecutionEffect) => void;
};

export function createRuntimeSession(
  context: BootstrapContext,
  options: SessionFactoryOptions,
): RuntimeSession {
  return new RuntimeSession({
    sessionId: createSessionId(),
    context,
    snapshotStore: new SessionSnapshotStore(context.projectRoot),
    write: options.write,
    ...(options.readLine ? { readLine: options.readLine } : {}),
    ...(options.closeInput ? { closeInput: options.closeInput } : {}),
    ...(options.assistantStep ? { assistantStep: options.assistantStep } : {}),
    ...(options.interruptController ? { interruptController: options.interruptController } : {}),
    ...(options.maxTurnLimit !== undefined ? { maxTurnLimit: options.maxTurnLimit } : {}),
    ...(options.emitFact ? { emitFact: options.emitFact } : {}),
    ...(options.onLocalEffect ? { onLocalEffect: options.onLocalEffect } : {}),
  });
}
