import { gryffindorTheme } from "./themes/gryffindor.ts";
import { hufflepuffTheme } from "./themes/hufflepuff.ts";
import { originTheme } from "./themes/origin.ts";
import { ravenclawTheme } from "./themes/ravenclaw.ts";
import { slytherinTheme } from "./themes/slytherin.ts";
import type { ThemeDefinition, ThemeId } from "./theme-types.ts";

const themeDefinitions: ThemeDefinition[] = [
  hufflepuffTheme,
  gryffindorTheme,
  ravenclawTheme,
  slytherinTheme,
  originTheme,
];

const themeDefinitionMap = new Map(
  themeDefinitions.map((theme) => [theme.id, theme] as const),
);

export function listThemeDefinitions(): ThemeDefinition[] {
  return [...themeDefinitions];
}

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  const theme = themeDefinitionMap.get(id);

  if (theme === undefined) {
    throw new Error(`Unknown theme id: ${id}`);
  }

  return theme;
}

export function getDefaultThemeId(): ThemeId {
  return "hufflepuff";
}
