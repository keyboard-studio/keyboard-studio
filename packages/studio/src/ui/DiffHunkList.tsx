// DiffHunkList — render unified-diff hunks over a keyboard's `.kmn` source.
//
// Lives in `ui/` because two unrelated surfaces show the same thing and must show
// it the same way: the author-facing decision trail (decisions/DecisionEntryRow)
// and the developer flow map's alternative-answer panel (dashboard/FlowGraphView).
// A second copy would let the two drift on the detail that matters most here —
// which lines read as added and which as removed.
//
// Presentation only, and translation-free by design: a hunk header and its `+`/`-`
// lines are `.kmn` source text and unified-diff syntax, neither of which is
// localizable. Every localized sentence AROUND a diff (what it means, why it is
// missing) belongs to the calling surface, which is why nothing here takes a
// message id.

import type React from "react";
import type { DiffHunk } from "@keyboard-studio/contracts";
import { ACCENT, BORDER, FONT_MONO, TEXT_DIM } from "./theme.ts";

export type DiffHunkListProps = {
  hunks: readonly DiffHunk[];
};

// Wide content scrolls inside its own box — a hunk from a long .kmn line must not
// make the whole surrounding view scroll sideways.
// Border is split into borderWidth/borderStyle/borderColor (rather than the
// `border: "1px solid <token>"` shorthand): jsdom's style-shorthand parser
// cannot decompose a shorthand value containing an unresolved `var(...)`.
const containerStyle: React.CSSProperties = {
  margin: "6px 0 0",
  padding: 8,
  background: "var(--app-surface-2)",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius-sm)",
  fontFamily: FONT_MONO,
  fontSize: 12,
  overflowX: "auto",
  whiteSpace: "pre",
};

/** Line colour by unified-diff prefix. Added and removed must be distinguishable. */
function lineColor(line: string): string {
  if (line.startsWith("+")) return "var(--app-success-text)";
  if (line.startsWith("-")) return "var(--app-danger-text)";
  return TEXT_DIM;
}

export function DiffHunkList({ hunks }: DiffHunkListProps): React.ReactElement {
  return (
    <div style={containerStyle}>
      {hunks.map((hunk, hunkIndex) => (
        <div key={`${hunk.oldStart}-${hunk.newStart}-${String(hunkIndex)}`}>
          <div style={{ color: ACCENT }}>
            {`@@ -${String(hunk.oldStart)},${String(hunk.oldLines)} +${String(hunk.newStart)},${String(hunk.newLines)} @@`}
          </div>
          {hunk.lines.map((line, lineIndex) => (
            <div key={lineIndex} style={{ color: lineColor(line) }}>
              {line}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
