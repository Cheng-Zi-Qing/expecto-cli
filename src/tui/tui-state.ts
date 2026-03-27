import type { InteractionEvent } from "../contracts/interaction-event-schema.ts";
import { listBuiltinCommands } from "../commands/builtin-commands.ts";
import {
  appendTranscriptChunk,
  createExecutionTranscriptBuffer,
} from "./execution-transcript-buffer.ts";
import {
  createForegroundRequestLedger,
  isComposerLocked,
  markInterruptRequested,
  reduceRequestLedger,
} from "./request-ledger.ts";
import type {
  CommandMenuItem,
  CommandMenuState,
  CreateInitialTuiStateInput,
  TimelineItem,
  TuiAction,
  TuiState,
} from "./tui-types.ts";

function createTimelineItemId(state: TuiState, kind: TimelineItem["kind"]): string {
  const nextIndex = state.timeline.filter((item) => item.kind === kind).length + 1;

  return `${kind}-${nextIndex}`;
}

function createEmptyCommandMenu(): CommandMenuState {
  return {
    visible: false,
    query: "",
    items: [],
    selectedIndex: 0,
  };
}

function deriveSlashQuery(draft: string): string | null {
  const trimmed = draft.trim();

  if (!trimmed.startsWith("/")) {
    return null;
  }

  if (trimmed === "/") {
    return "";
  }

  const firstWhitespaceIndex = trimmed.search(/\s/);

  if (firstWhitespaceIndex !== -1) {
    return null;
  }

  return trimmed.slice(1);
}

function resolveCommandMenuItems(query: string): CommandMenuItem[] {
  const commandPrefix = `/${query}`;

  return listBuiltinCommands().filter(
    (command) =>
      command.name.startsWith(commandPrefix) ||
      command.aliases.some((alias) => alias.startsWith(commandPrefix)),
  );
}

function deriveCommandMenu(draft: string): CommandMenuState {
  const query = deriveSlashQuery(draft);

  if (query === null) {
    return createEmptyCommandMenu();
  }

  return {
    visible: true,
    query,
    items: resolveCommandMenuItems(query),
    selectedIndex: 0,
  };
}

function replaceWelcomeCardIfNeeded(state: TuiState, item: TimelineItem): TimelineItem[] {
  const hasOnlyWelcomeCard =
    state.timeline.length === 1 && state.timeline[0]?.kind === "welcome";

  if (hasOnlyWelcomeCard) {
    return [item];
  }

  return [...state.timeline, item];
}

function appendTimelineItem(state: TuiState, item: TimelineItem): TuiState {
  const timeline = replaceWelcomeCardIfNeeded(state, item);

  return {
    ...state,
    timeline,
    selectedTimelineIndex: timeline.length - 1,
  };
}

function replaceTimelineItem(
  state: TuiState,
  index: number,
  timelineItem: TimelineItem,
): TuiState {
  const timeline = [...state.timeline];
  timeline[index] = timelineItem;

  return {
    ...state,
    timeline,
  };
}

function createWelcomeCard(input: CreateInitialTuiStateInput): TimelineItem {
  return {
    id: "welcome",
    kind: "welcome",
    summary: `beta is ready in ${input.projectLabel} on ${input.branchLabel}.`,
    body: [
      "Enter send",
      "Ctrl+C interrupt",
      "Ctrl+J newline",
      "Tab toggle Context Inspector",
    ].join("\n"),
    collapsed: false,
  };
}

function findAssistantCardIndex(
  state: TuiState,
  requestId: string,
  responseId: string,
): number {
  return state.timeline.findIndex((item) => {
    return (
      item.kind === "assistant" &&
      item.requestId === requestId &&
      item.responseId === responseId
    );
  });
}

function findExecutionCardIndex(
  state: TuiState,
  requestId: string,
  executionId: string,
): number {
  return state.timeline.findIndex((item) => {
    return (
      item.kind === "execution" &&
      item.requestId === requestId &&
      item.executionId === executionId
    );
  });
}

