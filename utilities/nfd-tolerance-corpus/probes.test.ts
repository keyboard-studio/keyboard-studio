// Unit tests for the pure half of the harness: how four measured outputs
// become a verdict, and how a rule's key part becomes keystrokes. No compiler,
// no corpus — these run in milliseconds and are what CI can afford.

import { describe, expect, it } from "vitest";

import type { ContextElement } from "@keyboard-studio/contracts";

import {
  bucketFor,
  classifyProbe,
  codepoints,
  emptyProbeCounts,
  gateIdFor,
  resolveAllKeys,
} from "./probes.js";
import type { ProbeOutcome } from "./types.js";

/** `classifyProbe`'s four inputs, named for readability at the call site. */
function outputs(bNFC: string, bNFD: string, fNFC: string, fNFD: string) {
  return {
    baselinePrecomposed: bNFC,
    baselineDecomposed: bNFD,
    transformedPrecomposed: fNFC,
    transformedDecomposed: fNFD,
  };
}

describe("classifyProbe", () => {
  it("reports no-gap when both forms agreed before and still do", () => {
    expect(classifyProbe(outputs("A", "A", "A", "A"))).toBe("no-gap");
  });

  it("reports gap-fixed when a divergence converges on the composed answer", () => {
    expect(classifyProbe(outputs("A", "B", "A", "A"))).toBe("gap-fixed");
  });

  it("reports gap-remaining when the decomposed path is untouched", () => {
    expect(classifyProbe(outputs("A", "B", "A", "B"))).toBe("gap-remaining");
  });

  it("reports gap-miscorrected when the decomposed path moves somewhere new and still wrong", () => {
    // The sil_yoruba8 class: the stray spacing accent is gone, so the output
    // now looks well-formed, but it is a different character than the
    // composed path produces. A shape-counting script scores this as fixed.
    expect(classifyProbe(outputs("A", "B", "A", "C"))).toBe("gap-miscorrected");
  });

  it("reports regressed-composed whenever the composed path moves at all", () => {
    // Checked before anything else: the transform's whole contract is that
    // output does not change, so a moved composed path is the worst finding
    // even when the decomposed path happens to agree with it afterwards.
    expect(classifyProbe(outputs("A", "B", "C", "C"))).toBe("regressed-composed");
    expect(classifyProbe(outputs("A", "A", "C", "C"))).toBe("regressed-composed");
  });

  it("reports regressed-decomposed when a tolerant pair stops agreeing", () => {
    expect(classifyProbe(outputs("A", "A", "A", "B"))).toBe("regressed-decomposed");
  });
});

describe("bucketFor", () => {
  const counts = (overrides: Partial<Record<ProbeOutcome, number>>) => ({
    ...emptyProbeCounts(),
    ...overrides,
  });

  it("lets one harmful probe outrank any number of fixed ones", () => {
    expect(bucketFor(counts({ "gap-fixed": 40, "gap-miscorrected": 1 }), 41, 0)).toBe("regressed");
    expect(bucketFor(counts({ "gap-fixed": 40, "regressed-composed": 1 }), 41, 0)).toBe("regressed");
    expect(bucketFor(counts({ "gap-fixed": 40, "regressed-decomposed": 1 }), 41, 0)).toBe("regressed");
  });

  it("prefers gap-remaining over gap-fixed when both are present", () => {
    expect(bucketFor(counts({ "gap-fixed": 3, "gap-remaining": 1 }), 4, 0)).toBe("gap-remaining");
  });

  it("distinguishes an unprobeable keyboard from a clean one", () => {
    expect(bucketFor(counts({}), 0, 12)).toBe("refused");
    expect(bucketFor(counts({}), 0, 0)).toBe("no-gap");
    expect(bucketFor(counts({ "no-gap": 20 }), 20, 12)).toBe("no-gap");
  });
});

describe("resolveAllKeys", () => {
  const stores = new Map<string, string[]>([
    ["key.all", ["[", "]", "{", "}", "|"]],
    ["key.act", ["]"]],
    ["nokeys", []],
  ]);

  it("returns every member of an any(store) key part, not just the first", () => {
    // The engine's own resolveKeyPart takes storeChars[0] only; that single
    // key is what the transform measures its baked output against, and the
    // other four are where it goes wrong. The harness must press all five.
    const keyPart: ContextElement[] = [{ kind: "any", storeRef: "key.all" }];
    expect(resolveAllKeys(keyPart, stores).map((k) => k.vkey)).toEqual([
      "K_LBRKT",
      "K_RBRKT",
      "K_LBRKT",
      "K_RBRKT",
      "K_BKSLASH",
    ]);
    expect(resolveAllKeys(keyPart, stores).map((k) => k.modifiers)).toEqual([
      [],
      [],
      ["shift"],
      ["shift"],
      ["shift"],
    ]);
  });

  it("resolves a vkey key part with its modifiers", () => {
    const keyPart: ContextElement[] = [{ kind: "vkey", name: "K_A", modifiers: ["SHIFT"] }];
    expect(resolveAllKeys(keyPart, stores)).toEqual([{ vkey: "K_A", modifiers: ["shift"] }]);
  });

  it("declines a key part the simulator cannot press", () => {
    // RSHIFT has no SimKeyInput modifier; an empty store has no members; a
    // compound key part is out of the transform's window entirely.
    expect(resolveAllKeys([{ kind: "vkey", name: "K_A", modifiers: ["RSHIFT"] }], stores)).toEqual([]);
    expect(resolveAllKeys([{ kind: "any", storeRef: "nokeys" }], stores)).toEqual([]);
    expect(
      resolveAllKeys(
        [
          { kind: "vkey", name: "K_A", modifiers: [] },
          { kind: "vkey", name: "K_B", modifiers: [] },
        ],
        stores,
      ),
    ).toEqual([]);
  });
});

describe("gateIdFor", () => {
  it("maps the engine's refusal reasons to stable ids", () => {
    expect(gateIdFor('compound preceding context (more than one element before "+") not analysed')).toBe(
      "compound-context",
    );
    expect(gateIdFor('store "vowelUK" is paired via index() with more than one other store')).toBe(
      "multi-store-pairing",
    );
    expect(gateIdFor('preceding-context element kind "notany" not analysed')).toBe(
      "context-element-kind:notany",
    );
  });

  it("passes an unrecognised reason through rather than hiding it", () => {
    expect(gateIdFor("some gate nobody has taught this harness about")).toBe(
      "some gate nobody has taught this harness about",
    );
  });
});

describe("codepoints", () => {
  it("renders astral characters as one codepoint, not two surrogates", () => {
    expect(codepoints("\u{1D11E}")).toBe("U+1D11E");
    expect(codepoints("ạ")).toBe("U+0061 U+0323");
  });
});
