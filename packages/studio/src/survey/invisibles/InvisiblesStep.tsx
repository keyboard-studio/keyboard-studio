// InvisiblesStep — the "Invisible characters" page (spec 075 US3, as
// amended by issue #2283).
//
// One always-rendering spine EditorStep between "punctuation" and
// "convenience". Format characters (Unicode General Category Cf) — the
// zero-width joiner and non-joiner, the zero-width space, the soft hyphen,
// the word joiner and the bidi controls — have no glyph, so no character map
// can show them and no exemplar tier attests them; until this step existed
// the only way to reach one was a code-point entry that filed it into an
// unrendered `controls` bucket. Each is offered BY NAME, with its
// `U+XXXX` notation and a one-line "you need this if…" statement, and the
// author's yes/no per character is a recorded decision (FR-013, FR-015,
// FR-018).
//
// #2283: this pane is the author's BUILD LIST, not a second picker. The
// right-pane gallery (InvisiblesGalleryPane) is the single place to browse
// and pick; this pane shows ONLY the accepted invisibles — name, U+XXXX and
// a remove control (remove = `declineInvisible`) — the same shape as the
// alphabet and punctuation steps. When nothing is accepted the pane shows
// the "most keyboards need none" guidance plus a pointer to the gallery.
// The bidi group's expanded-for-RTL / collapsed-never-hidden-for-LTR rule
// lives in the gallery (it mirrors this step's old group); nothing in this
// pane depends on the writing direction.
//
// Always renders (FR-020): there is no computed gate and no `null` return. A
// language with nothing accepted still sees the pane with the guidance note
// — the FR-020 "list" is the selected list, empty-with-guidance when nothing
// is selected.
//
// Decisions live in the invisibles-inventory decision record's sticky
// decisions (keyed `U+XXXX`), NOT in `chars`: an accepted character reaches the phase-C
// confirmed inventory through `phaseCConfirmedInventory()` and never lands in
// the `controls` bucket again (FR-014). On first render every `\p{Cf}`
// character an earlier code-point entry left in `controls` is carried over
// into an accepted decision and removed from `chars`, so it is offered once,
// pre-selected, and appears in one answer rather than two (FR-017).
//
// Result: `{ phase: "C", answers, confirmedInventory }` where `answers`
// carries one boolean per offered candidate (`questionId: "invisibles.u200c"`,
// …) so a declined offer is `false`, distinguishable from never asked, and
// `confirmedInventory` is the SAME phase-C union the punctuation step emits
// (see ../phaseCInventory.ts for why both emitters must agree — FR-024).
// The manifest entry declares `inputs: []`, `writes: []`: confirming an
// inventory is a survey result, not an IR write (spec 066 FR-006).
//
// Editors are pure (Article IV / G2): completion is reported via onComplete;
// the manifest reducer path (StepHost.handleComplete -> recordPhase) owns the
// session merge.
//
// spec 079 US3 (T079/T080): this step never shows a `reproposed`
// "needs reconfirming" flag — see hooks/useWorkToDo.ts's spec-079 note
// for why (in short:
// `carriedOver` guarantees a decided candidate is never dropped, so there is
// only "proposed"/"current", never a stale confirmation to surface).

import { useEffect, useMemo, useRef, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useInventoryDraft } from "../useInventoryDraft.ts";
import type { InventoryDecisionValue } from "../phaseBDraftOps.ts";
export {
  directionAnswersFromDecisions,
  writingDirectionFrom,
} from "./invisibleDirection.ts";
export type { WritingDirection } from "./invisibleDirection.ts";
import { needStatementFor, type InvisibleCharacterCandidate } from "./invisibleCandidates.ts";
import {
  invisiblesCandidates,
  invisiblesCarriedOver,
  invisiblesResult,
  isInvisibleAccepted,
} from "./invisiblesStepRules.ts";
export { invisibleQuestionId } from "./invisiblesStepRules.ts";
import {
  ACCENT,
  BORDER,
  BG_PAGE,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  ERROR_RED,
  phaseHeadingFlush,
  mutedParaFlush,
  sectionHeading,
} from "../surveyStyles.ts";

// ---------------------------------------------------------------------------
// AcceptedRow — one accepted invisible character with a remove control
// ---------------------------------------------------------------------------

interface AcceptedRowProps {
  candidate: InvisibleCharacterCandidate;
  onRemove: (candidate: InvisibleCharacterCandidate) => void;
}

