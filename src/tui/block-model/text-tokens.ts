export type TextTokenKind =
  | "default"
  | "muted"
  | "inline_code"
  | "command"
  | "path"
  | "shortcut"
  | "status";

export type TextToken = {
  kind: TextTokenKind;
  text: string;
};

export const createTextToken = (
  kind: TextTokenKind,
  text: string,
): TextToken => ({ kind, text });
