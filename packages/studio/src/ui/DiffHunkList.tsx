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
const containerStyle: React.CSSProperties = {
  margin: "6px 0 0",
  padding: 8,
  background: "rgba(255,255,255,0.03)",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontFamily: FONT_MONO,
  fontSize: 12,
  overflowX: "auto",
  whiteSpace: "pre",
};

/** Line colour by unified-diff prefix. Added and removed must be distinguishable. */
function lineColor(line: string): string {
  if (line.startsWith("+")) return "#7ee787";
  if (line.startsWith("-")) return "#ffa198";
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