function ensureAssistantCard(
  state: TuiState,
  event: Extract<InteractionEvent, { eventType: "assistant_response_started" }>,
): {
  state: TuiState;
  index: number;
} {
  const existingIndex = findAssistantCardIndex(
    state,
    event.requestId,
    event.payload.responseId,
  );

  if (existingIndex !== -1) {
    return {
      state,
      index: existingIndex,
    };
  }

  const withAssistantCard = appendTimelineItem(state, {
    id: createTimelineItemId(state, "assistant"),
    kind: "assistant",
    summary: "Thinking...",
    body: "",
    collapsed: false,
    requestId: event.requestId,
    responseId: event.payload.responseId,
  });

  return {
    state: withAssistantCard,
    index: withAssistantCard.timeline.length - 1,
  };
}

function ensureExecutionCard(
  state: TuiState,
  event: {
    requestId: string;
    executionId: string;
    title: string;
  },
): {
  state: TuiState;
  index: number;
} {
  const existingIndex = findExecutionCardIndex(
    state,
    event.requestId,
    event.executionId,
  );

  if (existingIndex !== -1) {
    return {
      state,
      index: existingIndex,
    };
  }

  const withExecutionCard = appendTimelineItem(state, {
    id: createTimelineItemId(state, "execution"),
    kind: "execution",
    summary: event.title,
    collapsed: true,
    requestId: event.requestId,
    executionId: event.executionId,
    executionTranscript: createExecutionTranscriptBuffer(),
    unreadLineCount: 0,
  });

  return {
    state: withExecutionCard,
    index: withExecutionCard.timeline.length - 1,
  };
}

function isBuiltinCommandRequest(event: InteractionEvent): boolean {
  return event.requestId.startsWith("request-command-");
}

function isBuiltinCommandExecutionEvent(event: InteractionEvent): boolean {
  if (
    event.eventType !== "execution_item_started" &&
    event.eventType !== "execution_item_chunk" &&
    event.eventType !== "execution_item_completed"
  ) {
    return false;
  }

  if (isBuiltinCommandRequest(event)) {
    return true;
  }

  if (event.eventType !== "execution_item_started") {
    return false;
  }

  return event.payload.origin.source === "builtin_command";
}

function isDeclaredExecutionEventForActiveLedger(
  state: TuiState,
  event: Extract<
    InteractionEvent,
    | { eventType: "execution_item_started" }
    | { eventType: "execution_item_chunk" }
    | { eventType: "execution_item_completed" }
  >,
): boolean {
  const activeLedger = state.activeRequestLedger;

  if (activeLedger === null || event.requestId !== activeLedger.requestId) {
    return false;
  }

  const wave = activeLedger.currentExecutionWave;

  if (wave === null) {
    return false;
  }

  return wave.planned.has(event.payload.executionId);
}

function shouldProjectPromptLifecycleEventIntoTimeline(
  state: TuiState,
  event: InteractionEvent,
): boolean {
  const activeLedger = state.activeRequestLedger;

  if (activeLedger === null || event.requestId !== activeLedger.requestId) {
    return false;
  }

  switch (event.eventType) {
    case "assistant_response_started": {
      const wave = activeLedger.currentExecutionWave;
      const hasInFlightWave =
        wave !== null && wave.completed.size < wave.planned.size;

      return !hasInFlightWave;
    }
    case "assistant_stream_chunk":
      return activeLedger.activeResponseId === event.payload.responseId;
    case "assistant_response_completed":
      return activeLedger.activeResponseId === event.payload.responseId;
    case "execution_item_started":
    case "execution_item_chunk":
    case "execution_item_completed":
      return isDeclaredExecutionEventForActiveLedger(state, event);
    case "request_completed":
      return false;
    default:
      return false;
  }
}

function shouldProjectInteractionEventIntoTimeline(
  state: TuiState,
  event: InteractionEvent,
): boolean {
  if (isBuiltinCommandExecutionEvent(event)) {
    return true;
  }

  return shouldProjectPromptLifecycleEventIntoTimeline(state, event);
}

