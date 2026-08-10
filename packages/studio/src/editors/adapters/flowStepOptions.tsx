// flowStepOptions.tsx — per-flow options records for makeFlowStepComponent.
// (spec 029 Stage 6, T005)
//
// Each record replaces the bespoke logic of the corresponding survey wrapper:
//   trackOptions        ← TrackStepAdapter / PhaseTrack
//   projectNameOptions  ← ProjectNameStepAdapter / PhaseProjectName
//   phaseFOptions       ← PhaseFAdapter / PhaseF
//
// Parity table (contract §3): every store effect, every extraction guard, and
// every context shape exactly reproduces the pre-Stage-6 wrapper behaviour.
//
// These records are consumed by makeFlowStepComponent to produce
// EditorStepProps-compatible components that register in registerEditorSteps.ts.

import { slugifyKeyboardId } from "@keyboard-studio/contracts";
import type { SurveyPhaseResult, HelpDocsAnswers } from "@keyboard-studio/contracts";
import { makeFlowStepComponent } from "./makeFlowStepComponent.tsx";
import type { FlowStepOptions, FlowStepDeps } from "./makeFlowStepComponent.tsx";

// ---------------------------------------------------------------------------
// track options — reproduces TrackStepAdapter + PhaseTrack behaviour exactly.
//
// Context: { base_name: localBase.displayName }
// Guard: localBase must be non-null (adapter rendered null if null; factory
//   will produce a null return to match).
// Seeds: track_choice from the session's currently-recorded selectedTrack, so
//   arriving at this step by deep link or by walking Back shows the recorded
//   answer instead of an empty radio group (spec 057 FR-031). `undefined`
//   before any choice has ever been recorded — SurveyRunner's "seed once, then
//   the user owns it" contract leaves the field genuinely unset in that case,
//   same as project_name below.
// Extract: track_choice answer → "copy" | "adapt" only; else undefined (stay).
// onCommit: setSelectedTrack(track); if track!=="copy" also setScaffoldSpec(null).
// Payload: { track }.
// ---------------------------------------------------------------------------

export type TrackPayload = { track: "copy" | "adapt" };

export const trackOptions: FlowStepOptions<TrackPayload> = {
  flowRef: "track",
  title: "Authoring Track",

  buildContext(deps: FlowStepDeps) {
    // Match TrackStepAdapter: base_name from localBase.displayName.
    return { base_name: deps.localBase?.displayName ?? "" };
  },

  seeds: {
    getSeedValue(questionId: string, deps: FlowStepDeps): string | string[] | undefined {
      if (questionId !== "track_choice") return undefined;
      return deps.selectedTrack ?? undefined;
    },
  },

  extract(result: SurveyPhaseResult): TrackPayload | undefined {
    const answer = result.answers.find((a) => a.questionId === "track_choice");
    if (!answer || (answer.answerType !== "select" && answer.answerType !== "text")) {
      return undefined;
    }
    const v = String(answer.value);
    return v === "copy" || v === "adapt" ? { track: v } : undefined;
  },

  onCommit(extracted: TrackPayload, deps: FlowStepDeps): void {
    // R7 ordering: setSelectedTrack BEFORE onComplete → StepHost advance.
    deps.setSelectedTrack(extracted.track);
    if (extracted.track !== "copy") {
      // Adapt-track: null scaffold spec (advanceOutcome carries setCharactersSubStage
      // which fires AFTER advance — matches pre-Stage-6 ordering).
      deps.setScaffoldSpec(null);
    }
    // Copy-track intentionally does NOT clear scaffoldSpec here;
    // scaffoldSpec is set downstream by projectNameStep.onCommit.
  },
};

// ---------------------------------------------------------------------------
// projectNameOptions — reproduces ProjectNameStepAdapter + PhaseProjectName.
//
// Context: {} (empty — matches PhaseProjectName today).
// Seeds: displayName from identityResult autonym/english; keyboardId slug.
//   Back→forward re-derivation: the ref-based pattern from PhaseProjectName
//   is preserved via a closure ref inside getSeedValue/onAnswerCommit.
// Extract: display + id (both trimmed); undefined unless both non-empty.
// onCommit: setScaffoldSpec({keyboardId,displayName}) → setIdentity({keyboardId,displayName}).
// Payload: { displayName, keyboardId }.
// ---------------------------------------------------------------------------

