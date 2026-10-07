// decisionStore.test.ts — contract C-1 tests for the spec-088 decision store.
import { describe, it, expect, beforeEach } from "vitest";
import type { Decision } from "../decisions/decisionTypes.ts";
import {
  useDecisionStore,
  getDecisionSnapshot,
  applyDecisionSnapshot,
  peekDecision,
  selectTrack,
  selectTouchSeedSource,
} from "./decisionStore.ts";

function rec(id: Decision["id"], value: unknown, provenance: Decision["provenance"] = "asked"): Decision {
  return { id, value, provenance };
}

beforeEach(() => {
  useDecisionStore.getState().reset();
});

describe("decisionStore (contract C-1)", () => {
  it("record replaces by id and leaves every other record untouched (C-1.1)", () => {
    const store = useDecisionStore.getState();
    store.record(rec("language-code", "fr"));
    store.record(rec("copyright-holder", "Author A"));
    store.record(rec("language-code", "ha"));
    const { decisions } = useDecisionStore.getState();
    expect(decisions["language-code"]?.value).toBe("ha");
    expect(decisions["copyright-holder"]?.value).toBe("Author A");
    expect(Object.keys(decisions)).toHaveLength(2);
  });

  it("recordAll folds in argument order (C-1.1)", () => {
    useDecisionStore.getState().recordAll([rec("language-code", "fr"), rec("language-code", "ha")]);
    expect(peekDecision("language-code")?.value).toBe("ha");
  });

  it("snapshot → apply is a round-trip identity (C-1.4)", () => {
    useDecisionStore.getState().recordAll([
      rec("language-code", "fr"),
      { id: "copyright-holder", value: "Author A", provenance: "extracted", source: "basic_kbdfr", step: "identity" },
    ]);
    const snapshot = getDecisionSnapshot();
    useDecisionStore.getState().reset();
    expect(getDecisionSnapshot()).toEqual({});
    applyDecisionSnapshot(snapshot);
    expect(getDecisionSnapshot()).toEqual(snapshot);
    expect(peekDecision("copyright-holder")).toEqual(snapshot["copyright-holder"]);
  });

  it("a record carrying provenance \"derived\" round-trips intact (FR-002 forward-compat)", () => {
    const derived: Decision = { id: "carved-layout", value: ["K_A"], provenance: "derived" };
    useDecisionStore.getState().record(derived);
    const snapshot = getDecisionSnapshot();
    useDecisionStore.getState().reset();
    applyDecisionSnapshot(JSON.parse(JSON.stringify(snapshot)) as typeof snapshot);
    expect(peekDecision("carved-layout")).toEqual(derived);
  });

  it("reset() empties the set", () => {
    useDecisionStore.getState().record(rec("language-code", "fr"));
    useDecisionStore.getState().reset();
    expect(getDecisionSnapshot()).toEqual({});
    expect(peekDecision("language-code")).toBeUndefined();
  });

  it("selectors read the two FR-005 decisions and narrow their values", () => {
    expect(selectTrack(getDecisionSnapshot())).toBeNull();
    expect(selectTouchSeedSource(getDecisionSnapshot())).toBeNull();
    useDecisionStore.getState().recordAll([
      rec("authoring-track", "copy"),
      rec("touch-seed-source", "reseed-from-desktop"),
    ]);
    expect(selectTrack(getDecisionSnapshot())).toBe("copy");
    expect(selectTouchSeedSource(getDecisionSnapshot())).toBe("reseed-from-desktop");
    useDecisionStore.getState().record(rec("authoring-track", "bogus"));
    expect(selectTrack(getDecisionSnapshot())).toBeNull();
  });
});
