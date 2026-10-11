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
import type { DecisionProposalSource, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { bumpKeyboardVersion, historyEntryHeading } from "@keyboard-studio/engine";
import { makeFlowStepComponent } from "./makeFlowStepComponent.tsx";
import type { FlowStepOptions, FlowStepDeps } from "./makeFlowStepComponent.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
// spec 079: the engine-backed helpers live in lib/, not in the question
// modules — those stay pure descriptors the standalone content-i18n
// extractor can load without the engine.
import {
  requiredWhen as requiredWhenWelcomeParagraph,
  type AdaptiveDescriptionContext,
} from "../../lib/adaptiveDescription.ts";
import { deriveHistoryEntryState } from "../../lib/historyEntryState.ts";
import { buildHistoryProposalSeed } from "../../decisions/historyProposalSeed.ts";
import { deriveIdentityResult } from "../../decisions/identitySelectors.ts";
import type { DecisionId, DecisionSet } from "../../decisions/decisionTypes.ts";
import type { ExtractContext } from "../../decisions/extractContext.ts";
import type { QuestionModule } from "../../survey/types.ts";
import ilAuthorNameModule from "../../survey/questions/a/il_author_name.ts";
import ilAuthorEmailModule from "../../survey/questions/a/il_author_email.ts";
import ilCopyrightHolderModule from "../../survey/questions/a/il_copyright_holder.ts";

/** A recorded decision's string value, or undefined when absent/non-string. */
function decisionString(decisions: DecisionSet, id: DecisionId): string | undefined {
  const value = decisions[id]?.value;
  return typeof value === "string" ? value : undefined;
}

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
// Effects: none here (spec 089) — the recorded authoring-track decision IS
//   the effect; routing reads it via selectTrack and the scaffold
//   consequence via deriveScaffoldSpec. track_choice's own apply is
//   deliberately empty (see the module).
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
};

// ---------------------------------------------------------------------------
// projectNameOptions — reproduces ProjectNameStepAdapter + PhaseProjectName.
//
// Context: {} (empty — matches PhaseProjectName today).
// Seeds: displayName from identityResult autonym/english; keyboardId slug
//   from the English language name (fallback: display-name / autonym) —
//   non-decomposing Latin letters in an autonym would otherwise collapse to
//   underscores under slugifyKeyboardId (issue #1777 / Bafut `bfd`).
//   Back→forward re-derivation: the ref-based pattern from PhaseProjectName
//   is preserved via a closure ref inside getSeedValue/onAnswerCommit.
// Extract: display + id (both trimmed); undefined unless both non-empty.
// Effects: none here (spec 089) — project_keyboard_id's apply composes the
//   working-copy identity from the recorded decisions (deriveProjectIdentity).
// Payload: { displayName, keyboardId }.
// ---------------------------------------------------------------------------

export type ProjectNamePayload = { displayName: string; keyboardId: string };

/**
 * True when `slug` keeps at least half the source's letter count after
 * NFD + mark-stripping. Used to decide whether an author-edited display name
 * is a safe keyboard-id seed, or whether we should fall back to English
 * (autonyms with non-decomposing letters like `ɨ` otherwise yield `b_f`).
 *
 * Source letters are counted with `\p{L}` so non-ASCII Latin (ɨ, ɛ, ɔ, …)
 * still contribute to the denominator; the slug only has `[a-z]`.
 */
export function slugRetainsMostLetters(source: string, slug: string): boolean {
  const sourceLetters = (
    source.normalize("NFD").replace(/\p{M}/gu, "").match(/\p{L}/gu) ?? []
  ).length;
  if (sourceLetters === 0) return slug.length > 0;
  const slugLetters = slug.replace(/[^a-z]/g, "").length;
  return slugLetters * 2 >= sourceLetters;
}

