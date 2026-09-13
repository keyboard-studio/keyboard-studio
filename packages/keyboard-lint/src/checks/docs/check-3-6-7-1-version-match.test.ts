import { describe, it, expect } from "vitest";
import { checkHistoryVersionMatch } from "./check-3-6-7-1-version-match.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

function makeInput(historyMd: string | undefined, keyboardVersion: string): DocLintInput {
  return {
    keyboardId: "test_kbd",
    keyboardVersion,
    targets: [],
    layerIds: [],
    displayName: "Test",
    copyrightHolders: {},
    members: historyMd !== undefined ? { "history-md": historyMd } : {},
    deletedFilenames: [],
  };
}

describe("checkHistoryVersionMatch (3.6/7.1 KM_LINT_HISTORY_VERSION_MISMATCH / KM_LINT_KMN_VERSION_MISMATCH)", () => {
  it("passes when the top HISTORY entry matches the .kmn version", () => {
    expect(checkHistoryVersionMatch(makeInput("## 1.2 (2024-03-01)\n* Added shift layer.\n", "1.2"))).toEqual([]);
  });

  it("emits both codes exactly once each on mismatch, naming both versions", () => {
    const findings = checkHistoryVersionMatch(makeInput("## 1.2 (2024-03-01)\n* Added shift layer.\n", "1.3"));
    expect(findings).toHaveLength(2);
    const history = findings.find((f) => f.code === "KM_LINT_HISTORY_VERSION_MISMATCH");
    const kmn = findings.find((f) => f.code === "KM_LINT_KMN_VERSION_MISMATCH");
    expect(history).toBeDefined();
    expect(kmn).toBeDefined();
    expect(history?.location?.file).toBe("HISTORY.md");
    expect(kmn?.location?.file).toBe("source/test_kbd.kmn");
    expect(history?.message).toContain("1.2");
    expect(history?.message).toContain("1.3");
    expect(kmn?.message).toContain("1.2");
    expect(kmn?.message).toContain("1.3");
  });

  it("returns [] when history-md is absent", () => {
    expect(checkHistoryVersionMatch(makeInput(undefined, "1.0"))).toEqual([]);
  });
});
