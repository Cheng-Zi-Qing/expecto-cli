import type {
  InteractionEvent,
  RequestCompletedStatus,
} from "../contracts/interaction-event-schema.ts";

export type ForegroundRequestPhase =
  | "assistant_active"
  | "awaiting_execution_start"
  | "executing"
  | "awaiting_assistant_resume"
  | "interrupting"
  | "terminal";

export interface ExecutionWaveLedger {
  planned: ReadonlySet<string>;
  started: ReadonlySet<string>;
  completed: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  interrupted: ReadonlySet<string>;
}

export interface ForegroundRequestLedger {
  requestId: string;
  turnId: string;
  startedAt: string;
  activeResponseId: string | null;
  currentExecutionWave: ExecutionWaveLedger | null;
  interruptRequested: boolean;
  terminalEventReceived: boolean;
  terminalStatus: RequestCompletedStatus | null;
  phase: ForegroundRequestPhase;
  assistantStarted: boolean;
}

export interface CreateForegroundRequestLedgerInput {
  requestId: string;
  turnId: string;
  startedAt: string;
}

export function createForegroundRequestLedger(
  input: CreateForegroundRequestLedgerInput,
): ForegroundRequestLedger {
  const base: Omit<ForegroundRequestLedger, "phase"> = {
    requestId: input.requestId,
    turnId: input.turnId,
    startedAt: input.startedAt,
    activeResponseId: null,
    currentExecutionWave: null,
    interruptRequested: false,
    terminalEventReceived: false,
    terminalStatus: null,
    assistantStarted: false,
  };

  return {
    ...base,
    phase: derivePhase(base),
  };
}

export function reduceRequestLedger(
  ledger: ForegroundRequestLedger,
  event: InteractionEvent,
): ForegroundRequestLedger {
  if (event.requestId !== ledger.requestId) {
    return ledger;
  }

  if (ledger.terminalEventReceived) {
    return ledger;
  }

  switch (event.eventType) {
    case "assistant_response_started": {
      const currentWave = ledger.currentExecutionWave;
      const hasInFlightWave =
        currentWave !== null && currentWave.completed.size < currentWave.planned.size;
      if (hasInFlightWave) {
        return ledger;
      }

      return withDerivedPhase({
        ...ledger,
        activeResponseId: event.payload.responseId,
        assistantStarted: true,
        currentExecutionWave: hasInFlightWave ? currentWave : null,
      });
    }
    case "assistant_response_completed": {
      if (ledger.activeResponseId !== event.payload.responseId) {
        return ledger;
      }

      if (event.payload.finishReason === "tool_calls") {
        return withDerivedPhase({
          ...ledger,
          activeResponseId: null,
          currentExecutionWave: {
            planned: new Set(event.payload.plannedExecutionIds),
            ...createEmptyWaveSets(),
          },
        });
      }

      return withDerivedPhase({
        ...ledger,
        activeResponseId: null,
      });
    }
    case "execution_item_started": {
      if (ledger.currentExecutionWave === null) {
        return ledger;
      }

      if (!ledger.currentExecutionWave.planned.has(event.payload.executionId)) {
        return ledger;
      }

      if (ledger.currentExecutionWave.started.has(event.payload.executionId)) {
        return ledger;
      }

      if (ledger.currentExecutionWave.completed.has(event.payload.executionId)) {
        return ledger;
      }

      const nextWave = cloneWave(ledger.currentExecutionWave);
      nextWave.started.add(event.payload.executionId);
      return withDerivedPhase({
        ...ledger,
        currentExecutionWave: nextWave,
      });
    }
    case "execution_item_completed": {
      if (ledger.currentExecutionWave === null) {
        return ledger;
      }

      if (!ledger.currentExecutionWave.planned.has(event.payload.executionId)) {
        return ledger;
      }

      if (ledger.currentExecutionWave.completed.has(event.payload.executionId)) {
        return ledger;
      }

      const nextWave = cloneWave(ledger.currentExecutionWave);
      nextWave.completed.add(event.payload.executionId);

      if (event.payload.status === "error") {
        nextWave.failed.add(event.payload.executionId);
      } else if (event.payload.status === "interrupted") {
        nextWave.interrupted.add(event.payload.executionId);
      }

      return withDerivedPhase({
        ...ledger,
        currentExecutionWave: nextWave,
      });
    }
    case "request_completed": {
      return withDerivedPhase({
        ...ledger,
        activeResponseId: null,
        terminalEventReceived: true,
        terminalStatus: event.payload.status,
      });
    }
    default:
      return ledger;
  }
}

export function isComposerLocked(ledger: ForegroundRequestLedger | null): boolean {
  return ledger !== null && !ledger.terminalEventReceived;
}

export function markInterruptRequested(
  ledger: ForegroundRequestLedger,
): ForegroundRequestLedger {
  if (ledger.terminalEventReceived || ledger.interruptRequested) {
    return ledger;
  }

  return withDerivedPhase({
    ...ledger,
    interruptRequested: true,
  });
}

function withDerivedPhase(
  ledger: Omit<ForegroundRequestLedger, "phase">,
): ForegroundRequestLedger {
  return {
    ...ledger,
    phase: derivePhase(ledger),
  };
}

function derivePhase(
  ledger: Omit<ForegroundRequestLedger, "phase">,
): ForegroundRequestPhase {
  if (ledger.terminalEventReceived) {
    return "terminal";
  }

  if (ledger.interruptRequested) {
    return "interrupting";
  }

  if (ledger.activeResponseId !== null) {
    return "assistant_active";
  }

  const wave = ledger.currentExecutionWave;

  if (wave !== null) {
    if (wave.completed.size >= wave.planned.size) {
      return "awaiting_assistant_resume";
    }

    if (wave.started.size > 0 || wave.completed.size > 0) {
      return "executing";
    }

    return "awaiting_execution_start";
  }

  if (!ledger.assistantStarted) {
    return "awaiting_execution_start";
  }

  return "awaiting_assistant_resume";
}

function cloneWave(wave: ExecutionWaveLedger): MutableExecutionWaveLedger {
  return {
    planned: new Set(wave.planned),
    started: new Set(wave.started),
    completed: new Set(wave.completed),
    failed: new Set(wave.failed),
    interrupted: new Set(wave.interrupted),
  };
}

function createEmptyWaveSets(): Omit<MutableExecutionWaveLedger, "planned"> {
  return {
    started: new Set<string>(),
    completed: new Set<string>(),
    failed: new Set<string>(),
    interrupted: new Set<string>(),
  };
}

interface MutableExecutionWaveLedger {
  planned: Set<string>;
  started: Set<string>;
  completed: Set<string>;
  failed: Set<string>;
  interrupted: Set<string>;
}
