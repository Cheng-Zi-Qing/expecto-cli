import type { DomainEvent } from "../protocol/domain-event-schema.ts";

export type ConsoleSurfaceStream = "stdout" | "stderr";

export type ConsoleSurface = {
  appendTimelineText: (text: string, stream?: ConsoleSurfaceStream) => void;
  setActiveStatus: (text: string) => void;
  clearActiveStatus: () => void;
};

export type ExecutionStatus = "success" | "error" | "interrupted";

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
  onDomainEvent: (event: DomainEvent) => void;
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
    onDomainEvent: (event: DomainEvent) => {
      const payload = event.payload;

      switch (event.eventType) {
        case "assistant.response_started": {
          const responseId = payload.responseId as string;
          responseHasOutput.set(responseId, false);
          surface.setActiveStatus("Thinking...");
          break;
        }
        case "assistant.stream_chunk": {
          if (payload.channel !== "output_text") {
            break;
          }

          const responseId = payload.responseId as string;
          const delta = payload.delta as string;
          surface.appendTimelineText(delta, "stdout");
          responseHasOutput.set(responseId, true);
          break;
        }
        case "assistant.response_completed": {
          const responseId = payload.responseId as string;
          const hadOutput = responseHasOutput.get(responseId);

          if (hadOutput) {
            surface.appendTimelineText("\n", "stdout");
          }

          responseHasOutput.delete(responseId);
          if (activeExecutions.size === 0) {
            surface.clearActiveStatus();
          } else {
            updateExecutionStatus();
          }
          break;
        }
        case "execution.started": {
          const executionId = payload.executionId as string;
          const title = payload.title as string;
          const requestId = event.causation?.requestId ?? "";
          activeExecutions.set(executionId, title);
          recordedExecutions.set(executionId, {
            requestId,
            executionId,
            title,
            summary: null,
            status: "running",
          });
          surface.appendTimelineText(`> ${title}\n`, "stdout");
          updateExecutionStatus();
          break;
        }
        case "execution.chunk": {
          const output = payload.output as string;
          const stream = payload.stream as string;
          surface.appendTimelineText(output, stream === "stderr" ? "stderr" : "stdout");
          break;
        }
        case "execution.completed": {
          const executionId = payload.executionId as string;
          const summary = payload.summary as string;
          const status = payload.status as ExecutionStatus;
          activeExecutions.delete(executionId);
          const previousRecord = recordedExecutions.get(executionId);
          if (previousRecord) {
            const errorCode = payload.errorCode as string | undefined;
            const exitCode = payload.exitCode as number | undefined;
            recordedExecutions.set(executionId, {
              ...previousRecord,
              summary,
              status,
              ...(errorCode ? { errorCode } : {}),
              ...(exitCode !== undefined ? { exitCode } : {}),
            });
          }
          updateExecutionStatus();
          break;
        }
        case "request.succeeded": {
          surface.clearActiveStatus();
          break;
        }
        case "request.failed": {
          surface.clearActiveStatus();

          const code = payload.code as string | undefined;
          const payloadMessage = payload.message as string | undefined;
          const message = code
            ? `Request failed: ${code}`
            : (payloadMessage ?? "Request failed");
          terminalError = new PresentedStreamRequestError(message, code);
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
