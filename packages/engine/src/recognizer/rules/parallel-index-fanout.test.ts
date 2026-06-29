import { describe, it, expect } from "vitest";
import { isParallelIndexFanOut } from "./parallel-index-fanout.js";
import type { IRRule } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bareAnyRule(storeRef: string, outStoreRef: string): IRRule {
  // Bamum shape: + any(defaultK) > index(defaultU, 1)
  return {
    nodeId: "rule#bare-any",
    context: [{ kind: "any", storeRef }],
    output: [{ kind: "index", storeRef: outStoreRef, offset: 1 }],
  };
}

function s02BodyRule(dkId: number, inputStore: string, outputStore: string): IRRule {
  // S-02 body shape: dk(D) any(BASE) > index(OUT, 2)
  return {
    nodeId: "rule#s02-body",
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inputStore },
    ],
    output: [{ kind: "index", storeRef: outputStore, offset: 2 }],
  };
}

function charOutputRule(): IRRule {
  // Plain char output — not an index rule.
  return {
    nodeId: "rule#char-out",
    context: [{ kind: "any", storeRef: "defaultK" }],
    output: [{ kind: "char", value: "x" }],
  };
}

function offsetMismatchRule(): IRRule {
  // context.length === 1 but offset === 2 — alignment invariant violated.
  return {
    nodeId: "rule#offset-mismatch",
    context: [{ kind: "any", storeRef: "defaultK" }],
    output: [{ kind: "index", storeRef: "defaultU", offset: 2 }],
  };
}

function contextPrefixedRule(): IRRule {
  // context(N) any(S) > index(OUT, 2): pre-terminal is context(), not deadkey.
  return {
    nodeId: "rule#context-prefixed",
    context: [
      { kind: "context", offset: 1 },
      { kind: "any", storeRef: "someStore" },
    ],
    output: [{ kind: "index", storeRef: "outStore", offset: 2 }],
  };
}

function anyAnyPrefixRule(): IRRule {
  // any(A) any(B) > index(OUT, 2): pre-terminal is any(), not deadkey.
  return {
    nodeId: "rule#any-any",
    context: [
      { kind: "any", storeRef: "storeA" },
      { kind: "any", storeRef: "storeB" },
    ],
    output: [{ kind: "index", storeRef: "outStore", offset: 2 }],
  };
}

function charPrefixRule(): IRRule {
  // char any(B) > index(OUT, 2): pre-terminal is char, not deadkey.
  return {
    nodeId: "rule#char-prefix",
    context: [
      { kind: "char", value: "a" },
      { kind: "any", storeRef: "storeB" },
    ],
    output: [{ kind: "index", storeRef: "outStore", offset: 2 }],
  };
}

function multiOutputRule(): IRRule {
  // any(S) > index(OUT, 1) char: more than one output element.
  return {
    nodeId: "rule#multi-output",
    context: [{ kind: "any", storeRef: "defaultK" }],
    output: [
      { kind: "index", storeRef: "defaultU", offset: 1 },
      { kind: "char", value: "!" },
    ],
  };
}

function emptyContextRule(): IRRule {
  // > index(OUT, 0): no context element to align against.
  return {
    nodeId: "rule#empty-context",
    context: [],
    output: [{ kind: "index", storeRef: "defaultU", offset: 0 }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isParallelIndexFanOut", () => {
  it("bare-any shape [any(S)] > index(OUT, 1) returns true (Bamum style)", () => {
    expect(isParallelIndexFanOut(bareAnyRule("defaultK", "defaultU"))).toBe(true);
  });

  it("S-02 deadkey body shape [dk(D), any(S)] > index(OUT, 2) returns true", () => {
    expect(isParallelIndexFanOut(s02BodyRule(0x0060, "dkf0060", "dkt0060"))).toBe(true);
  });

  it("char-output rule [any(S)] > char returns false (output is not index)", () => {
    expect(isParallelIndexFanOut(charOutputRule())).toBe(false);
  });

  it("offset-mismatch rule [any(S)] > index(OUT, 2) returns false (offset !== context.length)", () => {
    expect(isParallelIndexFanOut(offsetMismatchRule())).toBe(false);
  });

  it("context-prefixed rule [context(N), any(S)] > index(OUT, 2) returns false (pre-terminal is context)", () => {
    expect(isParallelIndexFanOut(contextPrefixedRule())).toBe(false);
  });

  it("any-any prefix rule [any(A), any(B)] > index(OUT, 2) returns false (pre-terminal is any)", () => {
    expect(isParallelIndexFanOut(anyAnyPrefixRule())).toBe(false);
  });

  it("char-prefix rule [char, any(B)] > index(OUT, 2) returns false (pre-terminal is char)", () => {
    expect(isParallelIndexFanOut(charPrefixRule())).toBe(false);
  });

  it("multi-output rule [any(S)] > index(OUT, 1) + char returns false (output.length !== 1)", () => {
    expect(isParallelIndexFanOut(multiOutputRule())).toBe(false);
  });

  it("empty-context rule [] > index(OUT, 0) returns false (no context element)", () => {
    expect(isParallelIndexFanOut(emptyContextRule())).toBe(false);
  });
});
