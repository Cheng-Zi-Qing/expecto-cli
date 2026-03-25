import type { ProviderMessage } from "../providers/provider-types.ts";
import type {
  SessionSnapshotSummary,
  SessionState,
} from "../contracts/session-snapshot-schema.ts";
import type { BootstrapContext } from "./bootstrap-context.ts";
import { EventLogStore } from "./event-log-store.ts";
import type { ReadLine, CloseInteractiveInput } from "./interactive-input.ts";
import type { SessionInterruptController } from "./session-interrupt.ts";
import { SessionSnapshotStore } from "./session-snapshot-store.ts";
import type { CommandExecutionEffect } from "../commands/command-executor.ts";
import { executeBuiltinCommand } from "../commands/command-executor.ts";

export type RuntimeSessionResult = {
  sessionId: string;
  state: SessionState;
  turnCount: number;
};

export type AssistantStepInput = {
  sessionId: string;
  turnId: string;
  prompt?: string;
  messages: ProviderMessage[];
  signal?: AbortSignal;
  context: BootstrapContext;
};

export type AssistantStepResult = {
  output?: string;
};

export type RuntimeSessionState = "ready" | "streaming" | "interrupted" | "error";

export type RuntimeSessionHooks = {
  onSystemLine?: (line: string) => void;
  onUserPrompt?: (prompt: string) => void;
  onAssistantOutput?: (output: string) => void;
  onExecutionItem?: (item: { summary: string; body?: string }) => void;
  onRuntimeStateChange?: (state: RuntimeSessionState) => void;
  onConversationCleared?: () => void;
  onPromptInterrupted?: (prompt: string) => void;
};

export type RuntimeSessionOptions = RuntimeSessionHooks & {
  sessionId: string;
  context: BootstrapContext;
  eventLogStore: EventLogStore;
  snapshotStore: SessionSnapshotStore;
  write: (chunk: string) => void;
  readLine?: ReadLine;
  closeInput?: CloseInteractiveInput;
  assistantStep?: (input: AssistantStepInput) => Promise<AssistantStepResult | null> | AssistantStepResult | null;
  interruptController?: SessionInterruptController;
};

function writeLine(write: (chunk: string) => void, line: string): void {
  write(`${line}\n`);
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  return error instanceof Error && error.name === "AbortError";
}

function promptFromEntry(entry: BootstrapContext["entry"]): string | undefined {
  switch (entry.kind) {
    case "interactive":
      return entry.initialPrompt;
    case "print":
      return entry.prompt;
    case "continue":
      return undefined;
    case "resume":
      return entry.session;
  }
}

function buildTurnPayload(entry: BootstrapContext["entry"]): Record<string, unknown> {
  switch (entry.kind) {
    case "interactive":
      return {
        turnId: "turn-1",
        entryKind: entry.kind,
        ...(entry.initialPrompt ? { prompt: entry.initialPrompt } : {}),
      };
    case "print":
      return {
        turnId: "turn-1",
        entryKind: entry.kind,
        prompt: entry.prompt,
      };
    case "continue":
      return {
        turnId: "turn-1",
        entryKind: entry.kind,
      };
    case "resume":
      return {
        turnId: "turn-1",
        entryKind: entry.kind,
        session: entry.session,
      };
  }
}

export class RuntimeSession {
  private readonly sessionId: string;
  private readonly context: BootstrapContext;
  private readonly eventLogStore: EventLogStore;
  private readonly snapshotStore: SessionSnapshotStore;
  private readonly write: (chunk: string) => void;
  private readonly readLine: ReadLine | undefined;
  private readonly closeInput: CloseInteractiveInput | undefined;
  private readonly assistantStep?: RuntimeSessionOptions["assistantStep"];
  private readonly interruptController: SessionInterruptController | undefined;
  private readonly hooks: RuntimeSessionHooks;
  private readonly conversation: ProviderMessage[] = [];
  private activeTurnAbortController: AbortController | undefined;
  private turnCount = 0;

