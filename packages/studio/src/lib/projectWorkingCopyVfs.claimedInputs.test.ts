// projectWorkingCopyVfs step 1 (spec 106 US4, FR-040): the starting rules a
// session assignment shadows are dropped, per projection only.

import { describe, expect, it } from "vitest";
import { createVirtualFS, makePattern } from "@keyboard-studio/contracts";
import type { FallbackPolicy, MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";

import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";

const KMN = [
  "store(&NAME) 'Projected'",
  "store(&VERSION) '14.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [SHIFT K_A] > 'A'",
  "+ [K_QUOTE] > U+0027",
  "'x' + [K_QUOTE] > 'y'",
  "",
].join("\n");

const SWAP: Pattern = makePattern({
  id: "simple_swap",
  title: "simple_swap",
  description: "simple_swap",
  category: "desktop",
  appliesTo: [],
  questions: [{ id: "kmnRules", prompt: "kmnRules", answerType: "text" as const }],
  kmnFragment: "{{kmnRules}}\n",
  tests: [],
  validatedForFamilies: [],
  sourceKeyboards: [],
  reviewedBy: "",
  reviewDate: "2026-10-29",
});

function swap(kmnRules: string): MechanismAssignment {
  return {
    scope: "individual",
    target: "x",
    modality: "physical",
    mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules } }],
    source: "user",
  };
}

function project(assignments: MechanismAssignment[], fallbackPolicy?: FallbackPolicy): string {
  const vfs = createVirtualFS();
  vfs.set("source/projected.kmn", KMN, false);
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "projected",
    startIr: parseKmn(KMN, "projected").ir,
    deletedNodeIds: new Set(),
    assignments,
    getPattern: (id) => (id === SWAP.id ? SWAP : undefined),
    identity: null,
    ...(fallbackPolicy !== undefined ? { fallbackPolicy } : {}),
  });
  const entry = vfs.get("source/projected.kmn");
  return typeof entry?.content === "string" ? entry.content : "";
}

const lines = (kmn: string): string[] => kmn.split(/\r?\n/).map((l) => l.trim());

describe("projectWorkingCopyVfs — claimed inputs (spec 106 US4)", () => {
  it("drops the starting rule an assignment shadows, keeping Shift and contextual rules", () => {
    const out = lines(project([swap("+ [K_QUOTE] > U+2019")]));
    expect(out).toContain("+ [K_QUOTE] > U+2019");
    expect(out).not.toContain("+ [K_QUOTE] > U+0027");
    // A carve re-emit writes characters in U+ notation.
    expect(out).toContain("+ [SHIFT K_A] > U+0041");
    expect(out).toContain("U+0078 + [K_QUOTE] > U+0079");
  });

  it("restores the starting rule when the assignment is removed", () => {
    expect(lines(project([]))).toContain("+ [K_QUOTE] > U+0027");
  });

  it("keeps an assignment line identical to the starting rule it replaces", () => {
    const out = lines(project([swap("+ [K_QUOTE] > U+0027")]));
    expect(out.filter((l) => l === "+ [K_QUOTE] > U+0027")).toHaveLength(1);
  });

  it("is a plain removal under a fallback policy, never a suppression rule", () => {
    const out = lines(project([swap("+ [K_QUOTE] > U+2019")], "swallow"));
    expect(out.filter((l) => l.startsWith("+ [K_QUOTE] >"))).toEqual(["+ [K_QUOTE] > U+2019"]);
  });
});
