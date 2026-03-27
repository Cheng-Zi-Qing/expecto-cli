import type { InteractionEvent } from "../contracts/interaction-event-schema.ts";
import type { ForegroundRequestLedger } from "./request-ledger.ts";
import type { ExecutionTranscriptBuffer } from "./execution-transcript-buffer.ts";

export type TuiFocus = "composer" | "timeline";

export type CommandMenuItem = {
  id: string;
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

export type TuiState = {
  sessionId: string;
  focus: TuiFocus;
  inspectorOpen: boolean;
  runtimeState: TuiRuntimeState;
  activeRequestLedger: ForegroundRequestLedger | null;
  commandMenu: CommandMenuState;
  timeline: TimelineItem[];
  selectedTimelineIndex: number;
  draft: string;
  inputLocked: boolean;
  projectLabel: string;
  branchLabel: string;
  providerLabel: string;
  modelLabel: string;
  contextMetrics: ContextMetrics;
};

export type CreateInitialTuiStateInput = {
  sessionId: string;
  projectLabel: string;
  branchLabel: string;
  providerLabel: string;
  modelLabel: string;
  contextMetrics: ContextMetrics;
};

export type TuiAction =
  | { type: "toggle_inspector" }
  | { type: "focus_timeline" }
  | { type: "focus_composer" }
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
  | { type: "set_input_locked"; locked: boolean }
  | { type: "set_runtime_state"; state: TuiRuntimeState }
  | { type: "set_context_metrics"; contextMetrics: ContextMetrics };
