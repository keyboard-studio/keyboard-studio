/**
 * Base-layout resolution + un-blocked-key detection unit tests (spec 040 T005).
 *
 * Tests the pure helpers in `base-layout.ts` in isolation from the classifier:
 * resolution always resolves the environment-default `kbdus`; `branchesOn`
 * collects `baselayout('...')` guard values; named/remapped/`> nul` vkeys are
 * excluded from `leakedChars` while un-named ones leak; and the touch-only
 * semantics of `hasBaseLayerRuleSurface` vs the full-alphabet `leakedChars`.
 *
 * Fixture IRs are built with the real codec (`parse()`), per house convention.
 */

import { describe, it, expect } from "vitest";

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parse } from "../../packages/engine/src/codec/index.js";
import { US_UNSHIFTED } from "../../packages/engine/src/placement/filters.js";
import {
  DEFAULT_BASELAYOUT,
  resolveBaseLayout,
  namedBaseLayerVkeys,
  hasBaseLayerRuleSurface,
  leakedChars,
  loadBaseLayoutTable,
} from "./base-layout.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026 Test'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;

/** Remaps K_A (Arabic), blocks K_B with `> nul`, leaves K_C..K_Z un-named. */
const REMAP_AND_BLOCK_KMN = `${HEADER}
+ [K_A] > U+0627
+ [K_B] > nul
`;

/** A base-layout branch guard on K_A; K_A is still named (excluded from leak). */
const BRANCH_GUARD_KMN = `${HEADER}
baselayout('azerty') + [K_A] > U+0627
`;

/** Two distinct baselayout('...') guards on different rules — exercises multi-value branchesOn. */
const TWO_BRANCH_GUARDS_KMN = `${HEADER}
baselayout('azerty') + [K_A] > U+0627
baselayout('dvorak') + [K_B] > U+0628
`;

/**
 * "Touch-only" for the helper's purpose: no base-layer VKEY rule at all (a
 * character-context rule names no vkey). `hasBaseLayerRuleSurface` must be
 * false and `leakedChars` must return the full alphabet.
 */
const NO_VKEY_RULES_KMN = `${HEADER}
+ 'x' > U+0041
`;

describe("base-layout: pinned table", () => {
  it("loads the kbdus family with the full K_A..K_Z lowercase-Latin map", () => {
    const table = loadBaseLayoutTable();
    const kbdus = table.get("kbdus");
    expect(kbdus).toBeDefined();
    expect(kbdus!.get("K_A")).toBe("a");
    expect(kbdus!.get("K_Z")).toBe("z");
    expect(kbdus!.size).toBe(26);
  });

  it("the pinned kbdus table matches the engine's US_UNSHIFTED map exactly (drift guard)", () => {
    const kbdus = loadBaseLayoutTable().get("kbdus")!;
    const enginePairs = Object.entries(US_UNSHIFTED).sort(([a], [b]) => a.localeCompare(b));
    const pinnedPairs = [...kbdus.entries()].sort(([a], [b]) => a.localeCompare(b));
    expect(pinnedPairs).toEqual(enginePairs);
  });

  it("throws naming the family and vkey when a value is not a valid base-layout char", () => {
    const dir = mkdtempSync(join(tmpdir(), "facet-baselayout-bad-"));
    const badPath = join(dir, "base-layouts.json");
    writeFileSync(badPath, JSON.stringify({ kbdus: { K_A: "ab" } }), "utf8");
    expect(() => loadBaseLayoutTable(badPath)).toThrow(/kbdus.*K_A/s);
  });
});

describe("resolveBaseLayout", () => {
  it("always resolves the environment default kbdus with its char map", () => {
    const { ir } = parse(REMAP_AND_BLOCK_KMN, "test-remap");
    const res = resolveBaseLayout(ir);
    expect(res.family).toBe(DEFAULT_BASELAYOUT);
    expect(res.family).toBe("kbdus");
    expect(res.charByVkey.get("K_C")).toBe("c");
  });

  it("collects distinct baselayout('...') guard values into branchesOn (normalized)", () => {
    const { ir } = parse(BRANCH_GUARD_KMN, "test-branch");
    const res = resolveBaseLayout(ir);
    expect(res.branchesOn).toEqual(["azerty"]);
  });

  it("has an empty branchesOn when no rule carries a baselayout guard", () => {
    const { ir } = parse(REMAP_AND_BLOCK_KMN, "test-nobranch");
    expect(resolveBaseLayout(ir).branchesOn).toEqual([]);
  });

  it("collects two distinct baselayout('...') guards into a sorted branchesOn", () => {
    const { ir } = parse(TWO_BRANCH_GUARDS_KMN, "test-two-branches");
    expect(resolveBaseLayout(ir).branchesOn).toEqual(["azerty", "dvorak"]);
  });
});

describe("namedBaseLayerVkeys / leakedChars", () => {
  it("excludes remapped and `> nul`-blocked vkeys, includes un-named ones", () => {
    const { ir } = parse(REMAP_AND_BLOCK_KMN, "test-leak");
    const named = namedBaseLayerVkeys(ir);
    expect(named.has("K_A")).toBe(true); // remapped
    expect(named.has("K_B")).toBe(true); // > nul blocked
    expect(named.has("K_C")).toBe(false); // un-named

    const leaked = leakedChars(ir);
    expect(leaked).not.toContain("a"); // K_A named
    expect(leaked).not.toContain("b"); // K_B named
    expect(leaked).toContain("c"); // K_C un-named leaks
    expect(leaked).toHaveLength(24); // 26 - 2 named
  });

  it("a branch-guarded vkey still counts as named (no leak)", () => {
    const { ir } = parse(BRANCH_GUARD_KMN, "test-guard-named");
    expect(namedBaseLayerVkeys(ir).has("K_A")).toBe(true);
    expect(leakedChars(ir)).not.toContain("a");
  });
});

describe("hasBaseLayerRuleSurface — touch-only semantics", () => {
  it("is false for an IR with no base-layer vkey rules, and leakedChars is the full alphabet", () => {
    const { ir } = parse(NO_VKEY_RULES_KMN, "test-touch-only");
    expect(hasBaseLayerRuleSurface(ir)).toBe(false);
    // The suppression of this full-alphabet leak is a classifier-layer concern
    // (T012 gates on hasBaseLayerRuleSurface); the pure helper leaks all 26.
    expect(leakedChars(ir)).toHaveLength(26);
  });

  it("is true once any base-layer vkey rule exists", () => {
    const { ir } = parse(REMAP_AND_BLOCK_KMN, "test-has-surface");
    expect(hasBaseLayerRuleSurface(ir)).toBe(true);
  });
});
