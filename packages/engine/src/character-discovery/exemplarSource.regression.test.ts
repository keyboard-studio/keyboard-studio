/**
 * Regression floor for spec 044 SC-006 / obligation T12.
 *
 * The feature widens exemplar coverage; it must not narrow it. Every locale
 * that produced a non-fallback seed on the PRE-feature CLDR-only path must
 * still produce one through the new sourcing path.
 *
 * The baseline fixture (`__fixtures__/cldr-baseline.json`) is the captured
 * pre-feature corpus — see its `_comment` for exactly how it was derived.
 *
 * This test has caught real losses. Before variant and private-use subtags
 * were preserved in the candidate ladder, `be-tarask`, `ca-ES-valencia` and
 * `el-polyton` each collapsed onto their base locale and vanished — and worse,
 * silently overwrote the base locale's alphabet with a different orthography's.
 */

import { beforeAll, describe, it, expect } from "vitest";
import baseline from "./__fixtures__/cldr-baseline.json" with { type: "json" };
import { loadExemplarSource, sourceExemplars } from "./exemplarSource.js";
import { loadExemplarIndex } from "./exemplarIndex.js";

beforeAll(async () => {
  await loadExemplarSource();
});

describe("no locale loses its pre-feature seed (obligation T12, SC-006)", () => {
  it("the baseline fixture is non-trivial", () => {
    // Guards against a truncated or accidentally-emptied fixture quietly
    // turning this whole suite into a no-op.
    expect(baseline.locales.length).toBe(baseline.count);
    expect(baseline.locales.length).toBeGreaterThan(700);
  });

  it("every baseline locale is present in the committed index", async () => {
    const index = await loadExemplarIndex();
    const missing = baseline.locales.filter((id) => index.locales[id] === undefined);
    expect(missing).toEqual([]);
  });

  it("every baseline locale still resolves to a non-null inventory", () => {
    const lost = baseline.locales.filter((id) => sourceExemplars(id) === null);
    expect(lost).toEqual([]);
  });

  it("every baseline locale still resolves from CLDR, not silently from SLDR", () => {
    // Precedence (R5) says CLDR wins where it covers the tag. A baseline locale
    // resolving to SLDR would mean its CLDR side went missing from the index.
    const wrongSource = baseline.locales
      .map((id) => ({ id, inv: sourceExemplars(id) }))
      .filter(({ inv }) => inv !== null && inv.source !== "cldr")
      .map(({ id }) => id);
    expect(wrongSource).toEqual([]);
  });

  it("every baseline locale still yields a non-empty main tier", () => {
    const empty = baseline.locales.filter((id) => {
      const inv = sourceExemplars(id);
      return inv === null || !inv.characters.some((c) => c.tier === "main");
    });
    expect(empty).toEqual([]);
  });

  it("resolves each baseline locale to itself, not to a less specific ancestor", () => {
    // `be-tarask` resolving to `be` would be a silent orthography swap, which
    // reads as "still seeded" to a naive null check.
    const drifted = baseline.locales
      .map((id) => ({ id, inv: sourceExemplars(id) }))
      .filter(({ id, inv }) => inv !== null && inv.resolvedTag !== id)
      .map(({ id, inv }) => `${id} -> ${inv!.resolvedTag}`);
    expect(drifted).toEqual([]);
  });
});

describe("coverage grew (SC-003)", () => {
  it("the index covers substantially more locales than the CLDR-only baseline", async () => {
    const index = await loadExemplarIndex();
    expect(Object.keys(index.locales).length).toBeGreaterThan(baseline.locales.length * 2);
  });

  it("SLDR contributes languages CLDR does not cover at all", async () => {
    const index = await loadExemplarIndex();
    const sldrOnly = Object.entries(index.locales).filter(([, e]) => e.c === undefined);
    expect(sldrOnly.length).toBeGreaterThan(1000);
    // And they actually resolve, rather than merely sitting in the artifact.
    for (const [id] of sldrOnly.slice(0, 50)) {
      const inv = sourceExemplars(id);
      expect(inv, `expected ${id} to resolve`).not.toBeNull();
      expect(inv!.source).toBe("sldr");
    }
  });
});
