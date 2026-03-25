import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const SESSION_ENV_RELATIVE_PATH = ".beta-agent/session.env";

export type LoadSessionEnvOptions = {
  homeDir?: string;
};

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseSessionEnv(contents: string, path: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = contents.split(/\r?\n/u);

  for (const [index, rawLine] of lines.entries()) {
    const trimmedLine = rawLine.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }

    const line = trimmedLine.startsWith("export ")
      ? trimmedLine.slice("export ".length).trim()
      : trimmedLine;
    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid session env line ${index + 1} in ${path}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = stripQuotes(value);
  }

  return env;
}

export function resolveSessionEnvPath(homeDir = homedir()): string {
  return join(homeDir, SESSION_ENV_RELATIVE_PATH);
}

export async function loadSessionEnv(options: LoadSessionEnvOptions = {}): Promise<Record<string, string>> {
  const path = resolveSessionEnvPath(options.homeDir);

  try {
    const contents = await readFile(path, "utf8");
    return parseSessionEnv(contents, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }

    throw error;
  }
}
