import { basename } from "node:path";
import { randomUUID } from "node:crypto";

import { execa } from "execa";

import { createUserConfigStore, type UserConfigStore } from "../cli/user-config.ts";
import { PRIMARY_CLI_BINARY_NAME } from "../core/brand.ts";
import type { ProviderRunner } from "../providers/provider-runner.ts";
import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import {
  createExecutionLogStore,
  type ExecutionLogStore,
} from "../runtime/execution-log-store.ts";
import { SessionManager } from "../runtime/session-manager.ts";
import { SessionInterruptController } from "../runtime/session-interrupt.ts";
import type { AssistantStepInput, AssistantStepResult } from "../runtime/runtime-session.ts";
import { deriveContextMetrics } from "./context-metrics.ts";
import { expandDraftAttachments } from "./draft-attachment.ts";
import { getThemeDefinition } from "./theme/theme-registry.ts";
import type { CreateInteractiveTuiApp, InteractiveTuiApp, TerminalTuiIo } from "./tui-app.ts";
import { createInitialTuiState, reduceTuiState } from "./tui-state.ts";
import { QueuedInteractiveInput } from "./queued-interactive-input.ts";
import type { ContextMetrics, TuiAction, TuiState } from "./tui-types.ts";

export type RunInteractiveTuiOptions = {
  createApp: CreateInteractiveTuiApp;
  providerLabel: string;
  modelLabel: string;
  branchLabel: string;
  write?: (chunk: string) => void;
  assistantStep?: (input: AssistantStepInput) => Promise<AssistantStepResult | null> | AssistantStepResult | null;
  providerRunner?: ProviderRunner;
  terminal?: TerminalTuiIo;
  executionLogStore?: ExecutionLogStore;
  openPager?: (logPath: string) => Promise<void>;
  userConfigStore?: UserConfigStore;
  shutdownSignal?: AbortSignal;
};

function noopWrite(): void {}

