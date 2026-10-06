import { describe, it, expect } from "vitest";
import { emit } from "../../codec/emit.js";
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

  it("keeps a user store that shares the generated prefix, through apply and replay", async () => {
    const kmn = ALTERNATES_KMN.replace(
      "group(main) using keys\n",
      "store(generated_cn_0) 'ae'\nstore(out) 'AE'\n\ngroup(main) using keys\n\nany(generated_cn_0) + 'q' > index(out,1)\n",
    );
    const ir = parseFixture(kmn);
    const step = await stepOf(ir);
    expect(step.stores.map((s) => s.name)).not.toContain("generated_cn_0");
    const once = applyNormalizationStep(ir, step);
    // Overlay replay: the projection is re-parsed, then the step applied again.
    const replayed = applyNormalizationStep(parseFixture(emit(once)), step);
    for (const out of [once, replayed, removeNormalizationStep(replayed)]) {
      expect(out.stores.find((s) => s.name === "generated_cn_0")?.items).toEqual(
        ir.stores.find((s) => s.name === "generated_cn_0")?.items,
      );
    }
    expect(emit(removeNormalizationStep(replayed))).toBe(emit(ir));
  });

  it("leaves a user group that only shares the generated name", () => {
    const kmn = ALTERNATES_KMN.replace(
      "group(main) using keys\n",
      `group(${NORMALIZATION_GROUP})\n\n'x' > 'y'\n\ngroup(main) using keys\n`,
    );
    const ir = parseFixture(kmn);
    expect(removeNormalizationStep(ir)).toBe(ir);
  });
});
