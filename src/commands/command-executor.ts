import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import type { ThemeSpellLabels } from "../tui/theme/theme-types.ts";
import { resolveGitBranch } from "../core/git-branch.ts";
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

const COMMAND_SPELL_KEYS: Record<string, keyof ThemeSpellLabels> = {
  "/help": "commandHelp",
  "/clear": "commandClear",
  "/theme": "commandTheme",
  "/exit": "commandExit",
};

function buildHelpEffects(spellLabels?: ThemeSpellLabels): CommandExecutionEffect[] {
  const sections = createHelpSections();
  const lines: string[] = ["Available commands", ""];

  sections.forEach((section, sectionIndex) => {
    lines.push(section.title);

    section.commands.forEach((command) => {
      const spellKey = COMMAND_SPELL_KEYS[command.name];
      const spellAnnotation =
        spellLabels && spellKey && spellLabels[spellKey].toLowerCase() !== command.name.slice(1).toLowerCase()
          ? ` (${spellLabels[spellKey]})`
          : "";
      lines.push(`${command.name}${spellAnnotation}    ${command.description}`);
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
  spellLabels?: ThemeSpellLabels,
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
        effects: buildHelpEffects(spellLabels),
      };
    case "session.clear":
      {
        const clearSpell = spellLabels && spellLabels.commandClear !== "Clear"
          ? `${spellLabels.commandClear}! `
          : "";
        return {
          handled: true,
          effects: [
            { type: "clear_conversation" },
            { type: "system_message", line: `${clearSpell}conversation cleared` },
          ],
        };
      }
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
    case "debug.inspect":
      return {
        handled: false,
        effects: [],
      };
    case "debug.stack":
      {
        const stack = context.instructionStack ?? [];
        const degraded = new Set(context.degradedArtifactIds);

        if (stack.length === 0) {
          return {
            handled: true,
            effects: [{ type: "system_message", line: "instruction stack is empty" }],
          };
        }

        const effects: CommandExecutionEffect[] = stack.map((layer) => {
          const lineCount = layer.content.split("\n").length;
          const pathSuffix = layer.path ? ` — ${layer.path}` : "";
          const artifactId = layer.id.startsWith("artifact:") ? layer.id.slice("artifact:".length) : undefined;
          const degradedSuffix = artifactId && degraded.has(artifactId) ? "  [degraded]" : "";
          return {
            type: "system_message" as const,
            line: `[${layer.kind}]  ${layer.title}${pathSuffix}  (${lineCount} lines)${degradedSuffix}`,
          };
        });

        return { handled: true, effects };
      }
    case "session.theme":
      return {
        handled: true,
        effects: [{ type: "open_theme_picker" }],
      };
    case "session.exit":
      {
        const exitEffects: CommandExecutionEffect[] = [];
        if (spellLabels && spellLabels.commandExit !== "Exit") {
          exitEffects.push({ type: "system_message", line: `${spellLabels.commandExit}!` });
        }
        exitEffects.push({ type: "exit_session" });
        return {
          handled: true,
          effects: exitEffects,
        };
      }
    default:
      return assertNever(command.id);
  }
}
