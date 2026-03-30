import { access, appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { currentAppPath } from "../core/brand.ts";

export type ExecutionLogStore = {
  ensureExecutionLog: (executionId: string) => Promise<string>;
  appendChunk: (executionId: string, output: string) => Promise<string>;
  resolveLogPath: (executionId: string) => Promise<string | null>;
  flush: (executionId?: string) => Promise<void>;
};

export type CreateExecutionLogStoreOptions = {
  projectRoot: string;
};

function sanitizeExecutionId(executionId: string): string {
  return executionId.replaceAll(/[^A-Za-z0-9._-]/g, "_");
}

export function createExecutionLogStore(
  options: CreateExecutionLogStoreOptions,
): ExecutionLogStore {
  const logsDir = join(options.projectRoot, currentAppPath("logs"));
  const pendingWrites = new Map<string, Promise<void>>();

  const pathFor = (directory: string, executionId: string): string => {
    return join(directory, `exec_${sanitizeExecutionId(executionId)}.log`);
  };

  const queueWrite = (executionId: string, action: () => Promise<void>): Promise<string> => {
    const previous = pendingWrites.get(executionId) ?? Promise.resolve();
    const next = previous.then(async () => {
      await mkdir(logsDir, { recursive: true });
      await action();
    });

    pendingWrites.set(
      executionId,
      next.finally(() => {
        if (pendingWrites.get(executionId) === next) {
          pendingWrites.delete(executionId);
        }
      }),
    );

    return next.then(() => pathFor(logsDir, executionId));
  };

  return {
    ensureExecutionLog: async (executionId) => {
      return queueWrite(executionId, async () => {
        await writeFile(pathFor(logsDir, executionId), "", { flag: "a" });
      });
    },
    appendChunk: async (executionId, output) => {
      return queueWrite(executionId, async () => {
        await appendFile(pathFor(logsDir, executionId), output, "utf8");
      });
    },
    resolveLogPath: async (executionId) => {
      const logPath = pathFor(logsDir, executionId);

      try {
        await access(logPath);
        return logPath;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      return null;
    },
    flush: async (executionId) => {
      if (executionId !== undefined) {
        await (pendingWrites.get(executionId) ?? Promise.resolve());
        return;
      }

      await Promise.all([...pendingWrites.values()]);
    },
  };
}
