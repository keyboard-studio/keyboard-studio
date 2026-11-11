// Question module registry — the ONE place modules are imported and grouped.
//
// Every question module is imported here exactly once and listed in exactly one
// group of `flowModules` (the flow it belongs to) or `demotedPhaseFModules` /
// `reserveOnlyModules` (registered but in no flow). Everything else is derived
// from those lists:
//
//   • `questionRegistry` — id-keyed view over every module (key === definition.id
//     by construction; a duplicate id throws at module load).
//   • `decisionIndex`    — DecisionId-keyed view built through the canonical
//     `indexProviders`, so a duplicate provider throws. Modules with no
//     `provides` (terminal stubs, join-point gates) are in the id registry only.
//   • each flow's order    — derived from the modules' provides/requires
//     (steps/flowSources.ts → loadDerivedFlowDef → orderDecisions).
//
// Flow membership is expressed once, here, as data; there are no per-phase
// registries to keep in sync. A new question lands in questions/<dir>/<id>.ts
// plus one import and one list entry below.
//
// KEY ORDER IS MEANINGFUL inside each flow list: it is the stable tie-break for
// `orderDecisions` where the provides/requires graph is silent, so keep the
// entries in walk order (decisions/orderParity.test.ts pins the result).

import type { GalleryModule, QuestionModule } from "../types.ts";
import type { DecisionId, DecisionSet } from "../../decisions/decisionTypes.ts";
import { indexProviders } from "../../decisions/orderDecisions.ts";
import { hasOpenIssue, openIssueGate, openLettersGate, openMechanismsGate } from "../../decisions/openIssues.ts";

import windowsLayoutModule from "./gallery/windowsLayout.ts";
import capsHandlingModule from "./gallery/capsHandling.ts";
import startKeyboardModule from "./gallery/baseKeyboard.ts";
import { authoringTrackProviderModule } from "./authoringTrackProvider.ts";
import characterInventoryModule from "./gallery/characterInventory.ts";
import marksTreatmentModule from "./gallery/marksTreatment.ts";
import punctuationInventoryModule from "./gallery/punctuationInventory.ts";
import invisiblesInventoryModule from "./gallery/invisiblesInventory.ts";
import retainedConvenienceCharsModule from "./gallery/retainedConvenienceChars.ts";
import carvedLayoutModule from "./gallery/carvedLayout.ts";
import deadkeysDefinedModule from "./gallery/deadkeysDefined.ts";
import kmnEditsModule from "./gallery/kmnEdits.ts";
import ruleSetModule from "./gallery/ruleSet.ts";
import physicalLayoutModule from "./gallery/physicalLayout.ts";
import fallbackPolicyModule from "./gallery/fallbackPolicy.ts";
import oskLayoutModule from "./gallery/oskLayout.ts";
import touchSeedSourceModule from "./gallery/touchSeedSource.ts";
import languageListModule from "./gallery/languageList.ts";
import missingLettersModule from "./gallery/missingLetters.ts";
import upgradesModule from "./gallery/upgrades.ts";
import touchLayoutModule from "./gallery/touchLayout.ts";
import customCssModule from "./gallery/customCss.ts";
import helpDocsModule from "./gallery/helpDocs.ts";
import welcomeHtmModule from "./gallery/welcomeHtm.ts";
import iconModule from "./gallery/icon.ts";
import trialModule from "./gallery/trial.ts";
import publishModule from "./gallery/publish.ts";

import { flowModules, demotedPhaseFModules, PHASE_F_HELPDOCS_QUESTION_IDS } from "./flowModules.ts";
export { flowModules, demotedPhaseFModules, PHASE_F_HELPDOCS_QUESTION_IDS };

/**
 * Retired questions whose answers still map onto live decisions. `track_choice`
 * asked the authoring track before the track step was removed (#2568); its
 * answer is the only record of an "adapt" walk in an old draft or decision
 * record, so it maps onto `authoring-track` instead of orphaning. The registry
 * is the only question→decision map, so the retired map lives here: the v1
 * draft migration (lib/draftPersistence.ts) and the decision-record replay
 * (test/recordToDecisionSet.ts) both resolve through it.
 */
