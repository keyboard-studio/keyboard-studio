import { describe, it, expect } from "vitest";
import { normaliseForComparison } from "./normalise-ir.js";
import type { KeyboardIR, RawKmnFragment } from "@keyboard-studio/contracts";

function frag(sourceText: string, reason: string, groupNodeId?: string): RawKmnFragment {
  const f: RawKmnFragment = {
    nodeId: "raw#x",
    origin: "imported",
    sourceText,
    reason,
  };
  if (groupNodeId !== undefined) f.groupNodeId = groupNodeId;
  return f;
}

function irWithRaw(raw: RawKmnFragment[]): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "t",
      name: "T",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw,
    recognizedPatterns: [],
  };
}

describe("normaliseForComparison — fragment order-insensitivity", () => {
  // The #2404 dependency pass legitimately reorders same-reason store
  // declarations (e.g. two outs-expansion fragments) to satisfy
  // declaration-before-use; the structural comparison must not treat that
  // as a divergence.
  it("treats same-reason fragments in different orders as equal", () => {
    const a = irWithRaw([
      frag("store(IT0) outs(keyGrave)", "outs-expansion"),
      frag("store(DirMod) outs(keyLeft)", "outs-expansion"),
    ]);
    const b = irWithRaw([
      frag("store(DirMod) outs(keyLeft)", "outs-expansion"),
      frag("store(IT0) outs(keyGrave)", "outs-expansion"),
    ]);
    expect(normaliseForComparison(a)).toEqual(normaliseForComparison(b));
  });

  // The #2404 pass can relocate a fragment across the pre-begin/group
  // boundary, so groupNodeId may be present on one side and absent on the
  // other; presence alone must not be a divergence.
  it("ignores groupNodeId presence on fragments", () => {
    const a = irWithRaw([frag("store(IT0) outs(keyGrave)", "outs-expansion")]);
    const b = irWithRaw([
      frag("store(IT0) outs(keyGrave)", "outs-expansion", "group#0"),
    ]);
    expect(normaliseForComparison(a)).toEqual(normaliseForComparison(b));
  });

  it("still distinguishes fragments with different source text", () => {
    const a = irWithRaw([frag("store(IT0) outs(keyGrave)", "outs-expansion")]);
    const b = irWithRaw([frag("store(IT0) outs(keyAcute)", "outs-expansion")]);
    expect(normaliseForComparison(a)).not.toEqual(normaliseForComparison(b));
  });
});
