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
import type {
  AssistantUsageStats,
  ExecutionKind,
  ExecutionStatus,
  ExecutionStream,
  InteractionEvent,
  RequestCompletedStatus,
} from "../contracts/interaction-event-schema.ts";

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

export type AssistantOutputStepResult = {
  kind: "output";
  responseId: string;
  output: string;
  finishReason: "stop" | "max_tokens" | "content_filter";
  usage?: AssistantUsageStats;
};

export type AssistantToolCallExecutionItem = {
  executionId: string;
  title: string;
  output?: string;
  summary?: string;
  status?: ExecutionStatus;
  executionKind?: ExecutionKind;
  stream?: ExecutionStream;
  errorCode?: string;
  exitCode?: number;
  origin?: Record<string, unknown>;
};

export type AssistantToolCallsStepResult = {
  kind: "tool_calls";
  responseId: string;
  plannedExecutionIds: string[];
  executionItems?: AssistantToolCallExecutionItem[];
  usage?: AssistantUsageStats;
};

type LegacyAssistantStepResult = {
  output?: string;
};

export type AssistantStepResult =
  | AssistantOutputStepResult
  | AssistantToolCallsStepResult
  | LegacyAssistantStepResult;

export type RuntimeSessionState = "ready" | "streaming" | "interrupted" | "error";

export type RuntimeSessionHooks = {
  onSystemLine?: (line: string) => void;
  onUserPrompt?: (prompt: string) => void;
  onAssistantOutput?: (output: string) => void;
  onExecutionItem?: (item: { summary: string; body?: string }) => void;
  onInteractionEvent?: (event: InteractionEvent) => void;
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
  maxTurnLimit?: number;
};

const DEFAULT_MAX_TURN_LIMIT = 15;
const ASSISTANT_OUTPUT_FINISH_REASONS = new Set<
  AssistantOutputStepResult["finishReason"]
>(["stop", "max_tokens", "content_filter"]);
const EXECUTION_STATUS_VALUES = new Set<ExecutionStatus>([
  "success",
  "error",
  "interrupted",
]);
const EXECUTION_KIND_VALUES = new Set<ExecutionKind>([
  "command",
  "tool",
  "system",
]);
const EXECUTION_STREAM_VALUES = new Set<ExecutionStream>([
  "stdout",
  "stderr",
  "system",
]);

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

