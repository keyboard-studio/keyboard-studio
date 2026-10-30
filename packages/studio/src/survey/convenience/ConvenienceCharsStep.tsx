// ConvenienceCharsStep — the pre-carve "keep these for convenience?" question.
//
// One spine EditorStep between "marks" and "carve". The carve gallery is about
// to propose removing every base-keyboard character the orthography does not
// use, which is right for the language and wrong for the author: they still
// have to type borrowed words, email addresses, and web addresses on this
// keyboard. Asking here — once, before the gallery, with the answer already
// filled in — means the gallery arrives with those letters shielded instead of
// flagged, and the author never has to fight a screen of recommendations they
// disagree with. Defaults are the product (spec v1.3.1 §3c): everything is
// pre-checked, so "keep them" is one click and the question is skipped
// entirely when there is nothing to ask.
//
// A COMPUTED gate that never renders, mirroring the marks series' S0: when the
// base produces no surplus basic-Latin letters (a Latin-script orthography
// using all of a-z, or a non-Latin base with no A-Z at all), the step completes
// immediately with an empty retained list and the author never sees a screen.
//
// Scope is basic Latin only, by decision — see the engine's convenienceChars
// module for why a Cyrillic base's own surplus letters stay a pure carve
// decision. Digits and punctuation need no question: carve never proposes them.
//
// Editors are pure (Article IV / G2): this component reports completion via
// onComplete with a SurveyPhaseResult carrying `retainedConvenienceChars`; the
// manifest reducer path (StepHost.handleComplete -> recordPhase) owns the
// session merge. The carve gallery then unions the merged list into its
// needed-set (see CarveGalleryV2's retainedSet).
//
// spec 079 US3 (T079/T080): this step never shows a `reproposed` "needs
// reconfirming" flag — see hooks/useWorkToDo.ts's spec-079 note for why
// (in short: a
// per-candidate `offeredKey` is either the SAME "offered" key or `null`,
// never a stale one, so there is nothing for `reconcile()` to classify as
// `reproposed`). The `not-asked` -> `applies` transition (FR-067) is a
// DIFFERENT, already-wired signal (`hooks/useWorkToDo.ts`'s `notAsked` map),
// not a per-answer flag.

import { useEffect, useMemo, useRef, type ComponentType } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import type { RetainedConvenienceCharsValue } from "./convenienceValue.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { useCarveNeededSet } from "../../hooks/useCarveNeededSet.ts";
import { useGlyphFontStack } from "../useGlyphFontStack.ts";
import {
  buildRetainedValue,
  continueConvenience,
  convenienceGateFor,
  gateCandidates,
  keptPrimaries,
  recordConvenienceStatus,
  skipConvenience,
  uncheckedPrimaries,
} from "./convenienceContinue.ts";
import {
  ACCENT,
  TEXT_MAIN,
  TEXT_DIM,
  FONT,
  phaseHeadingFlush,
  mutedParaFlush,
  secondaryButton,
  charChip,
  chipGlyph,
  chipCodepoint,
} from "../surveyStyles.ts";

// ---------------------------------------------------------------------------
// The computed gate. `computeConvenienceGate` itself lives in
// convenienceGate.ts (pure, React-free) so `steps/workToDo.ts`'s
// `selectWorkToDo()` can evaluate the SAME live gate for FR-067
// ("a `not-asked` step whose live gate now says `applies`") without this
// component. Re-exported here for tests and for anyone already importing it
// from this module.
// ---------------------------------------------------------------------------

export { computeConvenienceGate } from "./convenienceGate.ts";
export type { ConvenienceGateResult } from "./convenienceGate.ts";

/**
 * `U+XXXX` for a character — a technical identifier, never translated.
 */
