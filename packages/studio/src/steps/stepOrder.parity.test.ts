// stepOrder.parity.test.ts — FR-005 parity (spec 091 T017): the wizard's
// screens are DERIVED from the decision modules' declarations (provides /
// requires / screenRequires / group / screen), and the derivation must
// reproduce the wizard `main` had — unless a `requires` edge in the
// current declarations orders a pair differently, in which case the
// difference is explained by that edge, enumerated, never silent.
//
// The BASELINE_* literals below are that baseline: the screen sequence,
// membership, trails and lock order of `main` at 18e63aa4 (membership =
// the pre-091 step table's provides lists, carried over as data when the
// table was deleted at T016 — not regenerated from the code under test;
// a change here is a decision to review, not a regeneration).
//
// This file replaces the frozen-literal oracle that gated spec 087's
// migration (it asserted the derivation equals the literals exactly,
// with the step table as the membership source). The oracle's literals
// survive as the baseline; its exactness survives for membership,
// trails, locks and the Flow Map graph; order itself is asserted in
// FR-005 form (equal, or every inversion edge-explained).
//
// AMENDMENT (#1901, a deliberate decision per the rule above — not a
// regeneration): the author/copyright decisions moved out of the
// identity screen into a new "attribution" screen after "track" (the
// questions are asked after the track choice because their proposals
// are track-shaped). BASELINE_ORDER gains "attribution" after "track";
// BASELINE_MEMBERSHIP moves author-name / author-email /
// copyright-holder from identity to attribution; the Flow Map edges
// re-route through attribution (it is project_name's preceding spine
// step, so the copy fork now leaves from attribution); the tie-break
// pairs gain attribution's unordered pairs (its only ordering edges
// are target-script and, via screenRequires, authoring-track; nothing
// downstream requires its decisions).

import { describe, expect, it } from "vitest";
import { manifest, screenTrails } from "./manifest.ts";
import { STEP_ORDER, STEP_TRAILS } from "./stepOrder.ts";
import { buildManifestStepGraph } from "../dashboard/buildStepGraph.ts";
import { decisionModules, declaredScreenGates } from "../survey/questions/registry.ts";
import { deriveScreens } from "../decisions/deriveScreens.ts";

/** The screen sequence on `main` at 18e63aa4. */
const BASELINE_ORDER = [
  "identity",
  "layout",
  "choose_base",
  "track",
  "attribution",
  "project_name",
  "characters",
  "marks",
  "punctuation",
  "invisibles",
  "convenience",
  "carve",
  "deadkeys",
  "rules",
  "mechanisms",
  "touch_seed_source",
  "touch",
  "help",
  "package",
] as const;

/** Side-trail step -> the step it rejoins (the old spine:false + joinTarget). */
const BASELINE_SIDE_TRAILS: Readonly<Record<string, string>> = {
  project_name: "characters",
  touch_seed_source: "touch",
};

const BASELINE_LOCKS: ReadonlyArray<readonly [string, string]> = [
  ["mechanisms", "physical"],
  ["touch", "touch"],
];

const BASELINE_EDGES: ReadonlyArray<readonly [string, string, string]> = [
  ["identity", "layout", "spine"],
  ["layout", "choose_base", "spine"],
  ["choose_base", "track", "spine"],
  ["track", "attribution", "spine"],
  ["attribution", "characters", "spine"],
  ["attribution", "project_name", "fork"],
  ["project_name", "characters", "join"],
  ["characters", "marks", "spine"],
  ["marks", "punctuation", "spine"],
  ["punctuation", "invisibles", "spine"],
  ["invisibles", "convenience", "spine"],
  ["convenience", "carve", "spine"],
  ["carve", "deadkeys", "spine"],
  ["deadkeys", "rules", "spine"],
  ["rules", "mechanisms", "spine"],
  ["mechanisms", "touch", "spine"],
  ["mechanisms", "touch_seed_source", "fork"],
  ["touch_seed_source", "touch", "join"],
  ["touch", "help", "spine"],
  ["help", "package", "spine"],
];

