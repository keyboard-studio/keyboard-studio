// FullStepPage — the scroll container a `layout: "full"` step body renders in.
//
// StepHost renders every full-layout step inside a fixed
// `height: 100%; overflow: hidden` shell (the step owns its own scrolling so
// canvas-style steps like carve can lay out panes edge-to-edge). A step
// whose body is a plain document — the Rules and Deadkeys steps — therefore
// needs its own `height: 100%; overflowY: auto` root, or content taller than
// the viewport is clipped. This is that root, plus the page chrome the
// survey steps share: theme background/text/font tokens, a centred readable
// column, and bottom padding so the last control scrolls clear of the
// journey footer (FOOTER_CLEARANCE, as StudioShell's questions pane does).

import type { CSSProperties, ReactNode } from "react";
import { BG_PAGE, TEXT_MAIN, FONT } from "../ui/theme.ts";
import { FOOTER_CLEARANCE } from "./PreviewButton.tsx";

const scrollStyle: CSSProperties = {
  height: "100%",
  overflowY: "auto",
  boxSizing: "border-box",
  background: BG_PAGE,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

export interface FullStepPageProps {
  children: ReactNode;
  /** `data-testid` for the scroll container. */
  testId?: string;
  /** Max width of the centred content column (px). */
  maxWidth?: number;
}

export function FullStepPage({ children, testId, maxWidth = 960 }: FullStepPageProps) {
  const columnStyle: CSSProperties = {
    maxWidth,
    margin: "0 auto",
    padding: `32px 16px calc(48px + ${FOOTER_CLEARANCE})`,
    boxSizing: "border-box",
  };
  return (
    <div data-testid={testId} style={scrollStyle}>
      <div style={columnStyle}>{children}</div>
    </div>
  );
}