export const projectNameOptions: FlowStepOptions<ProjectNamePayload> = {
  flowRef: "project_name",
  title: "Name your keyboard",

  buildContext(_deps: FlowStepDeps) {
    // Match PhaseProjectName: empty context.
    return {};
  },

  seeds: {
    getSeedValue(questionId: string, deps: FlowStepDeps): string | string[] | undefined {
      // Spec 089 FR-005: the identity result is derived from the recorded
      // decisions, not read from a stored session field.
      const identity = deriveIdentityResult(deps.decisions);
      const english = identity?.english ?? "";
      const defaultDisplayName =
        identity !== null
          ? identity.autonym || identity.english
          : "";
      // FR-031 (spec 057): the recorded project-display-name decision is the
      // durable record of this step's own completion — the same role
      // `selectedTrack` plays for the track step. Once it exists the
      // author has committed a name/id at least once, so a fresh arrival at
      // this step (deep link, or Back after an earlier visit unmounted it)
      // must show THAT, not re-propose the identity-derived default it
      // started from. Absent (never committed yet) falls through to the
      // original default-proposal behavior unchanged.
      const recordedDisplayName = decisionString(deps.decisions, "project-display-name");

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
        const recordedKeyboardId = decisionString(deps.decisions, "project-keyboard-id");
        if (recordedKeyboardId !== undefined && recordedKeyboardId !== "") {
          return recordedKeyboardId;
        }

        const committedName =
          deps.displayNameRef.current !== ""
            ? deps.displayNameRef.current
            : defaultDisplayName;

        // Author edited the display name away from the identity default —
        // re-derive from their edit when the slug keeps most of the letters.
        // Otherwise fall through to the English-preferred seed (#1777).
        if (committedName !== "" && committedName !== defaultDisplayName) {
          const fromEdit = slugifyKeyboardId(committedName);
          if (fromEdit !== "" && slugRetainsMostLetters(committedName, fromEdit)) {
            return fromEdit;
          }
        }

        // Prefer the English language name; fall back to the display-name /
        // autonym slug only when English is empty or yields nothing.
        const fromEnglish = english !== "" ? slugifyKeyboardId(english) : "";
        if (fromEnglish !== "") return fromEnglish;

        const fromDisplay = slugifyKeyboardId(committedName);
        return fromDisplay !== "" ? fromDisplay : undefined;
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
};

// ---------------------------------------------------------------------------
// attributionOptions — the author / copyright questions (#1901).
//
// These three questions were the identity step's tail (spec 064 US1);
// they are asked AFTER the track choice now, because what they propose
// depends on it:
//   - Author name / email: confirm-style defaults from the authenticated
//     profile (spec 064 D7). The RULE is the modules' declared
//     `lookupDefault` (spec 092 T033); the seed callbacks below only
//     supply the profile input (deps.authorProfile, read by the factory)
//     and read the declared default back. A profile with no name seeds
//     nothing — ASK rather than substitute the login handle, which is
//     not a copyright holder.
//   - Copyright holder: NO caller seed on either track. On the update
//     track the live extraction pass has already seeded the decision
//     from the base keyboard (il_copyright_holder's `seedWhen`), and
//     SurveyRunner's record-first seeding renders it pre-filled with
//     its source caption; on the copy track the module forbids that
//     seed (the copied notice is retained by the attribution machinery)
//     and the field stays blank — blank means "same as the author" (D1).
// Re-entry (FR-031, the project_name pattern): a recorded asked answer
// is the seed — the author's own value, never a re-proposal over it.
// Extract: the author-name answer (the module's validate already
// requires it non-blank; this guard keeps a completion without it from
// advancing).
// Effects: none here (spec 089) — il_copyright_holder's apply lands the
// attribution at StepHost's boundary, pass 2 included: this completion
// recording author-name is exactly pass 2's trigger, as the identity
// completion was before the move.
// ---------------------------------------------------------------------------

export type AttributionPayload = { authorName: string };

const attributionModules: Readonly<Record<string, QuestionModule>> = {
  [ilAuthorNameModule.definition.id]: ilAuthorNameModule,
  [ilAuthorEmailModule.definition.id]: ilAuthorEmailModule,
  [ilCopyrightHolderModule.definition.id]: ilCopyrightHolderModule,
};

/** The recorded asked answer for a question's decision, or undefined. */
function askedAnswer(deps: FlowStepDeps, questionId: string): string | undefined {
  const decisionId = attributionModules[questionId]?.provides?.[0];
  if (decisionId === undefined) return undefined;
  const record = deps.decisions[decisionId];
  if (record === undefined || record.provenance !== "asked") return undefined;
  return typeof record.value === "string" ? record.value : undefined;
}

/**
 * A module's declared profile lookup default, evaluated against the
 * factory-supplied author profile. Undefined when the module declares
 * no default (il_copyright_holder) or the profile carries no value.
 */
function profileDefault(
  deps: FlowStepDeps,
  questionId: string,
): { value: string; source?: string } | undefined {
  const mod = attributionModules[questionId];
  if (mod?.lookupDefault === undefined) return undefined;
  const ctx: ExtractContext = {
    ir: null,
    catalog: null,
    identity: { authorProfile: deps.authorProfile },
  };
  const dflt = mod.lookupDefault(ctx);
  if (dflt === undefined || typeof dflt.value !== "string" || dflt.value === "") {
    return undefined;
  }
  return {
    value: dflt.value,
    ...(dflt.source !== undefined ? { source: dflt.source } : {}),
  };
}

export const attributionOptions: FlowStepOptions<AttributionPayload> = {
  flowRef: "attribution",
  title: "Author & copyright",

  buildContext(deps: FlowStepDeps) {
    return deps.surveyContext;
  },

  seeds: {
    getSeedValue(questionId: string, deps: FlowStepDeps): string | string[] | undefined {
      return askedAnswer(deps, questionId) ?? profileDefault(deps, questionId)?.value;
    },
    getSeedSource(questionId: string, deps: FlowStepDeps): DecisionProposalSource | undefined {
      // An asked answer is the author's own — it names no proposal
      // source. Only a profile lookup default does ("identity").
      if (askedAnswer(deps, questionId) !== undefined) return undefined;
      const source = profileDefault(deps, questionId)?.source;
      return source !== undefined ? (source as DecisionProposalSource) : undefined;
    },
  },

  extract(result: SurveyPhaseResult): AttributionPayload | undefined {
    const answer = result.answers.find((a) => a.questionId === "il_author_name");
    if (!answer || answer.answerType !== "text") return undefined;
    const authorName = String(answer.value).trim();
    return authorName !== "" ? { authorName } : undefined;
  },
};

// ---------------------------------------------------------------------------
// phaseFOptions — reproduces PhaseFAdapter + PhaseF behaviour exactly.
//
// Context: the decision-derived survey context (deriveSurveyContext, spec 089).
// usesFindings: true — derives findingsByQuestionId via buildFindingsByQuestionId.
// Seeds: NONE here since spec 092 (T036) — the pf_* seeds are extracts /
//   lookup defaults declared on their modules and seeded as decision
//   records by the live extraction pass; SurveyRunner reads the records.
// Extract: identity (raw SurveyPhaseResult — the host's applyStepCompletion / advance
//   already handles the result shape downstream).
// Effects: none here (spec 089) — pf_welcome_paragraph's apply composes the
//   working copy's help-docs + HISTORY-entry state from the recorded
//   decisions (decisions/helpDocsFromDecisions.ts).
// ---------------------------------------------------------------------------

export type PhaseFPayload = SurveyPhaseResult;

/**
 * Reads the four working-copy slices `pf_welcome_paragraph`'s `prefill`/
 * `requiredWhen` need (spec 079 FR-009), straight off `getState()` rather
 * than threading them through `FlowStepDeps` — this seed function is called
 * on-demand (question-transition time / every SurveyRunner render), not
 * reactively per-render like the hook-level `depsRef` fields above, so a
 * fresh snapshot read here is equivalent and keeps `FlowStepDeps` unchanged
 * for every other flow's seeds.
 */
function readAdaptiveDescriptionContext(): AdaptiveDescriptionContext {
  const state = useWorkingCopyStore.getState();
  return {
    instantiationMode: state.instantiationMode,
    baseDocProfile: state.baseDocProfile,
    baseWelcomeHtmText: state.baseWelcomeHtmText,
    baseHelpPhpText: state.baseHelpPhpText,
  };
}

/**
 * Spec 092 (T036): the PHASE_F_SEEDS table that used to live here is
 * deleted. Each entry became an `extract` or a `lookupDefault` declared
 * on its pf_* module (derivations in lib/phaseFSeeds.ts and
 * lib/adaptiveDescription.ts, computed by the live extraction wiring
 * and read off the extract context — G-17), seeded as decision records
 * by the live extraction pass and read back by SurveyRunner from the
 * records.
 * pf_credits was deliberately never seeded — thanking ≠ owning — and
 * stays unseeded.
 */

/**
 * The version HISTORY's proposed heading is stamped with (spec 079 FR-010),
 * mirroring `serializeWorkingCopy.ts`'s own `rawVersion`/`bumpKeyboardVersion`
 * derivation exactly (`baseIr.header.version?.trim() || "1.0"`, bumped only
 * on an adaptation) so the survey-time proposal and the final output-time
 * heading never disagree about which version they're for.
 */
function deriveHistoryVersion(): string {
  const state = useWorkingCopyStore.getState();
  const rawVersion = state.baseIr?.header.version?.trim() || "1.0";
  return state.instantiationMode === "adapt-existing" ? bumpKeyboardVersion(rawVersion) : rawVersion;
}

export const phaseFOptions: FlowStepOptions<PhaseFPayload> = {
  flowRef: "phase_f_helpdocs",
  title: "Help documentation",

  buildContext(deps: FlowStepDeps) {
    // Match PhaseFAdapter's surveyContext pass-through, plus (spec 079 US5)
    // the HISTORY-proposal tokens pf_history_entry's help_text interpolates.
    // `deps.historyEntryState` is null for exactly one render — before
    // onMount's first derivation lands — in which case both tokens resolve
    // to "" (see pf_history_entry.ts's own comment on that one-render gap).
    const historyState = deps.historyEntryState;
    const bullets = historyState !== null
      ? (historyState.editedBullets ?? historyState.proposal.bullets)
      : [];
    return {
      ...deps.surveyContext,
      history_heading: historyState !== null
        ? historyEntryHeading(historyState.proposal.version, historyState.proposal.dateIso)
        : "",
      history_bullets: bullets.map((bullet) => `- ${bullet}`).join("\n"),
    };
  },

  usesFindings: true,

  // spec 079 US5: derive the HISTORY-entry proposal once per mount (entering
  // the Phase F step), from the decision record no new journal was needed for
  // (buildHistoryProposalSeed) and the same version `serializeWorkingCopy.ts`
  // will independently recompute at output time (deriveHistoryVersion).
  // Identity-guarded: deriveHistoryEntryState returns `previous` UNCHANGED
  // when the version has not moved, so a re-mount (Back then forward into
  // this step again) never re-stamps `dateIso` (research R12) and never
  // fires a redundant store write.
  onMount(deps: FlowStepDeps): void {
    const next = deriveHistoryEntryState({
      seed: buildHistoryProposalSeed(),
      version: deriveHistoryVersion(),
      dateIso: new Date().toISOString().slice(0, 10),
      previous: deps.historyEntryState,
    });
    if (next !== deps.historyEntryState) {
      // Spec 089: no setter is plumbed through FlowStepDeps any more — this
      // file already reads the working-copy slices via getState() for its
      // seed functions (readAdaptiveDescriptionContext above), so the one
      // remaining mount-time write goes through the same channel.
      useWorkingCopyStore.getState().setHistoryEntryState(next);
    }
  },

  seeds: {
    // Spec 092 (T036): no getSeedValue/getSeedSource any more — the pf_*
    // seeds are decision records now (see the T036 note above), and
    // SurveyRunner reads them from the store. Only the required override
    // remains a host concern.
    //
    // spec 079 FR-009: waives pf_welcome_paragraph's static `required: true`
    // in exactly the case the extraction pass seeded a prefill for it —
    // every other question (undefined here) keeps its own static `required`.
    getRequiredOverride(questionId: string): boolean | undefined {
      if (questionId === "pf_welcome_paragraph") {
        return requiredWhenWelcomeParagraph(readAdaptiveDescriptionContext());
      }
      return undefined;
    },
  },

  extract(result: SurveyPhaseResult): PhaseFPayload | undefined {
    // Identity extraction — raw result forwarded to StepHost's generic path.
    return result;
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
export const AttributionStepFactoryComponent = makeFlowStepComponent(attributionOptions);
export const ProjectNameStepFactoryComponent = makeFlowStepComponent(projectNameOptions);
export const PhaseFStepFactoryComponent = makeFlowStepComponent(phaseFOptions);

