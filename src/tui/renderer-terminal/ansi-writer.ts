export type AnsiWriter = {
  hideCursor: () => void;
  showCursor: () => void;
  moveCursor: (column: number, row: number) => void;
  clearLine: () => void;
  enterAlternateScreen: () => void;
  exitAlternateScreen: () => void;
};

export function createAnsiWriter(write: (chunk: string) => void): AnsiWriter {
  return {
    hideCursor: () => {
      write("\u001b[?25l");
    },
    showCursor: () => {
      write("\u001b[?25h");
    },
    moveCursor: (column, row) => {
      write(`\u001b[${row};${column}H`);
    },
    clearLine: () => {
      write("\u001b[2K");
    },
    enterAlternateScreen: () => {
      write("\u001b[?1049h");
    },
    exitAlternateScreen: () => {
      write("\u001b[?1049l");
    },
  };
}
