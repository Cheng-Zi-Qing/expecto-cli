import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { currentAppPath } from "../core/brand.ts";
import type { ThemeId } from "../tui/theme/theme-types.ts";
import { isThemeId } from "../tui/theme/theme-types.ts";

export const USER_CONFIG_RELATIVE_PATH = currentAppPath("config.json");

export type UserConfig = {
  themeId: ThemeId | null;
};

export type UserConfigOptions = {
  homeDir?: string;
};

export type UserConfigStore = {
  load: () => Promise<UserConfig>;
  save: (config: UserConfig) => Promise<void>;
};

function normalizeThemeId(value: unknown): ThemeId | null {
  if (typeof value !== "string") {
    return null;
  }

  return isThemeId(value) ? value : null;
}

export function resolveUserConfigPath(homeDir = homedir()): string {
  return join(homeDir, USER_CONFIG_RELATIVE_PATH);
}

export async function loadUserConfig(
  options: UserConfigOptions = {},
): Promise<UserConfig> {
  const homeDir = options.homeDir ?? homedir();
  const currentPath = resolveUserConfigPath(homeDir);

  try {
    const raw = await readFile(currentPath, "utf8");
    const parsed = JSON.parse(raw) as {
      themeId?: unknown;
    };

    return {
      themeId: normalizeThemeId(parsed.themeId),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        themeId: null,
      };
    }

    throw error;
  }
}

export async function saveUserConfig(
  config: UserConfig,
  options: UserConfigOptions = {},
): Promise<void> {
  const path = resolveUserConfigPath(options.homeDir);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ themeId: config.themeId }, null, 2)}\n`,
    "utf8",
  );
}

export function createUserConfigStore(
  options: UserConfigOptions = {},
): UserConfigStore {
  return {
    load: () => loadUserConfig(options),
    save: (config) => saveUserConfig(config, options),
  };
}
