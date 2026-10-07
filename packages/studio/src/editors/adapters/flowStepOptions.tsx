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
  prefill as prefillWelcomeParagraph,
  requiredWhen as requiredWhenWelcomeParagraph,
  type AdaptiveDescriptionContext,
} from "../../lib/adaptiveDescription.ts";
import { deriveHistoryEntryState } from "../../lib/historyEntryState.ts";
import { proposeProjectUrl, proposeProvenanceBasis, type PhaseFSeedContext } from "../../lib/phaseFSeeds.ts";
import { buildHistoryProposalSeed } from "../../decisions/historyProposalSeed.ts";
import { deriveIdentityResult } from "../../decisions/identitySelectors.ts";
import type { DecisionId, DecisionSet } from "../../decisions/decisionTypes.ts";

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
// phaseFOptions — reproduces PhaseFAdapter + PhaseF behaviour exactly.
//
// Context: the decision-derived survey context (deriveSurveyContext, spec 089).
// usesFindings: true — derives findingsByQuestionId via buildFindingsByQuestionId.
// Seeds: pf_contact_info from surveyContext.author_contact — see CTX_AUTHOR_CONTACT.
// Extract: identity (raw SurveyPhaseResult — the host's applyStepCompletion / advance
//   already handles the result shape downstream).
// Effects: none here (spec 089) — pf_welcome_paragraph's apply composes the
//   working copy's help-docs + HISTORY-entry state from the recorded
//   decisions (decisions/helpDocsFromDecisions.ts).
// ---------------------------------------------------------------------------

export type PhaseFPayload = SurveyPhaseResult;

/**
 * SurveyContext key carrying the author's public contact, used to PRE-FILL
 * pf_contact_info rather than asking for the same fact a second time.
 *
 * Producer: keyboard attribution ([specs/064-keyboard-attribution](../../../../../specs/064-keyboard-attribution/spec.md))
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

/** The working-copy slices the Phase F text proposals read (lib/phaseFSeeds.ts). */
function readPhaseFSeedContext(): PhaseFSeedContext {
  const state = useWorkingCopyStore.getState();
  return {
    instantiationMode: state.instantiationMode,
    baseKeyboard: state.baseKeyboard,
    baseVfs: state.baseVfs,
  };
}

/**
 * One seeded Phase F question: its value resolver plus where the proposal
 * comes from, for the decision trail. The two travel together so a new
 * seeded question can never land in the value list without its source (or
 * an explicit sourceless `source`), and vice versa.
 */
interface PhaseFSeedSpec {
  /** Resolve the proposed value. Receives the flow deps — seeds are contextual. */
  getValue: (deps: FlowStepDeps) => string | string[] | undefined;
  /**
   * Where the proposal comes from, for the decision trail. Absent means a
   * plain default no data stands behind — still recorded as `tool-proposed`,
   * just without naming a source (see `AnswerProposal.source`).
   */
  source?: DecisionProposalSource;
}

/**
 * The single registry of Phase F seeded questions. `getSeedValue` and
 * `getSeedSource` below both read this table, so the two lists cannot drift
 * as Phase F grows (km-triage, PR #1927): presence in the table means
 * "seeded", and `source` names the data behind the proposal.
 */
const PHASE_F_SEEDS: Readonly<Record<string, PhaseFSeedSpec>> = {
  // spec 079 FR-009: on an adaptation whose base has a usable description,
  // propose it for confirmation (accept/edit/replace in one action, §3c).
  // Net-new, copy (Track 1), and a base classified none/minimal all
  // resolve to undefined here — pf_welcome_paragraph behaves exactly as
  // before (required, unfilled). See `getRequiredOverride` below, which
  // waives `required` in exactly this same case.
  pf_welcome_paragraph: {
    getValue: () => prefillWelcomeParagraph(readAdaptiveDescriptionContext()),
    source: "base",
  },

  // pf_contact_info stays OPTIONAL. Seeding pre-fills the field; it does not
  // require an answer. The author can clear it, or replace it with a community
  // channel that is not their own address — several shipped keyboards publish a
  // language-community contact rather than the author's personal one.
  pf_contact_info: {
    getValue: (deps) => {
      const contact = deps.surveyContext[CTX_AUTHOR_CONTACT];
      return contact !== undefined && contact !== "" ? contact : undefined;
    },
    source: "identity",
  },

  // Choice questions open with a defensible default so none is left blank.
  // The author can overturn any of them; blank already meant these values.
  // pf_more_detail_gate's "No" is a plain default, not something any data
  // suggested — so it carries no source.
  pf_more_detail_gate: { getValue: () => "false" },
  pf_doc_language: {
    getValue: (deps) => {
      const tag = deps.surveyContext["bcp47_tag"];
      const primary = typeof tag === "string" ? tag.split("-")[0]?.toLowerCase() ?? "" : "";
      return primary === "" || primary === "en" ? "english" : "bilingual";
    },
    source: "identity",
  },
  pf_history_entry: { getValue: () => "confirm", source: "analysis" },

  // Text proposals derived from the starting point (lib/phaseFSeeds.ts).
  pf_project_url: {
    getValue: () => proposeProjectUrl(readPhaseFSeedContext()),
    source: "base",
  },
  pf_provenance_basis: {
    getValue: () => proposeProvenanceBasis(readPhaseFSeedContext()),
    source: "base",
  },

  // pf_credits is deliberately NOT in this table. Thanking and owning are
  // different things: shipped credits sections routinely acknowledge advisors
  // and contributors who hold no copyright. Pre-filling the holder here would
  // produce exactly the duplicated boilerplate the question exists to collect
  // something better than.
};

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
    getSeedValue(questionId: string, deps: FlowStepDeps): string | string[] | undefined {
      // Single registry above — one entry per seeded question, so the value
      // and its trail source can never drift apart.
      return PHASE_F_SEEDS[questionId]?.getValue(deps);
    },

    getSeedSource(questionId: string): DecisionProposalSource | undefined {
      return PHASE_F_SEEDS[questionId]?.source;
    },

    // spec 079 FR-009: waives pf_welcome_paragraph's static `required: true`
    // in exactly the case getSeedValue above proposed a value — every other
    // question (undefined here) keeps its own static `required`.
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
export const ProjectNameStepFactoryComponent = makeFlowStepComponent(projectNameOptions);
export const PhaseFStepFactoryComponent = makeFlowStepComponent(phaseFOptions);

