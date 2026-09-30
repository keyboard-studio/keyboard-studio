// Tests for the guard-suggestion intent store (spec 082 FR-020 / FR-022):
// suggestions surface only after an intent signal — never on step entry —
// and a kept over-broad guard is never asked about again.

import { beforeEach, describe, expect, it } from "vitest";
import {
  guardIntentSignaledForFamily,
  missingGuardGroupKey,
  useGuardIntentStore,
} from "../../stores/guardIntentStore.ts";

beforeEach(() => {
  useGuardIntentStore.getState().resetForTest();
});

describe("guard intent signals", () => {
  it("starts with no signal — suggestions must not surface on step entry", () => {
    const s = useGuardIntentStore.getState();
    expect(guardIntentSignaledForFamily(s, "family-diablock-context-blocking")).toBe(false);
  });

  it("signals when the author opens the family card", () => {
    useGuardIntentStore.getState().noteFamilyCardOpened("fam-1");
    expect(
      guardIntentSignaledForFamily(useGuardIntentStore.getState(), "fam-1"),
    ).toBe(true);
    // …but not for an unrelated family.
    expect(
      guardIntentSignaledForFamily(useGuardIntentStore.getState(), "fam-2"),
    ).toBe(false);
  });

  it("signals when the author creates/edits/selects a rule in the family", () => {
    useGuardIntentStore.getState().noteFamilyEdited("fam-1");
    expect(
      guardIntentSignaledForFamily(useGuardIntentStore.getState(), "fam-1"),
    ).toBe(true);
  });

  it("a block-behaviour bundle install signals broadly (not family-specific)", () => {
    useGuardIntentStore.getState().noteBlockBundleInstalled();
    expect(
      guardIntentSignaledForFamily(useGuardIntentStore.getState(), "any-family"),
    ).toBe(true);
  });
});

describe("intent records", () => {
  it("Keep records the guard so it is never re-asked", () => {
    useGuardIntentStore.getState().keepOverBroadGuard("rule-123");
    expect(useGuardIntentStore.getState().keptGuardRuleIds.has("rule-123")).toBe(true);
  });

  it("dismissing a missing-guard group hides that group", () => {
    const key = missingGuardGroupKey({ store: "diablock", familyName: "Diacritic blocking" });
    expect(key).toBe("diablock::Diacritic blocking");
    useGuardIntentStore.getState().dismissMissingGroup(key);
    expect(useGuardIntentStore.getState().dismissedMissingGroups.has(key)).toBe(true);
  });
});