function projectInteractionEventIntoTimeline(
  state: TuiState,
  event: InteractionEvent,
): TuiState {
  switch (event.eventType) {
    case "assistant_response_started": {
      return ensureAssistantCard(state, event).state;
    }
    case "assistant_stream_chunk": {
      if (event.payload.channel !== "output_text") {
        return state;
      }

      const assistant = ensureAssistantCard(state, {
        ...event,
        eventType: "assistant_response_started",
        payload: {
          responseId: event.payload.responseId,
        },
      });
      const assistantCard = assistant.state.timeline[assistant.index];

      if (!assistantCard || assistantCard.kind !== "assistant") {
        return assistant.state;
      }

      const nextBody = (assistantCard.body ?? "") + event.payload.delta;
      const nextSummary = nextBody.trim().length > 0 ? nextBody : assistantCard.summary;

      return replaceTimelineItem(assistant.state, assistant.index, {
        ...assistantCard,
        summary: nextSummary,
        body: nextBody,
      });
    }
    case "assistant_response_completed":
      return state;
    case "execution_item_started": {
      return ensureExecutionCard(state, {
        requestId: event.requestId,
        executionId: event.payload.executionId,
        title: event.payload.title,
      }).state;
    }
    case "execution_item_chunk": {
      const execution = ensureExecutionCard(state, {
        requestId: event.requestId,
        executionId: event.payload.executionId,
        title: event.payload.executionId,
      });
      const executionCard = execution.state.timeline[execution.index];

      if (!executionCard || executionCard.kind !== "execution") {
        return execution.state;
      }

      const previousBuffer =
        executionCard.executionTranscript ?? createExecutionTranscriptBuffer();
      const nextBuffer = appendTranscriptChunk(previousBuffer, event.payload.output);

      if (nextBuffer === previousBuffer) {
        return execution.state;
      }

      const committedLineDelta =
        nextBuffer.totalCommittedLineCount - previousBuffer.totalCommittedLineCount;
      const unreadLineCount = executionCard.collapsed
        ? (executionCard.unreadLineCount ?? 0) + Math.max(0, committedLineDelta)
        : 0;

      return replaceTimelineItem(execution.state, execution.index, {
        ...executionCard,
        executionTranscript: nextBuffer,
        unreadLineCount,
      });
    }
    case "execution_item_completed": {
      const execution = ensureExecutionCard(state, {
        requestId: event.requestId,
        executionId: event.payload.executionId,
        title: event.payload.summary,
      });
      const executionCard = execution.state.timeline[execution.index];

      if (!executionCard || executionCard.kind !== "execution") {
        return execution.state;
      }

      return replaceTimelineItem(execution.state, execution.index, {
        ...executionCard,
        summary: event.payload.summary,
      });
    }
    case "request_completed":
      return state;
    default:
      return state;
  }
}

function projectInteractionEventIntoRequestLedger(
  state: TuiState,
  event: InteractionEvent,
): TuiState {
  const activeLedger = state.activeRequestLedger;

  if (activeLedger === null) {
    return state;
  }

  if (event.requestId !== activeLedger.requestId) {
    return state;
  }

  const nextLedger = reduceRequestLedger(activeLedger, event);
  const isTerminal = nextLedger.terminalEventReceived;

  return {
    ...state,
    activeRequestLedger: isTerminal ? null : nextLedger,
    inputLocked: isTerminal ? false : isComposerLocked(nextLedger),
  };
}

export function createInitialTuiState(input: CreateInitialTuiStateInput): TuiState {
  return {
    sessionId: input.sessionId,
    focus: "composer",
    inspectorOpen: false,
    runtimeState: "ready",
    activeRequestLedger: null,
    commandMenu: createEmptyCommandMenu(),
    timeline: [createWelcomeCard(input)],
    selectedTimelineIndex: 0,
    draft: "",
    inputLocked: false,
    projectLabel: input.projectLabel,
    branchLabel: input.branchLabel,
    providerLabel: input.providerLabel,
    modelLabel: input.modelLabel,
    contextMetrics: input.contextMetrics,
  };
}

