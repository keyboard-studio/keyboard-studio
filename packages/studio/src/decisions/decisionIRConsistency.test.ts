// Consistency lint: the declared DecisionId <-> IRPath relation
// (km/decisions-spike fix 1).
//
// Every `decisionIRPaths` key and every module in `questionRegistry` is
// checked, so the relation cannot drift silently:
//   - a decision mapped to `[]` must be on the explicit IR-less allowlist below
//     (so "no IR relation" is a reviewed decision, not a default);
//   - a provider that declares IR `writes` must not provide an id mapped to `[]`;
//   - every mapped path must be a prefix of (or equal to) a path the provider
//     actually writes.

import { describe, it, expect } from "vitest";
import type { IRPath } from "@keyboard-studio/contracts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { QuestionModule } from "../survey/types.ts";
import { decisionIRPaths, type DecisionId } from "./decisionTypes.ts";
import pbCharacterInventory from "../survey/questions/b/pb_character_inventory.ts";

/**
 * Decisions that deliberately have no IR relation (they reach their artifact
 * through `outputs`, the answer store, or a wizard step's own `writes`).
 * Adding an id here is a review decision; mapping it to real paths instead
 * removes it from this list.
 */
const IR_LESS_DECISIONS: ReadonlySet<DecisionId> = new Set<DecisionId>([
  "language-name",
  "language-region",
  "language-autonym",
  "language-code",
  "target-script",
  "author-name",
  "author-email",
  "copyright-holder",
  "character-inventory",
  "authoring-track",
  "reserve-desktop-notice",
  "reserve-language-autonym",
  "reserve-language-region",
  "reserve-writing-direction",
  "reserve-layout-family",
  "reserve-script-family",
  "reserve-primary-target",
  "reserve-author-name",
  "reserve-author-email",
  "reserve-provenance-opt-in",
  "reserve-requester-name",
  "reserve-requester-contact",
  "reserve-requester-affiliation",
  "reserve-requester-relation",
  "reserve-community-rep-name",
  "reserve-community-rep-role",
  "reserve-community-rep-email",
  "reserve-speaker-count",
  "reserve-regions",
  "reserve-language-status",
  "reserve-existing-tools",
  "reserve-orthography-url",
  "reserve-community-involvement",
  "reserve-casing-notes",
  "reserve-additional-notes",
  "text-sample",
  "special-letters",
  "latin-digraphs-wanted",
  "indic-onset-vowels-wanted",
  "syllabic-finals-wanted",
  "help-welcome-paragraph",
  "help-usage-tip-1",
  "help-usage-tip-2",
  "help-history-bullets",
  "help-doc-language",
  "help-doc-language-other",
  "help-doc-language-second",
  "help-doc-language-second-other",
  "help-font-guidance",
  "help-scope-variety",
  "help-provenance-basis",
  "help-canonical-order",
  "help-script-glossary",
  "help-example-words",
  "help-troubleshooting",
  "help-related-keyboards",
  "help-known-limitations",
  "help-further-reading",
  "help-project-url",
  "help-credits",
  "help-contact-info",
  "additional-methods",
  "azerty-qz-swap",
  "char-count",
  "co-installed-keyboards",
  "contact-language",
  "digit-set",
  "discovery-intro",
  "existing-keyboards",
  "help-design-rationale",
  "help-history-entry",
  "help-more-detail",
  "help-usage-tip-3",
  "help-usage-tip-4",
  "help-usage-tip-5",
  "indic-conjuncts-wanted",
  "indic-nukta-detail",
  "indic-nukta-wanted",
  "indic-onset-vowels-list",
  "indic-pre-base-vowels",
  "indic-virama",
  "indic-vowels-separate",
  "ip1-keep-strategies",
  "ip2-keep-device-targets",
  "ip3-keep-script-conventions",
  "latin-azerty-branch",
  "latin-digraphs-list",
  "latin-qwerty-branch",
  "legacy-encoding",
  "linguist-confirm",
  "mark-input-order",
  "non-roman-branch",
  "other-free-entry",
  "picker-confirm",
  "punctuation-list",
  "punctuation-wanted",
  "rtl-direction-confirm",
  "rtl-short-vowels",
  "rtl-special-letters",
  "sa1-target-script-spread",
  "sa2-base-script-mismatch",
  "sa3-latin-flavor",
  "sea-medials",
  "sea-stacked-consonants",
  "spare-keys-azerty",
  "spare-keys-qwerty",
  "special-letters-notes",
  "special-letters-wanted",
  "syllabic-finals-list",
  "syllabic-grid",
  "syllabic-note",
  "text-sample-review",
  "tp1-confidence-threshold",
  "tp2-fallback-tier-prefill",
  "tp3-orthography-join",
  "typing-approach",
  "use-case",
  "windows-layout",
  "base-keyboard",
  "marks-treatment",
  "punctuation-inventory",
  "invisibles-inventory",
  "retained-convenience-chars",
  "carved-layout",
  "deadkeys-defined",
  "rule-set",
  "physical-layout",
  "touch-seed-source",
  "touch-layout",
  "help-docs",
]);

