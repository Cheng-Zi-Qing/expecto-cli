import type { ProviderMessage } from "../providers/provider-types.ts";
import type {
  SessionSnapshotSummary,
  SessionState,
} from "../contracts/session-snapshot-schema.ts";
import type { BootstrapContext } from "./bootstrap-context.ts";
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
} from "../protocol/domain-event-payload-schema.ts";
import type { DomainFact } from "../protocol/domain-event-schema.ts";

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

export type RuntimeSessionOptions = {
  sessionId: string;
  context: BootstrapContext;
  snapshotStore: SessionSnapshotStore;
  write: (chunk: string) => void;
  readLine?: ReadLine;
  closeInput?: CloseInteractiveInput;
  assistantStep?: (input: AssistantStepInput) => Promise<AssistantStepResult | null> | AssistantStepResult | null;
  interruptController?: SessionInterruptController;
  maxTurnLimit?: number;
  emitFact?: (fact: DomainFact) => void;
  onLocalEffect?: (effect: CommandExecutionEffect) => void;
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

export class RuntimeSession {
  private readonly sessionId: string;
  private readonly context: BootstrapContext;
  private readonly snapshotStore: SessionSnapshotStore;
  private readonly write: (chunk: string) => void;
  private readonly readLine: ReadLine | undefined;
  private readonly closeInput: CloseInteractiveInput | undefined;
  private readonly assistantStep?: RuntimeSessionOptions["assistantStep"];
  private readonly interruptController: SessionInterruptController | undefined;
  private readonly maxTurnLimit: number;
  private readonly emitFact: (fact: DomainFact) => void;
  private readonly onLocalEffect: ((effect: CommandExecutionEffect) => void) | undefined;
  private readonly conversation: ProviderMessage[] = [];
  private activeTurnAbortController: AbortController | undefined;
  private builtInCommandRequestCount = 0;
  private promptTurnSequence = 0;
  private turnCount = 0;

  constructor(options: RuntimeSessionOptions) {
    this.sessionId = options.sessionId;
    this.context = options.context;
    this.snapshotStore = options.snapshotStore;
    this.write = options.write;
    this.readLine = options.readLine;
    this.closeInput = options.closeInput;
    this.assistantStep = options.assistantStep;
    this.interruptController = options.interruptController;
    this.maxTurnLimit = normalizeMaxTurnLimit(options.maxTurnLimit);
    this.emitFact = options.emitFact ?? (() => {});
    this.onLocalEffect = options.onLocalEffect;
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

    this.emitFact({
      eventType: "session.started",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      payload: {
        mode: this.context.mode,
        entryKind: this.context.entry.kind,
      },
    });

    this.emitRuntimeState("ready");

    const unsubscribeInterrupt = this.interruptController?.subscribe(() => {
      this.activeTurnAbortController?.abort();
    });

    const periodicSnapshotInterval = setInterval(() => {
      const snapshotSummary = this.buildSnapshotSummary();
      const compactedSummary = snapshotSummary
        ? [
            snapshotSummary.headline,
            ...(snapshotSummary.currentTaskId ? [`current task: ${snapshotSummary.currentTaskId}`] : []),
            ...(snapshotSummary.nextStep ? [`next step: ${snapshotSummary.nextStep}`] : []),
          ].join("\n")
        : undefined;

      void this.snapshotStore.save({
        id: this.createSnapshotId(),
        sessionId: this.sessionId,
        state: "executing",
        activeArtifacts: this.context.activeArtifacts,
        compactedSummary,
        summary: snapshotSummary,
        updatedAt: nowIsoString(),
      });
    }, 5 * 60 * 1000);

    try {
      switch (this.context.entry.kind) {
        case "interactive":


          if (this.context.entry.initialPrompt) {
            const initialPrompt = normalizeInteractiveCommandInput(
              this.context.entry.initialPrompt,
            ).trim();

            const shouldExit =
              initialPrompt.length > 0
                ? await this.processInput(initialPrompt)
                : false;

            if (shouldExit) {
              break;
            }
          }

          if (this.readLine) {
            await this.runInteractiveLoop();
          }
          break;
        case "print":

          await this.processInput(this.context.entry.prompt);
          break;
        case "continue":

          break;
        case "resume": {

          const resumeTarget = this.context.resumeTarget;
          if (!resumeTarget) {
            throw new Error("No snapshot found. Nothing to resume.");
          }
          if (this.readLine) {
            await this.runInteractiveLoop();
          }
          break;
        }
      }
    } catch (error) {
      terminalState = "blocked";
      throw error;
    } finally {
      this.emitFact({
        eventType: "session.stopped",
        sessionId: this.sessionId,
        timestamp: nowIsoString(),
        payload: { state: terminalState },
      });

      const snapshotSummary = this.buildSnapshotSummary();
      const compactedSummary = snapshotSummary
        ? [
            snapshotSummary.headline,
            ...(snapshotSummary.currentTaskId ? [`current task: ${snapshotSummary.currentTaskId}`] : []),
            ...(snapshotSummary.nextStep ? [`next step: ${snapshotSummary.nextStep}`] : []),
          ].join("\n")
        : undefined;

      await this.snapshotStore.save({
        id: this.createSnapshotId(),
        sessionId: this.sessionId,
        state: terminalState,
        activeArtifacts: this.context.activeArtifacts,
        compactedSummary,
        summary: snapshotSummary,
        updatedAt: nowIsoString(),
      });

      await this.closeInput?.();
      unsubscribeInterrupt?.();
      clearInterval(periodicSnapshotInterval);
    }

    return {
      sessionId: this.sessionId,
      state: terminalState,
      turnCount: this.turnCount,
    };
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

      const command = normalizeInteractiveCommandInput(line).trim();

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
    requestId: string,
    result: AssistantOutputStepResult,
  ): void {
    const timestamp = nowIsoString();
    this.emitFact({
      eventType: "assistant.response_started",
      timestamp,
      sessionId: this.sessionId,
      causation: { requestId },
      payload: {
        responseId: result.responseId,
      },
    });
    this.emitFact({
      eventType: "assistant.stream_chunk",
      timestamp,
      sessionId: this.sessionId,
      causation: { requestId },
      payload: {
        responseId: result.responseId,
        channel: "output_text",
        format: "markdown",
        delta: result.output,
      },
    });
    this.emitFact({
      eventType: "assistant.response_completed",
      timestamp,
      sessionId: this.sessionId,
      causation: { requestId },
      payload: {
        responseId: result.responseId,
        finishReason: result.finishReason,
        continuation: "none",
        ...(result.usage ? { usage: result.usage } : {}),
      },
    });
  }

  private emitAssistantToolCallsLifecycle(
    requestId: string,
    result: AssistantToolCallsStepResult,
  ): void {
    const timestamp = nowIsoString();
    this.emitFact({
      eventType: "assistant.response_started",
      timestamp,
      sessionId: this.sessionId,
      causation: { requestId },
      payload: {
        responseId: result.responseId,
      },
    });
    this.emitFact({
      eventType: "assistant.response_completed",
      timestamp,
      sessionId: this.sessionId,
      causation: { requestId },
      payload: {
        responseId: result.responseId,
        finishReason: "tool_calls",
        continuation: "awaiting_execution",
        plannedExecutionIds: result.plannedExecutionIds,
        ...(result.usage ? { usage: result.usage } : {}),
      },
    });
  }

  private emitRequestSucceeded(requestId: string): void {
    this.emitFact({
      eventType: "request.succeeded",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      causation: { requestId },
      payload: {},
    });
  }

  private emitRequestFailed(requestId: string, code: string, message: string, retryable: boolean): void {
    this.emitFact({
      eventType: "request.failed",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      causation: { requestId },
      payload: { code, message, retryable },
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

    this.emitFact({
      eventType: "user.prompt_received",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      causation: { requestId },
      payload: { prompt },
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
          this.emitRequestSucceeded(requestId);
          this.turnCount += 1;
          break;
        }

        if (result.kind === "output") {
          this.emitAssistantOutputLifecycle(requestId, result);
          this.conversation.push({
            role: "assistant",
            content: result.output,
          });
          writeLine(this.write, result.output);
          this.emitRequestSucceeded(requestId);
          this.turnCount += 1;
          break;
        }

        this.emitAssistantToolCallsLifecycle(requestId, result);
        this.emitAssistantExecutionWave(requestId, result);

        if (assistantTurnCount >= this.maxTurnLimit) {
          this.removePromptFromConversation(prompt);
          this.emitRequestFailed(
            requestId,
            "AGENT_LOOP_LIMIT_EXCEEDED",
            "agent loop limit exceeded",
            false,
          );
          break;
        }

        assistantTurnId = this.createPromptTurnId();
        assistantPrompt = undefined;
      }
      this.emitRuntimeState("ready");
    } catch (error) {
      if (isAbortError(error)) {
        this.removePromptFromConversation(prompt);

        this.emitRuntimeState("interrupted");
        this.emitRuntimeState("ready");
        this.emitRequestFailed(requestId, "INTERRUPTED", "generation interrupted", false);
        return;
      }

      this.emitRequestFailed(requestId, errorCodeFromError(error) ?? "UNKNOWN", "request failed", false);
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

  private createBuiltInCommandInteractionContext(): {
    requestId: string;
  } {
    this.builtInCommandRequestCount += 1;

    return {
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
      requestId: string;
    },
    executionIndex: number,
    item: { summary: string; body?: string },
  ): void {
    const executionId = `execution-command-${interactionContext.requestId}-${executionIndex + 1}`;
    const summary = this.sanitizeExecutionSummary(item.summary);
    this.emitFact({
      eventType: "execution.started",
      timestamp: nowIsoString(),
      sessionId: this.sessionId,
      causation: { requestId: interactionContext.requestId },
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
      this.emitFact({
        eventType: "execution.chunk",
        timestamp: nowIsoString(),
        sessionId: this.sessionId,
        causation: { requestId: interactionContext.requestId },
        payload: {
          executionId,
          stream: "system",
          output: item.body,
        },
      });
    }

    this.emitFact({
      eventType: "execution.completed",
      timestamp: nowIsoString(),
      sessionId: this.sessionId,
      causation: { requestId: interactionContext.requestId },
      payload: {
        executionId,
        status: "success",
        summary,
      },
    });
  }

  private emitAssistantExecutionWave(
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

      this.emitFact({
        eventType: "execution.started",
        timestamp: nowIsoString(),
        sessionId: this.sessionId,
        causation: { requestId },
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
        this.emitFact({
          eventType: "execution.chunk",
          timestamp: nowIsoString(),
          sessionId: this.sessionId,
          causation: { requestId },
          payload: {
            executionId,
            stream: item?.stream ?? "system",
            output,
          },
        });
      }

      this.emitFact({
        eventType: "execution.completed",
        timestamp: nowIsoString(),
        sessionId: this.sessionId,
        causation: { requestId },
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

  private applyCommandEffects(
    effects: CommandExecutionEffect[],
    interactionContext: {
      requestId: string;
    },
  ): boolean {
    let shouldExit = false;
    let executionIndex = 0;

    for (const effect of effects) {
      switch (effect.type) {
        case "system_message":
          writeLine(this.write, effect.line);
          this.onLocalEffect?.(effect);
          break;
        case "execution_item":
          this.emitBuiltInExecutionItemEvents(interactionContext, executionIndex, effect);
          executionIndex += 1;
          break;
        case "clear_conversation":
          this.conversation.length = 0;
          this.emitFact({
            eventType: "session.conversation_cleared",
            sessionId: this.sessionId,
            timestamp: nowIsoString(),
            payload: {},
          });
          break;
        case "open_theme_picker":
          this.onLocalEffect?.(effect);
          break;
        case "exit_session":
          shouldExit = true;
          this.onLocalEffect?.(effect);
          break;
      }
    }

    if (executionIndex > 0) {
      this.emitRequestSucceeded(interactionContext.requestId);
    }

    return shouldExit;
  }

  private emitRuntimeState(state: RuntimeSessionState): void {
    this.emitFact({
      eventType: "session.state_changed",
      sessionId: this.sessionId,
      timestamp: nowIsoString(),
      payload: { state },
    });
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

function normalizeInteractiveCommandInput(input: string): string {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "exit" || trimmed === "quit") {
    return "/exit";
  }

  return input;
}
