#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

import { loadSessionEnv } from "./session-env.ts";
import { createProviderRunnerFromEnv } from "../providers/provider-bootstrap.ts";
import type { ProviderRunner } from "../providers/provider-runner.ts";
import { buildBootstrapContext, type BootstrapContext } from "../runtime/bootstrap-context.ts";
import type { ReadLine, CloseInteractiveInput } from "../runtime/interactive-input.ts";
import { SessionManager } from "../runtime/session-manager.ts";
import { parseCliArgs } from "./arg-parser.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type CliCommand = ReturnType<typeof parseCliArgs>;

export type InteractiveTuiRunnerInput = {
  context: BootstrapContext;
  providerLabel: string;
  modelLabel: string;
  branchLabel: string;
  providerRunner?: ProviderRunner;
};

export type InteractiveTuiRunner = (
  input: InteractiveTuiRunnerInput,
) => Promise<void>;

export type RunCliOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  processEnv?: Record<string, string | undefined>;
  fetch?: FetchLike;
  homeDir?: string;
  readLine?: ReadLine;
  closeInput?: CloseInteractiveInput;
  write?: (chunk: string) => void;
  stdinIsTTY?: boolean;
  runInteractiveTui?: InteractiveTuiRunner;
};

const PROVIDER_ENV_KEYS = [
  "BETA_PROVIDER",
  "MODEL_PROVIDER",
  "model_provider",
  "BETA_API_KEY",
  "BETA_BASE_URL",
  "BETA_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "NEO_KEY",
  "NEO_BASE_URL",
  "MODEL",
  "model",
] as const;

function pickProviderEnv(env: Record<string, string | undefined>): Record<string, string> {
  const picked: Record<string, string> = {};

  for (const key of PROVIDER_ENV_KEYS) {
    const value = env[key];

    if (value !== undefined) {
      picked[key] = value;
    }
  }

  return picked;
}

function hasProviderConfig(env: Record<string, string | undefined>): boolean {
  return Object.keys(pickProviderEnv(env)).length > 0;
}

function readFirst(
  env: Record<string, string | undefined>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = env[key];

    if (value) {
      return value;
    }
  }

  return undefined;
}

function selectProviderLabel(
  env: Record<string, string | undefined>,
): "openai" | "anthropic" | "openai-compatible" | "neo" | null {
  const requested = readFirst(env, ["BETA_PROVIDER", "MODEL_PROVIDER", "model_provider"]);

  if (
    requested === "openai" ||
    requested === "anthropic" ||
    requested === "openai-compatible" ||
    requested === "neo"
  ) {
    return requested;
  }

  if (env.OPENAI_API_KEY) {
    return "openai";
  }

  if (env.NEO_KEY) {
    return "neo";
  }

  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) {
    return "anthropic";
  }

  return null;
}

function resolveProviderPresentation(
  env: Record<string, string | undefined>,
): { providerLabel: string; modelLabel: string } {
  const providerLabel = selectProviderLabel(env) ?? "none";

  switch (providerLabel) {
    case "openai":
      return {
        providerLabel,
        modelLabel: readFirst(env, ["BETA_MODEL", "OPENAI_MODEL", "MODEL", "model"]) ?? "gpt-5",
      };
    case "openai-compatible":
      return {
        providerLabel,
        modelLabel: readFirst(env, ["BETA_MODEL", "OPENAI_MODEL", "MODEL", "model"]) ?? "gpt-5",
      };
    case "neo":
      return {
        providerLabel,
        modelLabel: readFirst(env, ["BETA_MODEL", "MODEL", "model"]) ?? "gpt-5.4",
      };
    case "anthropic":
      return {
        providerLabel,
        modelLabel: readFirst(env, ["BETA_MODEL", "ANTHROPIC_MODEL"]) ?? "claude-sonnet-4-20250514",
      };
    default:
      return {
        providerLabel,
        modelLabel: "unconfigured",
      };
  }
}

async function resolveBranchLabel(cwd: string): Promise<string> {
  try {
    const result = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      reject: false,
    });
    const branch = result.stdout.trim();

    if (result.exitCode === 0 && branch.length > 0) {
      return branch;
    }
  } catch {}

  return "no-git";
}

function shouldUseFullscreenTui(
  command: CliCommand,
  options: RunCliOptions,
): boolean {
  return (
    command.kind === "interactive" &&
    (options.stdinIsTTY ?? Boolean(process.stdin.isTTY)) &&
    options.readLine === undefined &&
    options.closeInput === undefined
  );
}

async function runDefaultInteractiveTui(
  input: InteractiveTuiRunnerInput,
): Promise<void> {
  const [{ runInteractiveTui }, { createBlessedTuiApp }] = await Promise.all([
    import("../tui/run-interactive-tui.ts"),
    import("../tui/renderer-blessed/tui-app.ts"),
  ]);

  await runInteractiveTui(input.context, {
    createApp: createBlessedTuiApp,
    providerLabel: input.providerLabel,
    modelLabel: input.modelLabel,
    branchLabel: input.branchLabel,
    ...(input.providerRunner ? { providerRunner: input.providerRunner } : {}),
  });
}

function mergeProviderEnv(
  sessionEnv: Record<string, string>,
  ambientEnv: Record<string, string | undefined>,
  explicitEnv: Record<string, string | undefined>,
): Record<string, string> {
  const explicitProviderEnv = pickProviderEnv(explicitEnv);

  if (hasProviderConfig(sessionEnv)) {
    return {
      ...sessionEnv,
      ...explicitProviderEnv,
    };
  }

  return {
    ...pickProviderEnv(ambientEnv),
    ...explicitProviderEnv,
  };
}

async function runCliCommand(
  command: CliCommand,
  options: RunCliOptions = {},
): Promise<void> {
  const env = mergeProviderEnv(
    await loadSessionEnv({
      ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    }),
    options.processEnv ?? process.env,
    options.env ?? {},
  );
  const context = await buildBootstrapContext({
    command,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
  const providerRunner = createProviderRunnerFromEnv({
    env,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const shouldUseTui = shouldUseFullscreenTui(command, options);

  if (shouldUseTui) {
    const interactiveTuiRunner = options.runInteractiveTui ?? runDefaultInteractiveTui;
    const { providerLabel, modelLabel } = resolveProviderPresentation(env);
    const branchLabel = await resolveBranchLabel(context.projectRoot);

    await interactiveTuiRunner({
      context,
      providerLabel,
      modelLabel,
      branchLabel,
      ...(providerRunner ? { providerRunner } : {}),
    });
    return;
  }

  const sessionManager = new SessionManager(
    {
      ...(options.write ? { write: options.write } : {}),
      ...(options.readLine ? { readLine: options.readLine } : {}),
      ...(options.closeInput ? { closeInput: options.closeInput } : {}),
      ...(providerRunner ? { providerRunner } : {}),
    },
  );

  await sessionManager.run(context);
}

export async function runCli(argv: string[], options: RunCliOptions = {}): Promise<void> {
  const command = parseCliArgs(argv);
  await runCliCommand(command, options);
}

export function isDirectExecution(
  entryPath = process.argv[1],
  importUrl = import.meta.url,
): boolean {
  if (entryPath === undefined) {
    return false;
  }

  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(importUrl));
  } catch {
    return importUrl === pathToFileURL(entryPath).href;
  }
}

async function main(): Promise<void> {
  try {
    const command = parseCliArgs(process.argv.slice(2));
    await runCliCommand(command, {
      stdinIsTTY: Boolean(process.stdin.isTTY),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (isDirectExecution()) {
  await main();
}
