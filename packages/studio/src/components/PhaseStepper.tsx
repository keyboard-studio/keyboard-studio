// PhaseStepper — the A-F phase pill row (epic #533 design-system foundation).
//
// Prop-driven (`activeStepId` only) so it needs no store of its own: tests
// render it against a plain string, and the one store-connected call site
// lives in StudioShell (which already reads `surveySessionStore.activeStepId`
// for SurveyView/StepHost — see that file's NavBar/StudioShell wiring). This
// mirrors the layering StudioFooter/ProgressDot use elsewhere in this
// directory: the store read happens once, near the top of the tree, and the
// presentational piece takes plain props.
//
// Display mapping is `steps/phases.ts`'s fixed PHASES table — six phases,
// A-F, never re-derived here (see that file's header for why).
//
// Mobile adaptation (Phase 1): on narrow viewports (< 479px) the six
// pills don't fit, so the stepper renders a compact single-line button —
// "Phase C · Characters · step 5 of N" — that opens the shared Dialog with
// the full pill list in a vertical layout. `aria-current="step"` is preserved
// on the active pill in both branches; the pills stay display-only (gated by
// real completion state the survey doesn't expose yet — see below).
//
// Accessibility (docs/accessibility.md, specs/056-ada-accessibility/):
//   - <nav> + <ol>/<li> — a real list, not a row of clickable buttons. Phases
//     are gated by real completion state the survey doesn't expose yet; a
//     fake/disabled button per pill would be a worse affordance than static
//     text (spec instruction for this component, epic #533).
//   - `aria-current="step"` on the active pill only.
//   - Colour is never the only signal: every pill carries a visually-hidden
//     "completed / current step / not yet reached" span alongside its visible
//     label. (No existing sr-only helper/class was found in `src/` — grepped
//     for `srOnly` / `visually-hidden` / `sr-only` before adding this; the
//     style object below is the standard WCAG clip technique, defined once
//     here rather than reaching for a shared class that doesn't exist yet.)
import { useState } from "react";
import type { CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { PHASES, type PhaseDef } from "../steps/phases.ts";
import { manifest } from "../steps/manifest.ts";
import { useIsNarrow } from "../hooks/useViewport.ts";
import { Dialog } from "../ui/Dialog.tsx";

export interface PhaseStepperProps {
  /**
   * The survey's current manifest step id (or `null` before any step has
   * been resolved). Not typed as `steps/phases.ts`'s `StepId` — the caller
   * passes `surveySessionStore`'s `ActiveStepId`, which also carries the two
   * terminal states ("done" / "unsupported") and the unphased `"package"`
   * stub. Those all resolve to "no active phase" below, exactly like an
   * unrecognized string would.
   */
  activeStepId: string | null;
  /**
   * Narrow viewports only: render the compact summary as a borderless,
   * left-aligned button that sits inside the top NavBar row (see NavBar's
   * `narrowCenter`) instead of as a row of its own.
   */
  inline?: boolean;
}

/** Visually-hidden but screen-reader-visible — standard clip-based technique. */
const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 6,
  padding: "12px 22px",
  background: "var(--app-surface-2)",
  borderBottom: "1px solid var(--app-border)",
  boxSizing: "border-box",
};

const LIST_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const LIST_COLUMN_STYLE: CSSProperties = {
  ...LIST_STYLE,
  flexDirection: "column",
  alignItems: "stretch",
  gap: 4,
};

const LIST_ITEM_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
};

const CONNECTOR_STYLE: CSSProperties = {
  width: 18,
  height: 1,
  marginLeft: 6,
  background: "var(--app-border-strong)",
  flexShrink: 0,
};

const PILL_BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px 3px 3px",
  borderRadius: 999,
  fontSize: 12.5,
  fontWeight: 600,
  boxSizing: "border-box",
};

const PILL_ACTIVE_STYLE: CSSProperties = {
  background: "var(--app-accent-subtle)",
  color: "var(--app-accent-text)",
  border: "1px solid var(--app-accent)",
};

