import { describe, it, expect } from "vitest";
import { checkHistoryStaleFileRefs } from "./check-3-7-history-stale-refs.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

function makeInput(historyMd: string | undefined, deletedFilenames: string[]): DocLintInput {
  return {
    keyboardId: "test_kbd",
    keyboardVersion: "1.0",
    targets: [],
    layerIds: [],
    displayName: "Test",
    copyrightHolders: {},
    members: historyMd !== undefined ? { "history-md": historyMd } : {},
    deletedFilenames,
  };
}

describe("checkHistoryStaleFileRefs (3.7 KM_LINT_HISTORY_STALE_FILE_REFS)", () => {
  it("passes when no bullet mentions a deleted file", () => {
    const text = "## 1.0 (2024-01-01)\n* Initial release.\n";
    expect(checkHistoryStaleFileRefs(makeInput(text, ["old-icon.ico"]))).toEqual([]);
  });

  it("fires when a bullet references a deleted file", () => {
    const text = "## 1.2 (2024-03-01)\n* Removed old-icon.ico from icons.\n";
    const findings = checkHistoryStaleFileRefs(makeInput(text, ["old-icon.ico"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_HISTORY_STALE_FILE_REFS");
    expect(findings[0]?.message).toContain("old-icon.ico");
  });

  it("fires once per offending bullet", () => {
    const text = "## 1.2 (2024-03-01)\n* Removed old-icon.ico.\n* Removed second.ico too.\n";
    const findings = checkHistoryStaleFileRefs(makeInput(text, ["old-icon.ico", "second.ico"]));
    expect(findings).toHaveLength(2);
  });

  it("returns [] when deletedFilenames is empty", () => {
    const text = "## 1.0 (2024-01-01)\n* Removed old-icon.ico.\n";
    expect(checkHistoryStaleFileRefs(makeInput(text, []))).toEqual([]);
  });

  it("returns [] when history-md is absent", () => {
    expect(checkHistoryStaleFileRefs(makeInput(undefined, ["old-icon.ico"]))).toEqual([]);
  });
});
