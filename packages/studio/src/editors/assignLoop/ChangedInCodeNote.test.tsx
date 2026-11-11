// "Changed in code" markers (spec 117 US8 T100): the Assign tab and deadkey editor note, and the
// Layout tab's key detail line driven by authorEdit "code-tab".

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KmnEdit } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { ChangedInCodeNote, codeOverrideCount } from "./ChangedInCodeNote.tsx";

const code = (seq: number, owner: "rules-step" | "deadkeys"): KmnEdit => ({
  seq,
  at: 0,
  op: "code-apply",
  changes: [],
  overrides: [{ change: 0, owner }],
});

beforeEach(() => useDecisionStore.getState().reset());
afterEach(cleanup);

describe("ChangedInCodeNote", () => {
  it("counts only entries that overrode the named owner", () => {
    expect(codeOverrideCount([code(1, "rules-step"), code(2, "deadkeys"), code(3, "rules-step")], "rules-step")).toBe(2);
  });

  it("renders nothing without a matching override", () => {
    useDecisionStore.getState().record({ id: "kmn-edits", value: { entries: [code(1, "deadkeys")] }, provenance: "asked" });
    render(<ChangedInCodeNote owner="rules-step" />);
    expect(screen.queryByTestId("changed-in-code-note")).toBeNull();
  });

  it("names the Code tab for a matching override", () => {
    useDecisionStore.getState().record({ id: "kmn-edits", value: { entries: [code(1, "deadkeys")] }, provenance: "asked" });
    render(<ChangedInCodeNote owner="deadkeys" />);
    expect(screen.getByTestId("changed-in-code-note").textContent).toContain("Code tab");
  });
});
