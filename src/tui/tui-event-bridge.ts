import type { DomainEvent } from "../protocol/domain-event-schema.ts";
import type { ExecutionLogStore } from "../runtime/execution-log-store.ts";
import type { TuiAction, TuiRuntimeState, TuiState } from "./tui-types.ts";

export type TuiEventBridgeOptions = {
  dispatch: (action: TuiAction) => void;
  executionLogStore: ExecutionLogStore;
  onRefreshContextMetrics: () => void;
  getState: () => TuiState;
};

export type TuiEventBridge = {
  onDomainEvent: (event: DomainEvent) => void;
  allocateLocalTurn: () => { turnId: string; requestId: string };
  pushConversationEntry: (entry: string) => void;
  getConversation: () => readonly string[];
};

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

  const onDomainEvent = (event: DomainEvent): void => {
    const p = event.payload as Record<string, unknown>;
    const requestId = event.causation?.requestId ?? "";

    if (event.eventType === "session.started") {
      dispatch({ type: "set_session_id", sessionId: event.sessionId });
      return;
    }

    if (event.eventType === "user.prompt_received") {
      const prompt = p.prompt as string;
      const expectedConversationEntry = `user: ${prompt}`;
      const currentState = getState();
      const latestTimelineItem = currentState.timeline.at(-1);

      if (conversation.at(-1) !== expectedConversationEntry) {
        conversation.push(expectedConversationEntry);
        onRefreshContextMetrics();
      }

      if (currentState.activeRequestLedger?.requestId !== requestId) {
        dispatch({
          type: "start_request_lifecycle",
          requestId,
          turnId: requestId.replace(/^request-/, ""),
          startedAt: event.timestamp,
        });
      }

      if (!(latestTimelineItem?.kind === "user" && latestTimelineItem.summary === prompt)) {
        dispatch({ type: "append_user_message", prompt });
      }
    }

    if (event.eventType === "session.state_changed") {
      dispatch({ type: "set_runtime_state", state: p.state as TuiRuntimeState });
      return;
    }

    if (event.eventType === "session.conversation_cleared") {
      conversation.length = 0;
      assistantConversationEntryIndexByResponseId.clear();
      onRefreshContextMetrics();
      return;
    }

    if (event.eventType === "request.failed") {
      const code = p.code as string | undefined;
      if (code === "INTERRUPTED") {
        // Derive the interrupted prompt from the last user conversation entry
        const lastEntry = conversation.at(-1);
        if (lastEntry?.startsWith("user: ")) {
          const prompt = lastEntry.slice("user: ".length);
          conversation.pop();
          onRefreshContextMetrics();
          dispatch({ type: "set_draft", draft: prompt });
        }
      }
    }

    if (event.eventType === "assistant.stream_chunk") {
      if (p.channel === "output_text") {
        const responseId = p.responseId as string;
        const existingIndex = assistantConversationEntryIndexByResponseId.get(responseId);

        if (existingIndex === undefined) {
          conversation.push(`assistant: ${p.delta as string}`);
          assistantConversationEntryIndexByResponseId.set(responseId, conversation.length - 1);
        } else {
          conversation[existingIndex] = `${conversation[existingIndex] ?? "assistant: "}${p.delta as string}`;
        }

        onRefreshContextMetrics();
      }
    } else if (event.eventType === "assistant.response_completed") {
      assistantConversationEntryIndexByResponseId.delete(p.responseId as string);
    }

    if (event.eventType === "execution.started") {
      void executionLogStore.ensureExecutionLog(p.executionId as string).catch(() => {});
    } else if (event.eventType === "execution.chunk") {
      void executionLogStore.appendChunk(p.executionId as string, p.output as string).catch(() => {});
    }

    // Sync the local turn sequence counter from observed request ids
    const turnIdFromRequest = requestId.replace(/^request-/, "");
    const observedPromptTurnSequence = parsePromptTurnSequence(turnIdFromRequest);

    if (observedPromptTurnSequence !== null && observedPromptTurnSequence > promptTurnSequence) {
      promptTurnSequence = observedPromptTurnSequence;
    }

    dispatch({ type: "project_domain_event", event });
  };

  return {
    onDomainEvent,
    allocateLocalTurn,
    pushConversationEntry,
    getConversation: () => conversation,
  };
}
