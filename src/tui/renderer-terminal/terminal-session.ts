import type { AnsiWriter } from "./ansi-writer.ts";

export type TerminalSession = {
  enter: () => void;
  exit: () => void;
};

export type CreateTerminalSessionOptions = {
  writer: AnsiWriter;
  setRawMode: (enabled: boolean) => void;
};

export function createTerminalSession(options: CreateTerminalSessionOptions): TerminalSession {
  return {
    enter: () => {
      options.writer.enterAlternateScreen();
      try {
        options.setRawMode(true);
      } catch (error) {
        try {
          options.writer.exitAlternateScreen();
        } catch {}
        throw error;
      }

      try {
        options.writer.hideCursor();
      } catch (error) {
        try {
          options.setRawMode(false);
        } catch {}
        try {
          options.writer.exitAlternateScreen();
        } catch {}
        throw error;
      }
    },
    exit: () => {
      let firstError: unknown | undefined;
      const runCleanup = (cleanup: () => void): void => {
        try {
          cleanup();
        } catch (error) {
          if (firstError === undefined) {
            firstError = error;
          }
        }
      };

      runCleanup(() => options.writer.showCursor());
      runCleanup(() => options.setRawMode(false));
      runCleanup(() => options.writer.exitAlternateScreen());

      if (firstError !== undefined) {
        throw firstError;
      }
    },
  };
}
