import { basename } from "node:path";
import { randomUUID } from "node:crypto";

import { execa } from "execa";

import { createUserConfigStore, type UserConfigStore } from "../cli/user-config.ts";
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
import { createTuiEventBridge } from "./tui-event-bridge.ts";
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

function createContextMetrics(
  context: BootstrapContext,
  providerLabel: string,
  modelLabel: string,
  conversation: readonly string[],
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
    conversation: [...conversation],
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
      [],
    ),
  });

  const applyActionWithoutRender = (action: TuiAction): void => {
    state = reduceTuiState(state, action);
  };

  // app is assigned after bridge and initial seed; applyAction uses optional
  // chaining so calls before app is ready update state without triggering render
  let app!: InteractiveTuiApp;

  const applyAction = (action: TuiAction): void => {
    state = reduceTuiState(state, action);
    app?.update(state);
  };

  const bridge = createTuiEventBridge({
    dispatch: applyAction,
    executionLogStore,
    onRefreshContextMetrics: () => {
      applyAction({
        type: "set_context_metrics",
        contextMetrics: createContextMetrics(
          context,
          options.providerLabel,
          options.modelLabel,
          bridge.getConversation(),
        ),
      });
    },
    getState: () => state,
  });

  const seedForegroundPromptLifecycle = (
    prompt: string,
    dispatch: (action: TuiAction) => void,
  ): void => {
    const { turnId, requestId } = bridge.allocateLocalTurn();

    dispatch({ type: "append_user_message", prompt });
    dispatch({ type: "start_request_lifecycle", requestId, turnId, startedAt: new Date().toISOString() });
    bridge.pushConversationEntry(`user: ${prompt}`);
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

  const applySelectedTheme = async (): Promise<void> => {
    const picker = state.themePicker;

    if (picker === null) {
      applyAction({ type: "toggle_selected_item" });
      return;
    }

    if (getThemeDefinition(picker.selectedThemeId).availability !== "available") {
      return;
    }

    await userConfigStore.save({ themeId: picker.selectedThemeId });
    applyAction({ type: "toggle_selected_item" });
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

  app = options.createApp({
    initialState: state,
    handlers: {
      onDraftChange: (draft) => {
        if (state.themePicker !== null) {
          return;
        }

        applyAction({ type: "set_draft", draft });
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

        applyAction({ type: "set_draft", draft: "" });

        if (!isLocalCommandCandidate(normalizedPrompt)) {
          seedForegroundPromptLifecycle(normalizedPrompt, applyAction);
        }

        queuedInput.submit(normalizedPrompt);
      },
      onInspectExecution: (executionId) => {
        void inspectExecution(executionId, app);
      },
      onInterrupt: () => {
        applyAction({ type: "mark_interrupt_intent" });
        interruptController.interruptCurrentTurn();
      },
      onToggleInspector: () => {
        applyAction({ type: "toggle_inspector" });
      },
      onToggleTimelineMode: () => {
        applyAction({ type: "toggle_timeline_mode" });
      },
      onFocusTimeline: () => {
        applyAction({ type: "focus_timeline" });
      },
      onFocusComposer: () => {
        applyAction({ type: "focus_composer" });
      },
      onMoveSelectionUp: () => {
        applyAction({ type: "move_selection_up" });
      },
      onMoveSelectionDown: () => {
        applyAction({ type: "move_selection_down" });
      },
      onMoveSelectionLeft: () => {
        applyAction({ type: "move_selection_left" });
      },
      onMoveSelectionRight: () => {
        applyAction({ type: "move_selection_right" });
      },
      onToggleSelectedItem: () => {
        if (state.themePicker !== null) {
          void applySelectedTheme();
          return;
        }

        applyAction({ type: "toggle_selected_item" });
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
        applyAction({ type: "add_draft_attachment", id, content });
      },
    },
    ...(options.terminal ? { terminal: options.terminal } : {}),
  });

  const shutdownSignal = options.shutdownSignal;
  const handleShutdown = (): void => {
    interruptController.interruptCurrentTurn();
    queuedInput.close();
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
    closeInput: () => { queuedInput.close(); },
    ...(options.assistantStep ? { assistantStep: options.assistantStep } : {}),
    ...(options.providerRunner ? { providerRunner: options.providerRunner } : {}),
    interruptController,
    onSystemLine: bridge.onSystemLine,
    onInteractionEvent: bridge.onInteractionEvent,
  });

  try {
    return await manager.run(context);
  } finally {
    shutdownSignal?.removeEventListener("abort", handleShutdown);
    await app.close();
  }
}
