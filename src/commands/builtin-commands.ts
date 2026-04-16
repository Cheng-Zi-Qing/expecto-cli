import { findCommandByInput, listAllCommands } from "./command-registry.ts";
import type {
  BuiltinCommand,
  BuiltinCommandId,
  CommandDescriptor,
  CommandId,
} from "./command-types.ts";

const legacyIdByCommandId: Record<CommandId, BuiltinCommandId> = {
  "session.help": "help",
  "session.status": "status",
  "session.clear": "clear",
  "session.theme": "theme",
  "session.exit": "exit",
  "project.branch": "branch",
  "project.init": "init",
  "debug.inspect": "inspect",
  "debug.stack": "stack",
};

const legacyBuiltinOrder: BuiltinCommandId[] = [
  "help",
  "clear",
  "status",
  "branch",
  "init",
  "inspect",
  "theme",
  "exit",
];

function toBuiltinCommand(command: CommandDescriptor): BuiltinCommand {
  return {
    id: legacyIdByCommandId[command.id],
    name: command.name,
    aliases: [...command.aliases],
    description: command.description,
  };
}

export function listBuiltinCommands(): BuiltinCommand[] {
  const orderIndex = new Map(legacyBuiltinOrder.map((id, index) => [id, index]));

  return listAllCommands()
    .filter((command) => command.availability !== "planned")
    .map(toBuiltinCommand)
    .sort((left, right) => {
      const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;

      return leftIndex - rightIndex;
    });
}

export function findBuiltinCommand(name: string): BuiltinCommand | undefined {
  const command = findCommandByInput(name);

  if (!command) {
    return undefined;
  }

  return toBuiltinCommand(command);
}

export {
  createHelpSections,
  findCommandByInput,
  listAllCommands,
  listImplementedCommands,
  listImplementedCommandsByCategory,
} from "./command-registry.ts";
