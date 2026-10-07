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
import type { DecisionId } from "../../decisions/decisionTypes.ts";
import { indexProviders } from "../../decisions/orderDecisions.ts";

import windowsLayoutModule from "./gallery/windowsLayout.ts";
import baseKeyboardModule from "./gallery/baseKeyboard.ts";
import characterInventoryModule from "./gallery/characterInventory.ts";
import marksTreatmentModule from "./gallery/marksTreatment.ts";
import punctuationInventoryModule from "./gallery/punctuationInventory.ts";
import invisiblesInventoryModule from "./gallery/invisiblesInventory.ts";
import retainedConvenienceCharsModule from "./gallery/retainedConvenienceChars.ts";
import carvedLayoutModule from "./gallery/carvedLayout.ts";
import deadkeysDefinedModule from "./gallery/deadkeysDefined.ts";
import ruleSetModule from "./gallery/ruleSet.ts";
import physicalLayoutModule from "./gallery/physicalLayout.ts";
import touchSeedSourceModule from "./gallery/touchSeedSource.ts";
import touchLayoutModule from "./gallery/touchLayout.ts";
import helpDocsModule from "./gallery/helpDocs.ts";

import { flowModules, demotedPhaseFModules } from "./flowModules.ts";
export { flowModules, demotedPhaseFModules };
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
 * or editor step settles (the fourteen `settles` ids in
 * steps/stepDependencies.ts). Registered here — so `decisionIndex` resolves
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
  baseKeyboardModule,
  characterInventoryModule,
  marksTreatmentModule,
  punctuationInventoryModule,
  invisiblesInventoryModule,
  retainedConvenienceCharsModule,
  carvedLayoutModule,
  deadkeysDefinedModule,
  ruleSetModule,
  physicalLayoutModule,
  touchSeedSourceModule,
  touchLayoutModule,
  helpDocsModule,
];

export const galleryModules: readonly QuestionModule[] = galleryModuleList.map(
  (m) => m as QuestionModule,
);

/**
 * The typed gallery module for a decision id, for the gallery host and its
 * wrappers — the registry-side counterpart of `decisionIndex` that keeps
 * the value type. Returns undefined for decisions no gallery module settles.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function galleryModuleFor(decisionId: DecisionId): GalleryModule<any> | undefined {
  return galleryModuleList.find((m) => m.provides[0] === decisionId);
}

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
  ...flowModules.track,
  ...flowModules.project_name,
  ...reserveModules,
  ...galleryModules,
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
