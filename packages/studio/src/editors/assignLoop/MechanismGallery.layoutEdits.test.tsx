// Keys set by kmn-edits entries are labelled "set in the Layout tab" in the Assign tab (spec 117
// T067). The label is a standalone component mounted by MechanismGallery, so it is tested on its
// own over the real decision store.

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KmnEdit } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { LayoutEditedKeys, layoutEditedKeys } from "./LayoutEditedKeys.tsx";

const set = (seq: number, vkey: string, text: string, layer: Array<"SHIFT"> = []): KmnEdit => ({
  seq,
  at: 0,
  op: "set-key",
  vkey,
  layer,
  output: { kind: "text", text },
});

beforeEach(() => useDecisionStore.getState().reset());
afterEach(cleanup);

describe("layoutEditedKeys", () => {
  it("keeps the latest set-key per key and layer, and drops cleared keys", () => {
    const entries: KmnEdit[] = [
      set(1, "K_A", "x"),
      set(2, "K_A", "y"),
      set(3, "K_B", "z"),
      { seq: 4, at: 0, op: "clear-key", vkey: "K_B", layer: [] },
    ];
    expect(layoutEditedKeys(entries).map((e) => [e.vkey, e.output])).toEqual([["K_A", { kind: "text", text: "y" }]]);
  });
});

describe("LayoutEditedKeys", () => {
  it("renders nothing with no edits", () => {
    render(<LayoutEditedKeys />);
    expect(screen.queryByTestId("assign-layout-edited-keys")).toBeNull();
  });

  it("labels each key set by a Layout edit", () => {
    useDecisionStore.getState().record({
      id: "kmn-edits",
      value: { entries: [set(1, "K_A", "\u014b"), set(2, "K_A", "\u014a", ["SHIFT"])] },
      provenance: "asked",
    });
    render(<LayoutEditedKeys />);
    const text = screen.getByTestId("assign-layout-edited-keys").textContent ?? "";
    expect(text).toContain("set in the Layout tab");
    expect(text).toContain("\u014b");
    expect(text).toContain("\u014a");
  });
});
