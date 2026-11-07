// SuggestedFixes: the accept / skip list for suggested fixes (spec 111 US5,
// FR-028). Two parts:
//
//   - `SuggestedFixes`: presentational. Renders each fix with its preview (when
//     it carries one) and an Accept and a Skip button. Nothing is applied
//     unless the author presses Accept, and even then the host's `onAccept`
//     decides what accepting does; doing nothing changes nothing.
//   - `SuggestedFixesPanel`: the container. Merges the consistency suggestions
//     raised by applied changes (suggestedFixesStore) with any fixes the host
//     derives (e.g. "add character" fixes from criterion 18.6), drops the ones
//     already accepted or declined in the 053 decision record, and records the
//     author's accept / skip there so they are not offered again. When the
//     host passes `activeStepId` (#2528), fixes owned by a LATER survey step
//     are withheld until the author reaches that step.

import { Trans, useLingui } from "@lingui/react/macro";

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import { isSuggestedFixVisibleAtStep } from "../lib/suggestedFixStepOrder.ts";
import {
  decidedSuggestions,
  recordSuggestionDisposition,
} from "../lib/suggestionDispositions.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useSuggestedFixesStore } from "../stores/suggestedFixesStore.ts";
import { useBasicKeyboardOpen } from "../hooks/useBasicKeyboardOpen.ts";
import { withoutPhysicalFixes } from "../lib/basicKeyboard.ts";
import { Button } from "../ui/Button.tsx";
import { BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";

const sectionStyle: React.CSSProperties = {
  margin: "0 0 16px",
  padding: "8px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontFamily: FONT,
  fontSize: 13,
};

const listStyle: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

const itemStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
};

const previewStyle: React.CSSProperties = {
  flexBasis: "100%",
  margin: 0,
  fontSize: 12,
  color: TEXT_DIM,
};

const compareStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 8,
};

const compareHeadingStyle: React.CSSProperties = { margin: "4px 0", fontSize: 12 };

const preStyle: React.CSSProperties = { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

/** A DOM id fragment unique to one fix's file preview. */
function previewId(fixId: string, file: string): string {
  return `fix-preview-${fixId}-${file}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

export interface SuggestedFixesProps {
  fixes: readonly SuggestedFix[];
  onAccept: (fix: SuggestedFix) => void;
  onSkip: (fix: SuggestedFix) => void;
  /** Heading level context; the list names itself through its heading. */
  testId?: string;
  /** "apply" words the affirmative button Apply (an upgrade) instead of Accept. */
  mode?: "accept" | "apply";
}

export function SuggestedFixes({ fixes, onAccept, onSkip, testId, mode = "accept" }: SuggestedFixesProps) {
  const { t } = useLingui();
  if (fixes.length === 0) return null;
  return (
    <section
      style={sectionStyle}
      data-testid={testId ?? "suggested-fixes"}
      aria-labelledby="suggested-fixes-heading"
    >
      <h3 id="suggested-fixes-heading" style={{ margin: "0 0 4px", fontSize: 14 }}>
        <Trans id="suggestedFixes.heading">Suggested follow-ups</Trans>
      </h3>
      <p style={{ margin: "0 0 4px", color: TEXT_DIM }}>
        <Trans id="suggestedFixes.intro">
          Nothing changes unless you accept. Skipping a suggestion keeps it from coming back.
        </Trans>
      </p>
      <ul style={listStyle}>
        {fixes.map((fix) => (
          <li key={fix.id} style={itemStyle} data-testid="suggested-fix">
            <span style={{ flex: "1 1 200px" }}>{fix.title}</span>
            <Button
              variant="primary"
              size="compact"
              onClick={() => onAccept(fix)}
              aria-label={
                mode === "apply"
                  ? t({ id: "suggestedFixes.apply.label", message: `Apply: ${fix.title}` })
                  : t({ id: "suggestedFixes.accept.label", message: `Accept: ${fix.title}` })
              }
            >
              {mode === "apply" ? (
                <Trans id="suggestedFixes.apply">Apply</Trans>
              ) : (
                <Trans id="suggestedFixes.accept">Accept</Trans>
              )}
            </Button>
            <Button
              size="compact"
              onClick={() => onSkip(fix)}
              aria-label={t({
                id: "suggestedFixes.skip.label",
                message: `Skip: ${fix.title}`,
              })}
            >
              <Trans id="suggestedFixes.skip">Skip</Trans>
            </Button>
            {fix.preview.length > 0 && (
              <div style={previewStyle}>
                {fix.preview.map((p) => (
                  <details key={p.file}>
                    <summary>{p.file}</summary>
                    <div style={compareStyle}>
                      <section aria-labelledby={`${previewId(fix.id, p.file)}-before`}>
                        <h4 id={`${previewId(fix.id, p.file)}-before`} style={compareHeadingStyle}>
                          <Trans id="suggestedFixes.preview.current">Current</Trans>
                        </h4>
                        <pre style={preStyle}>{p.before}</pre>
                      </section>
                      <section aria-labelledby={`${previewId(fix.id, p.file)}-after`}>
                        <h4 id={`${previewId(fix.id, p.file)}-after`} style={compareHeadingStyle}>
                          <Trans id="suggestedFixes.preview.proposed">Proposed</Trans>
                        </h4>
                        <pre style={preStyle}>{p.after}</pre>
                      </section>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface SuggestedFixesPanelProps {
  /** Fixes the host derives itself (e.g. from criterion 18.6 findings). */
  extra?: readonly SuggestedFix[];
  /** What accepting does: the host routes to where the change is made. */
  onAccept: (fix: SuggestedFix) => void;
  testId?: string;
  /**
   * Active survey step id (#2528): when set, only fixes whose owning step
   * is at or before this step render — a fix about a LATER step stays
   * hidden until the author reaches it. When unset (the Criteria roll-up),
   * everything renders.
   */
  activeStepId?: string;
  /**
   * Manifest step-id order for the #2528 filter, supplied by the caller
   * (StudioShell). Required when `activeStepId` is set; without it the
   * filter cannot order steps, so everything renders (fail open).
   */
  stepOrder?: readonly string[];
}

export function SuggestedFixesPanel({ extra = [], onAccept, testId, activeStepId, stepOrder }: SuggestedFixesPanelProps) {
  const offered = useSuggestedFixesStore((s) => s.offered);
  const settle = useSuggestedFixesStore((s) => s.settle);
  const record = useDecisionLogStore((s) => s.record);
  const decided = decidedSuggestions(record);
  // A basic keyboard's physical layout never changes: no suggestion may route to the physical keys.
  const basicOpen = useBasicKeyboardOpen();

  const seen = new Set<string>();
  const fixes = withoutPhysicalFixes([...offered, ...extra], basicOpen).filter((f) => {
    if (decided.has(f.id) || seen.has(f.id)) return false;
    seen.add(f.id);
    // #2528: never show a follow-up for a step the author has not reached.
    if (
      activeStepId !== undefined &&
      stepOrder !== undefined &&
      !isSuggestedFixVisibleAtStep(f, activeStepId, stepOrder)
    )
      return false;
    return true;
  });

  return (
    <SuggestedFixes
      fixes={fixes}
      {...(testId !== undefined ? { testId } : {})}
      onAccept={(fix) => {
        recordSuggestionDisposition(fix, "accepted");
        settle(fix.id);
        onAccept(fix);
      }}
      onSkip={(fix) => {
        recordSuggestionDisposition(fix, "declined");
        settle(fix.id);
      }}
    />
  );
}
