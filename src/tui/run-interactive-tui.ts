import { basename } from "node:path";

import { listBuiltinCommands } from "../commands/builtin-commands.ts";
import type { ProviderRunner } from "../providers/provider-runner.ts";
import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import { SessionManager } from "../runtime/session-manager.ts";
import { SessionInterruptController } from "../runtime/session-interrupt.ts";
import type { AssistantStepInput, AssistantStepResult } from "../runtime/runtime-session.ts";
import { deriveContextMetrics } from "./context-metrics.ts";
import type { CreateInteractiveTuiApp, TerminalTuiIo } from "./tui-app.ts";
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
};

function noopWrite(): void {}

function shouldHideSystemLine(line: string): boolean {
  return (
    line === "beta interactive session" ||
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

function isKnownBuiltinCommand(prompt: string): boolean {
  const [commandName] = prompt.trim().split(/\s+/, 1);

  if (!commandName || !commandName.startsWith("/")) {
    return false;
  }

  return listBuiltinCommands().some((command) => {
    return (
      command.name === commandName ||
      command.aliases.includes(commandName as `/${string}`)
    );
  });
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
  const conversation: string[] = [];
  let promptTurnSequence = 0;
  let state = createInitialTuiState({
    sessionId: "pending-session",
    projectLabel: basename(context.projectRoot),
    branchLabel: options.branchLabel,
    providerLabel: options.providerLabel,
    modelLabel: options.modelLabel,
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
    const trimmedInitialPrompt = initialPrompt.trim();

    if (
      trimmedInitialPrompt.length > 0 &&
      !isKnownBuiltinCommand(trimmedInitialPrompt)
    ) {
      seedForegroundPromptLifecycle(initialPrompt, applyActionWithoutRender);
    }
  }

  const applyAction = (action: TuiAction): void => {
    state = reduceTuiState(state, action);
    app.update(state);
  };

  const refreshContextMetrics = (): void => {
    updateContextMetrics(applyAction);
  };

  const app = options.createApp({
    initialState: state,
    handlers: {
      onDraftChange: (draft) => {
        applyAction({
          type: "set_draft",
          draft,
        });
      },
      onSubmit: (prompt) => {
        const trimmedPrompt = prompt.trim();

        if (trimmedPrompt.length === 0) {
          return;
        }

        applyAction({
          type: "set_draft",
          draft: "",
        });

        if (!isKnownBuiltinCommand(trimmedPrompt)) {
          seedForegroundPromptLifecycle(prompt, applyAction);
        }

        queuedInput.submit(prompt);
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
      onToggleSelectedItem: () => {
        applyAction({
          type: "toggle_selected_item",
        });
      },
      onExit: () => {
        interruptController.interruptCurrentTurn();
        queuedInput.close();
      },
    },
    ...(options.terminal ? { terminal: options.terminal } : {}),
  });

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
    onUserPrompt: (prompt) => {
      const expectedConversationEntry = `user: ${prompt}`;
      const latestTimelineItem = state.timeline.at(-1);

      if (conversation.at(-1) !== expectedConversationEntry) {
        conversation.push(expectedConversationEntry);
      }

      if (!(latestTimelineItem?.kind === "user" && latestTimelineItem.summary === prompt)) {
        applyAction({
          type: "append_user_message",
          prompt,
        });
      }

      refreshContextMetrics();
    },
    onAssistantOutput: (output) => {
      const expectedConversationEntry = `assistant: ${output}`;

      if (conversation.at(-1) !== expectedConversationEntry) {
        conversation.push(expectedConversationEntry);
        refreshContextMetrics();
      }
    },
    onSystemLine: (line) => {
      if (line.startsWith("session: ")) {
        state = {
          ...state,
          sessionId: line.slice("session: ".length),
        };
        app.update(state);
        return;
      }

      if (shouldHideSystemLine(line)) {
        return;
      }

      applyAction({
        type: "append_system_message",
        line,
      });
    },
    onRuntimeStateChange: (runtimeState) => {
      applyAction({
        type: "set_runtime_state",
        state: runtimeState,
      });
    },
    onInteractionEvent: (event) => {
      const observedPromptTurnSequence = parsePromptTurnSequence(event.turnId);

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
    onConversationCleared: () => {
      conversation.length = 0;
      refreshContextMetrics();
    },
    onPromptInterrupted: (prompt) => {
      const expectedEntry = `user: ${prompt}`;

      if (conversation.at(-1) === expectedEntry) {
        conversation.pop();
        refreshContextMetrics();
      }

      applyAction({
        type: "set_draft",
        draft: prompt,
      });
    },
  });

  try {
    const result = await manager.run(context);

    state = {
      ...state,
      sessionId: result.sessionId,
    };
    app.update(state);

    return result;
  } finally {
    await app.close();
  }
}
