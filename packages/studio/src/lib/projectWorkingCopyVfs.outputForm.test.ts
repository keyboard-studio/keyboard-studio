// projectWorkingCopyVfs step 2 (spec 106 US3, FR-020..FR-023): the recorded
// output form and the mark attachment matrix reach the engine, and a
// projection-time uniformity scan warns on wrong-form text the assignments
// introduced (plan P2.4).

import { describe, expect, it } from "vitest";
import { createVirtualFS, makePattern } from "@keyboard-studio/contracts";
import type { MechanismAssignment, OutputForm, Pattern } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";

import { projectWorkingCopyVfs, type MarksGuardsInput } from "./projectWorkingCopyVfs.ts";
import { formViolations, outputFormWarning } from "./outputFormUniformity.ts";

const CARON = "̌";

const KMN = [
  "store(&NAME) 'Projected'",
  "store(&VERSION) '14.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "",
].join("\n");

function pattern(id: string, questions: string[], kmnFragment: string): Pattern {
  return makePattern({
    id,
    title: id,
    description: id,
    category: "desktop",
    appliesTo: [],
    questions: questions.map((q) => ({ id: q, prompt: q, answerType: "text" as const })),
    kmnFragment,
    tests: [],
    validatedForFamilies: [],
    sourceKeyboards: [],
    reviewedBy: "",
    reviewDate: "2026-10-29",
  });
}

const SWAP = pattern("simple_swap", ["kmnRules"], "{{kmnRules}}\n");
// An id the seam does not know, so it passes through unrewritten.
const LITERAL = pattern("literal_rule", ["kmnRules"], "{{kmnRules}}\n");
const patterns = new Map([SWAP, LITERAL].map((p) => [p.id, p]));

function assign(patternId: string, rules: string): MechanismAssignment {
  return {
    scope: "individual",
    target: "ǒ",
    modality: "physical",
    mechanisms: [{ patternId, strategyId: "S-01", slotValues: { kmnRules: rules } }],
    source: "user",
  };
}

function guards(outputForm: OutputForm): MarksGuardsInput {
  return {
    worklist: {
      ownLetterUnits: ["o"],
      markUnits: [{ mark: CARON, inputOrder: "postfix" }],
      blockedCombinations: [],
    },
    outputForm,
  };
}

function project(assignments: MechanismAssignment[], marksGuards: MarksGuardsInput | null) {
  const vfs = createVirtualFS();
  vfs.set("source/projected.kmn", KMN, false);
  const result = projectWorkingCopyVfs({
    vfs,
    keyboardId: "projected",
    startIr: parseKmn(KMN, "projected").ir,
    deletedNodeIds: new Set(),
    assignments,
    getPattern: (id) => patterns.get(id),
    identity: null,
    marksGuards,
  });
  const entry = vfs.get("source/projected.kmn");
  return { kmn: typeof entry?.content === "string" ? entry.content : "", warnings: result.warnings };
}

describe("projectWorkingCopyVfs — output form (spec 106 US3)", () => {
  it("rewrites an S-01 output into the recorded form and raises no warning", () => {
    const { kmn, warnings } = project([assign("simple_swap", "+ [K_Q] > U+01D2")], guards("base-plus-mark"));
    expect(kmn).toContain("+ [K_Q] > U+006F U+030C");
    expect(warnings.filter((w) => w.includes("output form"))).toEqual([]);
  });

  it("leaves output alone with no marks decision", () => {
    const { kmn, warnings } = project([assign("simple_swap", "+ [K_Q] > U+01D2")], null);
    expect(kmn).toContain("+ [K_Q] > U+01D2");
    expect(warnings.filter((w) => w.includes("output form"))).toEqual([]);
  });

  it("warns when generated text is in the wrong form", () => {
    const { warnings } = project([assign("literal_rule", "+ [K_Q] > U+01D2")], guards("base-plus-mark"));
    expect(warnings.some((w) => w.startsWith("[project-working-copy] output form base-plus-mark") && w.includes("U+01D2"))).toBe(true);
  });

  it("warns under ready-made on a decomposed run, and not on the start keyboard's own text", () => {
    const { warnings } = project([assign("literal_rule", "+ [K_Q] > U+006F U+030C")], guards("ready-made"));
    expect(warnings.some((w) => w.includes("output form ready-made") && w.includes("U+006F U+030C"))).toBe(true);
  });
});

describe("formViolations / outputFormWarning", () => {
  const kmn = (rule: string) => `${KMN}${rule}\n`;

  it("flags precomposed text under base-plus-mark and decomposed text under ready-made", () => {
    expect([...formViolations(kmn("+ [K_Q] > U+01D2"), "projected", "base-plus-mark")]).toEqual(["ǒ"]);
    expect([...formViolations(kmn("+ [K_Q] > U+006F U+030C"), "projected", "ready-made")]).toEqual([
      `o${CARON}`,
    ]);
    expect(formViolations(kmn("+ [K_Q] > U+006F U+030C"), "projected", "base-plus-mark").size).toBe(0);
  });

  it("blames only runs the assignments introduced", () => {
    const before = new Set(["ǒ"]);
    expect(outputFormWarning(before, new Set(["ǒ"]), "base-plus-mark")).toBeUndefined();
    expect(outputFormWarning(before, new Set(["ǒ", "ǎ"]), "base-plus-mark")).toContain("U+01CE");
  });
});
