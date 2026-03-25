export type BuiltinCommandId = "help" | "clear" | "status" | "branch" | "exit";

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
