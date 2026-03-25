import type { TuiFooterView } from "../view-model/tui-view-types.ts";
import { padOrTrimToWidth, wrapPlainText } from "./text-layout.ts";

export type FooterRenderOptions = {
  width: number;
  composerHeight: number;
};

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function renderFooter(view: TuiFooterView, options: FooterRenderOptions): string[] {
  const width = normalizePositiveInteger(options.width, 1);
  const composerHeight = normalizePositiveInteger(options.composerHeight, 1);
  const composerText = view.composer.value === "" ? "Write a prompt" : view.composer.value;

  const composerLines = wrapPlainText(composerText, width);
  const visibleComposer = composerLines.slice(-composerHeight).map((line) =>
    padOrTrimToWidth(line, width)
  );

  while (visibleComposer.length < composerHeight) {
    visibleComposer.push(padOrTrimToWidth("", width));
  }

  const statusLine = padOrTrimToWidth(`Status: ${view.status.runtimeLabel}`, width);
  return [...visibleComposer, statusLine];
}
