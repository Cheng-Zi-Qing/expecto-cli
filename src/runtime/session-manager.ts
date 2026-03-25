import type { ReadLine, CloseInteractiveInput } from "./interactive-input.ts";
import type { BootstrapContext } from "./bootstrap-context.ts";
import type { ProviderRunner } from "../providers/provider-runner.ts";
import type {
  AssistantStepInput,
  AssistantStepResult,
  RuntimeSessionHooks,
  RuntimeSessionResult,
} from "./runtime-session.ts";
import type { SessionInterruptController } from "./session-interrupt.ts";
import { createRuntimeSession } from "./session-factory.ts";

export type SessionManagerOptions = {
  write?: (chunk: string) => void;
  readLine?: ReadLine;
  closeInput?: CloseInteractiveInput;
  assistantStep?: (input: AssistantStepInput) => Promise<AssistantStepResult | null> | AssistantStepResult | null;
  providerRunner?: ProviderRunner;
  interruptController?: SessionInterruptController;
  onSystemLine?: RuntimeSessionHooks["onSystemLine"];
  onUserPrompt?: RuntimeSessionHooks["onUserPrompt"];
  onAssistantOutput?: RuntimeSessionHooks["onAssistantOutput"];
  onExecutionItem?: RuntimeSessionHooks["onExecutionItem"];
  onRuntimeStateChange?: RuntimeSessionHooks["onRuntimeStateChange"];
  onConversationCleared?: RuntimeSessionHooks["onConversationCleared"];
  onPromptInterrupted?: RuntimeSessionHooks["onPromptInterrupted"];
};

function defaultWrite(chunk: string): void {
  process.stdout.write(chunk);
}

export class SessionManager {
  private readonly write: (chunk: string) => void;
  private readonly readLine: ReadLine | undefined;
  private readonly closeInput: CloseInteractiveInput | undefined;
  private readonly assistantStep?: SessionManagerOptions["assistantStep"];
  private readonly providerRunner: ProviderRunner | undefined;
  private readonly interruptController: SessionInterruptController | undefined;
  private readonly hooks: RuntimeSessionHooks;

  constructor(options: SessionManagerOptions = {}) {
    this.write = options.write ?? defaultWrite;
    this.readLine = options.readLine;
    this.closeInput = options.closeInput;
    this.assistantStep = options.assistantStep;
    this.providerRunner = options.providerRunner;
    this.interruptController = options.interruptController;
    this.hooks = {
      ...(options.onSystemLine ? { onSystemLine: options.onSystemLine } : {}),
      ...(options.onUserPrompt ? { onUserPrompt: options.onUserPrompt } : {}),
      ...(options.onAssistantOutput ? { onAssistantOutput: options.onAssistantOutput } : {}),
      ...(options.onExecutionItem ? { onExecutionItem: options.onExecutionItem } : {}),
      ...(options.onRuntimeStateChange ? { onRuntimeStateChange: options.onRuntimeStateChange } : {}),
      ...(options.onConversationCleared ? { onConversationCleared: options.onConversationCleared } : {}),
      ...(options.onPromptInterrupted ? { onPromptInterrupted: options.onPromptInterrupted } : {}),
    };
  }

  async run(context: BootstrapContext): Promise<RuntimeSessionResult> {
    const assistantStep = this.assistantStep ?? this.providerRunner?.createAssistantStep();
    const session = createRuntimeSession(context, {
      write: this.write,
      ...(this.readLine ? { readLine: this.readLine } : {}),
      ...(this.closeInput ? { closeInput: this.closeInput } : {}),
      ...(assistantStep ? { assistantStep } : {}),
      ...(this.interruptController ? { interruptController: this.interruptController } : {}),
      ...this.hooks,
    });

    return session.run();
  }
}
