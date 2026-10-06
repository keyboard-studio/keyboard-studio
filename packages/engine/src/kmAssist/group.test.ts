/**
 * kmAssist rule-family tests — spec 082 FR-018 (Track C read-only v1).
 *
 * groupRules() over the sil_cameroon_qwerty fixture: the 36 diablock rules
 * form ONE family, the composed/backspace rule its own family, the beep
 * rules group together; explanations are non-empty and honest (no invented
 * semantics); opaque rules land in the single "Other rules" family.
 * The fixture copy lives in __fixtures__/ so these tests are hermetic.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../codec/parse.js";
import type { IRRule } from "@keyboard-studio/contracts";
import { classifyRuleKind } from "./classify.js";
import { groupRules, type RuleFamily } from "./group.js";
// The ./kmAssist subpath surface workstream 2 builds against.
import { groupRules as groupRulesFromIndex } from "./index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.kmn");

function loadFixtureRules(): IRRule[] {
  const src = readFileSync(FIXTURE_PATH, "utf-8");
  const { ir } = parse(src, "sil_cameroon_qwerty");
  return ir.groups.flatMap((g) => g.rules);
}

function mustFindFamily(families: RuleFamily[], id: string): RuleFamily {
  const found = families.find((f) => f.id === id);
  if (found === undefined) throw new Error(`family not found: ${id}`);
  return found;
}

describe("groupRules — sil_cameroon_qwerty families", () => {
  const rules = loadFixtureRules();
  const families = groupRules(rules);

  it("is exported from the kmAssist index (workstream 2 surface)", () => {
    expect(groupRulesFromIndex).toBe(groupRules);
  });

  it("partitions every fixture rule into exactly one family", () => {
    const allIds = families.flatMap((f) => f.memberIds);
    expect(allIds).toHaveLength(rules.length);
    expect(new Set(allIds).size).toBe(rules.length);
    const inputIds = new Set(rules.map((r) => r.nodeId));
    for (const id of allIds) expect(inputIds.has(id)).toBe(true);
    for (const f of families) expect(f.memberIds).toHaveLength(f.count);
  });

  it("groups the 36 diablock rules into ONE 'Diacritic blocking' family", () => {
    const diablockFamilies = families.filter((f) => f.guardStore === "diablock");
    expect(diablockFamilies).toHaveLength(1);
    const f = diablockFamilies[0]!;
    expect(f.id).toBe("guard:diablock>context");
    expect(f.name).toBe("Diacritic blocking");
    expect(f.count).toBe(36);
    expect(f.kind).toBe("blocking");
    expect(f.outputShape).toBe("context");
    expect(f.patternSummary).toBe("any(diablock) + key > context");
    expect(f.sampleRuleTexts).toHaveLength(3);
    expect(f.sampleRuleTexts[0]).toBe("any(diablock) + [RALT K_C] > context");
    for (const text of f.sampleRuleTexts) {
      expect(text).toContain("any(diablock)");
      expect(text.endsWith("> context")).toBe(true);
    }
  });

  it("gives the composed/backspace rule its own family", () => {
    const f = mustFindFamily(families, "guard:composed>indexed");
    expect(f.name).toBe("Composed-character unwrap");
    expect(f.count).toBe(1);
    expect(f.guardStore).toBe("composed");
    expect(f.kind).toBe("context");
    expect(f.outputShape).toBe("indexed");
    expect(f.patternSummary).toBe("any(composed) + key > indexed");
    expect(f.sampleRuleTexts).toHaveLength(1);
    expect(f.sampleRuleTexts[0]).toContain("any(composed)");
    expect(f.sampleRuleTexts[0]).toContain("index(comp-dia");
  });

  it("groups all beep rules into one 'Dead combinations' family", () => {
    const beepRules = rules.filter((r) =>
      r.output.length > 0 && r.output.every((el) => el.kind === "beep"),
    );
    expect(beepRules.length).toBeGreaterThan(1);
    const beepFamilies = families.filter((f) => f.id === "guard:none>beep");
    expect(beepFamilies).toHaveLength(1);
    const f = beepFamilies[0]!;
    expect(f.name).toBe("Dead combinations");
    expect(f.count).toBe(beepRules.length);
    expect(f.guardStore).toBeUndefined();
    expect(f.kind).toBe("blocking");
    expect(f.outputShape).toBe("beep");
    expect(f.patternSummary).toBe("key > beep");
    expect(f.sampleRuleTexts[0]).toBe("+ [SHIFT RALT K_1] > beep");
  });

  it("keeps the lone nul rule as a singleton family", () => {
    const f = mustFindFamily(families, "guard:none>nul");
    expect(f.count).toBe(1);
    expect(f.kind).toBe("blocking");
    expect(f.sampleRuleTexts).toEqual(["+ [T_CAM] > nul"]);
  });

  it("buckets opaque rules (e.g. match > use) into one 'Other rules' family", () => {
    const opaqueRules = rules.filter((r) => classifyRuleKind(r) === "opaque");
    expect(opaqueRules.length).toBeGreaterThan(0);
    const otherFamilies = families.filter((f) => f.kind === "opaque");
    expect(otherFamilies).toHaveLength(1);
    const f = otherFamilies[0]!;
    expect(f.id).toBe("other:opaque");
    expect(f.name).toBe("Other rules");
    expect(f.outputShape).toBe("mixed");
    expect(f.guardStore).toBeUndefined();
    expect(f.count).toBe(opaqueRules.length);
    for (const r of opaqueRules) expect(f.memberIds).toContain(r.nodeId);
    // The group-transition rule keeps its honest, non-invented rendering.
    expect(f.sampleRuleTexts.some((t) => t.includes("match > use(deadkeys)"))).toBe(true);
  });

  it("every family explanation is non-empty and honest", () => {
    for (const f of families) {
      expect(f.explanation.length).toBeGreaterThan(0);
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.patternSummary.length).toBeGreaterThan(0);
      for (const text of f.sampleRuleTexts) {
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
      }
      if (f.kind !== "opaque") {
        // Typed families never claim ignorance; the Other family owns that.
        expect(f.explanation).not.toContain("doesn't recognise");
      }
    }
    const other = mustFindFamily(families, "other:opaque");
    expect(other.explanation).toContain("shown as written");
  });

  it("diablock explanation is generalized from the explain.ts catalogue", () => {
    const f = mustFindFamily(families, "guard:diablock>context");
    expect(f.explanation).toContain("a character from the “diablock” store");
    expect(f.explanation).toContain("keeping the existing text");
    expect(f.explanation).toContain("All 36 rules in this family follow the same pattern");
    expect(f.explanation).toContain("They differ only in the struck key.");
  });

  it("composed explanation names the guard and the index store", () => {
    const f = mustFindFamily(families, "guard:composed>indexed");
    expect(f.explanation).toContain("a character from the “composed” store");
    expect(f.explanation).toContain("comp-dia");
    expect(f.explanation).toContain("Backspace");
  });

  it("is a pure function: no input mutation, deterministic output", () => {
    const before = JSON.stringify(rules);
    const first = groupRules(rules);
    const second = groupRules(rules);
    expect(JSON.stringify(rules)).toBe(before);
    expect(second).toEqual(first);
  });

  it("empty input yields no families", () => {
    expect(groupRules([])).toEqual([]);
  });
});

describe("groupRules — synthetic edge cases", () => {
  const vkeyRule = (nodeId: string, store: string): IRRule => ({
    nodeId,
    context: [
      { kind: "any", storeRef: store },
      { kind: "vkey", name: "K_A", modifiers: [] },
    ],
    output: [{ kind: "index", storeRef: "s", offset: 1 }],
  });

  it("splits one (guard, shape) pair by kind so `kind` stays truthful", () => {
    const contextKind = vkeyRule("rule#a", "x");
    const reorderKind: IRRule = {
      nodeId: "rule#b",
      context: [{ kind: "any", storeRef: "x" }],
      output: [{ kind: "raw", text: "context(1)" }],
    };
    expect(classifyRuleKind(contextKind)).toBe("context");
    expect(classifyRuleKind(reorderKind)).toBe("reorder");
    const families = groupRules([contextKind, reorderKind]);
    expect(families).toHaveLength(2);
    // First-appearance order; the kind refinement disambiguates the id.
    expect(families[0]!.id).toBe("guard:x>indexed");
    expect(families[0]!.kind).toBe("context");
    expect(families[1]!.id).toBe("guard:x>indexed:reorder");
    expect(families[1]!.kind).toBe("reorder");
  });

  it("notany guards get their own store-qualified id and guardStore", () => {
    const rule: IRRule = {
      nodeId: "rule#n",
      context: [
        { kind: "notany", storeRef: "y" },
        { kind: "vkey", name: "K_B", modifiers: [] },
      ],
      output: [{ kind: "raw", text: "nul" }],
    };
    const [f] = groupRules([rule]);
    expect(f!.id).toBe("guard:notany:y>nul");
    expect(f!.guardStore).toBe("y");
    expect(f!.name).toBe("“y” key suppression");
    expect(f!.patternSummary).toBe("notany(y) + key > nul");
  });

  it("synthetic opaque rules land in 'Other rules'", () => {
    const rule: IRRule = {
      nodeId: "rule#o",
      context: [{ kind: "raw", text: "if(foo)" }],
      output: [{ kind: "raw", text: "nul" }],
    };
    expect(classifyRuleKind(rule)).toBe("opaque");
    const [f] = groupRules([rule]);
    expect(f!.id).toBe("other:opaque");
    expect(f!.memberIds).toEqual(["rule#o"]);
  });

  it("sample texts render keys-group rules with `+` and keyless rules without", () => {
    const keyed = vkeyRule("rule#k", "x");
    const keyless: IRRule = {
      nodeId: "rule#d",
      context: [
        { kind: "deadkey", id: 0x3b },
        { kind: "any", storeRef: "dkf003b" },
      ],
      output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
    };
    const families = groupRules([keyed, keyless]);
    const keyedFam = families.find((f) => f.memberIds.includes("rule#k"))!;
    const keylessFam = families.find((f) => f.memberIds.includes("rule#d"))!;
    expect(keyedFam.sampleRuleTexts[0]!.startsWith("+ ")).toBe(true);
    expect(keylessFam.sampleRuleTexts[0]).toBe("dk(003b) any(dkf003b) > index(dkt003b, 2)");
    // Multi-guard families fall back to the pattern summary as their name.
    expect(keylessFam.name).toBe("dk(003b) + any(dkf003b) > indexed");
  });
});
