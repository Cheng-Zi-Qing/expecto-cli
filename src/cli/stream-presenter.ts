import {
  createConsolePresenter,
  PresentedStreamRequestError,
  type ConsolePresenter,
  type ConsoleSurfaceStream,
} from "./console-presenter.ts";

export type StreamPresenter = Pick<
  ConsolePresenter,
  "onDomainEvent" | "consumeTerminalError"
>;

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

function writeToStream(
  stream: ConsoleSurfaceStream,
  text: string,
  writeStdout: (chunk: string) => void,
  writeStderr: (chunk: string) => void,
): void {
  if (stream === "stderr") {
    writeStderr(text);
    return;
  }

  writeStdout(text);
}

export { PresentedStreamRequestError };

export function createStreamPresenter(
  options: StreamPresenterOptions = {},
): StreamPresenter {
  const writeStdout = options.writeStdout ?? defaultWriteStdout;
  const writeStderr = options.writeStderr ?? defaultWriteStderr;

  return createConsolePresenter({
    surface: {
      appendTimelineText: (text, stream = "stdout") => {
        writeToStream(stream, text, writeStdout, writeStderr);
      },
      setActiveStatus: () => {},
      clearActiveStatus: () => {},
    },
  });
}
