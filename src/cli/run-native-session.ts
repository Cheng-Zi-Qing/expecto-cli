import type { ProviderRunner } from "../providers/provider-runner.ts";
import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import type { InteractiveInput } from "../runtime/interactive-input.ts";
import type { SessionManagerOptions } from "../runtime/session-manager.ts";
import type { CliRoute } from "./route-resolution.ts";
import { createTerminalInteractiveInput } from "../runtime/interactive-input.ts";
import { SessionManager } from "../runtime/session-manager.ts";
import { createStreamPresenter } from "./stream-presenter.ts";

type SessionManagerLike = {
  run: (context: BootstrapContext) => Promise<unknown>;
};

export type RunNativeSessionInput = {
  context: BootstrapContext;
  route: CliRoute;
  providerRunner?: ProviderRunner;
  writeStdout?: (chunk: string) => void;
  writeStderr?: (chunk: string) => void;
  createSessionManager?: (options: SessionManagerOptions) => SessionManagerLike;
  createInteractiveInput?: (prompt?: string) => InteractiveInput;
};

export async function runNativeSession(
  input: RunNativeSessionInput,
): Promise<void> {
  const {
    context,
    route,
    providerRunner,
    writeStdout,
    writeStderr,
    createSessionManager,
    createInteractiveInput,
  } = input;

  if (route.kind === "tui") {
    throw new Error("runNativeSession does not support the TUI route");
  }

  if (route.kind === "error") {
    throw new Error(route.message);
  }

  const presenter = createStreamPresenter({
    ...(writeStdout ? { writeStdout } : {}),
    ...(writeStderr ? { writeStderr } : {}),
  });

  let interactiveInput: InteractiveInput | undefined;
  if (route.kind === "native_repl") {
    const factory = createInteractiveInput ?? createTerminalInteractiveInput;
    interactiveInput = factory();
  }

  const sessionManagerFactory =
    createSessionManager ?? ((options: SessionManagerOptions) => new SessionManager(options));

  const sessionManager = sessionManagerFactory({
    write: () => {},
    ...(interactiveInput ? { readLine: interactiveInput.readLine, closeInput: interactiveInput.close } : {}),
    ...(providerRunner ? { providerRunner } : {}),
    onSystemLine: presenter.onSystemLine,
    onInteractionEvent: presenter.onInteractionEvent,
  });

  await sessionManager.run(context);

  const terminalError = presenter.consumeTerminalError();

  if (terminalError && route.kind !== "native_repl") {
    throw terminalError;
  }
}
