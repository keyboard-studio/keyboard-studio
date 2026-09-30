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
// The sheet reads as emerging from the button that opened it: the invoker
// stores its trigger point in the store, and the enter/exit animation runs
// from that transform-origin, the exit retracing the enter path.
//
// Opened from StudioFooter's button or NavBar's menu (journeyContentsStore).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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

/**
 * The exit beat, read from the shared motion token so the JS staging and the
 * CSS animation can never drift apart. Under reduced motion the token is
 * 0ms and the sheet unmounts immediately; where the token is unreadable
 * (e.g. jsdom) the 300ms default matches the token's normal value.
 */
function motionResponseMs(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-motion-response")
    .trim();
  const ms = Number.parseFloat(raw);
  return Number.isFinite(ms) ? ms : 300;
}

export function JourneyContents({
  dots,
  onActivate,
  statusMessage,
}: JourneyContentsProps) {
  const { t, i18n } = useLingui();
  const open = useJourneyContentsStore((s) => s.open);
  const setOpen = useJourneyContentsStore((s) => s.setOpen);
  const origin = useJourneyContentsStore((s) => s.origin);
  const listRef = useRef<HTMLOListElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Bring the author's own position into view when the sheet opens.
  useEffect(() => {
    if (!open) return;
    const current = listRef.current?.querySelector('[aria-current="step"]');
    if (typeof current?.scrollIntoView === "function") {
      current.scrollIntoView({ block: "center" });
    }
  }, [open]);

  // Exit choreography. PreviewSheet unmounts the instant its `open` prop
  // flips, so a symmetric exit has to be staged here: keep rendering the
  // sheet with the exit class for one motion-token beat, then unmount. The
  // exit retraces the enter path (see the jc-sheet-exit keyframes) from the
  // same trigger origin.
  const [renderOpen, setRenderOpen] = useState(open);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (open) {
      setRenderOpen(true);
      setExiting(false);
      return;
    }
    if (!renderOpen) return;
    const ms = motionResponseMs();
    if (ms <= 0) {
      setRenderOpen(false);
      return;
    }
    setExiting(true);
    const id = window.setTimeout(() => {
      setRenderOpen(false);
      setExiting(false);
    }, ms);
    return () => window.clearTimeout(id);
  }, [open, renderOpen]);

  // Translate the stored viewport trigger point into the sheet's own box:
  // transform-origin is relative to the animated element. Measured in a
  // layout effect so the enter animation starts from the right origin on
  // its first frame. Falls back to the sheet's bottom-right corner (where
  // the footer button sits) when there is no stored trigger.
  const [originInSheet, setOriginInSheet] = useState<{
    x: number;
    y: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!renderOpen || origin === null) {
      setOriginInSheet(null);
      return;
    }
    const sheet = wrapRef.current?.querySelector(
      '[data-testid="journey-contents-sheet"]',
    );
    const rect = sheet?.getBoundingClientRect();
    if (rect === undefined) {
      setOriginInSheet(null);
      return;
    }
    setOriginInSheet({ x: origin.x - rect.left, y: origin.y - rect.top });
  }, [renderOpen, origin]);

  const entries = toEntries(dots);

  if (!renderOpen) return null;

  const originStyle: CSSProperties =
    originInSheet === null
      ? {}
      : ({
          "--jc-origin-x": `${originInSheet.x}px`,
          "--jc-origin-y": `${originInSheet.y}px`,
        } as CSSProperties);

  return (
    // A layout-less hook for the origin variables and the exit class: the
    // sheet and its backdrop are viewport-fixed, so the wrapper must take no
    // space in the footer's flex row (display: contents removes it from
    // layout while the variables still inherit through it).
    <div
      ref={wrapRef}
      data-testid="journey-contents-origin"
      className={exiting ? "jc-sheet-exit" : undefined}
      style={{ display: "contents", ...originStyle }}
    >
      <PreviewSheet
        open={renderOpen}
        onOpenChange={(next) => setOpen(next)}
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
    </div>
  );
}