/** Membership on `main` at 18e63aa4: the decisions each step's screen held. */
const BASELINE_MEMBERSHIP: Readonly<Record<string, readonly string[]>> = {
  identity: ["language-name", "language-region", "language-autonym", "language-code", "target-script"],
  layout: ["windows-layout"],
  choose_base: ["base-keyboard"],
  track: ["authoring-track"],
  // #1901 amendment: the author trio's membership, moved from identity.
  attribution: ["author-name", "author-email", "copyright-holder"],
  project_name: ["project-display-name", "project-keyboard-id"],
  characters: ["existing-keyboards", "co-installed-keyboards", "discovery-intro", "text-sample", "text-sample-review", "linguist-confirm", "picker-confirm", "standard-letters", "typing-approach", "special-letters-wanted", "special-letters", "special-letters-notes", "latin-digraphs-wanted", "latin-digraphs-list", "punctuation-wanted", "punctuation-list", "digit-set", "char-count", "latin-qwerty-branch", "spare-keys-qwerty", "latin-azerty-branch", "azerty-qz-swap", "spare-keys-azerty", "non-roman-branch", "indic-conjuncts-wanted", "indic-virama", "indic-vowels-separate", "indic-pre-base-vowels", "indic-nukta-wanted", "indic-nukta-detail", "indic-onset-vowels-wanted", "indic-onset-vowels-list", "sea-medials", "sea-stacked-consonants", "rtl-direction-confirm", "rtl-short-vowels", "rtl-special-letters", "syllabic-note", "syllabic-grid", "syllabic-finals-wanted", "syllabic-finals-list", "other-free-entry", "contact-language", "legacy-encoding", "use-case", "additional-methods", "character-inventory"],
  marks: ["marks-treatment"],
  punctuation: ["punctuation-inventory"],
  invisibles: ["invisibles-inventory"],
  convenience: ["retained-convenience-chars"],
  carve: ["carved-layout"],
  deadkeys: ["deadkeys-defined"],
  rules: ["rule-set"],
  mechanisms: ["physical-layout"],
  touch_seed_source: ["touch-seed-source"],
  touch: ["touch-layout"],
  help: ["help-welcome-paragraph", "help-usage-tip-1", "help-history-entry", "help-history-bullets", "help-more-detail", "help-doc-language", "help-font-guidance", "help-usage-tip-2", "help-scope-variety", "help-provenance-basis", "help-design-rationale", "help-canonical-order", "help-script-glossary", "help-example-words", "help-troubleshooting", "help-related-keyboards", "help-known-limitations", "help-further-reading", "help-project-url", "help-credits", "help-contact-info", "help-docs"],
  package: [],
};

// ---------------------------------------------------------------------------
// The derivation under test, and the requires-reachability the FR-005
// explanations are computed from. Reachability runs over the same edges
// the sort consumes: each module's `requires` plus its `screenRequires`
// (which deriveScreens folds into the full-list sort only).
// ---------------------------------------------------------------------------

const screens = deriveScreens(decisionModules, declaredScreenGates);
const derivedOrder = [...screens.map((s) => s.id), "package"];
const screenById = new Map(screens.map((s) => [s.id, s] as const));

const providerOf = new Map<string, string>();
for (const m of decisionModules) {
  for (const p of m.provides ?? []) providerOf.set(p, m.definition.id);
}
const byModuleId = new Map(decisionModules.map((m) => [m.definition.id, m] as const));

const reachCache = new Map<string, Set<string>>();
/** Module ids `start` transitively requires (provider modules, via edges). */
const requiresReach = (start: string): Set<string> => {
  const cached = reachCache.get(start);
  if (cached !== undefined) return cached;
  const seen = new Set<string>();
  const walk = (id: string): void => {
    const mod = byModuleId.get(id);
    if (mod === undefined) return;
    for (const r of [...(mod.requires ?? []), ...(mod.screenRequires ?? [])]) {
      const provider = providerOf.get(r);
      if (provider !== undefined && !seen.has(provider)) {
        seen.add(provider);
        walk(provider);
      }
    }
  };
  walk(start);
  reachCache.set(start, seen);
  return seen;
};

