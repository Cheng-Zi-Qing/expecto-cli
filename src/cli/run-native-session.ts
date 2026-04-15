import { join } from "node:path";

import type { ProviderRunner } from "../providers/provider-runner.ts";
import type { BootstrapContext } from "../runtime/bootstrap-context.ts";
import type { InteractiveInput } from "../runtime/interactive-input.ts";
import type { SessionManagerOptions } from "../runtime/session-manager.ts";
import type { CliRoute } from "./route-resolution.ts";
import { createTerminalInteractiveInput } from "../runtime/interactive-input.ts";
import { SessionManager } from "../runtime/session-manager.ts";
import { createStreamPresenter } from "./stream-presenter.ts";
import { createProtocolEmitter } from "../protocol/protocol-emitter.ts";
import { createProtocolTransport, writeEventToTransport } from "../protocol/protocol-transport.ts";
import { createAuditWriter } from "../protocol/audit-writer.ts";
import { currentAppPath } from "../core/brand.ts";

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
  if (route.kind === "native_repl" || route.kind === "resume") {
    const factory = createInteractiveInput ?? createTerminalInteractiveInput;
    interactiveInput = factory();
  }

  const transport = createProtocolTransport();
  const auditWriter = createAuditWriter(join(context.projectRoot, currentAppPath("state")));
  const emitter = createProtocolEmitter({
    onEvent: (event) => {
      writeEventToTransport(transport, event);
      void auditWriter.write(event);
      presenter.onDomainEvent(event);
    },
  });

  const sessionManagerFactory =
    createSessionManager ?? ((options: SessionManagerOptions) => new SessionManager(options));

  const sessionManager = sessionManagerFactory({
    write: () => {},
    ...(interactiveInput ? { readLine: interactiveInput.readLine, closeInput: interactiveInput.close } : {}),
    ...(providerRunner ? { providerRunner } : {}),
    emitFact: emitter.emit,
  });

  try {
    await sessionManager.run(context);
  } finally {
    await auditWriter.close();
  }

  const terminalError = presenter.consumeTerminalError();

  if (terminalError && route.kind !== "native_repl" && route.kind !== "resume") {
    throw terminalError;
  }
}
