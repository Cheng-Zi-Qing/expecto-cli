import type { InteractionEvent } from "../contracts/interaction-event-schema.ts";

export type StreamPresenter = {
  onSystemLine: (line: string) => void;
  onInteractionEvent: (event: InteractionEvent) => void;
  consumeTerminalError: () => PresentedStreamRequestError | null;
};

export type StreamPresenterOptions = {
  writeStdout?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
};

function defaultWriteStdout(chunk: string): void {
  process.stdout.write(chunk);
}

function defaultWriteStderr(chunk: string): void {
  process.stderr.write(chunk);
}

export class PresentedStreamRequestError extends Error {
  readonly alreadyPresented = true;

  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = errorCode ?? "StreamRequestError";
  }
}

export function createStreamPresenter(
  options: StreamPresenterOptions = {},
): StreamPresenter {
  const writeStdout = options.writeStdout ?? defaultWriteStdout;
  const writeStderr = options.writeStderr ?? defaultWriteStderr;
  const responseHasOutput = new Map<string, boolean>();
  let terminalError: PresentedStreamRequestError | null = null;

  return {
    onSystemLine: (line: string) => {
      writeStdout(`${line}\n`);
    },
    onInteractionEvent: (event: InteractionEvent) => {
      switch (event.eventType) {
        case "assistant_response_started": {
          responseHasOutput.set(event.payload.responseId, false);
          break;
        }
        case "assistant_stream_chunk": {
          if (event.payload.channel === "output_text") {
            writeStdout(event.payload.delta);
            responseHasOutput.set(event.payload.responseId, true);
          }
          break;
        }
        case "assistant_response_completed": {
          const hadOutput = responseHasOutput.get(event.payload.responseId);
          if (hadOutput) {
            writeStdout("\n");
          }
          responseHasOutput.delete(event.payload.responseId);
          break;
        }
        case "execution_item_started": {
          writeStdout(`> ${event.payload.title}\n`);
          break;
        }
        case "execution_item_chunk": {
          if (event.payload.stream === "stderr") {
            writeStderr(event.payload.output);
          } else {
            writeStdout(event.payload.output);
          }
          break;
        }
        case "request_completed": {
          if (event.payload.status !== "error") {
            break;
          }

          const message = event.payload.errorCode
            ? `Request failed: ${event.payload.errorCode}`
            : "Request failed";
          terminalError = new PresentedStreamRequestError(
            message,
            event.payload.errorCode,
          );
          writeStderr(`${message}\n`);
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
  };
}
