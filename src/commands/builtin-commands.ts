import type { BuiltinCommand } from "./command-types.ts";

const builtinCommands: BuiltinCommand[] = [
  {
    id: "help",
    name: "/help",
    aliases: [],
    description: "Show the built-in session commands.",
  },
  {
    id: "clear",
    name: "/clear",
    aliases: [],
    description: "Clear the current conversation history.",
  },
  {
    id: "status",
    name: "/status",
    aliases: [],
    description: "Show the current session status.",
  },
  {
    id: "branch",
    name: "/branch",
    aliases: [],
    description: "Show the current git branch for the project root.",
  },
  {
    id: "exit",
    name: "/exit",
    aliases: [],
    description: "Exit the current interactive session.",
  },
];

export function listBuiltinCommands(): BuiltinCommand[] {
  return builtinCommands;
}

export function findBuiltinCommand(name: string): BuiltinCommand | undefined {
  const slashName = name.startsWith("/") ? name : `/${name}`;

  return builtinCommands.find(
    (command) => command.name === slashName || command.aliases.includes(slashName as `/${string}`),
  );
}
