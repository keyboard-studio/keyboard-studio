import { describe, it, expect } from "vitest";
import { checkHistoryOrder } from "./check-3-3-history-order.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

function makeInput(historyMd: string | undefined): DocLintInput {
  return {
    keyboardId: "test_kbd",
    keyboardVersion: "1.2",
    targets: [],
    layerIds: [],
    displayName: "Test",
    copyrightHolders: {},
    members: historyMd !== undefined ? { "history-md": historyMd } : {},
    deletedFilenames: [],
  };
}

describe("checkHistoryOrder (3.3 KM_LINT_HISTORY_ORDER)", () => {
  it("passes when the top entry is the newest", () => {
    const text = "## 1.2 (2024-03-01)\n* Added shift layer.\n\n## 1.0 (2024-01-01)\n* Initial release.\n";
    expect(checkHistoryOrder(makeInput(text))).toEqual([]);
  });

  it("fires when a later entry has a newer version than the top", () => {
    const text = "## 1.0 (2024-01-01)\n* Initial release.\n\n## 1.2 (2024-03-01)\n* Added shift layer.\n";
    const findings = checkHistoryOrder(makeInput(text));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_HISTORY_ORDER");
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
    expect(findings[0]?.location?.file).toBe("HISTORY.md");
    expect(findings[0]?.message).toContain("1.2");
  });

  it("passes with a single entry (nothing to order)", () => {
    expect(checkHistoryOrder(makeInput("## 1.0 (2024-01-01)\n* Initial release.\n"))).toEqual([]);
  });

  it("returns [] when history-md is absent", () => {
    expect(checkHistoryOrder(makeInput(undefined))).toEqual([]);
  });
});
