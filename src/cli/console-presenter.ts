import type { InteractionEvent, ExecutionStatus } from "../contracts/interaction-event-schema.ts";

export type ConsoleSurfaceStream = "stdout" | "stderr";

export type ConsoleSurface = {
  appendTimelineText: (text: string, stream?: ConsoleSurfaceStream) => void;
  setActiveStatus: (text: string) => void;
  clearActiveStatus: () => void;
};

export type RecordedExecution = {
  requestId: string;
  executionId: string;
  title: string;
  summary: string | null;
  status: ExecutionStatus | "running";
  errorCode?: string;
  exitCode?: number;
};

export type ConsolePresenter = {
  onSystemLine: (line: string) => void;
  onInteractionEvent: (event: InteractionEvent) => void;
  consumeTerminalError: () => PresentedStreamRequestError | null;
  getRecordedExecution: (executionId: string) => RecordedExecution | null;
};

export type ConsolePresenterOptions = {
  surface: ConsoleSurface;
};

export class PresentedStreamRequestError extends Error {
  readonly alreadyPresented = true;

  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = errorCode ?? "StreamRequestError";
  }
}

function activeExecutionStatusText(executionTitles: string[]): string {
  if (executionTitles.length <= 0) {
    return "";
  }

  if (executionTitles.length === 1) {
    return `Running ${executionTitles[0]}...`;
  }

  return `Running ${executionTitles.length} tools...`;
}

export function createConsolePresenter(
  options: ConsolePresenterOptions,
): ConsolePresenter {
  const { surface } = options;
  const responseHasOutput = new Map<string, boolean>();
  const activeExecutions = new Map<string, string>();
  const recordedExecutions = new Map<string, RecordedExecution>();
  let terminalError: PresentedStreamRequestError | null = null;

  const updateExecutionStatus = (): void => {
    if (activeExecutions.size === 0) {
      surface.clearActiveStatus();
      return;
    }

    surface.setActiveStatus(activeExecutionStatusText([...activeExecutions.values()]));
  };

  return {
    onSystemLine: (line: string) => {
      surface.appendTimelineText(`${line}\n`, "stdout");
    },
    onInteractionEvent: (event: InteractionEvent) => {
      switch (event.eventType) {
        case "assistant_response_started": {
          responseHasOutput.set(event.payload.responseId, false);
          surface.setActiveStatus("Thinking...");
          break;
        }
        case "assistant_stream_chunk": {
          if (event.payload.channel !== "output_text") {
            break;
          }

          surface.appendTimelineText(event.payload.delta, "stdout");
          responseHasOutput.set(event.payload.responseId, true);
          break;
        }
        case "assistant_response_completed": {
          const hadOutput = responseHasOutput.get(event.payload.responseId);

          if (hadOutput) {
            surface.appendTimelineText("\n", "stdout");
          }

          responseHasOutput.delete(event.payload.responseId);
          if (activeExecutions.size === 0) {
            surface.clearActiveStatus();
          } else {
            updateExecutionStatus();
          }
          break;
        }
        case "execution_item_started": {
          activeExecutions.set(event.payload.executionId, event.payload.title);
          recordedExecutions.set(event.payload.executionId, {
            requestId: event.requestId,
            executionId: event.payload.executionId,
            title: event.payload.title,
            summary: null,
            status: "running",
          });
          surface.appendTimelineText(`> ${event.payload.title}\n`, "stdout");
          updateExecutionStatus();
          break;
        }
        case "execution_item_chunk": {
          surface.appendTimelineText(event.payload.output, event.payload.stream === "stderr" ? "stderr" : "stdout");
          break;
        }
        case "execution_item_completed": {
          activeExecutions.delete(event.payload.executionId);
          const previousRecord = recordedExecutions.get(event.payload.executionId);
          if (previousRecord) {
            recordedExecutions.set(event.payload.executionId, {
              ...previousRecord,
              summary: event.payload.summary,
              status: event.payload.status,
              ...(event.payload.errorCode ? { errorCode: event.payload.errorCode } : {}),
              ...(event.payload.exitCode !== undefined ? { exitCode: event.payload.exitCode } : {}),
            });
          }
          updateExecutionStatus();
          break;
        }
        case "request_completed": {
          surface.clearActiveStatus();

          if (event.payload.status !== "error") {
            break;
          }

          const message = event.payload.errorCode
            ? `Request failed: ${event.payload.errorCode}`
            : "Request failed";
          terminalError = new PresentedStreamRequestError(message, event.payload.errorCode);
          surface.appendTimelineText(`${message}\n`, "stderr");
          break;
        }
        default:
          break;
      }
    },
    consumeTerminalError: () => {
      const current = terminalError;
      terminalError = null;
      return current;
    },
    getRecordedExecution: (executionId: string) => {
      return recordedExecutions.get(executionId) ?? null;
    },
  };
}
