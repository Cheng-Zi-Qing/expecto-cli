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

function requireValue(flag: string, value: string | undefined, expected: string): string {
  if (!value) {
    throw new Error(`${flag} requires ${expected}`);
  }

  return value;
}

export function parseCliArgs(argv: string[]): CliCommand {
  if (argv.length === 0) {
    return { kind: "interactive" };
  }

  const [first, second, third] = argv;

  if (first === "-p" || first === "--print") {
    if (third) {
      throw new Error(`${first} accepts only a single prompt argument`);
    }

    return {
      kind: "print",
      prompt: requireValue(first, second, "a prompt"),
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

  if (argv.length > 1) {
    throw new Error("interactive mode accepts only a single positional prompt");
  }

  if (first) {
    return {
      kind: "interactive",
      initialPrompt: first,
    };
  }

  return {
    kind: "interactive",
  };
}
