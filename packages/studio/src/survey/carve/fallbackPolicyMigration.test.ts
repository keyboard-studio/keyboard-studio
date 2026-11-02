// Legacy widening of the fallback policy (single value -> per class) and the
// confirmed flag. Store persistence of the same state is covered in
// stores/workingCopyStore.fallbackPolicy.test.ts.

import { describe, it, expect } from "vitest";
import { uniformFallbackPolicy } from "@keyboard-studio/contracts";
import { migrateFallbackPolicy, migrateFallbackPolicyState } from "./fallbackPolicyMigration.ts";

const mixed = { letters: "swallow", digits: "pass-through", punctuation: "swallow" } as const;

describe("migrateFallbackPolicy", () => {
  it("widens a legacy single value to all three classes", () => {
    expect(migrateFallbackPolicy({ fallbackPolicy: "pass-through" })).toEqual(uniformFallbackPolicy("pass-through"));
    expect(migrateFallbackPolicy({ fallbackPolicy: "swallow" })).toEqual(uniformFallbackPolicy("swallow"));
  });

  it("keeps a per-class policy as is", () => {
    expect(migrateFallbackPolicy({ fallbackPolicy: mixed })).toEqual(mixed);
  });

  it("widens the pre-policy card outcome", () => {
    expect(migrateFallbackPolicy({ closedKeyboardCard: "declined" })).toEqual(uniformFallbackPolicy("pass-through"));
    expect(migrateFallbackPolicy({ closedKeyboardCard: "accepted" })).toEqual(uniformFallbackPolicy("swallow"));
  });

  it("falls back to all-swallow on junk without throwing", () => {
    for (const junk of [null, undefined, 3, "x", [], { fallbackPolicy: "bogus" }, { fallbackPolicy: { letters: "swallow" } }]) {
      expect(migrateFallbackPolicy(junk as never)).toEqual(uniformFallbackPolicy("swallow"));
    }
  });

  it("returns a fresh object each call", () => {
    expect(migrateFallbackPolicy(null)).not.toBe(migrateFallbackPolicy(null));
  });
});

describe("migrateFallbackPolicyState", () => {
  it("records confirmed:false for every widened legacy value and for defaults", () => {
    expect(migrateFallbackPolicyState({ fallbackPolicy: "pass-through" })).toEqual({
      policy: uniformFallbackPolicy("pass-through"),
      confirmed: false,
    });
    expect(migrateFallbackPolicyState({ closedKeyboardCard: "declined" }).confirmed).toBe(false);
    expect(migrateFallbackPolicyState(undefined)).toEqual({
      policy: uniformFallbackPolicy("swallow"),
      confirmed: false,
    });
  });

  it("a legacy single value never reads confirmed, even if the flag is present", () => {
    expect(migrateFallbackPolicyState({ fallbackPolicy: "swallow", fallbackPolicyConfirmed: true }).confirmed).toBe(
      false,
    );
  });

  it("reads confirmed only from a per-class policy with the flag true", () => {
    expect(migrateFallbackPolicyState({ fallbackPolicy: mixed, fallbackPolicyConfirmed: true })).toEqual({
      policy: mixed,
      confirmed: true,
    });
    expect(migrateFallbackPolicyState({ fallbackPolicy: mixed }).confirmed).toBe(false);
    expect(migrateFallbackPolicyState({ fallbackPolicy: mixed, fallbackPolicyConfirmed: "yes" }).confirmed).toBe(false);
  });
});
