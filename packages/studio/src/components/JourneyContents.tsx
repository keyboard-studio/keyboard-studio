// JourneyContents — the narrow-viewport table of contents for the journey.
//
// On a phone the footer's bare dot row does not work: there is no hover to
// reveal what a dot is, and 8px marks are hard to hit. So under the narrow
// breakpoint the footer shows a "Contents" button instead, and this sheet
// lists the SAME marks `buildProgressDots` assembles, each beside its label
// (ProgressDot layout="row"). The data's own collapse rule carries over: a
// stage the author is not in is one row; the current stage expands into its
// per-question rows under a heading. Activation goes through the caller's
// handler (jumpToLocation, the one jump implementation), and the sheet closes
// on an arrival so the author lands on the question they picked.
//
// Opened from StudioFooter's button or NavBar's menu (journeyContentsStore).

import { useEffect, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { PreviewSheet } from "./PreviewSheet.tsx";
import { ProgressDot } from "./ProgressDot.tsx";
import {
  stageLabel,
  type ProgressDot as ProgressDotData,
} from "../decisions/progressDots.ts";
import { useJourneyContentsStore } from "../stores/journeyContentsStore.ts";
import { CSS_TEXT_MUTED } from "../ui/theme.ts";

export interface JourneyContentsProps {
  readonly dots: readonly ProgressDotData[];
  /** Returns true when the jump arrived (the sheet then closes). */
  readonly onActivate: (dot: ProgressDotData) => boolean;
  /** Refusal / notice text, shown at the top of the sheet while set. */
  readonly statusMessage: string | null;
}

type Entry =
  | { kind: "heading"; stepId: string }
  | { kind: "dot"; dot: ProgressDotData };

/** Insert a stage heading before each run of question-tier marks. */
function toEntries(dots: readonly ProgressDotData[]): Entry[] {
  const out: Entry[] = [];
  let headingFor: string | null = null;
  for (const dot of dots) {
    if (dot.tier === "question") {
      const step = dot.location.step ?? "";
      if (step !== headingFor) {
        out.push({ kind: "heading", stepId: step });
        headingFor = step;
      }
    } else {
      headingFor = null;
    }
    out.push({ kind: "dot", dot });
  }
  return out;
}

export function JourneyContents({
  dots,
  onActivate,
  statusMessage,
}: JourneyContentsProps) {
  const { t, i18n } = useLingui();
  const open = useJourneyContentsStore((s) => s.open);
  const setOpen = useJourneyContentsStore((s) => s.setOpen);
  const listRef = useRef<HTMLOListElement | null>(null);

  // Bring the author's own position into view when the sheet opens.
  useEffect(() => {
    if (!open) return;
    const current = listRef.current?.querySelector('[aria-current="step"]');
    if (typeof current?.scrollIntoView === "function") {
      current.scrollIntoView({ block: "center" });
    }
  }, [open]);

  const entries = toEntries(dots);

  return (
    <PreviewSheet
      open={open}
      onOpenChange={setOpen}
      label={t({ id: "journeyContents.label", message: "Contents" })}
      testId="journey-contents-sheet"
    >
      {statusMessage !== null && (
        <p style={{ margin: "0 0 8px", fontSize: 13, color: CSS_TEXT_MUTED }}>
          {statusMessage}
        </p>
      )}
      <ol
        ref={listRef}
        style={{ listStyle: "none", margin: 0, padding: 0 }}
        data-testid="journey-contents-list"
      >
        {entries.map((entry) =>
          entry.kind === "heading" ? (
            <li
              key={`heading:${entry.stepId}`}
              style={{
                padding: "10px 12px 2px",
                fontSize: 13,
                fontWeight: 700,
                color: CSS_TEXT_MUTED,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {stageLabel(entry.stepId, i18n)}
            </li>
          ) : (
            <li key={`${entry.dot.location.step ?? "-"}:${entry.dot.id}`}>
              <ProgressDot
                dot={entry.dot}
                layout="row"
                onActivate={(d) => {
                  if (onActivate(d)) setOpen(false);
                }}
              />
            </li>
          ),
        )}
      </ol>
    </PreviewSheet>
  );
}