export type ProjectNamePayload = { displayName: string; keyboardId: string };

export const projectNameOptions: FlowStepOptions<ProjectNamePayload> = {
  flowRef: "project_name",
  title: "Name your keyboard",

  buildContext(_deps: FlowStepDeps) {
    // Match PhaseProjectName: empty context.
    return {};
  },

  seeds: {
    getSeedValue(questionId: string, deps: FlowStepDeps): string | string[] | undefined {
      const defaultDisplayName =
        deps.identityResult !== null
          ? deps.identityResult.autonym || deps.identityResult.english
          : "";
      // FR-031 (spec 057): `scaffoldSpec` is the durable record this step's OWN
      // onCommit writes (deps.setScaffoldSpec below) — the same role
      // `selectedTrack` plays for the track step. Once it is non-null the
      // author has committed a name/id at least once, so a fresh arrival at
      // this step (deep link, or Back after an earlier visit unmounted it)
      // must show THAT, not re-propose the identity-derived default it
      // started from. `null` (never committed yet) falls through to the
      // original default-proposal behavior unchanged.
      const recordedDisplayName = deps.scaffoldSpec?.displayName;

      if (questionId === "project_display_name") {
        const seed = recordedDisplayName ?? defaultDisplayName;
        // Seed from `seed` on first arrival; also re-seed on Back→forward.
        // Initialize the per-mount ref on first seed so re-derivation has a starting value.
        // deps.displayNameRef is allocated by useRef() inside the factory component —
        // always "" on a fresh mount, so re-entry never retains a prior session's value.
        if (deps.displayNameRef.current === "") {
          deps.displayNameRef.current = seed;
        }
        return seed !== "" ? seed : undefined;
      }
      if (questionId === "project_keyboard_id") {
        // A previously-recorded id wins outright — the author may have hand-
        // edited it away from the auto-slug of the display name, and FR-031
        // must show what they actually recorded, not re-derive a slug that
        // happens to look plausible.
        if (deps.scaffoldSpec?.keyboardId !== undefined && deps.scaffoldSpec.keyboardId !== "") {
          return deps.scaffoldSpec.keyboardId;
        }
        // Derive slug from the committed display name (via the per-mount ref).
        const name = deps.displayNameRef.current !== "" ? deps.displayNameRef.current : defaultDisplayName;
        const slug = slugifyKeyboardId(name);
        return slug !== "" ? slug : undefined;
      }
      return undefined;
    },

    onAnswerCommit(
      questionId: string,
      value: string | string[] | undefined,
      deps: FlowStepDeps,
    ): void {
      // Track the latest committed display name for Back→forward re-derivation.
      // Written to the per-mount ref so it does not leak across re-entries.
      if (questionId === "project_display_name") {
        deps.displayNameRef.current = typeof value === "string" ? value : "";
      }
    },
  },

  extract(result: SurveyPhaseResult): ProjectNamePayload | undefined {
    const displayNameAnswer = result.answers.find(
      (a) => a.questionId === "project_display_name",
    );
    const keyboardIdAnswer = result.answers.find(
      (a) => a.questionId === "project_keyboard_id",
    );

    const displayName =
      displayNameAnswer !== undefined && displayNameAnswer.answerType === "text"
        ? String(displayNameAnswer.value).trim()
        : "";
    const keyboardId =
      keyboardIdAnswer !== undefined && keyboardIdAnswer.answerType === "text"
        ? String(keyboardIdAnswer.value).trim()
        : "";

    if (displayName !== "" && keyboardId !== "") {
      return { displayName, keyboardId };
    }
    return undefined;
  },

  onCommit(extracted: ProjectNamePayload, deps: FlowStepDeps): void {
    // R7 ordering: setScaffoldSpec BEFORE setIdentity BEFORE onComplete → advance.
    deps.setScaffoldSpec({ keyboardId: extracted.keyboardId, displayName: extracted.displayName });
    // spec 059 FR-001/FR-002: carry the identity-lite answers into the working
    // copy so the package descriptor can declare the AUTHOR's language. Before
    // this, Track 1 set only keyboardId and displayName — the composed tag lived
    // in surveySessionStore.identityResult and never crossed over, so the
    // descriptor had no author tag to write even in principle.
    //
    // `bcp47` is consumed WHOLE (research D-03). The identity-lite series already
    // composed language + region + script into one tag; re-deriving it here would
    // be a second composition rule that could disagree with the first. An empty
    // string (author left the language code blank) is omitted rather than written,
    // so the descriptor writer applies its own `und` placeholder instead of
    // declaring a blank tag.
    const bcp47 = deps.identityResult?.bcp47.trim() ?? "";
    const languageName = deps.identityResult?.english.trim() ?? "";
    deps.setIdentity({
      keyboardId: extracted.keyboardId,
      displayName: extracted.displayName,
      ...(bcp47 !== "" ? { bcp47 } : {}),
      ...(languageName !== "" ? { languageName } : {}),
    });
  },
};

