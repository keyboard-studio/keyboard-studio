// identitySelectors — the identity step's derived views over the decision
// store (spec 089 FR-005).
//
// Until this spec, the identity step's outputs lived as stored session
// state: IdentityLiteAdapter wrote `identityResult`, the stored
// `surveyContext`, and the working copy's attribution into stores at
// completion, and project_name's onCommit wrote `scaffoldSpec`. Spec 088
// made the decision store the only stored state for answers, so those
// fields are now DERIVED: every function here is a pure composition over a
// `DecisionSet`, reproducing — field for field — what the deleted writers
// stored (`extractIdentityLite` in survey/IdentityLite.tsx and
// `contextFromIdentity` in editors/adapters/panelAdapters.tsx are the
// references; both stay in place for the answer-shaped callers that remain
// outside this spec's scope).
//
// REACT BINDINGS: components subscribe to the decision store's `decisions`
// slice (`useDecisionStore((s) => s.decisions)` — a stable reference that
// changes only when a record lands) and call these selectors in render or
// in a `useMemo`; handlers read `getDecisionSnapshot()` and call them
// directly. The bindings cannot live in this file as hooks over
// `useDecisionStore`: the decisions-layer depcruise rule forbids
// decisions/ -> stores/, and this file is decisions/.

import type { Attribution, SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { IdentityLiteResult } from "../survey/identityLiteResult.ts";
import { buildTargetBcp47, normalizeRegionSubtag } from "../survey/targetBcp47.ts";
import { deriveScriptPrefill } from "../lib/scriptAxes.ts";
import type { SurveyContext } from "../survey/types.ts";

/**
 * Scripts gated out of v1 — mirrors `UNSUPPORTED_SCRIPTS` in
 * survey/IdentityLite.tsx (the two must agree; that set gates the live
 * flow's terminal notice, this one gates the derived `supported` flag).
 */
const UNSUPPORTED_SCRIPTS = new Set(["Ethi", "Hani", "Hang"]);

/** A decision's value as a string — recorded answers keep their raw shape. */
function decisionString(decisions: DecisionSet, id: DecisionId): string {
  const value = decisions[id]?.value;
  return typeof value === "string" ? value : "";
}

/**
 * The attribution the identity step establishes, composed from decisions —
 * `extractAttribution` (survey/IdentityLite.tsx) over the decision set
 * instead of the phase result. Returns null when no author name was
 * recorded: a gated script terminates before the attribution questions,
 * and callers must treat null as "no notice to emit" rather than
 * substituting anything. The copyright holder falls back to the author
 * name (spec 064 D1).
 */
export function deriveAttribution(decisions: DecisionSet): Attribution | null {
  const authorName = decisionString(decisions, "author-name").trim();
  if (authorName === "") return null;
  const email = decisionString(decisions, "author-email").trim();
  const holder = decisionString(decisions, "copyright-holder").trim();
  return {
    authorName,
    ...(email !== "" ? { authorEmail: email } : {}),
    copyrightHolder: holder !== "" ? holder : authorName,
  };
}

/**
 * The identity-lite result, derived from decisions — `extractIdentityLite`
 * over the decision set. Null until the target script is recorded: the
 * script answer is the identity flow's point of no return (a gated script
 * still records it, then terminates), so its presence is exactly "the
 * identity step completed", which is what the deleted session field's
 * null-ness meant.
 */
export function deriveIdentityResult(decisions: DecisionSet): IdentityLiteResult | null {
  if (decisions["target-script"] === undefined) return null;
  const languageSubtag = decisionString(decisions, "language-code");
  const targetScriptRaw = decisionString(decisions, "target-script");
  // Normalize so the recorded region and the folded bcp47 subtag agree —
  // the same rule extractIdentityLite applies to the raw answer.
  const region = normalizeRegionSubtag(decisionString(decisions, "language-region"));
  return {
    autonym: decisionString(decisions, "language-autonym"),
    english: decisionString(decisions, "language-name"),
    languageSubtag,
    region,
    targetScriptRaw,
    bcp47: buildTargetBcp47(languageSubtag, targetScriptRaw, region),
    supported: !UNSUPPORTED_SCRIPTS.has(targetScriptRaw),
    prefill: deriveScriptPrefill(targetScriptRaw),
    attribution: deriveAttribution(decisions),
  };
}

/**
 * The copy track's scaffold spec, derived from decisions. Null unless the
 * authoring track is "copy" AND both project-name answers are recorded —
 * the exact conditions under which the deleted project_name onCommit
 * wrote the session field (its extract guard required both values
 * non-empty; the adapt track nulled it).
 */
export function deriveScaffoldSpec(
  decisions: DecisionSet,
): { keyboardId: string; displayName: string } | null {
  if (decisions["authoring-track"]?.value !== "copy") return null;
  const keyboardId = decisionString(decisions, "project-keyboard-id");
  const displayName = decisionString(decisions, "project-display-name");
  if (keyboardId === "" || displayName === "") return null;
  return { keyboardId, displayName };
}

/**
 * The survey context downstream steps interpolate from, derived from
 * decisions — `contextFromIdentity`'s exact output shape over
 * {@link deriveIdentityResult}. Empty object before identity completes
 * (the deleted session field's initial value).
 */
export function deriveSurveyContext(decisions: DecisionSet): SurveyContext {
  const identity = deriveIdentityResult(decisions);
  if (identity === null) return {};
  return {
    language_name: identity.english || identity.autonym,
    routing_group: identity.prefill.routingGroup,
    script_family: identity.prefill.script,
    ...(identity.bcp47 !== "" ? { bcp47_tag: identity.bcp47 } : {}),
    // spec 064 FR-016: publishing the contact here activates the Phase F
    // pre-fill seam (CTX_AUTHOR_CONTACT in flowStepOptions.tsx).
    ...(identity.attribution?.authorEmail !== undefined &&
    identity.attribution.authorEmail !== ""
      ? { author_contact: identity.attribution.authorEmail }
      : {}),
  };
}

/** Identity question id → the decision that records its answer. */
const IDENTITY_QUESTIONS: ReadonlyArray<{
  questionId: string;
  decisionId: DecisionId;
  answerType: "text" | "select";
}> = [
  { questionId: "il_language_english", decisionId: "language-name", answerType: "text" },
  { questionId: "il_language_region", decisionId: "language-region", answerType: "text" },
  { questionId: "il_language_autonym", decisionId: "language-autonym", answerType: "text" },
  { questionId: "il_language_code", decisionId: "language-code", answerType: "text" },
  { questionId: "il_target_script", decisionId: "target-script", answerType: "select" },
  { questionId: "il_author_name", decisionId: "author-name", answerType: "text" },
  { questionId: "il_author_email", decisionId: "author-email", answerType: "text" },
  { questionId: "il_copyright_holder", decisionId: "copyright-holder", answerType: "text" },
];

/**
 * The identity step's resume payload, rebuilt from decisions — the role the
 * deleted `identityPhaseResult` session field played for IdentityLite's
 * `resume` prop (back-navigation re-enters the flow at its last question
 * instead of restarting). Only the answers are consumed downstream
 * (`toResumeAnswers`), so the phase letter is the identity flow's ("A",
 * per steps/flowSources.ts). Null when no identity answer is recorded.
 */
export function deriveIdentityResume(decisions: DecisionSet): SurveyPhaseResult | null {
  const answers: SurveyPhaseResult["answers"][number][] = [];
  for (const { questionId, decisionId, answerType } of IDENTITY_QUESTIONS) {
    const record = decisions[decisionId];
    if (record === undefined) continue;
    answers.push({ questionId, answerType, value: record.value as string });
  }
  if (answers.length === 0) return null;
  return { phase: "A", answers };
}
