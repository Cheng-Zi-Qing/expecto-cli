import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  return mkdtemp(join(tmpdir(), "expecto-cli-user-config-"));
}

const legacyWorkspaceDir = [".beta", "agent"].join("-");

test("loadUserConfig returns null themeId when no config file exists", async () => {
  const homeDir = await makeHomeDir();

  assert.equal(resolveUserConfigPath(homeDir), join(homeDir, ".expecto-cli", "config.json"));
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

test("loadUserConfig ignores the removed legacy config path once expecto config is absent", async () => {
  const homeDir = await makeHomeDir();
  const legacyDir = join(homeDir, legacyWorkspaceDir);

  await mkdir(legacyDir, { recursive: true });
  await writeFile(
    join(legacyDir, "config.json"),
    `${JSON.stringify({ themeId: "ravenclaw" }, null, 2)}\n`,
    "utf8",
  );

  assert.deepEqual(await loadUserConfig({ homeDir }), {
    themeId: null,
  });
});

function rawGlyphRows(themeId: "hufflepuff" | "gryffindor" | "ravenclaw" | "slytherin"): string[] {
  return getThemeDefinition(themeId).welcome.glyphRows.map((row) =>
    row.map((segment) => segment.text).join("")
  );
}

test("theme registry returns four available house themes with stable assets", () => {
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
  assert.equal(hufflepuff.palette.glyph.mist_light, "#E4DFD8");
  assert.equal(hufflepuff.palette.glyph.mist_mid, "#C4BCB3");
  assert.equal(hufflepuff.palette.glyph.mist_dark, "#9F968D");
  assert.equal(hufflepuff.palette.glyph.shadow, "#635D57");
  assert.ok(hufflepuff.welcome.glyphRows.length > 0);
  assert.equal(hufflepuff.welcome.glyphRows[1]?.[1]?.text, "▗▛██▖ ▗██▜▖");
  assert.equal(hufflepuff.welcome.glyphRows[2]?.[1]?.text, "▐██▙▜█ █▛▟██▌");
  assert.equal(hufflepuff.welcome.glyphRows[3]?.[1]?.text, "▐██▛◦█ █◦▜██▌");
  assert.equal(hufflepuff.welcome.glyphRows[4]?.[1]?.text, "▝▜██▇▇██▛▘");
  assert.equal(hufflepuff.sample.tipTitle, "Tips");
  assert.equal(hufflepuff.sample.highlightTitle, "Highlights");
  assert.ok(hufflepuff.sample.highlightTokens.length > 0);

  assert.deepEqual(
    themes.map((theme) => ({
      id: theme.id,
      availability: theme.availability,
    })),
    [
      { id: "hufflepuff", availability: "available" },
      { id: "gryffindor", availability: "available" },
      { id: "ravenclaw", availability: "available" },
      { id: "slytherin", availability: "available" },
    ],
  );

  const gryffindor = getThemeDefinition("gryffindor");
  assert.equal(gryffindor.displayName, "Gryffindor");
  assert.equal(gryffindor.animal, "Lion");
  assert.equal(gryffindor.sample.tipTitle, "Tips");
  assert.equal(gryffindor.sample.highlightTitle, "Highlights");
  assert.deepEqual(rawGlyphRows("gryffindor"), [
    "   ░ · ░  · ░",
    " ░▒ ▗▞▓████▓▚▖ ~▒░",
    "  ░ ▐▓██▛▀▜██▓▌ ░",
    " ░▒ ▐▓██▌▼▐██▓▌·▒░",
    "   ░▒ ▝▀████▀▘ ›_",
  ]);

  const ravenclaw = getThemeDefinition("ravenclaw");
  assert.equal(ravenclaw.displayName, "Ravenclaw");
  assert.equal(ravenclaw.animal, "Eagle");
  assert.equal(ravenclaw.sample.tipTitle, "Tips");
  assert.equal(ravenclaw.sample.highlightTitle, "Highlights");
  assert.deepEqual(rawGlyphRows("ravenclaw"), [
    "       ░ · ░  · ░",
    "     ░▒  ▗▄████▄  ~▒░",
    "      ░ ▗████▛▀▜▖  ░",
    "     ░▒ ▐████▌◉ ◥▖·▒░",
    "       ░▒ ▝▀███▀  ›_",
  ]);

  const slytherin = getThemeDefinition("slytherin");
  assert.equal(slytherin.displayName, "Slytherin");
  assert.equal(slytherin.animal, "Serpent");
  assert.equal(slytherin.sample.tipTitle, "Tips");
  assert.equal(slytherin.sample.highlightTitle, "Highlights");
  assert.equal(slytherin.palette.chrome.user, "#2F7A38");
  assert.equal(slytherin.palette.glyph.shadow, "#165517");
  assert.equal(slytherin.palette.glyph.chin, "#2F7A38");
  assert.equal(slytherin.palette.glyph.highlight, "#FFFFFF");
  assert.equal(slytherin.palette.glyph.mystic, "#98A3AE");
  assert.deepEqual(rawGlyphRows("slytherin"), [
    "       ░ · ░  · ░",
    "     ░▒ ▗▄▓████▓▄▖ ~▒░",
    "      ░ ▐▓█▚▀▀▞█▓▌ ░",
    "     ░▒ ▐▓▌◥██◤▐▓▌ ·▒░",
    "       ░▒ ▝▀▓▼▼▓▀▘  ›_",
  ]);
});
