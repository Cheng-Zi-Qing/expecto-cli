import type { InteractionEvent } from "../contracts/interaction-event-schema.ts";
import type { CommandId } from "../commands/command-types.ts";
import type { ForegroundRequestLedger } from "./request-ledger.ts";
import type { ExecutionTranscriptBuffer } from "./execution-transcript-buffer.ts";
import type { ThemeId } from "./theme/theme-types.ts";

export type TuiFocus = "composer" | "timeline";
export type TuiTimelineMode = "scroll" | "select";

export type CommandMenuItem = {
  id: CommandId;
  name: `/${string}`;
  aliases: `/${string}`[];
  description: string;
};

export type CommandMenuState = {
  visible: boolean;
  query: string;
  items: CommandMenuItem[];
  selectedIndex: number;
};

export type TuiRuntimeState =
  | "idle"
  | "ready"
  | "streaming"
  | "tool_running"
  | "interrupted"
  | "error";

export type TimelineItemKind =
  | "welcome"
  | "system"
  | "user"
  | "assistant"
  | "execution";

export type TimelineItem = {
  id: string;
  kind: TimelineItemKind;
  summary: string;
  body?: string;
  collapsed?: boolean;
  requestId?: string;
  responseId?: string;
  executionId?: string;
  executionTranscript?: ExecutionTranscriptBuffer;
  unreadLineCount?: number;
};

export type ContextMetrics = {
  percent: number;
  rules: number;
  hooks: number;
  docs: number;
};

export type ThemePickerReason = "first_launch" | "command";

export type ThemePickerState = {
  reason: ThemePickerReason;
  selectedThemeId: ThemeId;
  themeIds: ThemeId[];
};

export type DraftAttachment = {
  id: string;
  content: string;
  lineCount: number;
  tokenCount: number;
};

export type TuiState = {
  sessionId: string;
  activeThemeId: ThemeId;
  focus: TuiFocus;
  timelineMode: TuiTimelineMode;
  inspectorOpen: boolean;
  runtimeState: TuiRuntimeState;
  activeRequestLedger: ForegroundRequestLedger | null;
  commandMenu: CommandMenuState;
  timeline: TimelineItem[];
  selectedTimelineIndex: number;
  draft: string;
  draftAttachments: DraftAttachment[];
  inputLocked: boolean;
  projectLabel: string;
  branchLabel: string;
  providerLabel: string;
  modelLabel: string;
  contextMetrics: ContextMetrics;
  themePicker: ThemePickerState | null;
};

export type CreateInitialTuiStateInput = {
  sessionId: string;
  projectLabel: string;
  branchLabel: string;
  providerLabel: string;
  modelLabel: string;
  contextMetrics: ContextMetrics;
  savedThemeId?: ThemeId | null;
  forceThemePicker?: boolean;
};

export type TuiAction =
  | { type: "toggle_inspector" }
  | { type: "toggle_timeline_mode" }
  | { type: "focus_timeline" }
  | { type: "focus_composer" }
  | { type: "move_selection_left" }
  | { type: "move_selection_right" }
  | { type: "move_selection_up" }
  | { type: "move_selection_down" }
  | { type: "append_system_message"; line: string }
  | { type: "append_user_message"; prompt: string }
  | { type: "append_assistant_message"; output: string }
  | { type: "append_execution_item"; summary: string; body?: string }
  | {
      type: "start_request_lifecycle";
      requestId: string;
      turnId: string;
      startedAt: string;
    }
  | { type: "mark_interrupt_intent" }
  | { type: "project_interaction_event"; event: InteractionEvent }
  | { type: "toggle_selected_item" }
  | { type: "set_draft"; draft: string }
  | { type: "add_draft_attachment"; id: string; content: string }
  | { type: "set_input_locked"; locked: boolean }
  | { type: "set_runtime_state"; state: TuiRuntimeState }
  | { type: "set_context_metrics"; contextMetrics: ContextMetrics }
  | { type: "open_theme_picker"; reason: ThemePickerReason; selectedThemeId?: ThemeId };