export const RETIRED_QUESTION_DECISIONS: Readonly<Record<string, readonly DecisionId[]>> = {
  track_choice: ["authoring-track"],
};
import pb_mark_input_order from "./reserve/pb_mark_input_order.ts";


/**
 * Build an id-keyed record from a module list. Throws on a duplicate id so a
 * module can never be silently shadowed.
 */
export function moduleRecord(
  modules: readonly QuestionModule[],
): Readonly<Record<string, QuestionModule>> {
  const record: Record<string, QuestionModule> = {};
  for (const m of modules) {
    const id = m.definition.id;
    if (Object.prototype.hasOwnProperty.call(record, id)) {
      throw new Error(`question registry: duplicate question id "${id}"`);
    }
    record[id] = m;
  }
  return record;
}



/**
 * Every Phase F module: the live flow plus the demoted tip slots. The demoted
 * ones are registered but not flow members, so they surface as
 * library-not-in-flow nodes in the Phase F drill-down.
 */
export const phaseFLibraryModules: readonly QuestionModule[] = [
  ...flowModules.phase_f_helpdocs,
  ...demotedPhaseFModules,
];

/** Registered modules that belong to no flow (relocated out of a live battery). */
export const reserveOnlyModules: readonly QuestionModule[] = [
  pb_mark_input_order,
];

/**
 * The gallery decision modules (spec 090): one module per decision a gallery
 * or editor step settles (the fourteen gallery decisions). Registered
 * here — so `decisionIndex` resolves
 * exactly one provider per gallery decision — but members of NO flow: the
 * gallery host (steps/galleryHost.tsx) renders them, never the SurveyRunner.
 * Module files live under questions/gallery/; the list is composed here, in
 * registry.ts, because a group file inside gallery/ would itself be globbed
 * as a module by the shared contract suite (research addendum D-090-4).
 * Populated by spec 090 T008; the stories (US1–US5) fill in each module's
 * renderer/apply in place.
 *
 * Gallery modules are authored as GalleryModule<V> (apply/renderer typed on
 * the decision's real value type); the cast to the heterogeneous
 * QuestionModule happens once, here, at registry composition (research
 * addendum D-090-1).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const galleryModuleList: readonly GalleryModule<any>[] = [
  windowsLayoutModule,
  capsHandlingModule,
  startKeyboardModule,
  languageListModule,
  missingLettersModule,
  upgradesModule,
  characterInventoryModule,
  marksTreatmentModule,
  punctuationInventoryModule,
  invisiblesInventoryModule,
  retainedConvenienceCharsModule,
  carvedLayoutModule,
  deadkeysDefinedModule,
  ruleSetModule,
  physicalLayoutModule,
  fallbackPolicyModule,
  oskLayoutModule,
  touchSeedSourceModule,
  touchLayoutModule,
  customCssModule,
  helpDocsModule,
  welcomeHtmModule,
  iconModule,
  trialModule,
  publishModule,
];

export const galleryModules: readonly QuestionModule[] = galleryModuleList.map(
  (m) => m as QuestionModule,
);

/**
 * Decision modules that are replayed and looked up but are NOT wizard steps (spec 113,
 * research R12): they are recorded at edit time by an editor tab, so they are in
 * `questionRegistry` / `decisionIndex` but deliberately absent from `galleryModules` and
 * `decisionModules` -- a gallery module would form its own wizard screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const layoutEditModuleList: readonly GalleryModule<any>[] = [kmnEditsModule];

export const layoutEditModules: readonly QuestionModule[] = layoutEditModuleList.map(
  (m) => m as QuestionModule,
);

/**
 * The typed gallery module for a decision id, for the gallery host and its
 * wrappers — the registry-side counterpart of `decisionIndex` that keeps
 * the value type. Returns undefined for decisions no gallery module settles.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function galleryModuleFor(decisionId: DecisionId): GalleryModule<any> | undefined {
  return (
    galleryModuleList.find((m) => m.provides[0] === decisionId) ??
    layoutEditModuleList.find((m) => m.provides[0] === decisionId)
  );
}

// ---------------------------------------------------------------------------
// Spec 091 — the derivation's module list and the `group` seeding (T003/T004).
//
// `decisionModules` is the single declaration-ordered list spec 091's
// `deriveScreens` consumes: the live question flows' modules plus the
// gallery modules, concatenated in the same relative order `questionRegistry`
// composes them (reserve and demoted sets are registered but are NOT live
// flow members, so they are not in the list). Declaration order in this list
// is the sort's stable tie-break input ONLY — it carries no other semantics,
// exactly like flow-list key order today.
//
// Each live flow's modules are seeded here with their screen `group`
// (spec 091 T003): the three SurveyRunner flows name their own screen;
// the two intra-step flows name their enclosing custom screen, per
// research.md's two-level treatment (their modules form no top-level
// screen). A module that already declares its own `group` keeps it.
// ---------------------------------------------------------------------------

const withGroup = (
  modules: readonly QuestionModule[],
  group: string,
): QuestionModule[] =>
  modules.map((m) => (m.group === undefined ? { ...m, group } : m));

export const decisionModules: readonly QuestionModule[] = [
  // The track question is gone, but the authoring-track decision still
  // orders the walk: the start screen records it before the walk, so it
  // is declared first here. Grouped under "choose_base" — intra-step to
  // the base picker's custom screen, so it forms no screen of its own
  // (see authoringTrackProvider.ts).
  ...withGroup([authoringTrackProviderModule], "choose_base"),
  ...withGroup(flowModules.identity_lite, "identity"),
  ...withGroup(flowModules.phase_b_characters, "characters"),
  ...withGroup(flowModules.phase_f_helpdocs, "help"),
  // #1901: the attribution screen sits between choose_base and project_name.
  // Declaration order here is the sort's tie-break: both screens
  // screen-require "authoring-track", and attribution walks first.
  ...withGroup(flowModules.attribution, "attribution"),
  ...withGroup(flowModules.project_name, "project_name"),
  ...galleryModules,
];

/**
 * Screens that do not appear in the walk on Open (spec 111 FR-016, research R6).
 * The first three are the identity-first steps (the keyboard already exists);
 * the rest are the remove tool and the feature galleries, which stay reachable
 * from the menu. (The Mechanisms and Touch galleries are walked, so they are not here.) Declared here once; the gates below and the advance policy
 * (steps/advance.ts) both read this set.
 */
