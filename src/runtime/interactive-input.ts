import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export type ReadLine = () => Promise<string | null>;
export type CloseInteractiveInput = () => Promise<void> | void;

export type InteractiveInput = {
  readLine: ReadLine;
  close: CloseInteractiveInput;
};

export function createTerminalInteractiveInput(prompt = "> "): InteractiveInput {
  const readline = createInterface({
    input: stdin,
    output: stdout,
  });
  let closed = false;

  readline.on("close", () => {
    closed = true;
  });

  return {
    readLine: async () => {
      if (closed) {
        return null;
      }

      try {
        return await readline.question(prompt);
      } catch {
        return null;
      }
    },
    close: () => {
      if (!closed) {
        readline.close();
      }
    },
  };
}
