// legacyStepIds.test — the SC-005 inventory (spec 091 T023).
//
// Every step id that existed on `main` at 18e63aa4 (the 18 ids inventoried
// in specs/091-derived-steps/research.md) must resolve — through the frozen
// legacy map and the deep-link resolver — to the derived screen that now
// holds that step's decisions. Ids are named literally here so a future
// rename or removal breaks this test loudly instead of stranding a
// pre-091 deep link or draft silently.

import { describe, it, expect } from "vitest";
import { LEGACY_STEP_ID_MAP, resolveLegacyStepId } from "../decisions/legacyStepIds.ts";
import { derivedScreens, manifest, screenGates } from "../steps/manifest.ts";
import { declaredScreenGates } from "../survey/questions/registry.ts";
import type { TraversalSnapshot } from "../stores/surveySessionStore.ts";
import type { Location } from "./location.ts";
import { resolveLocation, type ResolveContext } from "./resolveLocation.ts";

/** The 18 step ids on `main` at 18e63aa4 (research.md inventory). */
const MAIN_STEP_IDS_AT_18E63AA4 = [
  "identity",
  "layout",
  "choose_base",
  "track",
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

function traversalAllWalked(): TraversalSnapshot {
  return {
    activeStepId: "help",
    history: [...MAIN_STEP_IDS_AT_18E63AA4],
    visited: [...MAIN_STEP_IDS_AT_18E63AA4],
    selectedTrack: "copy",
  } as unknown as TraversalSnapshot;
}

/** A context in which the author has walked everything on the copy track. */
function ctxAllWalked(): ResolveContext {
  return {
    manifest,
    screenGates,
    questionRegistry: {},
    traversal: traversalAllWalked(),
    decisions: {
      "authoring-track": { id: "authoring-track", value: "copy", provenance: "asked" },
    },
    hasProject: true,
  };
}

describe("SC-005 inventory — every pre-091 step id resolves to its screen", () => {
  it("the frozen map covers exactly the 18 inventoried ids", () => {
    expect(Object.keys(LEGACY_STEP_ID_MAP).sort()).toEqual(
      [...MAIN_STEP_IDS_AT_18E63AA4].sort(),
    );
  });

  it("each id resolves to a derived screen (or the terminal package screen)", () => {
    const screenIds = new Set([
      ...derivedScreens.map((s) => s.id),
      "package",
    ]);
    for (const id of MAIN_STEP_IDS_AT_18E63AA4) {
      expect(screenIds.has(resolveLegacyStepId(id)), id).toBe(true);
    }
  });

  it("the resolved screen holds the decisions the step provided (baseline oracle)", () => {
    // The oracle is the pre-091 declaration table's provides lists,
    // carried here as literals at the T016 flip (the table is deleted;
    // the baseline is main@18e63aa4's step membership, frozen — the same
    // baseline steps/stepOrder.parity.test.ts asserts equality against).
    const BASELINE_PROVIDES: Readonly<Record<string, readonly string[]>> = {
      // #1901 amendment: the pre-091 identity step also provided the
      // author/copyright trio; those decisions live on the attribution
      // screen now (asserted separately below) — the identity screen
      // holds only the language decisions.
      identity: ["language-name", "language-region", "language-autonym", "language-code", "target-script"],
      layout: ["windows-layout"],
      choose_base: ["base-keyboard"],
      track: ["authoring-track"],
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
    const screenById = new Map(derivedScreens.map((s) => [s.id, s] as const));
    for (const id of MAIN_STEP_IDS_AT_18E63AA4) {
      if (id === "package") continue; // terminal screen: no decisions
      const screen = screenById.get(resolveLegacyStepId(id))!;
      expect(screen, id).toBeDefined();
      for (const decisionId of BASELINE_PROVIDES[id] ?? []) {
        expect(screen.decisionIds, `${id} -> ${screen.id}`).toContain(decisionId);
      }
    }
    // #1901: the author/copyright decisions the pre-091 identity step
    // provided are held by the attribution screen (post-track) now.
    const attribution = screenById.get("attribution")!;
    expect(attribution).toBeDefined();
    for (const decisionId of ["author-name", "author-email", "copyright-holder"]) {
      expect(attribution.decisionIds, `identity (pre-091) -> attribution`).toContain(decisionId);
    }
  });

  it("each id resolves through resolveLocation to a reachable location on that screen", () => {
    const ctx = ctxAllWalked();
    for (const id of MAIN_STEP_IDS_AT_18E63AA4) {
      const loc: Location = { route: "survey", step: id as never };
      const result = resolveLocation(loc, ctx);
      expect(result.kind, id).toBe("reachable");
      if (result.kind === "reachable") {
        expect(result.location.step, id).toBe(resolveLegacyStepId(id));
      }
    }
  });

  it("the declared screen gates cover the two gated legacy steps", () => {
    // project_name and touch_seed_source were the gated steps of the old
    // table; their gates survive as composition-layer declarations (P6).
    expect(declaredScreenGates.has(resolveLegacyStepId("project_name"))).toBe(true);
    expect(declaredScreenGates.has(resolveLegacyStepId("touch_seed_source"))).toBe(true);
  });

  it("done / unsupported pass through the map unchanged (terminals, not screens)", () => {
    expect(resolveLegacyStepId("done")).toBe("done");
    expect(resolveLegacyStepId("unsupported")).toBe("unsupported");
    expect(LEGACY_STEP_ID_MAP["done"]).toBeUndefined();
    expect(LEGACY_STEP_ID_MAP["unsupported"]).toBeUndefined();
  });
});
