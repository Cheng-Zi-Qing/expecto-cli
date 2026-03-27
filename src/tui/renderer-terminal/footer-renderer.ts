import type { TuiFooterView } from "../view-model/tui-view-types.ts";
import { padOrTrimToWidth, wrapPlainText } from "./text-layout.ts";

export type FooterRenderOptions = {
  width: number;
  composerHeight: number;
};

export type RenderedFooter = {
  lines: string[];
  composerBodyTop: number;
  composerBodyHeight: number;
  composerContentColumn: number;
  composerContentWidth: number;
};

const FRAME_SIDE_WIDTH = 4;
const FRAMED_CONTENT_COLUMN = 3;
const COMPOSER_BODY_TOP = 1;

function normalizePositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function renderLabeledFrameLine(
  width: number,
  leftCorner: string,
  rightCorner: string,
  label: string,
): string {
  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return leftCorner;
  }

  const innerWidth = Math.max(0, width - 2);
  const visibleLabel = label.slice(0, innerWidth);
  const fillerWidth = Math.max(0, innerWidth - visibleLabel.length);

  return `${leftCorner}${visibleLabel}${"─".repeat(fillerWidth)}${rightCorner}`;
}

function renderFramedBodyLine(content: string, width: number): string {
  if (width < FRAME_SIDE_WIDTH) {
    return padOrTrimToWidth(content, width);
  }

  const contentWidth = Math.max(1, width - FRAME_SIDE_WIDTH);
  return `│ ${padOrTrimToWidth(content, contentWidth)} │`;
}

export function renderFooter(view: TuiFooterView, options: FooterRenderOptions): RenderedFooter {
  const width = normalizePositiveInteger(options.width, 1);
  const composerHeight = normalizePositiveInteger(options.composerHeight, 1);
  const composerText = view.composer.value === "" ? "Write a prompt" : view.composer.value;
  const composerContentWidth = width < FRAME_SIDE_WIDTH ? width : Math.max(1, width - FRAME_SIDE_WIDTH);
  const composerContentColumn = width < FRAME_SIDE_WIDTH ? 1 : FRAMED_CONTENT_COLUMN;

  const composerLines = wrapPlainText(composerText, composerContentWidth);
  const visibleComposer = composerLines.slice(-composerHeight).map((line) =>
    renderFramedBodyLine(line, width)
  );

  while (visibleComposer.length < composerHeight) {
    visibleComposer.push(renderFramedBodyLine("", width));
  }

  return {
    lines: [
      renderLabeledFrameLine(width, "╭", "╮", " Composer "),
      ...visibleComposer,
      renderLabeledFrameLine(width, "╰", "╯", ` Status: ${view.status.runtimeLabel} `),
    ],
    composerBodyTop: COMPOSER_BODY_TOP,
    composerBodyHeight: composerHeight,
    composerContentColumn,
    composerContentWidth,
  };
}
