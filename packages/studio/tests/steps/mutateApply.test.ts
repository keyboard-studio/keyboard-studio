// T009: unit tests for the pure patch-apply helper (spec-014 mutate-seam M2–M5).
//
// Source of truth: specs/014-mutate-seam-touch-propagation/contracts/mutate-seam.contract.md
//   M2 — path-scoped deep merge preserves siblings.
//   M3 — a patch touching a path outside `writes` is rejected whole; IR unchanged; error surfaced.
//   M4 — idempotent: apply twice == apply once.
//   M5 — empty patch {} is a no-op.
// Plus M1 — purity: inputs are never mutated.

import { describe, it, expect } from "vitest";
import { irPath, ARRAY_INDEX } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  applyMutatePatch,
  MutatePatchContainmentError,
} from "../../src/steps/mutateApply.ts";

// ---------------------------------------------------------------------------
// Fixture — a minimal but structurally real KeyboardIR.
// ---------------------------------------------------------------------------

function makeIR(): KeyboardIR {
  return {
    origin: "scaffolded",
    header: {
      keyboardId: "kbd_test",
      name: "Original Name",
      bcp47: ["en"],
      copyright: "© Original",
      version: "1.0",
      targets: ["desktop"],
      storeDirectives: [],
    },
    stores: [
      { nodeId: "s0", name: "letters", items: [{ kind: "char", value: "a" }], isSystem: false },
    ],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

describe("applyMutatePatch — M1 purity", () => {
  it("does not mutate the base IR or the patch", () => {
    const base = makeIR();
    const baseSnapshot = structuredClone(base);
    const patch: Partial<KeyboardIR> = { header: { name: "New Name" } as KeyboardIR["header"] };
    const patchSnapshot = structuredClone(patch);

    const result = applyMutatePatch(base, patch, [irPath("header", "name")]);

    expect(base).toEqual(baseSnapshot); // base untouched
    expect(patch).toEqual(patchSnapshot); // patch untouched
    expect(result).not.toBe(base); // fresh object
    expect(result.header).not.toBe(base.header); // fresh subtree
  });
});

describe("applyMutatePatch — M2 path-scoped deep merge", () => {
  it("writes the declared leaf and preserves sibling header fields", () => {
    const base = makeIR();
    // mutate() for language_name_english returns just header.name; the merge
    // must preserve bcp47/copyright/etc. (NOT a shallow header replace).
    const patch: Partial<KeyboardIR> = { header: { name: "Bafut" } as KeyboardIR["header"] };

    const result = applyMutatePatch(base, patch, [irPath("header", "name")]);

    expect(result.header.name).toBe("Bafut");
    // siblings byte-identical to the original
    expect(result.header.bcp47).toEqual(["en"]);
    expect(result.header.copyright).toBe("© Original");
    expect(result.header.version).toBe("1.0");
    expect(result.header.keyboardId).toBe("kbd_test");
  });

  it("preserves unrelated top-level branches (stores) when writing header", () => {
    const base = makeIR();
    const patch: Partial<KeyboardIR> = { header: { copyright: "© New" } as KeyboardIR["header"] };

    const result = applyMutatePatch(base, patch, [irPath("header", "copyright")]);

    expect(result.header.copyright).toBe("© New");
    expect(result.stores).toEqual(base.stores);
  });

  it("replaces an array-valued leaf wholesale (bcp47)", () => {
    const base = makeIR();
    const patch: Partial<KeyboardIR> = { header: { bcp47: ["yo", "yo-Latn"] } as KeyboardIR["header"] };

    const result = applyMutatePatch(base, patch, [irPath("header", "bcp47")]);

    expect(result.header.bcp47).toEqual(["yo", "yo-Latn"]);
    // result array shares no reference with the patch's array (purity)
    expect(result.header.bcp47).not.toBe(patch.header!.bcp47);
  });
});

describe("applyMutatePatch — M3 declared-writes containment", () => {
  it("rejects the whole patch when it touches a path outside writes; IR unchanged", () => {
    const base = makeIR();
    const baseSnapshot = structuredClone(base);
    // Declares only header.name but the patch also writes header.copyright.
    const patch: Partial<KeyboardIR> = {
      header: { name: "ok", copyright: "SNEAKY" } as KeyboardIR["header"],
    };

    expect(() => applyMutatePatch(base, patch, [irPath("header", "name")])).toThrow(
      MutatePatchContainmentError,
    );
    // IR left unchanged — no partial apply.
    expect(base).toEqual(baseSnapshot);
  });

  it("surfaces the offending path and declared writes on the error", () => {
    const base = makeIR();
    const patch: Partial<KeyboardIR> = {
      stores: [{ nodeId: "x", name: "y", items: [], isSystem: false }],
    };
    try {
      applyMutatePatch(base, patch, [irPath("header", "name")]);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(MutatePatchContainmentError);
      const err = e as MutatePatchContainmentError;
      expect(err.offendingPaths.join(",")).toContain("stores");
      expect(err.declaredWrites).toEqual(["header.name"]);
    }
  });

  it("authorizes a leaf nested under a declared array write (stores[])", () => {
    const base = makeIR();
    // Declared writes: stores[] — authorizes writing an element of stores.
    const patch: Partial<KeyboardIR> = {
      stores: [
        { nodeId: "s0", name: "letters", items: [{ kind: "char", value: "a" }], isSystem: false },
        { nodeId: "s1", name: "script_group", items: [], isSystem: false },
      ],
    };
    const result = applyMutatePatch(base, patch, [irPath("stores", ARRAY_INDEX)]);
    expect(result.stores).toHaveLength(2);
    expect(result.stores[1]!.name).toBe("script_group");
  });
});

describe("applyMutatePatch — M4 idempotency", () => {
  it("applying the same patch twice equals applying it once", () => {
    const base = makeIR();
    const patch: Partial<KeyboardIR> = { header: { name: "Stable" } as KeyboardIR["header"] };
    const writes = [irPath("header", "name")];

    const once = applyMutatePatch(base, patch, writes);
    const twice = applyMutatePatch(once, patch, writes);

    expect(twice).toEqual(once);
  });
});

describe("applyMutatePatch — M5 empty patch", () => {
  it("an empty patch {} is a value-level no-op", () => {
    const base = makeIR();
    const result = applyMutatePatch(base, {}, []);
    expect(result).toEqual(base);
    expect(result).not.toBe(base); // still a fresh copy (purity)
  });

  it("an empty patch is allowed even with declared writes (no leaves to check)", () => {
    const base = makeIR();
    const result = applyMutatePatch(base, {}, [irPath("header", "name")]);
    expect(result).toEqual(base);
  });

  it("a patch with an empty nested object is a no-op and does not violate containment", () => {
    const base = makeIR();
    // header: {} writes no leaf, so it must NOT trip the containment check
    // even though no path under header is declared.
    const patch = { header: {} } as Partial<KeyboardIR>;
    const result = applyMutatePatch(base, patch, []);
    expect(result).toEqual(base);
  });
});

describe("applyMutatePatch — prototype-pollution hardening", () => {
  it("ignores a __proto__ key smuggled in via JSON.parse (no prototype set, no containment trip)", () => {
    const base = makeIR();
    // JSON.parse produces an OWN-enumerable "__proto__" key (unlike a literal),
    // so Object.keys sees it. The guard must skip it: no merge, no leaf collected.
    const patch = JSON.parse('{"__proto__":{"polluted":true}}') as Partial<KeyboardIR>;
    // Must not throw containment (the unsafe key is never path-collected).
    const result = applyMutatePatch(base, patch, []);
    expect(result).toEqual(base);
    // Object.prototype was not polluted.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // The result's prototype is the normal object prototype.
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });

  it("ignores constructor/prototype patch keys", () => {
    const base = makeIR();
    const patch = JSON.parse(
      '{"constructor":{"x":1},"prototype":{"y":2}}',
    ) as Partial<KeyboardIR>;
    const result = applyMutatePatch(base, patch, []);
    expect(result).toEqual(base);
    expect((result as Record<string, unknown>).x).toBeUndefined();
    expect((result as Record<string, unknown>).y).toBeUndefined();
  });

  it("still applies legitimate sibling keys in a patch that also carries an unsafe key", () => {
    const base = makeIR();
    const patch = JSON.parse(
      '{"__proto__":{"polluted":true},"header":{"name":"New"}}',
    ) as Partial<KeyboardIR>;
    const result = applyMutatePatch(base, patch, [irPath("header", "name")]);
    expect(result.header.name).toBe("New");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
