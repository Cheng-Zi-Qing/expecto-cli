import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const legacyBrand = ["beta", "agent"].join("-");
const legacyWorkspaceDir = [".beta", "agent"].join("-");

test("package metadata exposes only the expecto bin and local install scripts", async () => {
  const packageJson = JSON.parse(
    await readFile(`${projectRoot}/package.json`, "utf8"),
  ) as {
    name?: string;
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.name, "expecto-cli");
  assert.equal(packageJson.bin?.expecto, "./dist/src/cli/entry.js");
  assert.equal(packageJson.bin?.beta, undefined);
  assert.equal(packageJson.scripts?.dev, "node --experimental-strip-types src/cli/entry.ts");
  assert.equal(
    packageJson.scripts?.["dev:watch:init"],
    "EXPECTO_FORCE_THEME_PICKER=1 node --watch-path=src --watch-path=package.json --watch-path=tsconfig.json --experimental-strip-types src/cli/entry.ts",
  );
  assert.equal(packageJson.scripts?.["install:local"], "bash ./scripts/install-local-expecto.sh");
});

test("local expecto install script exists", async () => {
  await access(`${projectRoot}/scripts/install-local-expecto.sh`);
});

test("repository metadata uses the expecto app directory and project scaffold", async () => {
  const gitignore = await readFile(`${projectRoot}/.gitignore`, "utf8");

  assert.match(gitignore, /^\.expecto-cli\/state\/$/m);
  assert.doesNotMatch(gitignore, new RegExp(`^\\${legacyWorkspaceDir}/state/$`, "m"));

  await access(`${projectRoot}/.expecto-cli/docs/00-requirements.md`);
  await access(`${projectRoot}/.expecto-cli/docs/01-plan.md`);
  await access(`${projectRoot}/.expecto-cli/memory/INDEX.md`);
});

test("workspace docs and retained planning references no longer use the legacy beta brand", async () => {
  const markdownFiles = [
    ".expecto-cli/docs/00-requirements.md",
    ".expecto-cli/docs/01-plan.md",
    ".expecto-cli/memory/INDEX.md",
    "plans/2026-03-23-v1-bootstrap-plan.md",
    "plans/2026-03-24-workspace-instruction-foundation-plan.md",
    "plans/2026-03-25-renderer-terminal-mvp-plan.md",
    "specs/2026-03-23-bootstrap-decisions.md",
    "specs/2026-03-26-cli-interaction-contract.md",
    "specs/v1-memory-architecture.md",
    "specs/v1-observer-lite-boundary.md",
    "specs/v1-provider-architecture.md",
  ];
  const legacyBrandPattern = new RegExp(legacyBrand, "i");

  for (const markdownFile of markdownFiles) {
    const content = await readFile(`${projectRoot}/${markdownFile}`, "utf8");
    assert.doesNotMatch(content, legacyBrandPattern, markdownFile);
  }
});

test("readme documents session env setup and local expecto install", async () => {
  const readme = await readFile(`${projectRoot}/README.md`, "utf8");

  assert.match(readme, /Harry Potter fans/i);
  assert.match(readme, /feel surprisingly close to magic/i);
  assert.match(readme, /decoupled frontend and backend/i);
  assert.match(readme, /easter eggs/i);
  assert.match(readme, /## Current Status/);
  assert.match(readme, /## Architecture/);
  assert.match(readme, /## Contributing/);
  assert.match(readme, /~\/\.expecto-cli\/session\.env/);
  assert.match(readme, /npm run install:local/);
  assert.match(readme, /expecto\s+"say hello in one sentence"/);
  assert.match(readme, /expecto --tui/);
  assert.match(readme, /expecto --native/);
  assert.match(readme, /\/inspect <id>/);
  assert.doesNotMatch(readme, /## Deprecated Compatibility Surface/);
  assert.doesNotMatch(readme, new RegExp(`${legacyBrand}\` -> legacy executable alias`, "i"));
  assert.doesNotMatch(readme, /Legacy `BETA_\*` environment variables/i);
});
