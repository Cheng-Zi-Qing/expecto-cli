import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import { resolveGitBranch } from "../core/git-branch.ts";
import { ArtifactStore } from "../core/artifact-store.ts";
import { ArtifactWorkspace } from "../core/artifact-workspace.ts";
import { artifactWriteInputSchema } from "../contracts/artifact-schema.ts";
import { createHelpSections, findCommandByInput } from "./command-registry.ts";
import { parseSlashCommand } from "./command-parser.ts";

export type CommandExecutionEffect =
  | { type: "system_message"; line: string }
  | { type: "execution_item"; summary: string; body?: string }
  | { type: "clear_conversation" }
  | { type: "open_theme_picker" }
  | { type: "exit_session" };

export type CommandExecutionResult = {
  handled: boolean;
  effects: CommandExecutionEffect[];
};

function assertNever(value: never): never {
  throw new Error(`Unhandled command id: ${String(value)}`);
}

function buildHelpEffects(): CommandExecutionEffect[] {
  const sections = createHelpSections();
  const lines: string[] = ["Available commands", ""];

  sections.forEach((section, sectionIndex) => {
    lines.push(section.title);

    section.commands.forEach((command) => {
      lines.push(`${command.name}    ${command.description}`);
    });

    if (sectionIndex < sections.length - 1) {
      lines.push("");
    }
  });

  return lines.map((line) => ({ type: "system_message", line }));
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

  const command = findCommandByInput(`/${parsed.name}`);

  if (!command) {
    return {
      handled: true,
      effects: [
        {
          type: "system_message",
          line: `Unknown command: /${parsed.name}`,
        },
        {
          type: "system_message",
          line: "Run /help to see available commands.",
        },
      ],
    };
  }

  switch (command.id) {
    case "session.help":
      return {
        handled: true,
        effects: buildHelpEffects(),
      };
    case "session.clear":
      return {
        handled: true,
        effects: [
          { type: "clear_conversation" },
          { type: "system_message", line: "conversation cleared" },
        ],
      };
    case "session.status":
      return {
        handled: true,
        effects: context.sessionSummary
          ?.split("\n")
          .map((line) => ({
            type: "system_message" as const,
            line,
          })) ?? [],
      };
    case "project.branch":
      {
        const branch = await resolveGitBranch(context.projectRoot);

        return {
          handled: true,
          effects: [
            {
              type: "system_message",
              line: `branch: ${branch.label}`,
            },
            {
              type: "execution_item",
              summary: "Read git branch",
              body: branch.detail,
            },
          ],
        };
      }
    case "workspace.init":
      {
        const workspace = new ArtifactWorkspace(context.projectRoot);
        const result = await workspace.ensureInitialized();
        const effects: CommandExecutionEffect[] = [];

        for (const path of result.created) {
          effects.push({ type: "system_message", line: `created: ${path}` });
        }

        for (const path of result.existing) {
          effects.push({ type: "system_message", line: `exists:  ${path}` });
        }

        return { handled: true, effects };
      }
    case "workspace.write_artifact":
      {
        const rawArg = parsed.args.join(" ").trim();

        let writeInput: unknown;
        try {
          writeInput = JSON.parse(rawArg);
        } catch {
          return {
            handled: true,
            effects: [{ type: "system_message", line: "write_artifact: argument must be valid JSON" }],
          };
        }

        const parseResult = artifactWriteInputSchema.safeParse(writeInput);

        if (!parseResult.success) {
          return {
            handled: true,
            effects: [{ type: "system_message", line: `write_artifact: invalid input — ${parseResult.error.message}` }],
          };
        }

        const store = new ArtifactStore(context.projectRoot);
        const ref = await store.write(parseResult.data);

        return {
          handled: true,
          effects: [
            { type: "system_message", line: `artifact written: ${ref.title} (${ref.path})` },
          ],
        };
      }
    case "debug.inspect":
      return {
        handled: false,
        effects: [],
      };
    case "session.theme":
      return {
        handled: true,
        effects: [{ type: "open_theme_picker" }],
      };
    case "session.exit":
      return {
        handled: true,
        effects: [{ type: "exit_session" }],
      };
    default:
      return assertNever(command.id);
  }
}
