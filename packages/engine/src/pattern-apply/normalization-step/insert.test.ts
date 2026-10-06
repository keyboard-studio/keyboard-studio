import { describe, it, expect } from "vitest";
import { emit } from "../../codec/emit.js";
import { parse } from "../../codec/parse.js";
import { NORMALIZATION_GROUP, NORMALIZATION_STORE_PREFIX } from "./constants.js";
import { ALTERNATES_KMN, parseFixture } from "../__fixtures__/normalization.js";
import { applyNormalizationStep, removeNormalizationStep } from "./insert.js";
import { proposeNormalizationStep } from "./index.js";

async function stepOf(ir = parseFixture(ALTERNATES_KMN)) {
  const r = await proposeNormalizationStep(ir);
  if (r.kind !== "step") throw new Error(`expected a step, got refusal ${r.reason}`);
  return r.step;
}

describe("applyNormalizationStep / removeNormalizationStep", () => {
  it("G3: remove(apply(ir)) emits byte-identical to ir", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const step = await stepOf(ir);
    expect(emit(removeNormalizationStep(applyNormalizationStep(ir, step)))).toBe(emit(ir));
  });

  it("G4: applying twice yields one group", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const step = await stepOf(ir);
    const twice = applyNormalizationStep(applyNormalizationStep(ir, step), step);
    expect(twice.groups.filter((g) => g.name === NORMALIZATION_GROUP)).toHaveLength(1);
    expect(emit(twice)).toBe(emit(applyNormalizationStep(ir, step)));
  });

  it("G5: only one non-keys group, generated_cn_* stores and entryPoints.main change", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const step = await stepOf(ir);
    const out = applyNormalizationStep(ir, step);
    expect(out.groups.slice(0, ir.groups.length)).toEqual(ir.groups);
    expect(out.groups).toHaveLength(ir.groups.length + 1);
    const added = out.groups.at(-1);
    expect(added?.name).toBe(NORMALIZATION_GROUP);
    expect(added?.usingKeys).toBe(false);
    expect(out.stores.slice(0, ir.stores.length)).toEqual(ir.stores);
    expect(out.stores.slice(ir.stores.length).every((s) => s.name.startsWith(NORMALIZATION_STORE_PREFIX))).toBe(true);
    expect(out.header.entryPoints?.main).toBe(NORMALIZATION_GROUP);
    expect({ ...out.header, entryPoints: undefined }).toEqual({ ...ir.header, entryPoints: undefined });
    expect(out.raw).toEqual(ir.raw);
    expect(emit(out)).toContain(`begin Unicode > use(${NORMALIZATION_GROUP})`);
  });

  it("takes the entry from entryPoints.main, not the first keys group", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const aux = { ...ir.groups[0]!, nodeId: "aux", name: "aux" };
    const two = { ...ir, groups: [aux, ...ir.groups], header: { ...ir.header, entryPoints: { main: "main" } } };
    const step = await stepOf(two);
    expect(step.originalEntry).toBe("main");
    const out = applyNormalizationStep(two, step);
    expect(removeNormalizationStep(out).header.entryPoints?.main).toBe("main");
  });

  it("the group ends match > use(X) and nomatch > use(X)", async () => {
    const step = await stepOf();
    const tail = step.rules.slice(-2);
    expect(tail.map((r) => r.matchKind)).toEqual(["match", "nomatch"]);
    for (const r of tail) expect(r.output).toEqual([{ kind: "useGroup", groupName: "main" }]);
  });

  it("removeNormalizationStep is a no-op on an IR without a step", () => {
    const ir = parseFixture(ALTERNATES_KMN);
    expect(removeNormalizationStep(ir)).toBe(ir);
  });

  it("keeps an implicit entryPoints.main implicit and restores header deep-equal", async () => {
    const parsed = parseFixture(ALTERNATES_KMN);
    const { entryPoints: _e, ...headerNoEntry } = parsed.header;
    const ir = { ...parsed, header: headerNoEntry };
    const step = await stepOf(parsed);
    const back = removeNormalizationStep(applyNormalizationStep(ir, step));
    expect(back.header).toEqual(ir.header);
    expect("entryPoints" in back.header).toBe(false);
    // An explicit main (what the parser always records) stays explicit.
    const explicit = removeNormalizationStep(applyNormalizationStep(parsed, step));
    expect(explicit.header).toEqual(parsed.header);
    expect(back.groups).toEqual(ir.groups);
    expect(back.stores).toEqual(ir.stores);
    expect(back.comments).toEqual(ir.comments);
  });

  it("with no nomatch rule, main never points at the deleted group", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const step = await stepOf(ir);
    const out = applyNormalizationStep(ir, step);
    const stripped = {
      ...out,
      groups: out.groups.map((g) =>
        g.name === NORMALIZATION_GROUP
          ? { ...g, rules: g.rules.filter((r) => r.matchKind === undefined) }
          : g,
      ),
    };
    const back = removeNormalizationStep(stripped, "main");
    expect(back.header.entryPoints?.main).not.toBe(NORMALIZATION_GROUP);
    expect(back.groups.some((g) => g.name === NORMALIZATION_GROUP)).toBe(false);
    expect(emit(back)).toContain("begin Unicode > use(main)");
    // Without a recorded entry either, it falls back to the implicit entry.
    expect(removeNormalizationStep(stripped).header.entryPoints?.main).toBeUndefined();
    // An explicit recorded entry that differs from the implicit one is kept.
    const two = { ...ir, groups: [{ ...ir.groups[0]!, nodeId: "aux", name: "aux" }, ...ir.groups] };
    const outTwo = applyNormalizationStep(two, { ...step, originalEntry: "main" });
    const strippedTwo = {
      ...outTwo,
      groups: outTwo.groups.map((g) => (g.name === NORMALIZATION_GROUP ? { ...g, rules: [] } : g)),
    };
    expect(removeNormalizationStep(strippedTwo, "main").header.entryPoints?.main).toBe("main");
  });

  it("removes only the stores the step generated, not any generated_cn_ store", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const step = await stepOf(ir);
    const user = { nodeId: "u1", name: `${NORMALIZATION_STORE_PREFIX}mine`, items: [], isSystem: false };
    const withUser = { ...ir, stores: [...ir.stores, user] };
    const back = removeNormalizationStep(applyNormalizationStep(withUser, step));
    expect(back.stores).toEqual(withUser.stores);
  });

  it("emits a generated/do-not-edit header and per-rule comments that round-trip", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const step = await stepOf(ir);
    const text = emit(applyNormalizationStep(ir, step));
    expect(text).toMatch(/^c GENERATED group generated_context_normalize: do not edit\.$/m);
    expect(text).toContain("Regenerate it with Keyboard Studio");
    const lines = text.split("\n");
    const groupAt = lines.findIndex((l) => l.startsWith(`group(${NORMALIZATION_GROUP})`));
    const headerAt = lines.findIndex((l) => l.includes("GENERATED group"));
    expect(headerAt).toBeGreaterThan(groupAt);
    expect(lines.filter((l) => /^c (literal|store-indexed|hand the)/.test(l)).length).toBeGreaterThanOrEqual(step.rules.length - 2);

    const reparsed = parse(text, "fixture").ir;
    expect(reparsed.groups.map((g) => g.name)).toContain(NORMALIZATION_GROUP);
    expect(emit(reparsed)).toBe(text);
    expect(emit(removeNormalizationStep(reparsed))).toBe(emit(ir));
  });
});