// ---------------------------------------------------------------------------
// phaseFOptions — reproduces PhaseFAdapter + PhaseF behaviour exactly.
//
// Context: surveySessionStore.surveyContext (matches PhaseFAdapter today).
// usesFindings: true — derives findingsByQuestionId via buildFindingsByQuestionId.
// Seeds: pf_contact_info from surveyContext.author_contact — see CTX_AUTHOR_CONTACT.
// Extract: identity (raw SurveyPhaseResult — the host's applyStepCompletion / advance
//   already handles the result shape downstream).
// onCommit: none (PhaseFAdapter had no pre-onComplete store writes).
// ---------------------------------------------------------------------------

export type PhaseFPayload = SurveyPhaseResult;

/**
 * SurveyContext key carrying the author's public contact, used to PRE-FILL
 * pf_contact_info rather than asking for the same fact a second time.
 *
 * Producer: keyboard attribution ([specs/059-keyboard-attribution](../../../../../specs/059-keyboard-attribution/spec.md))
 * captures an author contact once, in the identity phase, itself pre-filled from
 * the authenticated GitHub profile. Until that lands nothing writes this key, so
 * the seed below resolves to undefined and Phase F behaves exactly as it does
 * today — the seam is inert rather than speculative, and lights up with no
 * further change here.
 *
 * SurveyContext is an open `Record<string, string | undefined>`, so this needs
 * neither a new type nor a change to FlowStepDeps.
 */
const CTX_AUTHOR_CONTACT = "author_contact";

type OptInField =
  | "designRationale" | "fontGuidance" | "canonicalOrder" | "scriptGlossary"
  | "exampleWords" | "scopeVariety" | "provenanceBasis" | "troubleshooting"
  | "knownLimitations" | "relatedKeyboards" | "furtherReading";

/** The opt-in "additional detail" battery — HelpDocsAnswers field ↔ Phase F question id. */
const OPT_IN_QUESTION_IDS: ReadonlyArray<[OptInField, string]> = [
  ["designRationale", "pf_design_rationale"],
  ["fontGuidance", "pf_font_guidance"],
  ["canonicalOrder", "pf_canonical_order"],
  ["scriptGlossary", "pf_script_glossary"],
  ["exampleWords", "pf_example_words"],
  ["scopeVariety", "pf_scope_variety"],
  ["provenanceBasis", "pf_provenance_basis"],
  ["troubleshooting", "pf_troubleshooting"],
  ["knownLimitations", "pf_known_limitations"],
  ["relatedKeyboards", "pf_related_keyboards"],
  ["furtherReading", "pf_further_reading"],
];

function getTextAnswer(result: SurveyPhaseResult, questionId: string): string | undefined {
  const answer = result.answers.find((a) => a.questionId === questionId);
  return answer !== undefined && typeof answer.value === "string" ? answer.value : undefined;
}

/**
 * Build `HelpDocsAnswers` from a Phase F `SurveyPhaseResult`, or `undefined`
 * when the one required question (`pf_welcome_paragraph`) is blank — the
 * caller (phaseFOptions.onCommit) then skips `setHelpDocs` entirely, leaving
 * the store field exactly as it was (spec 061 research D-01).
 *
 * `pf_usage_tip_3`/`_4`/`_5` are deliberately not read — only `_1`/`_2` are
 * reachable in the live flow (research D-11). `pf_project_url` splits on a
 * newline into `projectHomeUrl`/`projectHelpUrl` — the question's own
 * documented "one or two lines" format (FR-004).
 */
