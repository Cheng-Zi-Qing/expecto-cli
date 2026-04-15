import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { HOUSE_SPELL_LABELS, ORIGIN_SPELL_LABELS } from "../../../src/tui/theme/spell-labels.ts";

describe("HOUSE_SPELL_LABELS", () => {
  test("every field is a non-empty string", () => {
    for (const [key, value] of Object.entries(HOUSE_SPELL_LABELS)) {
      assert.equal(typeof value, "string", `${key} should be a string`);
      assert.ok(value.length > 0, `${key} should not be empty`);
    }
  });

  test("contains all 21 required keys", () => {
    const keys = Object.keys(HOUSE_SPELL_LABELS);
    assert.equal(keys.length, 21);
  });
});

describe("ORIGIN_SPELL_LABELS", () => {
  test("every field is a non-empty string", () => {
    for (const [key, value] of Object.entries(ORIGIN_SPELL_LABELS)) {
      assert.equal(typeof value, "string", `${key} should be a string`);
      assert.ok(value.length > 0, `${key} should not be empty`);
    }
  });

  test("contains all 21 required keys", () => {
    const keys = Object.keys(ORIGIN_SPELL_LABELS);
    assert.equal(keys.length, 21);
  });

  test("has the same keys as HOUSE_SPELL_LABELS", () => {
    const houseKeys = Object.keys(HOUSE_SPELL_LABELS).sort();
    const originKeys = Object.keys(ORIGIN_SPELL_LABELS).sort();
    assert.deepEqual(originKeys, houseKeys);
  });
});

describe("house vs origin spell labels differ on themed keys", () => {
  const themedKeys: (keyof typeof HOUSE_SPELL_LABELS)[] = [
    "composerTitle",
    "timelineTitle",
    "themePickerTitle",
    "statusStreaming",
    "statusError",
    "hintEnter",
    "hintInterrupt",
    "commandExit",
    "commandHelp",
    "commandClear",
    "commandCompact",
    "commandLog",
    "commandTrace",
    "commandTheme",
    "userInputLabel",
    "assistantStreamLabel",
    "modeSwitchLabel",
  ];

  for (const key of themedKeys) {
    test(`${key} differs between house and origin`, () => {
      assert.notEqual(
        HOUSE_SPELL_LABELS[key],
        ORIGIN_SPELL_LABELS[key],
        `${key} should differ between house and origin`,
      );
    });
  }
});
