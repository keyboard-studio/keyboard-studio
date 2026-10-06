// stepDependencies — what each wizard step settles, needs, and when it is asked.
//
// The decision registry is the single source of order (spec 087 Q3). Question
// modules declare `provides` / `requires`; this table gives every wizard step
// the same declarations, so the step order is derived by the SAME sort
// (decisions/orderDecisions.ts → steps/stepOrder.ts) and no hand-maintained
// spine list or order array exists.
//
// Plain data on purpose: no step components are imported here, so stores can
// derive the order (STEP_ORDER) without the manifest ↔ stores import cycle.
// The manifest spreads each entry onto its Step, so a Step and its entry can
// never disagree.
//
// provides  = the decisions of the step's `flowRefs` modules (derived from the
//             registry — never re-listed here) plus `settles`: decisions the
//             step settles that no question module asks for.
// requires  = decisions that must be settled before the step can run. Only
//             REAL preconditions are listed (what the step reads, or what its
//             component consumes from the session); a step that merely feels
//             like it belongs earlier or later gets no edge.
// gatedBy   = the step is asked only for some answers (a side trail). It
//             replaces the old `spine: false` flag: a gated step is a side
//             trail, and it rejoins at the next ungated step.
//
// ENTRY ORDER BELOW IS MEANINGFUL ONLY AS THE STABLE TIE-BREAK, exactly like the
// key order of a flow in survey/questions/registry.ts: where no dependency
// separates two steps, the earlier entry is asked first. The pairs this
// applies to are pinned in steps/stepOrder.parity.test.ts.
//
// Why `inputs` / `writes` are not the ordering inputs: carve, deadkeys and
// mechanisms all write groups[]/stores[] and deliberately declare no inputs (to
// keep the data graph acyclic), so IR paths cannot say which of them comes
// first. Decisions can.

