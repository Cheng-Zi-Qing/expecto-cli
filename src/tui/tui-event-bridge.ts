import { PRIMARY_CLI_BINARY_NAME } from "../core/brand.ts";
import type { InteractionEvent } from "../contracts/interaction-event-schema.ts";
import type { ExecutionLogStore } from "../runtime/execution-log-store.ts";
import type { TuiAction, TuiState } from "./tui-types.ts";

export type TuiEventBridgeOptions = {
  dispatch: (action: TuiAction) => void;
  executionLogStore: ExecutionLogStore;
  onRefreshContextMetrics: () => void;
  getState: () => TuiState;
};

export type TuiEventBridge = {
  onInteractionEvent: (event: InteractionEvent) => void;
  onSystemLine: (line: string) => void;
  allocateLocalTurn: () => { turnId: string; requestId: string };
  pushConversationEntry: (entry: string) => void;
  getConversation: () => readonly string[];
};

function shouldHideSystemLine(line: string): boolean {
  return (
    line === `${PRIMARY_CLI_BINARY_NAME} interactive session` ||
    line.startsWith("mode: ") ||
    line.startsWith("project: ") ||
    line.startsWith("initial prompt: ")
  );
}

function parsePromptTurnSequence(turnId: string): number | null {
  const match = /^turn-(\d+)$/.exec(turnId);

  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function createTuiEventBridge(options: TuiEventBridgeOptions): TuiEventBridge {
  const { dispatch, executionLogStore, onRefreshContextMetrics, getState } = options;

  const conversation: string[] = [];
  const assistantConversationEntryIndexByResponseId = new Map<string, number>();
  let promptTurnSequence = 0;

  const allocateLocalTurn = (): { turnId: string; requestId: string } => {
    promptTurnSequence += 1;
    const turnId = `turn-${promptTurnSequence}`;
    return { turnId, requestId: `request-${turnId}` };
  };

  const pushConversationEntry = (entry: string): void => {
    conversation.push(entry);
    onRefreshContextMetrics();
  };

  const onInteractionEvent = (event: InteractionEvent): void => {
    if (event.eventType === "session_initialized") {
      dispatch({ type: "set_session_id", sessionId: event.payload.sessionId });
      return;
    }

    if (event.eventType === "user_prompt_received") {
      const expectedConversationEntry = `user: ${event.payload.prompt}`;
      const currentState = getState();
      const latestTimelineItem = currentState.timeline.at(-1);

      if (conversation.at(-1) !== expectedConversationEntry) {
        conversation.push(expectedConversationEntry);
        onRefreshContextMetrics();
      }

      if (currentState.activeRequestLedger?.requestId !== event.requestId) {
        dispatch({
          type: "start_request_lifecycle",
          requestId: event.requestId,
          turnId: event.turnId,
          startedAt: event.timestamp,
        });
      }

      if (!(latestTimelineItem?.kind === "user" && latestTimelineItem.summary === event.payload.prompt)) {
        dispatch({ type: "append_user_message", prompt: event.payload.prompt });
      }
    }

    if (event.eventType === "session_state_changed") {
      dispatch({ type: "set_runtime_state", state: event.payload.state });
      return;
    }

    if (event.eventType === "conversation_cleared") {
      conversation.length = 0;
      assistantConversationEntryIndexByResponseId.clear();
      onRefreshContextMetrics();
      return;
    }

    if (event.eventType === "prompt_interrupted") {
      const expectedEntry = `user: ${event.payload.prompt}`;

      if (conversation.at(-1) === expectedEntry) {
        conversation.pop();
        onRefreshContextMetrics();
      }

      dispatch({ type: "set_draft", draft: event.payload.prompt });
      return;
    }

    if (event.eventType === "assistant_stream_chunk") {
      if (event.payload.channel === "output_text") {
        const existingIndex = assistantConversationEntryIndexByResponseId.get(event.payload.responseId);

        if (existingIndex === undefined) {
          conversation.push(`assistant: ${event.payload.delta}`);
          assistantConversationEntryIndexByResponseId.set(event.payload.responseId, conversation.length - 1);
        } else {
          conversation[existingIndex] = `${conversation[existingIndex] ?? "assistant: "}${event.payload.delta}`;
        }

        onRefreshContextMetrics();
      }
    } else if (event.eventType === "assistant_response_completed") {
      assistantConversationEntryIndexByResponseId.delete(event.payload.responseId);
    }

    if (event.eventType === "execution_item_started") {
      void executionLogStore.ensureExecutionLog(event.payload.executionId).catch(() => {});
    } else if (event.eventType === "execution_item_chunk") {
      void executionLogStore.appendChunk(event.payload.executionId, event.payload.output).catch(() => {});
    }

    const observedPromptTurnSequence = "turnId" in event
      ? parsePromptTurnSequence(event.turnId)
      : null;

    if (observedPromptTurnSequence !== null && observedPromptTurnSequence > promptTurnSequence) {
      promptTurnSequence = observedPromptTurnSequence;
    }

    dispatch({ type: "project_interaction_event", event });
  };

  const onSystemLine = (line: string): void => {
    if (shouldHideSystemLine(line)) {
      return;
    }

    dispatch({ type: "append_system_message", line });
  };

  return {
    onInteractionEvent,
    onSystemLine,
    allocateLocalTurn,
    pushConversationEntry,
    getConversation: () => conversation,
  };
}