function shouldForceThemePickerForTesting(): boolean {
  const value = process.env.EXPECTO_FORCE_THEME_PICKER?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

async function defaultOpenPager(logPath: string): Promise<void> {
  const pager = process.env.PAGER?.trim() || "less";
  await execa(pager, [logPath], {
    stdio: "inherit",
    reject: false,
  });
}

function shouldHideSystemLine(line: string): boolean {
  return (
    line === `${PRIMARY_CLI_BINARY_NAME} interactive session` ||
    line.startsWith("mode: ") ||
    line.startsWith("project: ") ||
    line.startsWith("initial prompt: ")
  );
}

function createContextMetrics(
  context: BootstrapContext,
  providerLabel: string,
  modelLabel: string,
  conversation: string[],
): ContextMetrics {
  return deriveContextMetrics({
    providerLabel,
    modelLabel,
    instructions: context.instructions.map((document) => document.content),
    hooksCount: 0,
    loadedDocsCount:
      context.instructions.length +
      context.memory.length +
      context.loadedArtifacts.required.length +
      context.loadedArtifacts.optional.length,
    sessionSummary: context.sessionSummary ?? "",
    conversation,
  });
}

function isLocalCommandCandidate(prompt: string): boolean {
  return normalizeInteractiveCommandPrompt(prompt).trim().startsWith("/");
}

function normalizeInteractiveCommandPrompt(prompt: string): string {
  const trimmed = prompt.trim().toLowerCase();

  if (trimmed === "exit" || trimmed === "quit") {
    return "/exit";
  }

  return prompt;
}

function parsePromptTurnSequence(turnId: string): number | null {
  const match = /^turn-(\d+)$/.exec(turnId);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function runInteractiveTui(
  context: BootstrapContext,
  options: RunInteractiveTuiOptions,
) {
  const queuedInput = new QueuedInteractiveInput();
  const interruptController = new SessionInterruptController();
  const userConfigStore = options.userConfigStore ?? createUserConfigStore();
  const userConfig = await userConfigStore.load();
  const executionLogStore = options.executionLogStore ?? createExecutionLogStore({
    projectRoot: context.projectRoot,
  });
  const openPager = options.openPager ?? defaultOpenPager;
  const conversation: string[] = [];
  const assistantConversationEntryIndexByResponseId = new Map<string, number>();
  let promptTurnSequence = 0;
  let state = createInitialTuiState({
    sessionId: "pending-session",
    projectLabel: basename(context.projectRoot),
    branchLabel: options.branchLabel,
    providerLabel: options.providerLabel,
    modelLabel: options.modelLabel,
    savedThemeId: userConfig.themeId,
    forceThemePicker: shouldForceThemePickerForTesting(),
    contextMetrics: createContextMetrics(
      context,
      options.providerLabel,
      options.modelLabel,
      conversation,
    ),
  });

  const applyActionWithoutRender = (action: TuiAction): void => {
    state = reduceTuiState(state, action);
  };

  const updateContextMetrics = (dispatch: (action: TuiAction) => void): void => {
    dispatch({
      type: "set_context_metrics",
      contextMetrics: createContextMetrics(
        context,
        options.providerLabel,
        options.modelLabel,
        conversation,
      ),
    });
  };

  const seedForegroundPromptLifecycle = (
    prompt: string,
    dispatch: (action: TuiAction) => void,
  ): void => {
    promptTurnSequence += 1;
    const turnId = `turn-${promptTurnSequence}`;

    dispatch({
      type: "append_user_message",
      prompt,
    });
    dispatch({
      type: "start_request_lifecycle",
      requestId: `request-${turnId}`,
      turnId,
      startedAt: new Date().toISOString(),
    });
    conversation.push(`user: ${prompt}`);
    updateContextMetrics(dispatch);
  };

  if (context.entry.kind === "interactive") {
    const initialPrompt = context.entry.initialPrompt ?? "";
    const normalizedInitialPrompt = normalizeInteractiveCommandPrompt(initialPrompt);
    const trimmedInitialPrompt = normalizedInitialPrompt.trim();

    if (
      trimmedInitialPrompt.length > 0 &&
      !isLocalCommandCandidate(normalizedInitialPrompt)
    ) {
      seedForegroundPromptLifecycle(initialPrompt, applyActionWithoutRender);
    }
  }

  const applyAction = (action: TuiAction): void => {
    state = reduceTuiState(state, action);
    app.update(state);
  };

  const applySelectedTheme = async (): Promise<void> => {
    const picker = state.themePicker;

    if (picker === null) {
      applyAction({
        type: "toggle_selected_item",
      });
      return;
    }

    if (getThemeDefinition(picker.selectedThemeId).availability !== "available") {
      return;
    }

    await userConfigStore.save({
      themeId: picker.selectedThemeId,
    });
    applyAction({
      type: "toggle_selected_item",
    });
  };

  const refreshContextMetrics = (): void => {
    updateContextMetrics(applyAction);
  };

  const inspectExecution = async (
    executionId: string,
    app: InteractiveTuiApp,
  ): Promise<void> => {
    await executionLogStore.flush(executionId);
    const logPath = await executionLogStore.resolveLogPath(executionId);

    if (logPath === null) {
      applyAction({
        type: "append_system_message",
        line: `No execution log found for ${executionId}`,
      });
      return;
    }

    try {
      await app.suspendForPager?.();
      await openPager(logPath);
    } catch {
      applyAction({
        type: "append_system_message",
        line: `Log saved to ${logPath}`,
      });
    } finally {
      await app.resumeFromPager?.();
    }
  };

  const app = options.createApp({
    initialState: state,
    handlers: {
      onDraftChange: (draft) => {
        if (state.themePicker !== null) {
          return;
        }

        applyAction({
          type: "set_draft",
          draft,
        });
      },
      onSubmit: (prompt) => {
        if (state.themePicker !== null) {
          return;
        }

        const expandedPrompt = expandDraftAttachments(prompt, state.draftAttachments);
        const normalizedPrompt = normalizeInteractiveCommandPrompt(expandedPrompt);
        const trimmedPrompt = normalizedPrompt.trim();

        if (trimmedPrompt.length === 0) {
          return;
        }

        applyAction({
          type: "set_draft",
          draft: "",
        });

        if (!isLocalCommandCandidate(normalizedPrompt)) {
          seedForegroundPromptLifecycle(normalizedPrompt, applyAction);
        }

        queuedInput.submit(normalizedPrompt);
      },
      onInspectExecution: (executionId) => {
        void inspectExecution(executionId, app);
      },
      onInterrupt: () => {
        applyAction({
          type: "mark_interrupt_intent",
        });
        interruptController.interruptCurrentTurn();
      },
      onToggleInspector: () => {
        applyAction({
          type: "toggle_inspector",
        });
      },
      onToggleTimelineMode: () => {
        applyAction({
          type: "toggle_timeline_mode",
        });
      },
      onFocusTimeline: () => {
        applyAction({
          type: "focus_timeline",
        });
      },
      onFocusComposer: () => {
        applyAction({
          type: "focus_composer",
        });
      },
      onMoveSelectionUp: () => {
        applyAction({
          type: "move_selection_up",
        });
      },
      onMoveSelectionDown: () => {
        applyAction({
          type: "move_selection_down",
        });
      },
      onMoveSelectionLeft: () => {
        applyAction({
          type: "move_selection_left",
        });
      },
      onMoveSelectionRight: () => {
        applyAction({
          type: "move_selection_right",
        });
      },
      onToggleSelectedItem: () => {
        if (state.themePicker !== null) {
          void applySelectedTheme();
          return;
        }

        applyAction({
          type: "toggle_selected_item",
        });
      },
      onExit: () => {
        interruptController.interruptCurrentTurn();
        queuedInput.close();
      },
      onAddAttachment: (content) => {
        if (state.themePicker !== null) {
          return;
        }

        const id = randomUUID();
        applyAction({
          type: "add_draft_attachment",
          id,
          content,
        });
      },
    },
    ...(options.terminal ? { terminal: options.terminal } : {}),
  });

  const requestShutdown = (): void => {
    interruptController.interruptCurrentTurn();
    queuedInput.close();
  };
  const shutdownSignal = options.shutdownSignal;
  const handleShutdown = (): void => {
    requestShutdown();
  };

  if (shutdownSignal) {
    if (shutdownSignal.aborted) {
      handleShutdown();
    } else {
      shutdownSignal.addEventListener("abort", handleShutdown, { once: true });
    }
  }

  await app.start();

  const manager = new SessionManager({
    write: options.write ?? noopWrite,
    readLine: () => queuedInput.readLine(),
    closeInput: () => {
      queuedInput.close();
    },
    ...(options.assistantStep ? { assistantStep: options.assistantStep } : {}),
    ...(options.providerRunner ? { providerRunner: options.providerRunner } : {}),
    interruptController,
    onSystemLine: (line) => {
      if (shouldHideSystemLine(line)) {
        return;
      }

      applyAction({
        type: "append_system_message",
        line,
      });
    },
    onOpenThemePicker: () => {
      applyAction({
        type: "open_theme_picker",
        reason: "command",
      });
    },
    onInteractionEvent: (event) => {
      if (event.eventType === "session_initialized") {
        applyAction({
          type: "set_session_id",
          sessionId: event.payload.sessionId,
        });
        return;
      }

      if (event.eventType === "user_prompt_received") {
        const expectedConversationEntry = `user: ${event.payload.prompt}`;
        const latestTimelineItem = state.timeline.at(-1);

        if (conversation.at(-1) !== expectedConversationEntry) {
          conversation.push(expectedConversationEntry);
          refreshContextMetrics();
        }

        if (state.activeRequestLedger?.requestId !== event.requestId) {
          applyAction({
            type: "start_request_lifecycle",
            requestId: event.requestId,
            turnId: event.turnId,
            startedAt: event.timestamp,
          });
        }

        if (!(latestTimelineItem?.kind === "user" && latestTimelineItem.summary === event.payload.prompt)) {
          applyAction({
            type: "append_user_message",
            prompt: event.payload.prompt,
          });
        }
      }

      if (event.eventType === "session_state_changed") {
        applyAction({
          type: "set_runtime_state",
          state: event.payload.state,
        });
        return;
      }

      if (event.eventType === "conversation_cleared") {
        conversation.length = 0;
        assistantConversationEntryIndexByResponseId.clear();
        refreshContextMetrics();
        return;
      }

      if (event.eventType === "prompt_interrupted") {
        const expectedEntry = `user: ${event.payload.prompt}`;

        if (conversation.at(-1) === expectedEntry) {
          conversation.pop();
          refreshContextMetrics();
        }

        applyAction({
          type: "set_draft",
          draft: event.payload.prompt,
        });
        return;
      }

      if (event.eventType === "assistant_stream_chunk") {
        if (event.payload.channel === "output_text") {
          const existingIndex = assistantConversationEntryIndexByResponseId.get(event.payload.responseId);

          if (existingIndex === undefined) {
            conversation.push(`assistant: ${event.payload.delta}`);
            assistantConversationEntryIndexByResponseId.set(
              event.payload.responseId,
              conversation.length - 1,
            );
          } else {
            conversation[existingIndex] = `${conversation[existingIndex] ?? "assistant: "}${event.payload.delta}`;
          }

          refreshContextMetrics();
        }
      } else if (event.eventType === "assistant_response_completed") {
        assistantConversationEntryIndexByResponseId.delete(event.payload.responseId);
      }

      if (event.eventType === "execution_item_started") {
        void executionLogStore.ensureExecutionLog(event.payload.executionId).catch(() => {});
      } else if (event.eventType === "execution_item_chunk") {
        void executionLogStore.appendChunk(
          event.payload.executionId,
          event.payload.output,
        ).catch(() => {});
      }

      const observedPromptTurnSequence = "turnId" in event
        ? parsePromptTurnSequence(event.turnId)
        : null;

      if (
        observedPromptTurnSequence !== null &&
        observedPromptTurnSequence > promptTurnSequence
      ) {
        promptTurnSequence = observedPromptTurnSequence;
      }

      applyAction({
        type: "project_interaction_event",
        event,
      });
    },
  });

  try {
    return await manager.run(context);
  } finally {
    shutdownSignal?.removeEventListener("abort", handleShutdown);
    await app.close();
  }
}
