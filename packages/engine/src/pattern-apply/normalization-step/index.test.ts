import { describe, it, expect, vi } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { emit } from "../../codec/emit.js";
import { compile } from "../../compiler/index.js";
import { simulate } from "../../simulator/index.js";
import { ALTERNATES_KMN, NO_ALTERNATES_KMN, parseFixture } from "../__fixtures__/normalization.js";
import {
  NORMALIZATION_GROUP,
  NORMALIZATION_STEP_GENERATOR_VERSION,
  applyNormalizationStep,
  normalizationStepCacheKey,
  proposeNormalizationStep,
} from "./index.js";

vi.mock("../../compiler/index.js", () => ({ compile: vi.fn() }));
vi.mock("../../simulator/index.js", () => ({ simulate: vi.fn() }));

describe("proposeNormalizationStep", () => {
  it("G1: performs no compile and no simulation", async () => {
    const r = await proposeNormalizationStep(parseFixture(ALTERNATES_KMN));
    expect(r.kind).toBe("step");
    expect(compile).not.toHaveBeenCalled();
    expect(simulate).not.toHaveBeenCalled();
  });

  it("G2: two calls emit byte-identical source and the same cache key", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const a = await proposeNormalizationStep(ir);
    const b = await proposeNormalizationStep(ir);
    if (a.kind !== "step" || b.kind !== "step") throw new Error("expected steps");
    expect(emit(applyNormalizationStep(ir, a.step))).toBe(emit(applyNormalizationStep(ir, b.step)));
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("proposes a step with maps, rule count and examples", async () => {
    const r = await proposeNormalizationStep(parseFixture(ALTERNATES_KMN));
    if (r.kind !== "step") throw new Error("expected a step");
    expect(r.step.ruleCount).toBeGreaterThan(0);
    expect(r.step.rules).toHaveLength(r.step.ruleCount + 2);
    expect(r.maps.map((m) => m.to)).toContain("á");
    expect(r.step.examples.length).toBeGreaterThan(0);
    expect(r.step.examples.length).toBeLessThanOrEqual(5);
  });

  it("G6: refuses without touching the IR", async () => {
    const base = parseFixture(ALTERNATES_KMN);
    const snapshot = JSON.stringify(base);

    const ansi: KeyboardIR = { ...base, header: { ...base.header, encoding: "ANSI" } };
    expect(await proposeNormalizationStep(ansi)).toMatchObject({ kind: "refused", reason: "no-unicode-entry" });

    const opaqueEntry: KeyboardIR = { ...base, groups: base.groups.map((g) => ({ ...g, readonly: true })) };
    expect(await proposeNormalizationStep(opaqueEntry)).toMatchObject({ kind: "refused", reason: "opaque-entry" });

    const badStore: KeyboardIR = {
      ...base,
      groups: base.groups.map((g) => ({
        ...g,
        rules: [
          ...g.rules,
          {
            nodeId: "r-missing",
            context: [{ kind: "vkey" as const, name: "K_Z", modifiers: [] }],
            output: [{ kind: "index" as const, storeRef: "no.such.store", offset: 1 }],
          },
        ],
      })),
    };
    expect(await proposeNormalizationStep(badStore)).toMatchObject({ kind: "refused", reason: "opaque-output-store" });

    expect(await proposeNormalizationStep(parseFixture(NO_ALTERNATES_KMN))).toMatchObject({
      kind: "refused",
      reason: "no-alternates",
    });

    const userGroup = parseFixture(
      ALTERNATES_KMN.replace("group(main) using keys\n", `group(${NORMALIZATION_GROUP})\n\n'x' > 'y'\n\ngroup(main) using keys\n`),
    );
    expect(await proposeNormalizationStep(userGroup)).toMatchObject({ kind: "refused", reason: "name-collision" });
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("G7: budgetMs 0 returns time-bound", async () => {
    expect(await proposeNormalizationStep(parseFixture(ALTERNATES_KMN), { budgetMs: 0 })).toMatchObject({
      kind: "refused",
      reason: "time-bound",
    });
  });

  it("examples hold at most 5 entries in a stable order", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const wide: KeyboardIR = {
      ...ir,
      groups: ir.groups.map((g) => ({
        ...g,
        rules: [
          ...g.rules,
          ...["à", "è", "ì", "ò", "ù", "â", "ê"].map((c, i) => ({
            nodeId: `w${i}`,
            context: [{ kind: "vkey" as const, name: `K_${"BCDFGHJ"[i]}`, modifiers: [] }],
            output: [{ kind: "char" as const, value: c }],
          })),
        ],
      })),
    };
    const a = await proposeNormalizationStep(wide);
    const b = await proposeNormalizationStep(wide);
    if (a.kind !== "step" || b.kind !== "step") throw new Error("expected steps");
    expect(a.step.examples).toHaveLength(5);
    expect(a.step.examples).toEqual(b.step.examples);
  });
});

describe("normalizationStepCacheKey", () => {
  it("is stable for the same IR and ends with the generator version", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const k = await normalizationStepCacheKey(ir);
    expect(await normalizationStepCacheKey(ir)).toBe(k);
    expect(k.endsWith(`|${NORMALIZATION_STEP_GENERATOR_VERSION}`)).toBe(true);
  });

  it("ignores an applied step (it is stripped before hashing)", async () => {
    const ir = parseFixture(ALTERNATES_KMN);
    const r = await proposeNormalizationStep(ir);
    if (r.kind !== "step") throw new Error("expected a step");
    expect(await normalizationStepCacheKey(applyNormalizationStep(ir, r.step))).toBe(
      await normalizationStepCacheKey(ir),
    );
  });

  it("changes when one rule changes", async () => {
    const a = await normalizationStepCacheKey(parseFixture(ALTERNATES_KMN));
    const b = await normalizationStepCacheKey(parseFixture(ALTERNATES_KMN.replace("+ [K_O] > U+00F3", "+ [K_O] > U+00F2")));
    expect(a).not.toBe(b);
  });

  it("changes when the generator version changes", async () => {
    vi.resetModules();
    vi.doMock("./constants.js", async (orig) => ({
      ...(await orig<typeof import("./constants.js")>()),
      NORMALIZATION_STEP_GENERATOR_VERSION: "test-bumped",
    }));
    const bumped = await import("./index.js");
    const ir = parseFixture(ALTERNATES_KMN);
    expect(await bumped.normalizationStepCacheKey(ir)).not.toBe(await normalizationStepCacheKey(ir));
    vi.doUnmock("./constants.js");
  });
});