/** Path segments are strings or objects (e.g. `{ kind: "[]" }`): compare structurally. */
const sameSegment = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** True when `mapped` is a prefix of (or equal to) some declared write. */
function isCoveredBy(writes: readonly IRPath[], mapped: IRPath): boolean {
  return writes.some(
    (w) => mapped.length <= w.length && mapped.every((seg, i) => sameSegment(seg, w[i])),
  );
}

/** Every provider in play: the registry plus pb_character_inventory (registered nowhere else). */
function allModules(): QuestionModule[] {
  return [...Object.values(questionRegistry), pbCharacterInventory];
}

const MAPPED_IDS = (Object.keys(decisionIRPaths) as DecisionId[]).filter(
  (id) => decisionIRPaths[id].length > 0,
);

describe("decisionIRPaths consistency", () => {
  describe.each(Object.keys(decisionIRPaths) as DecisionId[])("decision %s", (id) => {
    it("is either mapped to IR paths or on the IR-less allowlist, never both", () => {
      const mapped = decisionIRPaths[id].length > 0;
      expect(
        IR_LESS_DECISIONS.has(id),
        mapped
          ? `"${id}" is mapped to IR paths; remove it from IR_LESS_DECISIONS`
          : `"${id}" maps to [] but is not on the IR_LESS_DECISIONS allowlist`,
      ).toBe(!mapped);
    });
  });

  it("the allowlist names only real decisions", () => {
    for (const id of IR_LESS_DECISIONS) {
      expect(Object.prototype.hasOwnProperty.call(decisionIRPaths, id), id).toBe(true);
    }
  });

  describe.each(allModules().map((m) => [m.definition.id, m] as const))("%s", (_id, mod) => {
    it("provides no id mapped to [] while declaring IR writes", () => {
      if (mod.writes.length === 0) return;
      for (const p of mod.provides ?? []) {
        expect(
          decisionIRPaths[p].length,
          `${mod.definition.id} declares writes ${JSON.stringify(mod.writes)} but its ` +
            `decision "${p}" maps to [] in decisionIRPaths`,
        ).toBeGreaterThan(0);
      }
    });

    it("declares writes covering every mapped path of the decisions it provides", () => {
      for (const p of mod.provides ?? []) {
        for (const path of decisionIRPaths[p]) {
          expect(
            isCoveredBy(mod.writes, path),
            `${mod.definition.id} provides "${p}" mapped to ${JSON.stringify(path)} ` +
              `but never writes it (writes: ${JSON.stringify(mod.writes)})`,
          ).toBe(true);
        }
      }
    });
  });

  it("every IR-mapped decision has a provider that writes it", () => {
    const providers = allModules();
    for (const id of MAPPED_IDS) {
      const owner = providers.find((m) => (m.provides ?? []).includes(id));
      expect(owner, `no module provides IR-mapped decision "${id}"`).toBeDefined();
      expect(owner!.writes.length, `${owner!.definition.id} provides "${id}" but declares no writes`).toBeGreaterThan(0);
    }
  });

  it("isCoveredBy detects a real mismatch (guardrail sanity)", () => {
    expect(isCoveredBy([["header", "bcp47"]], ["header"])).toBe(true);
    expect(isCoveredBy([["header", "bcp47"]], ["header", "bcp47"])).toBe(true);
    expect(isCoveredBy([["header"]], ["header", "bcp47"])).toBe(false);
    expect(isCoveredBy([], ["header"])).toBe(false);
    expect(isCoveredBy([["stores", { kind: "[]" }]], ["stores", { kind: "[]" }])).toBe(true);
  });
});
