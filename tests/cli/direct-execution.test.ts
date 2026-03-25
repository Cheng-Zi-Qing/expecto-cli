import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isDirectExecution } from "../../src/cli/entry.ts";

test("isDirectExecution returns true when invoked through a symlinked bin path", async () => {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-direct-exec-"));
  const realDir = join(root, "dist", "src", "cli");
  await mkdir(realDir, { recursive: true });

  const realEntry = join(realDir, "entry.js");
  const symlinkEntry = join(root, "beta");

  await writeFile(realEntry, "#!/usr/bin/env node\n");
  await symlink(realEntry, symlinkEntry);

  assert.equal(
    isDirectExecution(symlinkEntry, pathToFileURL(realEntry).href),
    true,
  );
});

test("isDirectExecution returns false for a different file", () => {
  assert.equal(
    isDirectExecution("/tmp/other-entry.js", pathToFileURL("/tmp/real-entry.js").href),
    false,
  );
});