// --app-text-muted, NOT --app-text-subtle. The pill row sits on
// --app-surface-2, where subtle measures 3.88:1 against the 4.5:1 WCAG AA
// minimum for normal-size text (these labels are 12.5px, well under the
// large-text exemption). Muted measures 6.22:1 on navy and clears AA on the
// light theme too. Caught by the axe gate in e2e/boot-smoke.spec.ts — do not
// "tidy" this back to subtle.
const PILL_INACTIVE_STYLE: CSSProperties = {
  background: "transparent",
  color: "var(--app-text-muted)",
  border: "1px solid transparent",
};

const BADGE_BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: "50%",
  fontSize: 10,
  fontFamily: "var(--app-font-mono)",
  fontWeight: 600,
  boxSizing: "border-box",
  flexShrink: 0,
};

const BADGE_ACTIVE_STYLE: CSSProperties = {
  background: "var(--app-accent)",
  color: "var(--app-text-on-accent)",
};

// Also muted, for the same reason as the pill label above. Subtle on
// --app-surface measures 4.51:1 — it technically clears AA, but by 0.01, and
// this badge is 10px text. A margin that thin is one token tweak away from a
// regression, so it uses the same comfortable value as the label.
const BADGE_INACTIVE_STYLE: CSSProperties = {
  background: "var(--app-surface)",
  color: "var(--app-text-muted)",
  border: "1px solid var(--app-border-strong)",
};

/**
 * Compact narrow-viewport trigger — one line, full width, 44px tall so it
 * meets the shared touch target. Tapping opens the full pill list in the
 * shared Dialog.
 */
const COMPACT_BUTTON_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  minHeight: "var(--app-touch-target)",
  padding: "8px 16px",
  background: "var(--app-surface-2)",
  border: "none",
  borderBottom: "1px solid var(--app-border)",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "var(--app-font)",
  color: "var(--app-text)",
  cursor: "pointer",
  boxSizing: "border-box",
};

/** The compact trigger restyled to live inside the NavBar row. */
const INLINE_BUTTON_STYLE: CSSProperties = {
  ...COMPACT_BUTTON_STYLE,
  justifyContent: "flex-start",
  minWidth: 0,
  padding: "0 4px",
  background: "transparent",
  borderBottom: "none",
  borderRadius: 6,
};

const INLINE_TEXT_STYLE: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** Find the phase (if any) `activeStepId` belongs to, without requiring the
 * caller's loosely-typed id to satisfy `StepId` — `phaseOfStep` in
 * `steps/phases.ts` takes a real `StepId`; this is the same membership check
 * against an arbitrary string, for ids that may be "done", "unsupported",
 * "package", or unrecognized. */
function findActivePhaseIndex(activeStepId: string | null): number {
  if (activeStepId === null) return -1;
  return PHASES.findIndex((phase) =>
    (phase.stepIds as readonly string[]).includes(activeStepId),
  );
}

/**
 * Position of `activeStepId` on the manifest spine (1-based), or -1 when the
 * id isn't a manifest step. The manifest order is the survey's real step
 * order, so "step N of M" in the compact label always matches what the
 * author walks through.
 */
function findStepNumber(activeStepId: string | null): number {
  if (activeStepId === null) return -1;
  const index = manifest.findIndex((step) => step.id === activeStepId);
  return index === -1 ? -1 : index + 1;
}

interface PhasePillListProps {
  activeStepId: string | null;
  /** "row" is the desktop pill strip; "column" stacks the pills for the
   * narrow-viewport dialog, where six pills plus connectors can't fit side
   * by side. */
  direction: "row" | "column";
}

