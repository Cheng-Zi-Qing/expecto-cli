import type { ReadLine, CloseInteractiveInput } from "./interactive-input.ts";
import type { BootstrapContext } from "./bootstrap-context.ts";
import type { ProviderRunner } from "../providers/provider-runner.ts";
import type {
  AssistantStepInput,
  AssistantStepResult,
  RuntimeSessionResult,
} from "./runtime-session.ts";
import type { SessionInterruptController } from "./session-interrupt.ts";
import type { DomainFact } from "../protocol/domain-event-schema.ts";
import type { CommandExecutionEffect } from "../commands/command-executor.ts";
import { createRuntimeSession } from "./session-factory.ts";

export type SessionManagerOptions = {
  write?: (chunk: string) => void;
  readLine?: ReadLine;
  closeInput?: CloseInteractiveInput;
  assistantStep?: (input: AssistantStepInput) => Promise<AssistantStepResult | null> | AssistantStepResult | null;
  providerRunner?: ProviderRunner;
  interruptController?: SessionInterruptController;
  maxTurnLimit?: number;
  emitFact?: (fact: DomainFact) => void;
  onLocalEffect?: (effect: CommandExecutionEffect) => void;
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
  private readonly maxTurnLimit: number | undefined;
  private readonly emitFact: ((fact: DomainFact) => void) | undefined;
  private readonly onLocalEffect: ((effect: CommandExecutionEffect) => void) | undefined;

  constructor(options: SessionManagerOptions = {}) {
    this.write = options.write ?? defaultWrite;
    this.readLine = options.readLine;
    this.closeInput = options.closeInput;
    this.assistantStep = options.assistantStep;
    this.providerRunner = options.providerRunner;
    this.interruptController = options.interruptController;
    this.maxTurnLimit = options.maxTurnLimit;
    this.emitFact = options.emitFact;
    this.onLocalEffect = options.onLocalEffect;
  }

  async run(context: BootstrapContext): Promise<RuntimeSessionResult> {
    const assistantStep = this.assistantStep ?? this.providerRunner?.createAssistantStep();
    const session = createRuntimeSession(context, {
      write: this.write,
      ...(this.readLine ? { readLine: this.readLine } : {}),
      ...(this.closeInput ? { closeInput: this.closeInput } : {}),
      ...(assistantStep ? { assistantStep } : {}),
      ...(this.interruptController ? { interruptController: this.interruptController } : {}),
      ...(this.maxTurnLimit !== undefined ? { maxTurnLimit: this.maxTurnLimit } : {}),
      ...(this.emitFact ? { emitFact: this.emitFact } : {}),
      ...(this.onLocalEffect ? { onLocalEffect: this.onLocalEffect } : {}),
    });

    return session.run();
  }
}
