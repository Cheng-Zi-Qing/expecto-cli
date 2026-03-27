import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("package metadata exposes the built beta bin and local install scripts", async () => {
  const packageJson = JSON.parse(
    await readFile(`${projectRoot}/package.json`, "utf8"),
  ) as {
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.bin?.beta, "./dist/src/cli/entry.js");
  assert.equal(packageJson.scripts?.dev, "node --experimental-strip-types src/cli/entry.ts");
  assert.equal(packageJson.scripts?.["install:local"], "bash ./scripts/install-local-beta.sh");
});

test("local beta install script exists", async () => {
  await access(`${projectRoot}/scripts/install-local-beta.sh`);
});

test("readme documents session env setup and local beta install", async () => {
  const readme = await readFile(`${projectRoot}/README.md`, "utf8");
  const cliBehaviorSectionMatch = readme.match(
    /## Current CLI Behavior\s+([\s\S]*?)\n## Deprecated Compatibility Surface/,
  );

  if (!cliBehaviorSectionMatch) {
    assert.fail("expected current CLI behavior section");
  }
  const cliBehaviorSection = cliBehaviorSectionMatch[1] ?? "";

  assert.match(readme, /~\/\.beta-agent\/session\.env/);
  assert.match(readme, /npm run install:local/);
  assert.match(readme, /beta\s+"say hello in one sentence"/);
  assert.match(readme, /beta --tui "<prompt>"/);
  assert.match(readme, /non-TTY.*single-shot stream semantics/i);
  assert.match(readme, /## Deprecated Compatibility Surface/);
  assert.match(readme, /beta -p\/--print "<prompt>"/);
  assert.doesNotMatch(cliBehaviorSection, /beta -p\/--print/);
});
