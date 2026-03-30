export const PRODUCT_DISPLAY_NAME = "Expecto Cli";
export const PRODUCT_PACKAGE_NAME = "expecto-cli";
export const PRIMARY_CLI_BINARY_NAME = "expecto";
export const CURRENT_APP_DIR = ".expecto-cli";
export const RUNTIME_IDENTITY_TITLE = "expecto-cli-identity";
export const RUNTIME_IDENTITY_CONTENT =
  `You are ${PRODUCT_DISPLAY_NAME}, a CLI-first coding assistant with a Markdown-driven workspace.`;
export const DEFAULT_ASSISTANT_IDENTITY =
  `You are ${PRODUCT_DISPLAY_NAME}, a CLI-first coding assistant. Follow the user request directly.`;

function joinAppPath(appDir: string, segments: readonly string[]): string {
  return [appDir, ...segments].join("/");
}

export function currentAppPath(...segments: string[]): string {
  return joinAppPath(CURRENT_APP_DIR, segments);
}
