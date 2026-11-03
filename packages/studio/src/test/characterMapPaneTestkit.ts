// Shared fixtures for the CharacterMapPane.*.test.tsx files. The vi.mock /
// vi.hoisted blocks are NOT shared here: they hoist per test file.
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRGroup } from "@keyboard-studio/contracts";
import type { CharacterMapGroup } from "../lib/services.ts";

// Combining acute accent, U+0301 — a genuine standalone combining mark (not
// attached to a base letter), the case CharacterMapPane's dotted-circle
// rendering exists for.
export const COMBINING_ACUTE = "́";

export function twoGroupFixture(): CharacterMapGroup[] {
  return [
    {
      block: "Latin",
      tier: "main",
      script: "Latn",
      usedByStart: false,
      cells: [
        { char: "a", isCombiningMark: false },
        { char: "b", isCombiningMark: false },
      ],
    },
    {
      block: "Combining Diacritical Marks",
      tier: "auxiliary",
      script: "Latn",
      usedByStart: false,
      cells: [{ char: COMBINING_ACUTE, isCombiningMark: true }],
    },
  ];
}

export const TEST_BASE = {
  id: "test_kb",
  path: "release/t/test_kb",
  script: "Latn",
  targets: ["windows" as const],
  displayName: "Test",
  version: "1.0",
};

/** Record the identity decisions a completed identity step records (spec 089:
 * the survey context / scaffold spec are derived from these, never seeded
 * into the session store directly). */
export function seedIdentityDecisions(languageCode: string, languageName: string): void {
  const record = useDecisionStore.getState().record;
  record({ id: "language-name", value: languageName, provenance: "asked" });
  record({ id: "language-autonym", value: languageName, provenance: "asked" });
  record({ id: "language-code", value: languageCode, provenance: "asked" });
  record({ id: "target-script", value: "Latn", provenance: "asked" });
}

export function seedStartAndLanguage(bcp47 = "yo", languageName = "Yoruba"): void {
  useWorkingCopyStore.getState().instantiateFromStart(TEST_BASE, {
    vfs: { files: new Map() } as never,
    ir: makeTestIR([]),
  });
  seedIdentityDecisions(bcp47.split("-")[0]!, languageName);
}

/** Seed a base whose IR PRODUCES the given glyphs (one rule per char). */
export function seedStartProducing(produced: string[], bcp47 = "yo", languageName = "Yoruba"): void {
  const rules = produced.map((c, i) => ({
    nodeId: `rule#${i}`,
    context: [{ kind: "vkey" as const, name: "K_A", modifiers: [] }],
    output: [{ kind: "char" as const, value: c.normalize("NFC") }],
  }));
  const group: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, readonly: false, rules };
  useWorkingCopyStore.getState().instantiateFromStart(TEST_BASE, {
    vfs: { files: new Map() } as never,
    ir: makeTestIR([group]),
  });
  seedIdentityDecisions(bcp47.split("-")[0]!, languageName);
}
