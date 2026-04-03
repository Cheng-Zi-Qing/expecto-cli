import type { ParsedCliArgs } from "./arg-parser.ts";

export type CliRouteWarningCode =
  | "DEPRECATED_PRINT_ALIAS";

export type CliRouteWarning = {
  code: CliRouteWarningCode;
  message: string;
};

type InteractiveBootstrapCommand = {
  kind: "interactive";
  initialPrompt?: string;
};

type PrintBootstrapCommand = {
  kind: "print";
  prompt: string;
};

export type CliRoute =
  | {
      kind: "tui";
      bootstrapCommand: InteractiveBootstrapCommand;
      warnings: CliRouteWarning[];
    }
  | {
      kind: "native_repl";
      bootstrapCommand: InteractiveBootstrapCommand;
      warnings: CliRouteWarning[];
    }
  | {
      kind: "stream_single";
      bootstrapCommand: PrintBootstrapCommand;
      warnings: CliRouteWarning[];
    }
  | {
      kind: "continue";
      bootstrapCommand: { kind: "continue" };
      warnings: CliRouteWarning[];
    }
  | {
      kind: "resume";
      bootstrapCommand: {
        kind: "resume";
      };
      warnings: CliRouteWarning[];
    }
  | {
      kind: "error";
      message: string;
      warnings: CliRouteWarning[];
    };

export type RouteResolutionInput = {
  parsed: ParsedCliArgs;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  hasStdinPayload: boolean;
  deprecatedTerminalRendererEnv: boolean;
};

const printWarning = (code: CliRouteWarningCode, message: string): CliRouteWarning => ({
  code,
  message,
});

function makePrintCommand(prompt: string): PrintBootstrapCommand {
  return { kind: "print", prompt };
}

function makeInteractiveCommand(initialPrompt?: string): InteractiveBootstrapCommand {
  if (initialPrompt === undefined) {
    return { kind: "interactive" };
  }

  return {
    kind: "interactive",
    initialPrompt,
  };
}

export function resolveCliRoute(input: RouteResolutionInput): CliRoute {
  const {
    parsed,
    stdinIsTTY,
    stdoutIsTTY,
    hasStdinPayload,
    deprecatedTerminalRendererEnv,
  } = input;

  const warnings: CliRouteWarning[] = [];

  if ("deprecatedPrintAlias" in parsed && parsed.deprecatedPrintAlias) {
    warnings.push(
      printWarning(
        "DEPRECATED_PRINT_ALIAS",
        "The -p/--print alias is deprecated and will be removed in a future release.",
      ),
    );
  }

  if ("kind" in parsed) {
    if (parsed.kind === "continue") {
      return {
        kind: "continue",
        bootstrapCommand: { kind: "continue" },
        warnings,
      };
    }

    if (parsed.kind === "resume") {
      return {
        kind: "resume",
        bootstrapCommand: { kind: "resume" },
        warnings,
      };
    }
  }

  const hasPrompt = typeof parsed.prompt === "string";
  const promptValue = hasPrompt ? parsed.prompt ?? "" : "";
  const nonTty = !stdinIsTTY || !stdoutIsTTY;

  if (!stdoutIsTTY && stdinIsTTY && !hasPrompt) {
    return {
      kind: "error",
      message:
        "Cannot start an interactive session in a non-TTY environment without a prompt.",
      warnings,
    };
  }

  if (nonTty) {
    return {
      kind: "stream_single",
      bootstrapCommand: makePrintCommand(promptValue),
      warnings,
    };
  }

  if (parsed.explicitMode === "tui") {
    return {
      kind: "tui",
      bootstrapCommand: makeInteractiveCommand(parsed.prompt),
      warnings,
    };
  }

  if (parsed.explicitMode === "native") {
    if (hasPrompt) {
      return {
        kind: "stream_single",
        bootstrapCommand: makePrintCommand(promptValue),
        warnings,
      };
    }

    return {
      kind: "native_repl",
      bootstrapCommand: makeInteractiveCommand(),
      warnings,
    };
  }

  if (hasPrompt || hasStdinPayload) {
    return {
      kind: "stream_single",
      bootstrapCommand: makePrintCommand(promptValue),
      warnings,
    };
  }

  return {
    kind: "tui",
    bootstrapCommand: makeInteractiveCommand(),
    warnings,
  };
}
