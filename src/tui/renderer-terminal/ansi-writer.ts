export type AnsiWriter = {
  hideCursor: () => void;
  showCursor: () => void;
  saveCursor: () => void;
  restoreCursor: () => void;
  disableLineWrap: () => void;
  enableLineWrap: () => void;
  moveCursor: (column: number, row: number) => void;
  clearLine: () => void;
  clearScreen: () => void;
  setScrollRegion: (top: number, bottom: number) => void;
  resetScrollRegion: () => void;
  enableBracketedPaste: () => void;
  disableBracketedPaste: () => void;
};

export function createAnsiWriter(write: (chunk: string) => void): AnsiWriter {
  return {
    hideCursor: () => {
      write("\u001b[?25l");
    },
    showCursor: () => {
      write("\u001b[?25h");
    },
    saveCursor: () => {
      write("\u001b7");
    },
    restoreCursor: () => {
      write("\u001b8");
    },
    disableLineWrap: () => {
      write("\u001b[?7l");
    },
    enableLineWrap: () => {
      write("\u001b[?7h");
    },
    moveCursor: (column, row) => {
      write(`\u001b[${row};${column}H`);
    },
    clearLine: () => {
      write("\u001b[2K");
    },
    clearScreen: () => {
      write("\u001b[2J");
    },
    setScrollRegion: (top, bottom) => {
      write(`\u001b[${top};${bottom}r`);
    },
    resetScrollRegion: () => {
      write("\u001b[r");
    },
    enableBracketedPaste: () => {
      write("\u001b[?2004h");
    },
    disableBracketedPaste: () => {
      write("\u001b[?2004l");
    },
  };
}