function AcceptedRow({ candidate, onRemove }: AcceptedRowProps) {
  const { t, i18n } = useLingui();
  const hex = candidate.codePoint.toString(16).toLowerCase().padStart(4, "0");
  const labelId = `invisible-accepted-label-${hex}`;
  const needId = `invisible-accepted-need-${hex}`;
  return (
    <li style={{ listStyle: "none", margin: 0 }} data-testid={`invisible-accepted-${hex}`}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "center",
          padding: "10px 12px",
          background: BG_PAGE,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          color: TEXT_MAIN,
          fontFamily: FONT,
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span id={labelId} style={{ fontSize: 14, fontWeight: 600 }}>
            {candidate.label}{" "}
            <span style={{ fontFamily: "monospace", fontWeight: 400, color: TEXT_DIM }}>
              {candidate.notation}
            </span>
          </span>
          <span id={needId} style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
            {i18n._(needStatementFor(candidate.codePoint))}
          </span>
        </span>
        <button
          type="button"
          data-testid={`invisible-accepted-remove-${hex}`}
          onClick={() => onRemove(candidate)}
          aria-label={t({
            id: "survey.invisibles.removeAriaLabel",
            message: `Remove ${{ name: candidate.label }} (${{ cp: candidate.notation }})`,
          })}
          aria-describedby={needId}
          className="ks-focus-ring"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            padding: 0,
            background: "transparent",
            border: `1px solid ${ERROR_RED}`,
            borderRadius: 6,
            color: ERROR_RED,
            fontSize: 16,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// InvisiblesStep
// ---------------------------------------------------------------------------

const INVISIBLES_STEP_ID = "invisibles";

const InvisiblesStep: ComponentType<DecisionRendererProps<InventoryDecisionValue>> = () => {
  const { onComplete, onBack } = useGalleryStepContext();
  const { t } = useLingui();

  // The shared Phase B/C draft, as decision values (spec 090 T022): the
  // remove controls are the bound ops, recorded through the gallery host
  // under this step's attribution.
  const draft = useInventoryDraft(INVISIBLES_STEP_ID);
  const controls = draft.controls;
  const invisibleDecisions = draft.invisibleDecisions;
  const declineInvisible = draft.ops.declineInvisible;
  const adoptControlsAsInvisibles = draft.ops.adoptControlsAsInvisibles;

  // Carry-over (FR-017): capture what the code-point field left in `controls`
  // BEFORE adopting it, so the candidate list keeps offering those characters
  // after they have moved out of `chars`. Characters already decided about on
  // an earlier visit stay offered too — nothing an author entered is dropped.
  const carriedOver = useMemo(
    () => invisiblesCarriedOver(controls, invisibleDecisions),
    [controls, invisibleDecisions],
  );
  useEffect(() => {
    adoptControlsAsInvisibles();
  }, [adoptControlsAsInvisibles]);

  // The offer list is direction-invariant (invisibleCandidatesFor deliberately
  // ignores its direction argument — the bidi group is always offered, and
  // only the gallery's collapse state depends on the direction), so the step
  // renders from a fixed "unknown" and never computes the direction itself.
  const candidates = useMemo(
    () => invisiblesCandidates("unknown", carriedOver),
    [carriedOver],
  );
  const accepted = candidates.filter((c) => isInvisibleAccepted(invisibleDecisions, c));
  const acceptedCount = accepted.length;

  // Double-complete guard (mirrors the punctuation step).
  const completedRef = useRef(false);

  function remove(c: InvisibleCharacterCandidate): void {
    declineInvisible(c.notation);
  }

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(invisiblesResult(candidates, invisibleDecisions));
  }

  // Back / Continue render in the footer (spec 081).
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "survey.invisibles.backButton", message: "Back" }),
            onClick: onBack,
            testId: "invisibles-back",
          },
        }
      : {}),
    forward: {
      label:
        acceptedCount === 0
          ? t({
              id: "survey.invisibles.continueButtonNone",
              message: "Continue without invisible characters",
            })
          : t({
              id: "survey.invisibles.continueButton",
              message: plural(acceptedCount, {
                one: "Continue (# invisible character)",
                other: "Continue (# invisible characters)",
              }),
            }),
      onClick: complete,
      testId: "invisibles-continue",
    },
  });

  return (
    <div
      data-testid="invisibles-step"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 640,
        fontFamily: FONT,
        color: TEXT_MAIN,
      }}
    >
      <h2 style={phaseHeadingFlush} data-testid="invisibles-heading">
        <Trans id="survey.invisibles.heading">Invisible characters</Trans>
      </h2>

      <div
        style={{
          padding: "12px 16px",
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 6,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: 0 }}>
          <Trans id="survey.invisibles.intro">
            Some keyboards need characters that print nothing but change how the
            text around them joins, breaks or reads. Browse the gallery on the
            right — each invisible character is named, with when you would need
            it. Accept the ones your keyboard should be able to type; your
            picks appear in the list below.
          </Trans>
        </p>
      </div>

      {acceptedCount === 0 ? (
        <>
          <p style={mutedParaFlush} data-testid="invisibles-none-needed">
            <Trans id="survey.invisibles.noneNeeded">
              Most keyboards need none of these. If that is yours, just continue.
            </Trans>
          </p>
          <p style={mutedParaFlush} data-testid="invisibles-gallery-pointer">
            <Trans id="survey.invisibles.galleryPointer">
              Browse the gallery on the right to add the ones your keyboard needs.
            </Trans>
          </p>
        </>
      ) : (
        <section
          aria-label={t({
            id: "survey.invisibles.listSectionAriaLabel",
            message: "Your invisible characters",
          })}
        >
          <h3 style={sectionHeading}>
            <Trans id="survey.invisibles.listHeading">
              Your invisible characters ({acceptedCount})
            </Trans>
          </h3>
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {accepted.map((c) => (
              <AcceptedRow key={c.notation} candidate={c} onRemove={remove} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export { InvisiblesStep };
