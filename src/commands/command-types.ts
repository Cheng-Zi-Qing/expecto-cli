export type CommandId =
  | "session.help"
  | "session.status"
  | "session.clear"
  | "session.theme"
  | "session.exit"
  | "project.branch"
  | "debug.inspect";

export type CommandCategory = "session" | "project" | "debug";

export type CommandAvailability = "implemented" | "planned" | "hidden";

export type CommandDescriptor = {
  id: CommandId;
  category: CommandCategory;
  name: `/${string}`;
  aliases: `/${string}`[];
  description: string;
  usage?: string;
  availability: CommandAvailability;
};

export type CommandHelpSection = {
  category: CommandCategory;
  title: string;
  commands: CommandDescriptor[];
};

export type BuiltinCommandId =
  | "help"
  | "status"
  | "clear"
  | "theme"
  | "exit"
  | "branch"
  | "inspect";

export type BuiltinCommand = {
  id: BuiltinCommandId;
  name: `/${string}`;
  aliases: `/${string}`[];
  description: string;
};

export type ParsedSlashCommand = {
  raw: string;
  name: string;
  args: string[];
};
