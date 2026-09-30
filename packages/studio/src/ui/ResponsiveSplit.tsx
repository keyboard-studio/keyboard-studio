// ResponsiveSplit — the single "two panes → stacked" collapse.
//
// The studio's recurring responsive pattern (survey shell, AssignLoopShell,
// seed grid): two panes side by side on desktop, stacked on a narrow
// viewport. Centralizing the ONE collapse here preserves the codebase's
// "no breakpoint to keep in sync" philosophy — callers name their panes,
// never a px value.
//
// This is a layout branch (viewport WIDTH), not a touch-sizing branch:
// coarse pointers do not stack panes by themselves. See useViewport.ts.
import type { CSSProperties, ReactNode } from "react";
import { BREAKPOINTS } from "./breakpoints.ts";
import { useIsNarrow } from "../hooks/useViewport.ts";

export interface ResponsiveSplitProps {
  /** First pane (renders left on desktop / top when stacked). */
  readonly primary: ReactNode;
  /** Second pane (renders right on desktop / bottom when stacked). */
  readonly secondary: ReactNode;
  /** Width at or below which the panes stack. Default `BREAKPOINTS.mobileMax`. */
  readonly breakpoint?: number;
  /** Flex-grow share of the primary pane on desktop. Default 1. */
  readonly primaryFlex?: number;
  /** Flex-grow share of the secondary pane on desktop. Default 1. */
  readonly secondaryFlex?: number;
  /** Gap between panes, px. Default 16. */
  readonly gap?: number;
  /** Extra styles for the outer flex container. */
  readonly style?: CSSProperties;
  /** Passed through as `data-testid` on the outer container. */
  readonly testId?: string;
}

export function ResponsiveSplit({
  primary,
  secondary,
  breakpoint = BREAKPOINTS.mobileMax,
  primaryFlex = 1,
  secondaryFlex = 1,
  gap = 16,
  style,
  testId,
}: ResponsiveSplitProps) {
  const narrow = useIsNarrow(breakpoint);

  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: narrow ? "column" : "row",
        gap,
        minHeight: 0,
        minWidth: 0,
        ...style,
      }}
    >
      <div
        style={{
          flex: narrow ? "none" : primaryFlex,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {primary}
      </div>
      <div
        style={{
          flex: narrow ? "none" : secondaryFlex,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {secondary}
      </div>
    </div>
  );
}