export function reduceTuiState(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "toggle_inspector":
      return {
        ...state,
        inspectorOpen: !state.inspectorOpen,
      };
    case "focus_timeline":
      return {
        ...state,
        focus: "timeline",
      };
    case "focus_composer":
      return {
        ...state,
        focus: "composer",
      };
    case "move_selection_up":
      if (state.focus === "composer" && state.commandMenu.visible) {
        return {
          ...state,
          commandMenu: {
            ...state.commandMenu,
            selectedIndex: Math.max(0, state.commandMenu.selectedIndex - 1),
          },
        };
      }

      return {
        ...state,
        selectedTimelineIndex: Math.max(0, state.selectedTimelineIndex - 1),
      };
    case "move_selection_down":
      if (state.focus === "composer" && state.commandMenu.visible) {
        return {
          ...state,
          commandMenu: {
            ...state.commandMenu,
            selectedIndex: Math.min(
              Math.max(0, state.commandMenu.items.length - 1),
              state.commandMenu.selectedIndex + 1,
            ),
          },
        };
      }

      return {
        ...state,
        selectedTimelineIndex: Math.min(
          Math.max(0, state.timeline.length - 1),
          state.selectedTimelineIndex + 1,
        ),
      };
    case "append_system_message":
      return appendTimelineItem(state, {
        id: createTimelineItemId(state, "system"),
        kind: "system",
        summary: action.line,
        body: action.line,
        collapsed: false,
      });
    case "append_user_message":
      return appendTimelineItem(state, {
        id: createTimelineItemId(state, "user"),
        kind: "user",
        summary: action.prompt,
        body: action.prompt,
        collapsed: false,
      });
    case "append_assistant_message":
      return appendTimelineItem(state, {
        id: createTimelineItemId(state, "assistant"),
        kind: "assistant",
        summary: action.output,
        body: action.output,
        collapsed: false,
      });
    case "append_execution_item":
      return appendTimelineItem(state, {
        id: createTimelineItemId(state, "execution"),
        kind: "execution",
        summary: action.summary,
        ...(action.body !== undefined ? { body: action.body } : {}),
        collapsed: true,
      });
    case "start_request_lifecycle": {
      const ledger = createForegroundRequestLedger({
        requestId: action.requestId,
        turnId: action.turnId,
        startedAt: action.startedAt,
      });

      return {
        ...state,
        activeRequestLedger: ledger,
        inputLocked: isComposerLocked(ledger),
      };
    }
    case "mark_interrupt_intent": {
      if (state.activeRequestLedger === null) {
        return state;
      }

      const nextLedger = markInterruptRequested(state.activeRequestLedger);

      return {
        ...state,
        activeRequestLedger: nextLedger,
        inputLocked: isComposerLocked(nextLedger),
      };
    }
    case "project_interaction_event": {
      const shouldProjectTimelineEvent = shouldProjectInteractionEventIntoTimeline(
        state,
        action.event,
      );
      const withLedgerProjection = projectInteractionEventIntoRequestLedger(
        state,
        action.event,
      );

      if (!shouldProjectTimelineEvent) {
        return withLedgerProjection;
      }

      return projectInteractionEventIntoTimeline(
        withLedgerProjection,
        action.event,
      );
    }
    case "toggle_selected_item": {
      const item = state.timeline[state.selectedTimelineIndex];

      if (item === undefined) {
        return state;
      }

      const timeline = state.timeline.map((timelineItem, index) => {
        if (index !== state.selectedTimelineIndex || timelineItem.collapsed === undefined) {
          return timelineItem;
        }

        const nextCollapsed = !timelineItem.collapsed;

        if (timelineItem.kind !== "execution" || nextCollapsed) {
          return {
            ...timelineItem,
            collapsed: nextCollapsed,
          };
        }

        return {
          ...timelineItem,
          collapsed: false,
          unreadLineCount: 0,
        };
      });

      return {
        ...state,
        timeline,
      };
    }
    case "set_draft":
      return {
        ...state,
        draft: action.draft,
        commandMenu: deriveCommandMenu(action.draft),
      };
    case "set_input_locked":
      return {
        ...state,
        inputLocked: action.locked,
      };
    case "set_runtime_state":
      return {
        ...state,
        runtimeState: action.state,
      };
    case "set_context_metrics":
      return {
        ...state,
        contextMetrics: action.contextMetrics,
      };
    default:
      return state;
  }
}