export function extractHelpDocs(result: SurveyPhaseResult): HelpDocsAnswers | undefined {
  const description = getTextAnswer(result, "pf_welcome_paragraph")?.trim() ?? "";
  if (description === "") return undefined;

  const usageTips = [
    getTextAnswer(result, "pf_usage_tip_1"),
    getTextAnswer(result, "pf_usage_tip_2"),
  ]
    .map((t) => t?.trim() ?? "")
    .filter((t) => t !== "");

  const helpDocs: HelpDocsAnswers = { description, usageTips };

  const credits = getTextAnswer(result, "pf_credits")?.trim();
  if (credits !== undefined && credits !== "") helpDocs.credits = credits;

  const contactInfo = getTextAnswer(result, "pf_contact_info")?.trim();
  if (contactInfo !== undefined && contactInfo !== "") helpDocs.contactInfo = contactInfo;

  const projectUrl = getTextAnswer(result, "pf_project_url");
  if (projectUrl !== undefined) {
    const lines = projectUrl.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    if (lines[0] !== undefined) helpDocs.projectHomeUrl = lines[0];
    if (lines[1] !== undefined) helpDocs.projectHelpUrl = lines[1];
  }

  const docLanguage = getTextAnswer(result, "pf_doc_language");
  if (docLanguage === "english" || docLanguage === "target" || docLanguage === "bilingual") {
    helpDocs.docLanguage = docLanguage;
  }

  for (const [field, questionId] of OPT_IN_QUESTION_IDS) {
    const value = getTextAnswer(result, questionId)?.trim();
    if (value !== undefined && value !== "") {
      helpDocs[field] = value;
    }
  }

  return helpDocs;
}

export const phaseFOptions: FlowStepOptions<PhaseFPayload> = {
  flowRef: "phase_f_helpdocs",
  title: "Help documentation",

  buildContext(deps: FlowStepDeps) {
    // Match PhaseFAdapter: pass surveyContext from session store.
    return deps.surveyContext;
  },

  usesFindings: true,

  seeds: {
    getSeedValue(questionId: string, deps: FlowStepDeps): string | string[] | undefined {
      // pf_contact_info stays OPTIONAL. Seeding pre-fills the field; it does not
      // require an answer. The author can clear it, or replace it with a community
      // channel that is not their own address — several shipped keyboards publish a
      // language-community contact rather than the author's personal one.
      if (questionId === "pf_contact_info") {
        const contact = deps.surveyContext[CTX_AUTHOR_CONTACT];
        return contact !== undefined && contact !== "" ? contact : undefined;
      }

      // pf_credits is deliberately NOT seeded from the copyright holder. Thanking
      // and owning are different things: shipped credits sections routinely
      // acknowledge advisors and contributors who hold no copyright. Pre-filling
      // the holder here would produce exactly the duplicated boilerplate the
      // question exists to collect something better than.
      return undefined;
    },
  },

  extract(result: SurveyPhaseResult): PhaseFPayload | undefined {
    // Identity extraction — raw result forwarded to StepHost's generic path.
    return result;
  },

  onCommit(result: PhaseFPayload, deps: FlowStepDeps): void {
    // spec 061: wire the previously-inert Phase F answers into the working
    // copy. Skipped entirely (not setHelpDocs(null)) when the required
    // description is blank — see extractHelpDocs's doc comment.
    const extracted = extractHelpDocs(result);
    if (extracted !== undefined) {
      deps.setHelpDocs(extracted);
    }
  },
};

// ---------------------------------------------------------------------------
// Factory-produced step components — EditorStepProps-compatible.
//
// These are the canonical factory outputs for the three converged flows.
// registerEditorSteps.ts may use these directly (C4.1 "factory output directly")
// instead of the adapter wrappers. They render FlowStepHost internally.
// ---------------------------------------------------------------------------

export const TrackStepFactoryComponent = makeFlowStepComponent(trackOptions);
export const ProjectNameStepFactoryComponent = makeFlowStepComponent(projectNameOptions);
export const PhaseFStepFactoryComponent = makeFlowStepComponent(phaseFOptions);

