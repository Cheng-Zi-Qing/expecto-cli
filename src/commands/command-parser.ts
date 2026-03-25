import type { ParsedSlashCommand } from "./command-types.ts";

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith("/")) {
    return null;
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  const [commandToken, ...args] = tokens;

  if (!commandToken || commandToken === "/") {
    return null;
  }

  return {
    raw: trimmed,
    name: commandToken.slice(1),
    args,
  };
}
