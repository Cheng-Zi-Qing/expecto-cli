import type {
  CommandCategory,
  CommandDescriptor,
  CommandHelpSection,
} from "./command-types.ts";

const commandRegistry: CommandDescriptor[] = [
  {
    id: "session.help",
    category: "session",
    name: "/help",
    aliases: [],
    description: "Show the built-in session commands.",
    availability: "implemented",
  },
  {
    id: "session.status",
    category: "session",
    name: "/status",
    aliases: [],
    description: "Show the current session status.",
    availability: "implemented",
  },
  {
    id: "session.clear",
    category: "session",
    name: "/clear",
    aliases: [],
    description: "Clear the current conversation history.",
    availability: "implemented",
  },
  {
    id: "session.theme",
    category: "session",
    name: "/theme",
    aliases: [],
    description: "Open the local theme selector.",
    availability: "implemented",
  },
  {
    id: "session.exit",
    category: "session",
    name: "/exit",
    aliases: [],
    description: "Exit the current interactive session.",
    availability: "implemented",
  },
  {
    id: "project.branch",
    category: "project",
    name: "/branch",
    aliases: [],
    description: "Show the current git branch for the project root.",
    availability: "implemented",
  },
  {
    id: "project.init",
    category: "project",
    name: "/init",
    aliases: [],
    description: "Initialize the artifact workspace directory structure.",
    availability: "implemented",
  },
  {
    id: "debug.inspect",
    category: "debug",
    name: "/inspect",
    aliases: [],
    description: "Open the saved execution log for a completed tool run.",
    availability: "hidden",
  },
  {
    id: "debug.stack",
    category: "debug",
    name: "/stack",
    aliases: [],
    description: "Show the current instruction stack layers.",
    availability: "implemented",
  },
];

const orderedCategories: CommandCategory[] = ["session", "project", "debug"];
const categoryTitles: Record<CommandCategory, string> = {
  session: "Session",
  project: "Project",
  debug: "Debug",
};

function cloneCommand(command: CommandDescriptor): CommandDescriptor {
  return {
    ...command,
    aliases: [...command.aliases],
  };
}

export function listAllCommands(): CommandDescriptor[] {
  return commandRegistry.map(cloneCommand);
}

export function listImplementedCommands(): CommandDescriptor[] {
  return commandRegistry
    .filter((command) => command.availability === "implemented")
    .map(cloneCommand);
}

export function listImplementedCommandsByCategory(): CommandHelpSection[] {
  const implemented = listImplementedCommands();

  return orderedCategories
    .map((category) => {
      const commands = implemented.filter((command) => command.category === category);

      if (commands.length === 0) {
        return null;
      }

      return {
        category,
        title: categoryTitles[category],
        commands,
      };
    })
    .filter((section): section is CommandHelpSection => section !== null);
}

export function findCommandByInput(input: string): CommandDescriptor | undefined {
  const normalizedInput = input.trim();

  if (normalizedInput.length === 0) {
    return undefined;
  }

  const slashName = (
    normalizedInput.startsWith("/") ? normalizedInput : `/${normalizedInput}`
  ) as `/${string}`;

  const command = commandRegistry.find(
    (command) =>
      command.availability !== "planned" &&
      (command.name === slashName || command.aliases.includes(slashName)),
  );

  if (!command) {
    return undefined;
  }

  return cloneCommand(command);
}

export function createHelpSections(): CommandHelpSection[] {
  return listImplementedCommandsByCategory();
}
