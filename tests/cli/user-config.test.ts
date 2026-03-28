import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadUserConfig,
  resolveUserConfigPath,
  saveUserConfig,
} from "../../src/cli/user-config.ts";
import {
  getThemeDefinition,
  listThemeDefinitions,
} from "../../src/tui/theme/theme-registry.ts";

async function makeHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "beta-agent-user-config-"));
}

test("loadUserConfig returns null themeId when no config file exists", async () => {
  const homeDir = await makeHomeDir();

  assert.equal(resolveUserConfigPath(homeDir), join(homeDir, ".beta-agent", "config.json"));
  assert.deepEqual(await loadUserConfig({ homeDir }), {
    themeId: null,
  });
});

test("saveUserConfig persists a themeId and loadUserConfig reads it back", async () => {
  const homeDir = await makeHomeDir();

  await saveUserConfig(
    {
      themeId: "hufflepuff",
    },
    { homeDir },
  );

  assert.deepEqual(await loadUserConfig({ homeDir }), {
    themeId: "hufflepuff",
  });

  const saved = JSON.parse(
    await readFile(resolveUserConfigPath(homeDir), "utf8"),
  ) as {
    themeId?: string | null;
  };
  assert.equal(saved.themeId, "hufflepuff");
});

test("theme registry returns the Hufflepuff theme and stable house metadata", () => {
  const themes = listThemeDefinitions();

  assert.deepEqual(
    themes.map((theme) => theme.id),
    ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
  );

  const hufflepuff = getThemeDefinition("hufflepuff");
  assert.equal(hufflepuff.displayName, "Hufflepuff");
  assert.equal(hufflepuff.animal, "Badger");
  assert.equal(hufflepuff.availability, "available");
  assert.equal(hufflepuff.paletteLabel, "yellow / gray");
  assert.equal(hufflepuff.welcome.title, "Welcome back!");
  assert.match(hufflepuff.welcome.subtitle, /Hufflepuff Badger/i);
  assert.ok(hufflepuff.welcome.glyphRows.length > 0);
  assert.ok(hufflepuff.sample.highlightTokens.length > 0);

  assert.deepEqual(
    themes.slice(1).map((theme) => ({
      id: theme.id,
      availability: theme.availability,
    })),
    [
      { id: "gryffindor", availability: "planned" },
      { id: "ravenclaw", availability: "planned" },
      { id: "slytherin", availability: "planned" },
    ],
  );
});
