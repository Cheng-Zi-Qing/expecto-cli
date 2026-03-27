type ExplicitMode = "native" | "tui";

type ParsedPromptArgs = {
  prompt?: string;
  explicitMode?: ExplicitMode;
  deprecatedPrintAlias?: true;
};

type ContinueCommand = {
  kind: "continue";
};

type ResumeCommand = {
  kind: "resume";
  session: string;
};

export type ParsedCliArgs = ParsedPromptArgs | ContinueCommand | ResumeCommand;
export type CliCommand =
  | {
      kind: "interactive";
      initialPrompt?: string;
    }
  | {
      kind: "print";
      prompt: string;
    }
  | {
      kind: "continue";
    }
  | {
      kind: "resume";
      session: string;
    };

const RESERVED_LEGACY_FLAGS = new Set(["--continue", "--resume", "-p", "--print"]);

function requireValue(flag: string, value: string | undefined, expected: string): string {
  if (!value) {
    throw new Error(`${flag} requires ${expected}`);
  }

  return value;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  if (argv.length === 0) {
    return {};
  }

  const [first, second, third] = argv;

  if (first === "-p" || first === "--print") {
    if (third) {
      throw new Error(`${first} accepts only a single prompt argument`);
    }

    return {
      prompt: requireValue(first, second, "a prompt"),
      deprecatedPrintAlias: true,
    };
  }

  if (first === "--continue") {
    if (second) {
      throw new Error("--continue does not accept extra arguments");
    }

    return { kind: "continue" };
  }

  if (first === "--resume") {
    if (third) {
      throw new Error("--resume accepts only a single session id");
    }

    return {
      kind: "resume",
      session: requireValue(first, second, "a session id"),
    };
  }

  let explicitMode: ExplicitMode | undefined;
  let prompt: string | undefined;

  for (const arg of argv) {
    if (arg === "--native" || arg === "--tui") {
      const nextMode: ExplicitMode = arg === "--native" ? "native" : "tui";
      if (explicitMode && explicitMode !== nextMode) {
        throw new Error("cannot combine --native and --tui");
      }

      explicitMode = nextMode;
      continue;
    }

    if (RESERVED_LEGACY_FLAGS.has(arg)) {
      throw new Error(`${arg} can only be used as the first argument`);
    }

    if (prompt !== undefined) {
      throw new Error("interactive mode accepts only a single positional prompt");
    }

    prompt = arg;
  }

  const parsed: ParsedPromptArgs = {};
  if (explicitMode) {
    parsed.explicitMode = explicitMode;
  }
  if (prompt !== undefined) {
    parsed.prompt = prompt;
  }
  return parsed;
}