export const openHiddenScreens: ReadonlySet<string> = new Set([
  "identity",
  "layout",
  "choose_base",
  // The character survey: Open's Missing letters page replaces it (spec 111 FR-031).
  "characters",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
  "carve",
  "deadkeys",
  "rules",
]);

/**
 * The screens a menu entry reaches on Open: the remove tool and the feature galleries
 * that stay opt-in. Mechanisms and Touch are not among them: they are walked steps.
 */
export const openMenuScreens: readonly string[] = [
  "carve",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
  "deadkeys",
  "rules",
];

const notOpen = (d: DecisionSet): boolean => d["authoring-track"]?.value !== "adapt";

/**
 * Declared screen gates (spec 091 FR-003, Delta P6): the gates of screens
 * whose visibility is NOT routing-expressible — the project_name fork
 * (manifest-level in StudioShell, never a property of the flow's `next`
 * graph) and the touch seed fork (asked only while unrecorded). Spec 087
 * FR-005 forbids a module-level `gatedBy` (conditional visibility comes
 * from `next` only), so these former step-level gates are declared here,
 * at the composition layer,
 * keyed by screen id, and passed to `deriveScreens` by its callers. Every
 * other screen's gate is member-derived from routing.
 */
export const declaredScreenGates: ReadonlyMap<
  string,
  (decisions: DecisionSet) => boolean
> = new Map([
  ["project_name", (d) => d["authoring-track"]?.value === "copy"],
  [
    "touch_seed_source",
    // Open (spec 111 FR-009): the keyboard's own touch layout is edited as it
    // is; generation is offered only when the file is missing.
    (d) =>
      d["touch-seed-source"] === undefined &&
      (d["authoring-track"]?.value !== "adapt" || openedKeyboardLacksTouchLayout(d)),
  ],
]);

/**
 * True when the opened keyboard's catalog entry names no touch platform, so it
 * has no touch layout of its own to edit. Reads only the recorded
 * `base-keyboard` decision (gates receive nothing else).
 */