  constructor(options: RuntimeSessionOptions) {
    this.sessionId = options.sessionId;
    this.context = options.context;
    this.eventLogStore = options.eventLogStore;
    this.snapshotStore = options.snapshotStore;
    this.write = options.write;
    this.readLine = options.readLine;
    this.closeInput = options.closeInput;
    this.assistantStep = options.assistantStep;
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

  private buildSnapshotSummary(): SessionSnapshotSummary | undefined {
    const activeTask = this.context.activeArtifacts.required.find((artifact) => artifact.kind === "task");
    const latestOptionalSummary = this.context.activeArtifacts.optional.find(
      (artifact) => artifact.kind === "summary",
    );
    const headline = latestOptionalSummary
      ? `Continue from ${latestOptionalSummary.title}.`
      : activeTask
        ? `Continue ${activeTask.title} from the active workspace docs.`
        : "Continue from the active workspace docs.";

    return {
      headline,
      ...(activeTask ? { currentTaskId: activeTask.title } : {}),
      nextStep: activeTask
        ? `Review ${activeTask.title} and continue the next verified step.`
        : "Review the active workspace documents and continue the next verified step.",
    };
  }

  async run(): Promise<RuntimeSessionResult> {
    await this.eventLogStore.append({
      type: "session:start",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      payload: {
        mode: this.context.mode,
        entryKind: this.context.entry.kind,
      },
    });

    this.renderHeader();
    this.emitRuntimeState("ready");

    const unsubscribeInterrupt = this.interruptController?.subscribe(() => {
      this.activeTurnAbortController?.abort();
    });

    try {
      switch (this.context.entry.kind) {
        case "interactive":
          this.renderEntryDetails();

          if (this.context.entry.initialPrompt) {
            const shouldExit = await this.processInput(this.context.entry.initialPrompt);

            if (shouldExit) {
              break;
            }
          }

          if (this.readLine) {
            await this.runInteractiveLoop();
          }
          break;
        case "print":
          this.renderEntryDetails();
          await this.processInput(this.context.entry.prompt);
          break;
        case "continue":
          this.renderEntryDetails();
          break;
        case "resume":
          this.renderEntryDetails();
          await this.processPrompt(this.context.entry.session);
          break;
      }
    } finally {
      await this.eventLogStore.append({
        type: "session:stop",
        sessionId: this.sessionId,
        timestamp: nowIsoString(),
        payload: {
          state: "idle",
        },
      });

      await this.snapshotStore.save({
        id: this.createSnapshotId(),
        sessionId: this.sessionId,
        state: "idle",
        activeArtifacts: [
          ...this.context.activeArtifacts.required,
          ...this.context.activeArtifacts.optional,
        ],
        activatedSkills: [],
        toolHistory: [],
        compactedSummary: this.context.sessionSummary,
        summary: this.buildSnapshotSummary(),
        updatedAt: nowIsoString(),
      });

      await this.closeInput?.();
      unsubscribeInterrupt?.();
    }

    return {
      sessionId: this.sessionId,
      state: "idle",
      turnCount: this.turnCount,
    };
  }

  private renderHeader(): void {
    switch (this.context.entry.kind) {
      case "interactive":
        this.emitSystemLine("beta interactive session");
        break;
      case "print":
        this.emitSystemLine("beta one-shot session");
        break;
      case "continue":
        this.emitSystemLine("beta continue session");
        break;
      case "resume":
        this.emitSystemLine("beta resume session");
        break;
    }

    this.emitSystemLine(`session: ${this.sessionId}`);
    this.emitSystemLine(`mode: ${this.context.mode}`);
    this.emitSystemLine(`project: ${this.context.projectRoot}`);
  }

  private renderEntryDetails(): void {
    switch (this.context.entry.kind) {
      case "interactive":
        if (this.context.entry.initialPrompt) {
          this.emitSystemLine(`initial prompt: ${this.context.entry.initialPrompt}`);
        }
        break;
      case "print":
        this.emitSystemLine(`prompt: ${this.context.entry.prompt}`);
        break;
      case "continue":
        break;
      case "resume":
        this.emitSystemLine(`session: ${this.context.entry.session}`);
        break;
    }
  }

  private createSnapshotId(): string {
    return `snapshot-${this.sessionId}-${Date.now()}`;
  }

  private async runInteractiveLoop(): Promise<void> {
    const readLine = this.readLine;

    if (!readLine) {
      return;
    }

    while (true) {
      const line = await readLine();

      if (line == null) {
        break;
      }

      const command = line.trim();

      if (command.length === 0) {
        continue;
      }

      const shouldExit = await this.processInput(command);

      if (shouldExit) {
        break;
      }
    }
  }

  private async processInput(input: string): Promise<boolean> {
    const commandResult = await executeBuiltinCommand(input, this.context);

    if (commandResult.handled) {
      return this.applyCommandEffects(commandResult.effects);
    }

    await this.processPrompt(input);
    return false;
  }

  private async processPrompt(prompt: string): Promise<void> {
    const turnId = `turn-${this.turnCount + 1}`;

    this.hooks.onUserPrompt?.(prompt);

    await this.eventLogStore.append({
      type: "turn:start",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      payload: {
        turnId,
        ...(buildTurnPayloadForPrompt(this.context.entry.kind, prompt)),
      },
    });

    this.conversation.push({
      role: "user",
      content: prompt,
    });

    const abortController = new AbortController();
    this.activeTurnAbortController = abortController;
    this.emitRuntimeState("streaming");

    try {
      const result = await this.runAssistantStep(turnId, prompt, abortController.signal);

      if (result?.output) {
        this.conversation.push({
          role: "assistant",
          content: result.output,
        });
        this.hooks.onAssistantOutput?.(result.output);
        writeLine(this.write, result.output);
      }

      this.turnCount += 1;
      this.emitRuntimeState("ready");

      await this.eventLogStore.append({
        type: "turn:end",
        sessionId: this.sessionId,
        timestamp: nowIsoString(),
        payload: {
          turnId,
          state: "idle",
        },
      });
    } catch (error) {
      if (isAbortError(error)) {
        const lastMessage = this.conversation.at(-1);

        if (lastMessage?.role === "user" && lastMessage.content === prompt) {
          this.conversation.pop();
        }

        this.hooks.onPromptInterrupted?.(prompt);
        this.emitRuntimeState("interrupted");
        this.emitSystemLine("generation interrupted");
        this.emitRuntimeState("ready");

        await this.eventLogStore.append({
          type: "turn:end",
          sessionId: this.sessionId,
          timestamp: nowIsoString(),
          payload: {
            turnId,
            state: "interrupted",
          },
        });
        return;
      }

      this.emitRuntimeState("error");
      throw error;
    } finally {
      this.activeTurnAbortController = undefined;
    }
  }

  private async runAssistantStep(
    turnId: string,
    prompt: string,
    signal: AbortSignal,
  ): Promise<AssistantStepResult | null> {
    if (!this.assistantStep) {
      return null;
    }

    const input: AssistantStepInput =
      prompt !== undefined
        ? {
            sessionId: this.sessionId,
            turnId,
            prompt,
            messages: [...this.conversation],
            signal,
            context: this.context,
          }
        : {
            sessionId: this.sessionId,
            turnId,
            messages: [...this.conversation],
            signal,
            context: this.context,
          };

    return this.assistantStep(input);
  }

  private emitSystemLine(line: string): void {
    this.hooks.onSystemLine?.(line);
    writeLine(this.write, line);
  }

  private applyCommandEffects(effects: CommandExecutionEffect[]): boolean {
    let shouldExit = false;

    for (const effect of effects) {
      switch (effect.type) {
        case "system_message":
          this.emitSystemLine(effect.line);
          break;
        case "execution_item":
          this.hooks.onExecutionItem?.({ summary: effect.summary, ...(effect.body ? { body: effect.body } : {}) });
          break;
        case "clear_conversation":
          this.conversation.length = 0;
          this.hooks.onConversationCleared?.();
          break;
        case "exit_session":
          shouldExit = true;
          break;
      }
    }

    return shouldExit;
  }

  private emitRuntimeState(state: RuntimeSessionState): void {
    this.hooks.onRuntimeStateChange?.(state);
  }
}

function buildTurnPayloadForPrompt(
  entryKind: BootstrapContext["entry"]["kind"],
  prompt: string,
): Record<string, unknown> {
  return {
    entryKind,
    prompt,
  };
}