/**
 * Screen `a` must precede screen `b`: some member of `b` transitively
 * requires a decision a member of `a` provides.
 */
const mustPrecede = (a: string, b: string): boolean => {
  const sa = screenById.get(a);
  const sb = screenById.get(b);
  if (sa === undefined || sb === undefined) return false;
  const aModules = new Set(sa.moduleIds);
  return sb.moduleIds.some((id) =>
    [...requiresReach(id)].some((provider) => aModules.has(provider)),
  );
};

describe("FR-005 parity: derived screens vs the main@18e63aa4 baseline", () => {
  it("the published STEP_ORDER is the derived screen order", () => {
    expect([...STEP_ORDER]).toEqual(derivedOrder);
    expect(manifest.map((s) => s.id)).toEqual(derivedOrder);
  });

  it("screen order equals the baseline, or every inversion is edge-explained", () => {
    const unexplained: string[] = [];
    for (let i = 0; i < BASELINE_ORDER.length; i++) {
      for (let j = i + 1; j < BASELINE_ORDER.length; j++) {
        const a = BASELINE_ORDER[i]!;
        const b = BASELINE_ORDER[j]!;
        if (derivedOrder.indexOf(a) < derivedOrder.indexOf(b)) continue;
        // Baseline a-before-b is inverted in the derivation: explained
        // iff a requires edge orders b before a.
        if (!mustPrecede(b, a)) {
          unexplained.push(`${a} before ${b} (baseline) inverted, unexplained`);
        }
      }
    }
    expect(unexplained).toEqual([]);
  });

  it("no baseline screen is missing and no derived screen is unbaselined", () => {
    expect([...derivedOrder].sort()).toEqual([...BASELINE_ORDER].sort());
  });

  it("screen membership equals the baseline membership", () => {
    for (const id of BASELINE_ORDER) {
      if (id === "package") continue;
      const screen = screenById.get(id);
      expect(screen, id).toBeDefined();
      expect([...screen!.decisionIds].sort(), id).toEqual(
        [...(BASELINE_MEMBERSHIP[id] ?? [])].sort(),
      );
    }
  });

  it("derived trails equal the baseline side trails", () => {
    const sideTrails: Record<string, string> = {};
    for (const [id, trail] of STEP_TRAILS) {
      if (!trail.spine) {
        expect(trail.joinTarget, `side trail "${id}" must have a join target`).toBeDefined();
        sideTrails[id] = trail.joinTarget as string;
      } else {
        expect(trail.joinTarget, `spine step "${id}" has no join target`).toBeUndefined();
      }
    }
    expect(sideTrails).toEqual(BASELINE_SIDE_TRAILS);
    // STEP_TRAILS is steps/manifest.ts's screenTrails by construction
    // (one derivation, re-published — steps/stepOrder.ts); the per-screen
    // trail fields assert the same baseline independently.
    expect(screenTrails).toEqual(STEP_TRAILS);
    for (const s of screens) {
      expect(s.joinTarget, s.id).toBe(BASELINE_SIDE_TRAILS[s.id]);
      expect(s.spine, s.id).toBe(BASELINE_SIDE_TRAILS[s.id] === undefined);
    }
  });

  it("lock placement order is unchanged (a validation on the derived order, not an input)", () => {
    const locks = manifest
      .filter((s) => s.lock !== undefined)
      .map((s) => [s.id, s.lock] as const);
    expect(locks).toEqual([...BASELINE_LOCKS]);
  });

  it("Flow Map step graph: nodes, spine flags, join targets and edges are unchanged", () => {
    const graph = buildManifestStepGraph();
    expect(graph.nodes.map((n) => n.id)).toEqual([...BASELINE_ORDER]);
    for (const n of graph.nodes) {
      expect(n.spine, `node "${n.id}" spine flag`).toBe(!(n.id in BASELINE_SIDE_TRAILS));
      expect(n.joinTarget, `node "${n.id}" joinTarget`).toBe(BASELINE_SIDE_TRAILS[n.id]);
    }
    expect(graph.edges.map((e) => [e.from, e.to, e.kind] as const)).toEqual([
      ...BASELINE_EDGES,
    ]);
  });

  describe("the order is determined by declarations, not by declaration order", () => {
    // Pairs no requires chain orders: the declaration order of the
    // module list is their documented stable tie-break, exactly as the
    // question registry's key order is for pure walk-order flows.
    // Frozen: a new entry here is a decision to review, not something
    // to regenerate.
    //   - layout is pinned only to "after identity, before carve".
    //   - marks/punctuation/invisibles/convenience each read the alphabet
    //     and feed carve, but none reads another.
    //   - attribution (#1901 amendment) is ordered only against identity
    //     (target-script) and track (authoring-track, via screenRequires);
    //     nothing downstream requires its decisions, so it is a
    //     tie-break against every other screen it neighbours.
    const BASELINE_TIE_BREAK_PAIRS: ReadonlyArray<readonly [string, string]> = [
      ["layout", "choose_base"],
      ["layout", "track"],
      ["layout", "attribution"],
      ["layout", "project_name"],
      ["layout", "characters"],
      ["layout", "marks"],
      ["layout", "punctuation"],
      ["layout", "invisibles"],
      ["layout", "convenience"],
      ["choose_base", "attribution"],
      ["attribution", "project_name"],
      ["attribution", "characters"],
      ["attribution", "marks"],
      ["attribution", "punctuation"],
      ["attribution", "invisibles"],
      ["attribution", "convenience"],
      ["attribution", "carve"],
      ["attribution", "deadkeys"],
      ["attribution", "rules"],
      ["attribution", "mechanisms"],
      ["attribution", "touch_seed_source"],
      ["attribution", "touch"],
      ["attribution", "help"],
      ["marks", "punctuation"],
      ["marks", "invisibles"],
      ["marks", "convenience"],
      ["punctuation", "invisibles"],
      ["punctuation", "convenience"],
      ["invisibles", "convenience"],
    ];

    it("every pair not fixed by a requires chain is a frozen, documented tie-break", () => {
      const unordered: Array<readonly [string, string]> = [];
      for (let i = 0; i < BASELINE_ORDER.length; i++) {
        for (let j = i + 1; j < BASELINE_ORDER.length; j++) {
          const a = BASELINE_ORDER[i]!;
          const b = BASELINE_ORDER[j]!;
          if (a === "package" || b === "package") continue;
          if (!mustPrecede(a, b) && !mustPrecede(b, a)) unordered.push([a, b]);
        }
      }
      expect(unordered).toEqual([...BASELINE_TIE_BREAK_PAIRS]);
    });

    it("every edge-ordered pair holds for adversarial input orders", () => {
      const inputs: (typeof decisionModules)[] = [[...decisionModules].reverse()];
      for (let rot = 1; rot < decisionModules.length; rot += 4) {
        inputs.push([
          ...decisionModules.slice(rot),
          ...decisionModules.slice(0, rot),
        ]);
      }
      for (const input of inputs) {
        const order = [
          ...deriveScreens(input, declaredScreenGates).map((s) => s.id),
          "package",
        ];
        for (let i = 0; i < BASELINE_ORDER.length; i++) {
          for (let j = i + 1; j < BASELINE_ORDER.length; j++) {
            const a = BASELINE_ORDER[i]!;
            const b = BASELINE_ORDER[j]!;
            if (a === "package" || b === "package") continue;
            if (!mustPrecede(a, b)) continue;
            expect(
              order.indexOf(a),
              `${a} before ${b} for a rotated/reversed module list`,
            ).toBeLessThan(order.indexOf(b));
          }
        }
      }
    });
  });
});
