import { execa } from "execa";

import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import { findBuiltinCommand, listBuiltinCommands } from "./builtin-commands.ts";
import { parseSlashCommand } from "./command-parser.ts";

export type CommandExecutionEffect =
  | { type: "system_message"; line: string }
  | { type: "execution_item"; summary: string; body?: string }
  | { type: "clear_conversation" }
  | { type: "exit_session" };

export type CommandExecutionResult = {
  handled: boolean;
  effects: CommandExecutionEffect[];
};

async function resolveBranchLabel(projectRoot: string): Promise<string> {
  try {
    const result = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectRoot,
      reject: false,
    });
    const branch = result.stdout.trim();

    if (result.exitCode === 0 && branch.length > 0) {
      return branch;
    }
  } catch {}

  return "no-git";
}

export async function executeBuiltinCommand(
  input: string,
  context: BootstrapContext,
): Promise<CommandExecutionResult> {
  const parsed = parseSlashCommand(input);

  if (!parsed) {
    return {
      handled: false,
      effects: [],
    };
  }

  const command = findBuiltinCommand(parsed.name);

  if (!command) {
    return {
      handled: false,
      effects: [],
    };
  }

  switch (command.id) {
    case "help":
      return {
        handled: true,
        effects: [
          { type: "system_message", line: "Available commands:" },
          ...listBuiltinCommands().map((builtinCommand) => ({
            type: "system_message" as const,
            line: `${builtinCommand.name} - ${builtinCommand.description}`,
          })),
        ],
      };
    case "clear":
      return {
        handled: true,
        effects: [
          { type: "clear_conversation" },
          { type: "system_message", line: "conversation cleared" },
        ],
      };
    case "status":
      return {
        handled: true,
        effects: context.sessionSummary
          ?.split("\n")
          .map((line) => ({
            type: "system_message" as const,
            line,
          })) ?? [],
      };
    case "branch":
      {
        const branch = await resolveBranchLabel(context.projectRoot);

        return {
          handled: true,
          effects: [
            {
              type: "system_message",
              line: `branch: ${branch}`,
            },
            {
              type: "execution_item",
              summary: "Read git branch",
              body: `$ git rev-parse --abbrev-ref HEAD\n${branch}`,
            },
          ],
        };
      }
    case "exit":
      return {
        handled: true,
        effects: [{ type: "exit_session" }],
      };
  }
}