function PhasePillList({ activeStepId, direction }: PhasePillListProps) {
  const { i18n, t } = useLingui();
  const activeIndex = findActivePhaseIndex(activeStepId);

  const doneLabel = t({ id: "phaseStepper.state.done", message: "completed" });
  const currentLabel = t({
    id: "phaseStepper.state.current",
    message: "current step",
  });
  const upcomingLabel = t({
    id: "phaseStepper.state.upcoming",
    message: "not yet reached",
  });

  return (
    <ol style={direction === "row" ? LIST_STYLE : LIST_COLUMN_STYLE}>
      {PHASES.map((phase: PhaseDef, index: number) => {
        const isActive = index === activeIndex;
        // Only meaningful relative to a KNOWN current position — with no
        // match (activeIndex === -1: unphased step, terminal state, or
        // null) every pill is reported as "not yet reached" rather than
        // guessing at progress from an unmapped id.
        const isDone = activeIndex !== -1 && index < activeIndex;
        const stateLabel = isActive
          ? currentLabel
          : isDone
            ? doneLabel
            : upcomingLabel;
        const isLast = index === PHASES.length - 1;

        return (
          <li
            key={phase.letter}
            style={LIST_ITEM_STYLE}
            data-testid={`phase-pill-${phase.letter.toLowerCase()}`}
            {...(isActive ? { "aria-current": "step" as const } : {})}
          >
            <span
              style={{
                ...PILL_BASE_STYLE,
                ...(isActive ? PILL_ACTIVE_STYLE : PILL_INACTIVE_STYLE),
              }}
            >
              <span
                style={{
                  ...BADGE_BASE_STYLE,
                  ...(isActive ? BADGE_ACTIVE_STYLE : BADGE_INACTIVE_STYLE),
                }}
              >
                {phase.letter}
              </span>
              <span>{resolveMessage(i18n, phase.label)}</span>
              <span style={VISUALLY_HIDDEN_STYLE}>{stateLabel}</span>
            </span>
            {direction === "row" && !isLast && (
              <span aria-hidden="true" style={CONNECTOR_STYLE} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PhaseStepper({ activeStepId, inline = false }: PhaseStepperProps) {
  const { i18n, t } = useLingui();
  const isNarrow = useIsNarrow();
  const [dialogOpen, setDialogOpen] = useState(false);

  const ariaLabel = t({
    id: "phaseStepper.ariaLabel",
    message: "Survey phase progress",
  });

  if (!isNarrow) {
    return (
      <nav aria-label={ariaLabel} style={ROW_STYLE} data-testid="phase-stepper">
        <PhasePillList activeStepId={activeStepId} direction="row" />
      </nav>
    );
  }

  // Narrow viewport: compact single-line summary. The pill list moves into
  // the shared Dialog, opened by tapping the summary.
  const activeIndex = findActivePhaseIndex(activeStepId);
  const stepNumber = findStepNumber(activeStepId);
  const totalSteps = manifest.length;
  const hasPosition = activeIndex !== -1 && stepNumber !== -1;
  const activePhase: PhaseDef | null =
    hasPosition && activeIndex >= 0 && activeIndex < PHASES.length
      ? PHASES[activeIndex]!
      : null;

  return (
    <>
      <nav
        aria-label={ariaLabel}
        data-testid="phase-stepper-compact"
        style={inline ? { minWidth: 0, flex: "1 1 auto" } : undefined}
      >
        <button
          type="button"
          style={inline ? INLINE_BUTTON_STYLE : COMPACT_BUTTON_STYLE}
          className="ks-focus-ring"
          aria-expanded={dialogOpen}
          aria-haspopup="dialog"
          onClick={() => setDialogOpen(true)}
        >
          <span style={inline ? INLINE_TEXT_STYLE : undefined}>
            {hasPosition && activePhase !== null ? (
              <Trans id="phaseStepper.compact.summary">
                Phase {activePhase.letter} ·{" "}
                {resolveMessage(i18n, activePhase.label)} · step {stepNumber} of{" "}
                {totalSteps}
              </Trans>
            ) : (
              <Trans id="phaseStepper.compact.unknown">Survey progress</Trans>
            )}
          </span>
          <span aria-hidden="true">▾</span>
        </button>
      </nav>
      <Dialog
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        label={ariaLabel}
        testId="phase-stepper-dialog"
        showCloseButton
        closeLabel={t({
          id: "phaseStepper.compact.close",
          message: "Close phase list",
        })}
      >
        <PhasePillList activeStepId={activeStepId} direction="column" />
      </Dialog>
    </>
  );
}
