import type { ReadLine, CloseInteractiveInput } from "./interactive-input.ts";
import type { BootstrapContext } from "./bootstrap-context.ts";
import { EventLogStore } from "./event-log-store.ts";
import {
  RuntimeSession,
  type AssistantStepInput,
  type AssistantStepResult,
  type RuntimeSessionHooks,
} from "./runtime-session.ts";
import type { SessionInterruptController } from "./session-interrupt.ts";
import { createSessionId } from "./session-id.ts";
import { SessionSnapshotStore } from "./session-snapshot-store.ts";

export type SessionFactoryOptions = RuntimeSessionHooks & {
  write: (chunk: string) => void;
  readLine?: ReadLine;
  closeInput?: CloseInteractiveInput;
  assistantStep?: (input: AssistantStepInput) => Promise<AssistantStepResult | null> | AssistantStepResult | null;
  interruptController?: SessionInterruptController;
  maxTurnLimit?: number;
};

export function createRuntimeSession(
  context: BootstrapContext,
  options: SessionFactoryOptions,
): RuntimeSession {
  return new RuntimeSession({
    sessionId: createSessionId(),
    context,
    eventLogStore: new EventLogStore(context.projectRoot),
    snapshotStore: new SessionSnapshotStore(context.projectRoot),
    write: options.write,
    ...(options.readLine ? { readLine: options.readLine } : {}),
    ...(options.closeInput ? { closeInput: options.closeInput } : {}),
    ...(options.assistantStep ? { assistantStep: options.assistantStep } : {}),
    ...(options.interruptController ? { interruptController: options.interruptController } : {}),
    ...(options.maxTurnLimit !== undefined ? { maxTurnLimit: options.maxTurnLimit } : {}),
    ...(options.onSystemLine ? { onSystemLine: options.onSystemLine } : {}),
    ...(options.onUserPrompt ? { onUserPrompt: options.onUserPrompt } : {}),
    ...(options.onAssistantOutput ? { onAssistantOutput: options.onAssistantOutput } : {}),
    ...(options.onExecutionItem ? { onExecutionItem: options.onExecutionItem } : {}),
    ...(options.onInteractionEvent ? { onInteractionEvent: options.onInteractionEvent } : {}),
    ...(options.onRuntimeStateChange ? { onRuntimeStateChange: options.onRuntimeStateChange } : {}),
    ...(options.onConversationCleared ? { onConversationCleared: options.onConversationCleared } : {}),
    ...(options.onPromptInterrupted ? { onPromptInterrupted: options.onPromptInterrupted } : {}),
  });
}