import type { DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { flowModules } from "../survey/questions/registry.ts";
import type { QuestionModule } from "../survey/types.ts";

interface StepDeclaration {
  /** Survey flows that run inside this step (ids into steps/flowSources.ts). */
  readonly flowRefs?: readonly string[];
  /** Decisions this step settles beyond those its flows' questions provide. */
  readonly settles?: readonly DecisionId[];
  readonly requires?: readonly DecisionId[];
  readonly gatedBy?: (decisions: DecisionSet) => boolean;
}

const DECLARATIONS = {
  // The language, script and attribution; its questions order themselves.
  identity: { flowRefs: ["identity_lite"] },

  // The community's Windows layout is proposed from the language tag. Carve,
  // the rules demo and the mechanism gallery resolve likely host layouts from
  // it; nothing earlier reads it, so it is pinned only to "after identity,
  // before carve" and sits here, right after identity, by tie-break.
  layout: { settles: ["windows-layout"], requires: ["language-code"] },

  // The base keyboard is searched by language and script.
  choose_base: { settles: ["base-keyboard"], requires: ["language-code", "target-script"] },

  // The track prompt and its header inputs name the chosen base.
  track: { flowRefs: ["track"], requires: ["base-keyboard"] },

  // Copy track only. Adapt keeps the base's own name and id, so the keyboard
  // identity is settled on both tracks and downstream steps may rely on it.
  project_name: {
    flowRefs: ["project_name"],
    requires: ["authoring-track"],
    gatedBy: (decisions) => decisions["authoring-track"]?.value === "copy",
  },

  // Phase A/B: the alphabet. Reads the script, runs against the instantiated
  // working copy (so the keyboard identity must be settled), and writes the
  // language tag back into it.
  characters: {
    flowRefs: ["phase_b_characters"],
    settles: ["character-inventory"],
    requires: ["target-script", "authoring-track", "project-keyboard-id"],
  },

  // The marks, punctuation, invisibles and convenience steps each read the
  // confirmed alphabet and each emit an independent contribution to the session
  // that carve consumes. They do not read one another (the punctuation and
  // invisibles steps union into the same phase-C inventory, order-free by
  // design), so their mutual order is the tie-break.
  marks: { settles: ["marks-treatment"], requires: ["character-inventory"] },
  punctuation: { settles: ["punctuation-inventory"], requires: ["character-inventory"] },
  invisibles: { settles: ["invisibles-inventory"], requires: ["character-inventory"] },
  convenience: {
    settles: ["retained-convenience-chars"],
    requires: ["character-inventory", "base-keyboard"],
  },

  // Carve proposes removals from the base; every contribution above must
  // exist first (retained letters and inventories are shielded from it).
  carve: {
    settles: ["carved-layout"],
    requires: [
      "base-keyboard",
      "windows-layout",
      "marks-treatment",
      "punctuation-inventory",
      "invisibles-inventory",
      "retained-convenience-chars",
    ],
  },

  // Deadkeys are defined for the keys carve retained.
  deadkeys: { settles: ["deadkeys-defined"], requires: ["carved-layout"] },

  // The rule demo and builder show what the working copy's rules do, including
  // the deadkeys just defined.
  rules: { settles: ["rule-set"], requires: ["deadkeys-defined", "windows-layout"] },

  // Physical assignment consumes the marks worklist, the carved layout, the
  // deadkeys (accented-character flow) and the rule set it must not collide with.
  mechanisms: {
    settles: ["physical-layout"],
    requires: ["carved-layout", "deadkeys-defined", "rule-set", "marks-treatment", "windows-layout"],
  },

  // Side trail: the touch seed is asked only while no choice is recorded; a
  // remembered choice goes straight to touch.
  touch_seed_source: {
    settles: ["touch-seed-source"],
    requires: ["physical-layout"],
    gatedBy: (decisions) => decisions["touch-seed-source"] === undefined,
  },

  // Touch seeds from the locked physical layout and the chosen seed source.
  touch: {
    settles: ["touch-layout"],
    requires: ["physical-layout", "touch-seed-source"],
  },

  // The Phase F hard gate needs every modality's layout to exist.
  help: {
    flowRefs: ["phase_f_helpdocs"],
    settles: ["help-docs"],
    requires: ["physical-layout", "touch-layout"],
  },

  // Reserved terminal; packages the help docs and layouts.
  package: { requires: ["help-docs"] },
} as const satisfies Record<string, StepDeclaration>;

/** Every declared step id. */
export type StepId = keyof typeof DECLARATIONS;

/** The ordering-relevant declarations a Step carries (spread by the manifest). */
export interface StepDependencies {
  readonly flowRefs?: readonly string[];
  readonly provides: readonly DecisionId[];
  readonly requires: readonly DecisionId[];
  readonly gatedBy?: (decisions: DecisionSet) => boolean;
}

const flowModuleLists: Readonly<Record<string, readonly QuestionModule[]>> = flowModules;

function flowDecisions(flowRefs: readonly string[]): DecisionId[] {
  return flowRefs.flatMap((ref) => {
    const modules = flowModuleLists[ref];
    if (modules === undefined) {
      throw new Error(`stepDependencies: unknown flowRef "${ref}"`);
    }
    return modules.flatMap((m) => m.provides ?? []);
  });
}

const resolved: ReadonlyMap<string, StepDependencies> = new Map(
  Object.entries(DECLARATIONS as Record<string, StepDeclaration>).map(([id, decl]) => {
    const dependencies: StepDependencies = {
      ...(decl.flowRefs !== undefined && { flowRefs: decl.flowRefs }),
      provides: [...flowDecisions(decl.flowRefs ?? []), ...(decl.settles ?? [])],
      requires: decl.requires ?? [],
      ...(decl.gatedBy !== undefined && { gatedBy: decl.gatedBy }),
    };
    return [id, dependencies] as const;
  }),
);

/** The declared step ids, in declaration order (the tie-break order). */
export const DECLARED_STEP_IDS: readonly StepId[] = Object.keys(DECLARATIONS) as StepId[];

/** A step's dependency declarations. Throws on an undeclared id. */
export function stepDependencies(id: StepId): StepDependencies {
  const found = resolved.get(id);
  if (found === undefined) throw new Error(`stepDependencies: undeclared step "${id}"`);
  return found;
}