function codepointLabel(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** Stable empty set for value records where no candidate was acted on. */
const EMPTY_ACTED: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------

const ConvenienceCharsStep: ComponentType<DecisionRendererProps<RetainedConvenienceCharsValue>> = ({
  value,
  onChange,
}: DecisionRendererProps<RetainedConvenienceCharsValue>) => {
  const { onComplete, onBack } = useGalleryStepContext();
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const { neededSet, neededCharsResolved, hasSignal } = useCarveNeededSet();
  const glyphFontStack = useGlyphFontStack();

  // Hold the gate until the CLDR/SLDR exemplars have settled — deciding early
  // would either read a step as `unknown` that should have been `applies`, or
  // render a list that silently shrinks under the author a moment later. This
  // is the ONLY state in which the step neither renders nor completes, and it
  // always settles (see the hook's `neededCharsResolved`, which is true
  // immediately when there is no language to look up). It is NOT the same as
  // the gate's own `unknown` outcome below, which is a SETTLED "no signal at
  // all" state that must render, never wait silently (FR-064).
  const ready = neededCharsResolved;
  // The gate itself is convenienceContinue.ts's convenienceGateFor (over the
  // working copy's IR, not startIr: carve operates on `ir`, so the letters on
  // offer must be the ones carve will actually see), shared with the headless
  // author.
  const gate = useMemo(
    () => (ready
      ? convenienceGateFor({ ir, instantiationMode, needed: { neededSet, hasSignal } })
      : null),
    [ready, ir, instantiationMode, neededSet, hasSignal],
  );
  // A stable empty array reference when there is nothing to offer, so the
  // memos below do not recompute every render on a fresh `[]` literal.
  const candidates = useMemo(() => gateCandidates(gate), [gate]);
  const unknown = gate?.kind === "unknown";

  // Decision-backed (spec 090 T024, D-090-12; was store-backed per spec 079
  // T034): the kept set is the recorded `retained-convenience-chars` value,
  // not per-candidate answer-store booleans. `unchecked` is DERIVED from the
  // value's `rejected` primaries, not held in component state — a toggle
  // records synchronously through onChange, so the choice survives an
  // unmount (tab switch) exactly as the saved answers did. Everything
  // pre-checked (propose-then-confirm): a candidate the value does not
  // reject — including one that became surplus only after the value was
  // recorded — is checked by construction.
  const unchecked = useMemo(() => uncheckedPrimaries(candidates, value), [candidates, value]);

  /**
   * Build the value for a kept-primary set. Candidates the author acted on
   * in this call carry `asked` provenance; the rest keep their recorded
   * provenance, or the proposal's (`extracted`) on a first record.
   */
  function buildValue(
    kept: ReadonlySet<string>,
    acted: ReadonlySet<string>,
  ): RetainedConvenienceCharsValue {
    return buildRetainedValue(candidates, kept, acted, value);
  }

  function recordValue(kept: ReadonlySet<string>, acted: ReadonlySet<string>): void {
    onChange(buildValue(kept, acted));
  }

  // Pre-T024 draft migration: a draft saved before the value existed
  // carries per-candidate booleans in the answer store. Adopt them into
  // the value the first time the settled candidate set is known; from
  // then on the value is the only source. (The answer-store slot itself
  // is T026's adjudication — this shim reads what restore put there.)
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (adoptedRef.current || value !== undefined || gate?.kind !== "applies") return;
    const answers = useSurveyAnswerStore.getState().steps["convenience"]?.answers;
    if (answers === undefined || Object.keys(answers).length === 0) return;
    adoptedRef.current = true;
    const kept = new Set(
      candidates.filter((c) => answers[c.primary]?.value !== false).map((c) => c.primary),
    );
    recordValue(kept, EMPTY_ACTED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, value, candidates]);

  // Stay TRANSPARENT in the direction of travel on a `not-applicable` pass:
  // complete forward, but on a back-pop (the author pressed Back in the carve
  // gallery) keep popping backward instead of bouncing them forward again.
  // `unknown` never auto-completes here — FR-064 requires it to render.
  const completedRef = useRef(false);
  useEffect(() => {
    if (gate === null || gate.kind !== "not-applicable" || completedRef.current) return;
    completedRef.current = true;
    // FR-065: record "not asked" with its reason and the evidence key it was
    // judged against (convenienceContinue.ts's skipConvenience).
    const skip = skipConvenience(gate, hasSignal);
    recordConvenienceStatus(skip.status);
    if (useSurveySessionStore.getState().lastNavigation === "pop" && onBack !== undefined) {
      onBack();
    } else {
      onComplete(skip.result);
    }
  }, [gate, onComplete, onBack, hasSignal]);

  const keptCount = candidates.length - unchecked.size;

  // Back / Continue render in the footer (spec 081). Back is published only
  // when there is somewhere to go back to — an inert Back that does nothing
  // when pressed is worse than none (FR-015).
  usePublishStepNav(
    gate === null || gate.kind === "not-applicable"
      ? {}
      : {
          ...(onBack !== undefined
            ? {
                back: {
                  label: t({ id: "survey.convenience.backButton", message: "Back" }),
                  onClick: onBack,
                  testId: "convenience-back",
                },
              }
            : {}),
          forward: {
            label: unknown
              ? t({ id: "survey.convenience.unknownEvidence.continueButton", message: "Continue" })
              : keptCount === 0
                ? t({ id: "survey.convenience.continueButtonNone", message: "Continue, keeping none" })
                : t({
                    id: "survey.convenience.continueButton",
                    message: plural(keptCount, {
                      one: "Continue, keeping # letter",
                      other: "Continue, keeping # letters",
                    }),
                  }),
            onClick: complete,
            testId: "convenience-continue",
          },
        },
  );

  if (gate === null || gate.kind === "not-applicable") return null;

  function toggle(primary: string): void {
    const kept = keptPrimaries(candidates, unchecked);
    if (unchecked.has(primary)) kept.add(primary);
    else kept.delete(primary);
    recordValue(kept, new Set([primary]));
  }

  function complete(): void {
    if (completedRef.current) return;
    completedRef.current = true;
    // spec 090 T024 (D-090-12): the completion result is computed FROM the
    // recorded value (convenienceContinue.ts's continueConvenience).
    const done = continueConvenience(candidates, value);
    if (done.record !== null) onChange(done.record);
    // The step was genuinely asked (candidates offered) or its gap was
    // surfaced (`unknown`, nothing to offer) — either way the author has now
    // been through it, so the status moves past "in-progress" (data-model.md
    // §1). Nothing previously set this to `finished`.
    recordConvenienceStatus(done.status);
    onComplete(done.result);
  }

  return (
    <div
      data-testid="convenience-chars"
      style={{
        display: "flex", flexDirection: "column", gap: 16, maxWidth: 640,
        fontFamily: FONT, color: TEXT_MAIN, padding: 16, overflow: "auto",
      }}
    >
      <h2 style={{ ...phaseHeadingFlush, color: ACCENT }}>
        {unknown
          ? t({
            id: "survey.convenience.unknownEvidence.heading",
            message: "We don't know yet whether you have extra letters to keep",
          })
          : t({ id: "survey.convenience.heading", message: "Keep these letters for convenience?" })}
      </h2>

      {unknown ? (
        // FR-064: the gap is surfaced, never silently skipped. There is
        // nothing to offer yet (no orthography signal to compare the base
        // against), so the step still completes on Continue — with nothing
        // kept — but it is never auto-completed the way `not-applicable` is,
        // and the author sees why.
        <p style={mutedParaFlush} data-testid="convenience-unknown-notice">
          <Trans id="survey.convenience.unknownEvidence.startingBody">
            We can't yet tell whether your starting keyboard has extra letters your alphabet
            doesn't use — that depends on your alphabet being confirmed first. Continue for
            now; if it turns out there is something to keep, you'll be asked again later.
          </Trans>
        </p>
      ) : (
        <>
          <p style={mutedParaFlush}>
            {t({
              id: "survey.convenience.startingIntro",
              message: plural(candidates.length, {
                one: "Your alphabet doesn't use # letter from the starting keyboard. Keeping it lets you type borrowed words, email addresses, and web addresses without switching keyboards.",
                other: "Your alphabet doesn't use these # letters from the starting keyboard. Keeping them lets you type borrowed words, email addresses, and web addresses without switching keyboards.",
              }),
            })}
          </p>
          <p style={{ ...mutedParaFlush, color: TEXT_DIM }}>
            <Trans id="survey.convenience.uncheckHint">
              Anything you uncheck will be offered for removal on the next screen.
              Capital and small letters are kept together.
            </Trans>
          </p>

          <ul
            aria-label={t({ id: "survey.convenience.listAriaLabel", message: "Letters to keep for convenience" })}
            style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {candidates.map((candidate) => {
              const checked = !unchecked.has(candidate.primary);
              const label = candidate.chars.join(" ");
              return (
                <li key={candidate.primary}>
                  <label style={{ ...charChip(checked), position: "relative" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(candidate.primary)}
                      aria-label={t({ id: "survey.convenience.keepCheckboxAriaLabel", message: `Keep ${label}` })}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={chipGlyph(checked, glyphFontStack)}>{label}</span>
                    <span style={chipCodepoint()}>{codepointLabel(candidate.chars[0]!)}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="convenience-keep-all"
              onClick={() => {
                const all = new Set(candidates.map((c) => c.primary));
                recordValue(all, all);
              }}
              style={secondaryButton}
            >
              <Trans id="survey.convenience.keepAllButton">Keep all</Trans>
            </button>
            <button
              type="button"
              data-testid="convenience-keep-none"
              onClick={() => {
                recordValue(new Set(), new Set(candidates.map((c) => c.primary)));
              }}
              style={secondaryButton}
            >
              <Trans id="survey.convenience.keepNoneButton">Keep none</Trans>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export { ConvenienceCharsStep };
