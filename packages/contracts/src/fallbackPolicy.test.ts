// Per-class fallback policy: helpers, the zod mirror, and legacy-value parsing.
// The compile-time drift guards live in schemas.ts; the type-level assertions
// here fail the build if the schema output and the type diverge.

import { describe, it, expect } from "vitest";
import type { Disposition, FallbackPolicy } from "./fallbackPolicy";
import {
  DEFAULT_FALLBACK_POLICY,
  collapseFallbackPolicy,
  uniformFallbackPolicy,
} from "./fallbackPolicy";
import { DispositionSchema, FallbackPolicySchema } from "./schemas";

describe("DEFAULT_FALLBACK_POLICY", () => {
  it("swallows every class", () => {
    expect(DEFAULT_FALLBACK_POLICY).toEqual({
      letters: "swallow",
      digits: "swallow",
      punctuation: "swallow",
    });
  });
});

describe("uniformFallbackPolicy / collapseFallbackPolicy", () => {
  it("widens one disposition to all three classes", () => {
    expect(uniformFallbackPolicy("pass-through")).toEqual({
      letters: "pass-through",
      digits: "pass-through",
      punctuation: "pass-through",
    });
  });

  it("collapses to pass-through only when every class passes through", () => {
    expect(collapseFallbackPolicy(uniformFallbackPolicy("pass-through"))).toBe("pass-through");
    expect(collapseFallbackPolicy(uniformFallbackPolicy("swallow"))).toBe("swallow");
    expect(
      collapseFallbackPolicy({ letters: "pass-through", digits: "swallow", punctuation: "pass-through" }),
    ).toBe("swallow");
  });
});

describe("FallbackPolicySchema", () => {
  it("round-trips a per-class policy", () => {
    const policy: FallbackPolicy = { letters: "swallow", digits: "pass-through", punctuation: "swallow" };
    expect(FallbackPolicySchema.parse(policy)).toEqual(policy);
  });

  it("accepts the legacy single value and widens it", () => {
    expect(FallbackPolicySchema.parse("pass-through")).toEqual(uniformFallbackPolicy("pass-through"));
    expect(FallbackPolicySchema.parse("swallow")).toEqual(uniformFallbackPolicy("swallow"));
  });

  it("rejects unknown values and partial objects", () => {
    expect(FallbackPolicySchema.safeParse("bogus").success).toBe(false);
    expect(FallbackPolicySchema.safeParse({ letters: "swallow" }).success).toBe(false);
    expect(
      FallbackPolicySchema.safeParse({ letters: "x", digits: "swallow", punctuation: "swallow" }).success,
    ).toBe(false);
  });

  it("parsed output is assignable to FallbackPolicy (drift guard, both directions)", () => {
    const parsed: FallbackPolicy = FallbackPolicySchema.parse("swallow");
    const d: Disposition = DispositionSchema.parse("pass-through");
    expect(parsed.letters).toBe("swallow");
    expect(d).toBe("pass-through");
  });
});