function openedKeyboardLacksTouchLayout(d: DecisionSet): boolean {
  const targets = (d["base-keyboard"]?.value as { targets?: readonly string[] } | undefined)?.targets;
  if (targets === undefined) return false;
  return !targets.some((t) => t === "web" || t === "mobile" || t === "tablet");
}

/**
 * Spec 111 (Open): the screens hidden once the Open entry records
 * `authoring-track = "adapt"` (the identity-first screens, the remove tool and
 * the feature galleries). Kept apart from `declaredScreenGates` on purpose: a
 * declared gate makes its screen an off-spine side trail, and these screens
 * stay on the static spine that Copy walks and the Flow Map draws. The manifest
 * folds these into its `screenGates`, so the walk skips them only on Open.
 */
export const openScreenGates: ReadonlyMap<string, (decisions: DecisionSet) => boolean> =
  new Map<string, (decisions: DecisionSet) => boolean>([
    ...[...openHiddenScreens].map((id) => [id, notOpen] as const),
    // Spec 111: the Open walk's own pages. Their gates are decisions (the track, the
    // recorded problem kinds, whether the keyboard is basic); where they sit in the walk
    // comes from the modules' provides / requires / screenRequires, not from this file.
    // They stay on the spine (Copy's gate is false), so no step hard-codes the next one.
    ["open_languages", (d) => !notOpen(d)],
    ["open_missing_letters", openLettersGate],
    ["open_upgrades", openIssueGate("upgrades")],
    // Spec 111 (Open walk): the Mechanisms gallery is walked on Open unless the keyboard
    // is basic, whose physical layout is fixed. Copy always walks it.
    ["mechanisms", openMechanismsGate],
    // Spec 111 FR-029/FR-032: on Open the help step is asked only when the baseline
    // recorded a help document that is missing or fails its criteria. Copy always asks it.
    ["help", (d) => notOpen(d) || hasOpenIssue(d, "docs")],
    // The welcome-page editor follows the help step: asked on Open only with it.
    ["html", (d) => notOpen(d) || hasOpenIssue(d, "docs")],
  ]);

/**
 * The reserve / Leftover set (no-delete guardrail): every module physically
 * under questions/reserve/ — the demoted Phase A battery plus the flow-less
 * pb_mark_input_order.
 */
export const reserveModules: readonly QuestionModule[] = [
  ...flowModules.phase_a_identity,
  ...reserveOnlyModules,
];

/**
 * Synchronous registry: { [questionId]: QuestionModule }
 *
 * Populated at module-init time; the map never grows at runtime. Key order is
 * simply the concatenation below; it carries no meaning (flow order derives
 * from each flow's provides/requires, not from this record).
 */
export const questionRegistry: Readonly<Record<string, QuestionModule>> = moduleRecord([
  ...flowModules.identity_lite,
  ...flowModules.phase_b_characters,
  ...phaseFLibraryModules,
  ...flowModules.attribution,
  ...flowModules.project_name,
  ...reserveModules,
  ...galleryModules,
  ...layoutEditModules,
]);

/**
 * The single DecisionId -> module index (spec 087). Built through the canonical
 * `indexProviders`, so a duplicate provider throws rather than silently
 * shadowing a module.
 */
export const decisionIndex: Readonly<Partial<Record<DecisionId, QuestionModule>>> =
  Object.fromEntries(indexProviders(Object.values(questionRegistry)));

// ---------------------------------------------------------------------------
// Spec 017 — registry-keyed drill-down declarations (prefill / pb_build_list).
//
// These are DECLARED-ONLY drill-down descriptors hung under the opaque
// `characters` node — NOT questionRegistry entries and NOT modular-YAML flow
// nodes (keeping the orphan-input-lint and the spec-016 bijection green). They
// live in their own module; re-exported here so the drill-down declarations have
// a home under the question registry, per spec 017 T004/T016/T017.
// ---------------------------------------------------------------------------
export {
  drillDownDeclarations,
  prefillDrillDown,
  pbBuildListDrillDown,
  CHARACTERS_NODE_ID,
} from "./drillDownDeclarations.ts";
export type { DrillDownDeclaration, DrillDownOutput } from "./drillDownDeclarations.ts";
