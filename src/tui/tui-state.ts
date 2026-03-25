import { listBuiltinCommands } from "../commands/builtin-commands.ts";
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

export function createInitialTuiState(input: CreateInitialTuiStateInput): TuiState {
  return {
    sessionId: input.sessionId,
    focus: "composer",
    inspectorOpen: false,
    runtimeState: "ready",
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
    case "toggle_selected_item": {
      const item = state.timeline[state.selectedTimelineIndex];

      if (item === undefined) {
        return state;
      }

      const timeline = state.timeline.map((timelineItem, index) => {
        if (index !== state.selectedTimelineIndex || timelineItem.collapsed === undefined) {
          return timelineItem;
        }

        return {
          ...timelineItem,
          collapsed: !timelineItem.collapsed,
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
