import { describe, it, expect } from "vitest";
import { checkHistoryEntryFormat } from "./check-3-5-history-entry-format.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

function makeInput(historyMd: string | undefined): DocLintInput {
  return {
    keyboardId: "test_kbd",
    keyboardVersion: "1.0",
    targets: [],
    layerIds: [],
    displayName: "Test",
    copyrightHolders: {},
    members: historyMd !== undefined ? { "history-md": historyMd } : {},
    deletedFilenames: [],
  };
}

describe("checkHistoryEntryFormat (3.5 KM_LINT_HISTORY_ENTRY_FORMAT)", () => {
  it("passes for a well-formed entry", () => {
    expect(checkHistoryEntryFormat(makeInput("## 1.0 (2024-01-01)\n* Initial release.\n"))).toEqual([]);
  });

  it("fires when the heading isn't <version> (<date>)", () => {
    const findings = checkHistoryEntryFormat(makeInput("## Version 1.0\n* Initial release.\n"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_HISTORY_ENTRY_FORMAT");
  });

  it("fires when the date isn't YYYY-MM-DD", () => {
    const findings = checkHistoryEntryFormat(makeInput("## 1.0 (Jan 2024)\n* Initial release.\n"));
    expect(findings).toHaveLength(1);
  });

  it("fires when there are no bullet items", () => {
    const findings = checkHistoryEntryFormat(makeInput("## 1.0 (2024-01-01)\n"));
    expect(findings).toHaveLength(1);
  });

  it("fires when a stray non-bullet line is present", () => {
    const findings = checkHistoryEntryFormat(
      makeInput("## 1.0 (2024-01-01)\nInitial release, no bullet.\n"),
    );
    expect(findings).toHaveLength(1);
  });

  it("returns [] when history-md is absent", () => {
    expect(checkHistoryEntryFormat(makeInput(undefined))).toEqual([]);
  });
});
