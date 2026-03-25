import { basename } from "node:path";

import type { ProviderRunner } from "../providers/provider-runner.ts";
import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import { SessionManager } from "../runtime/session-manager.ts";
import { SessionInterruptController } from "../runtime/session-interrupt.ts";
import type { AssistantStepInput, AssistantStepResult, RuntimeSessionState } from "../runtime/runtime-session.ts";
import { deriveContextMetrics } from "./context-metrics.ts";
import type { CreateInteractiveTuiApp } from "./tui-app.ts";
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

function isInputLockedForState(state: RuntimeSessionState): boolean {
  return state === "streaming";
}

export async function runInteractiveTui(
  context: BootstrapContext,
  options: RunInteractiveTuiOptions,
) {
  const queuedInput = new QueuedInteractiveInput();
  const interruptController = new SessionInterruptController();
  const conversation: string[] = [];
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

  const applyAction = (action: TuiAction): void => {
    state = reduceTuiState(state, action);
    app.update(state);
  };

  const refreshContextMetrics = (): void => {
    applyAction({
      type: "set_context_metrics",
      contextMetrics: createContextMetrics(
        context,
        options.providerLabel,
        options.modelLabel,
        conversation,
      ),
    });
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
        if (prompt.trim().length === 0) {
          return;
        }

        applyAction({
          type: "set_draft",
          draft: "",
        });
        applyAction({
          type: "set_input_locked",
          locked: true,
        });
        queuedInput.submit(prompt);
      },
      onInterrupt: () => {
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
      conversation.push(`user: ${prompt}`);
      applyAction({
        type: "append_user_message",
        prompt,
      });
      refreshContextMetrics();
    },
    onAssistantOutput: (output) => {
      conversation.push(`assistant: ${output}`);
      applyAction({
        type: "append_assistant_message",
        output,
      });
      refreshContextMetrics();
    },
    onExecutionItem: (item) => {
      applyAction({
        type: "append_execution_item",
        summary: item.summary,
        ...(item.body ? { body: item.body } : {}),
      });
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
      applyAction({
        type: "set_input_locked",
        locked: isInputLockedForState(runtimeState),
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
      applyAction({
        type: "set_input_locked",
        locked: false,
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
