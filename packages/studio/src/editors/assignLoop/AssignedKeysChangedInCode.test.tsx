// Assigned keys a Code edit changed are labelled "changed in code" in the Assign tab (spec 113
// ruling 10). A standalone component mounted by MechanismGallery, tested over the real decision
// store.

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IRRule, KmnEdit } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { AssignedKeysChangedInCode, assignedKeysChangedInCode } from "./AssignedKeysChangedInCode.tsx";

const RULE: IRRule = {
  nodeId: "rule#1",
  context: [{ kind: "vkey", name: "K_G", modifiers: [] }],
  output: [{ kind: "char", value: "g" }],
};
const MAIN = { kind: "group" as const, name: "main", usingKeys: true };

const edit = (seq: number, owner: "assign-tab" | "rules-step", withKey = true): KmnEdit => ({
  seq,
  at: 0,
  op: "code-apply",
  changes: [
    {
      change: "replace",
      at: { container: MAIN, text: "x", ...(withKey ? { keystroke: { vkey: "K_G", modifiers: [] } } : {}) },
      old: RULE,
      node: { ...RULE, output: [{ kind: "char", value: "\u011d" }] },
    },
  ],
  overrides: [{ change: 0, owner }],
});

beforeEach(() => useDecisionStore.getState().reset());
afterEach(cleanup);

describe("assignedKeysChangedInCode", () => {
  it("lists each key once, only for assign-tab overrides carrying a keystroke", () => {
    const keys = assignedKeysChangedInCode([edit(1, "assign-tab"), edit(2, "assign-tab"), edit(3, "rules-step"), edit(4, "assign-tab", false)]);
    expect(keys.map((k) => k.vkey)).toEqual(["K_G"]);
  });
});

describe("AssignedKeysChangedInCode", () => {
  it("renders nothing without an assign-tab override", () => {
    useDecisionStore.getState().record({ id: "kmn-edits", value: { entries: [edit(1, "rules-step")] }, provenance: "asked" });
    render(<AssignedKeysChangedInCode />);
    expect(screen.queryByTestId("assign-changed-in-code-keys")).toBeNull();
  });

  it("labels the assigned key as changed in the Code tab", () => {
    useDecisionStore.getState().record({ id: "kmn-edits", value: { entries: [edit(1, "assign-tab")] }, provenance: "asked" });
    render(<AssignedKeysChangedInCode />);
    const text = screen.getByTestId("assign-changed-in-code-keys").textContent ?? "";
    expect(text).toContain("Key G");
    expect(text).toContain("changed in the Code tab");
  });
});