function errorCodeFromError(error: unknown): string | undefined {
  if (error instanceof Error && error.name.length > 0) {
    return error.name;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function createInvalidAssistantStepResultError(message: string): Error {
  const error = new Error(message);
  error.name = "InvalidAssistantStepResult";
  return error;
}

function normalizeAssistantUsage(usage: unknown): AssistantUsageStats | undefined {
  if (!isRecord(usage)) {
    return undefined;
  }

  const normalized = Object.entries(usage).reduce<Record<string, number>>(
    (accumulator, [key, value]) => {
      if (key.length === 0) {
        return accumulator;
      }

      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    },
    {},
  );

  if (Object.keys(normalized).length === Object.keys(usage).length) {
    return normalized;
  }

  return undefined;
}

function normalizeAssistantExecutionItem(
  item: unknown,
): AssistantToolCallExecutionItem | null {
  if (!isRecord(item) || !isNonEmptyString(item.executionId)) {
    return null;
  }

  const executionItem: AssistantToolCallExecutionItem = {
    executionId: item.executionId,
    title: isNonEmptyString(item.title) ? item.title : item.executionId,
  };

  if (typeof item.output === "string") {
    executionItem.output = item.output;
  }

  if (typeof item.summary === "string") {
    executionItem.summary = item.summary;
  }

  if (typeof item.status === "string" && EXECUTION_STATUS_VALUES.has(item.status as ExecutionStatus)) {
    executionItem.status = item.status as ExecutionStatus;
  }

  if (
    typeof item.executionKind === "string" &&
    EXECUTION_KIND_VALUES.has(item.executionKind as ExecutionKind)
  ) {
    executionItem.executionKind = item.executionKind as ExecutionKind;
  }

  if (typeof item.stream === "string" && EXECUTION_STREAM_VALUES.has(item.stream as ExecutionStream)) {
    executionItem.stream = item.stream as ExecutionStream;
  }

  if (isNonEmptyString(item.errorCode)) {
    executionItem.errorCode = item.errorCode;
  }

  if (Number.isInteger(item.exitCode) && (item.exitCode as number) >= 0) {
    executionItem.exitCode = item.exitCode as number;
  }

  if (isRecord(item.origin) && Object.keys(item.origin).length > 0) {
    executionItem.origin = item.origin;
  }

  return executionItem;
}

function normalizeExecutionIds(executionIds: unknown): string[] {
  if (!Array.isArray(executionIds)) {
    return [];
  }

  return [...new Set(executionIds.filter(isNonEmptyString))];
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
  private readonly maxTurnLimit: number;
  private readonly hooks: RuntimeSessionHooks;
  private readonly conversation: ProviderMessage[] = [];
  private activeTurnAbortController: AbortController | undefined;
  private builtInCommandRequestCount = 0;
  private promptTurnSequence = 0;
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
    this.maxTurnLimit = normalizeMaxTurnLimit(options.maxTurnLimit);
    this.hooks = {
      ...(options.onSystemLine ? { onSystemLine: options.onSystemLine } : {}),
      ...(options.onUserPrompt ? { onUserPrompt: options.onUserPrompt } : {}),
      ...(options.onAssistantOutput ? { onAssistantOutput: options.onAssistantOutput } : {}),
      ...(options.onExecutionItem ? { onExecutionItem: options.onExecutionItem } : {}),
      ...(options.onInteractionEvent ? { onInteractionEvent: options.onInteractionEvent } : {}),
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
    let terminalState: SessionState = "idle";

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
    } catch (error) {
      terminalState = "blocked";
      throw error;
    } finally {
      await this.eventLogStore.append({
        type: "session:stop",
        sessionId: this.sessionId,
        timestamp: nowIsoString(),
        payload: {
          state: terminalState,
        },
      });

      await this.snapshotStore.save({
        id: this.createSnapshotId(),
        sessionId: this.sessionId,
        state: terminalState,
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
      state: terminalState,
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

  private createRequestId(turnId: string): string {
    return `request-${turnId}`;
  }

  private createPromptTurnId(): string {
    this.promptTurnSequence += 1;
    return `turn-${this.promptTurnSequence}`;
  }

  private normalizeAssistantStepResult(
    turnId: string,
    result: AssistantStepResult | null,
  ): AssistantOutputStepResult | AssistantToolCallsStepResult | null {
    if (!result) {
      return null;
    }

    if (!isRecord(result)) {
      return null;
    }

    const rawResult: Record<string, unknown> = result;

    if (rawResult.kind === "output") {
      const normalizedOutput: AssistantOutputStepResult = {
        kind: "output",
        responseId: isNonEmptyString(rawResult.responseId)
          ? rawResult.responseId
          : `response-${turnId}`,
        output: typeof rawResult.output === "string" ? rawResult.output : "",
        finishReason:
          typeof rawResult.finishReason === "string" &&
          ASSISTANT_OUTPUT_FINISH_REASONS.has(
            rawResult.finishReason as AssistantOutputStepResult["finishReason"],
          )
            ? (rawResult.finishReason as AssistantOutputStepResult["finishReason"])
            : "stop",
      };

      const normalizedUsage = normalizeAssistantUsage(rawResult.usage);

      if (normalizedUsage) {
        normalizedOutput.usage = normalizedUsage;
      }

      return normalizedOutput;
    }

    if (rawResult.kind === "tool_calls") {
      const normalizedExecutionItems = Array.isArray(rawResult.executionItems)
        ? rawResult.executionItems
            .map((item: unknown) => normalizeAssistantExecutionItem(item))
            .filter((item): item is AssistantToolCallExecutionItem => item !== null)
        : [];
      const plannedExecutionIds = normalizeExecutionIds(rawResult.plannedExecutionIds);
      const resolvedExecutionIds =
        plannedExecutionIds.length > 0
          ? plannedExecutionIds
          : [...new Set(normalizedExecutionItems.map((item) => item.executionId))];

      if (resolvedExecutionIds.length === 0) {
        throw createInvalidAssistantStepResultError(
          "Assistant tool_calls results must provide at least one execution id",
        );
      }

      const normalizedResult: AssistantToolCallsStepResult = {
        kind: "tool_calls",
        responseId: isNonEmptyString(rawResult.responseId)
          ? rawResult.responseId
          : `response-${turnId}`,
        plannedExecutionIds: resolvedExecutionIds,
      };

      const normalizedUsage = normalizeAssistantUsage(rawResult.usage);

      if (normalizedUsage) {
        normalizedResult.usage = normalizedUsage;
      }

      if (normalizedExecutionItems.length > 0) {
        normalizedResult.executionItems = normalizedExecutionItems;
      }

      return normalizedResult;
    }

    if (!Object.prototype.hasOwnProperty.call(rawResult, "output")) {
      return null;
    }

    return {
      kind: "output",
      responseId: `response-${turnId}`,
      output: typeof rawResult.output === "string" ? rawResult.output : "",
      finishReason: "stop",
    };
  }

  private removePromptFromConversation(prompt: string): void {
    const lastMessage = this.conversation.at(-1);

    if (lastMessage?.role === "user" && lastMessage.content === prompt) {
      this.conversation.pop();
    }
  }

  private emitAssistantOutputLifecycle(
    turnId: string,
    requestId: string,
    result: AssistantOutputStepResult,
  ): void {
    const timestamp = nowIsoString();
    this.emitInteractionEvent({
      eventType: "assistant_response_started",
      timestamp,
      sessionId: this.sessionId,
      turnId,
      requestId,
      payload: {
        responseId: result.responseId,
      },
    });
    this.emitInteractionEvent({
      eventType: "assistant_stream_chunk",
      timestamp,
      sessionId: this.sessionId,
      turnId,
      requestId,
      payload: {
        responseId: result.responseId,
        channel: "output_text",
        format: "markdown",
        delta: result.output,
      },
    });
    this.emitInteractionEvent({
      eventType: "assistant_response_completed",
      timestamp,
      sessionId: this.sessionId,
      turnId,
      requestId,
      payload: {
        responseId: result.responseId,
        finishReason: result.finishReason,
        continuation: "none",
        ...(result.usage ? { usage: result.usage } : {}),
      },
    });
  }

  private emitAssistantToolCallsLifecycle(
    turnId: string,
    requestId: string,
    result: AssistantToolCallsStepResult,
  ): void {
    const timestamp = nowIsoString();
    this.emitInteractionEvent({
      eventType: "assistant_response_started",
      timestamp,
      sessionId: this.sessionId,
      turnId,
      requestId,
      payload: {
        responseId: result.responseId,
      },
    });
    this.emitInteractionEvent({
      eventType: "assistant_response_completed",
      timestamp,
      sessionId: this.sessionId,
      turnId,
      requestId,
      payload: {
        responseId: result.responseId,
        finishReason: "tool_calls",
        continuation: "awaiting_execution",
        plannedExecutionIds: result.plannedExecutionIds,
        ...(result.usage ? { usage: result.usage } : {}),
      },
    });
  }

  private emitRequestCompleted(
    turnId: string,
    requestId: string,
    status: RequestCompletedStatus,
    errorCode?: string,
  ): void {
    this.emitInteractionEvent({
      eventType: "request_completed",
      timestamp: nowIsoString(),
      sessionId: this.sessionId,
      turnId,
      requestId,
      payload: {
        status,
        ...(errorCode ? { errorCode } : {}),
      },
    });
  }

  private async processInput(input: string): Promise<boolean> {
    const commandResult = await executeBuiltinCommand(input, this.context);

    if (commandResult.handled) {
      return this.applyCommandEffects(
        commandResult.effects,
        this.createBuiltInCommandInteractionContext(),
      );
    }

    await this.processPrompt(input);
    return false;
  }

  private async processPrompt(prompt: string): Promise<void> {
    const initialTurnId = this.createPromptTurnId();
    const requestId = this.createRequestId(initialTurnId);

    this.hooks.onUserPrompt?.(prompt);

    await this.eventLogStore.append({
      type: "turn:start",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      payload: {
        turnId: initialTurnId,
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
      let assistantTurnId = initialTurnId;
      let assistantPrompt: string | undefined = prompt;
      let assistantTurnCount = 0;

      while (true) {
        assistantTurnCount += 1;
        const rawResult = await this.runAssistantStep(assistantTurnId, assistantPrompt, abortController.signal);
        const result = this.normalizeAssistantStepResult(assistantTurnId, rawResult);

        if (!result) {
          this.emitRequestCompleted(assistantTurnId, requestId, "completed");
          this.turnCount += 1;
          break;
        }

        if (result.kind === "output") {
          this.emitAssistantOutputLifecycle(assistantTurnId, requestId, result);
          this.conversation.push({
            role: "assistant",
            content: result.output,
          });
          this.hooks.onAssistantOutput?.(result.output);
          writeLine(this.write, result.output);
          this.emitRequestCompleted(assistantTurnId, requestId, "completed");
          this.turnCount += 1;
          break;
        }

        this.emitAssistantToolCallsLifecycle(assistantTurnId, requestId, result);
        this.emitAssistantExecutionWave(assistantTurnId, requestId, result);

        if (assistantTurnCount >= this.maxTurnLimit) {
          this.removePromptFromConversation(prompt);
          this.emitRequestCompleted(
            assistantTurnId,
            requestId,
            "error",
            "AGENT_LOOP_LIMIT_EXCEEDED",
          );
          break;
        }

        assistantTurnId = this.createPromptTurnId();
        assistantPrompt = undefined;
      }
      this.emitRuntimeState("ready");

      await this.eventLogStore.append({
        type: "turn:end",
        sessionId: this.sessionId,
        timestamp: nowIsoString(),
        payload: {
          turnId: initialTurnId,
          state: "idle",
        },
      });
    } catch (error) {
      if (isAbortError(error)) {
        this.removePromptFromConversation(prompt);

        this.hooks.onPromptInterrupted?.(prompt);
        this.emitRuntimeState("interrupted");
        this.emitSystemLine("generation interrupted");
        this.emitRuntimeState("ready");
        this.emitRequestCompleted(initialTurnId, requestId, "interrupted");

        await this.eventLogStore.append({
          type: "turn:end",
          sessionId: this.sessionId,
          timestamp: nowIsoString(),
          payload: {
            turnId: initialTurnId,
            state: "interrupted",
          },
        });
        return;
      }

      this.emitRequestCompleted(initialTurnId, requestId, "error", errorCodeFromError(error));
      await this.eventLogStore.append({
        type: "turn:end",
        sessionId: this.sessionId,
        timestamp: nowIsoString(),
        payload: {
          turnId: initialTurnId,
          state: "blocked",
        },
      });
      this.emitRuntimeState("error");
      throw error;
    } finally {
      this.activeTurnAbortController = undefined;
    }
  }

  private async runAssistantStep(
    turnId: string,
    prompt: string | undefined,
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

  private emitInteractionEvent(event: InteractionEvent): void {
    this.hooks.onInteractionEvent?.(event);
  }

  private createBuiltInCommandInteractionContext(): {
    turnId: string;
    requestId: string;
  } {
    this.builtInCommandRequestCount += 1;

    return {
      turnId: `turn-command-${this.builtInCommandRequestCount}`,
      requestId: `request-command-${this.builtInCommandRequestCount}`,
    };
  }

  private sanitizeExecutionSummary(summary: string): string {
    const singleLineSummary = summary.replace(/[\r\n]+/g, " ").trim();

    if (singleLineSummary.length > 0) {
      return singleLineSummary;
    }

    return "Execution item";
  }

  private emitBuiltInExecutionItemEvents(
    interactionContext: {
      turnId: string;
      requestId: string;
    },
    executionIndex: number,
    item: { summary: string; body?: string },
  ): void {
    const executionId = `execution-command-${interactionContext.requestId}-${executionIndex + 1}`;
    const summary = this.sanitizeExecutionSummary(item.summary);
    this.emitInteractionEvent({
      eventType: "execution_item_started",
      timestamp: nowIsoString(),
      sessionId: this.sessionId,
      turnId: interactionContext.turnId,
      requestId: interactionContext.requestId,
      payload: {
        executionId,
        executionKind: "command",
        title: summary,
        origin: {
          source: "builtin_command",
        },
      },
    });

    if (item.body) {
      this.emitInteractionEvent({
        eventType: "execution_item_chunk",
        timestamp: nowIsoString(),
        sessionId: this.sessionId,
        turnId: interactionContext.turnId,
        requestId: interactionContext.requestId,
        payload: {
          executionId,
          stream: "system",
          output: item.body,
        },
      });
    }

    this.emitInteractionEvent({
      eventType: "execution_item_completed",
      timestamp: nowIsoString(),
      sessionId: this.sessionId,
      turnId: interactionContext.turnId,
      requestId: interactionContext.requestId,
      payload: {
        executionId,
        status: "success",
        summary,
      },
    });
  }

  private emitAssistantExecutionWave(
    turnId: string,
    requestId: string,
    result: AssistantToolCallsStepResult,
  ): void {
    const executionItemsById = new Map(
      (result.executionItems ?? []).map((item) => [item.executionId, item] as const),
    );

    for (const executionId of result.plannedExecutionIds) {
      const item = executionItemsById.get(executionId);
      const title = this.sanitizeExecutionSummary(item?.title ?? executionId);
      const summary = this.sanitizeExecutionSummary(item?.summary ?? title);
      const output = item?.output;
      this.hooks.onExecutionItem?.({ summary, ...(output !== undefined ? { body: output } : {}) });

      this.emitInteractionEvent({
        eventType: "execution_item_started",
        timestamp: nowIsoString(),
        sessionId: this.sessionId,
        turnId,
        requestId,
        payload: {
          executionId,
          executionKind: item?.executionKind ?? "tool",
          title,
          origin:
            item?.origin && Object.keys(item.origin).length > 0
              ? item.origin
              : {
                  source: "assistant_tool_calls",
                },
        },
      });

      if (output !== undefined) {
        this.emitInteractionEvent({
          eventType: "execution_item_chunk",
          timestamp: nowIsoString(),
          sessionId: this.sessionId,
          turnId,
          requestId,
          payload: {
            executionId,
            stream: item?.stream ?? "system",
            output,
          },
        });
      }

      this.emitInteractionEvent({
        eventType: "execution_item_completed",
        timestamp: nowIsoString(),
        sessionId: this.sessionId,
        turnId,
        requestId,
        payload: {
          executionId,
          status: item?.status ?? "success",
          summary,
          ...(item?.exitCode !== undefined ? { exitCode: item.exitCode } : {}),
          ...(item?.errorCode ? { errorCode: item.errorCode } : {}),
        },
      });
    }
  }

  private emitSystemLine(line: string): void {
    this.hooks.onSystemLine?.(line);
    writeLine(this.write, line);
  }

  private applyCommandEffects(
    effects: CommandExecutionEffect[],
    interactionContext: {
      turnId: string;
      requestId: string;
    },
  ): boolean {
    let shouldExit = false;
    let executionIndex = 0;

    for (const effect of effects) {
      switch (effect.type) {
        case "system_message":
          this.emitSystemLine(effect.line);
          break;
        case "execution_item":
          this.hooks.onExecutionItem?.({ summary: effect.summary, ...(effect.body ? { body: effect.body } : {}) });
          this.emitBuiltInExecutionItemEvents(interactionContext, executionIndex, effect);
          executionIndex += 1;
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

    if (executionIndex > 0) {
      this.emitRequestCompleted(
        interactionContext.turnId,
        interactionContext.requestId,
        "completed",
      );
    }

    return shouldExit;
  }

  private emitRuntimeState(state: RuntimeSessionState): void {
    this.hooks.onRuntimeStateChange?.(state);
  }
}

function normalizeMaxTurnLimit(maxTurnLimit: number | undefined): number {
  if (maxTurnLimit === undefined) {
    return DEFAULT_MAX_TURN_LIMIT;
  }

  if (!Number.isFinite(maxTurnLimit) || maxTurnLimit < 1) {
    return DEFAULT_MAX_TURN_LIMIT;
  }

  return Math.floor(maxTurnLimit);
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
