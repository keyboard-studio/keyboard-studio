import { describe, it, expect } from "vitest";
import { checkHistoryCumulative } from "./check-3-4-history-cumulative.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

const BASE_HISTORY = "## 1.0 (2024-01-01)\n* Initial release.\n";

function makeInput(opts: { historyMd?: string; baseHistoryMdText?: string }): DocLintInput {
  const input: DocLintInput = {
    keyboardId: "test_kbd",
    keyboardVersion: "1.2",
    targets: [],
    layerIds: [],
    displayName: "Test",
    copyrightHolders: {},
    members: opts.historyMd !== undefined ? { "history-md": opts.historyMd } : {},
    deletedFilenames: [],
  };
  return opts.baseHistoryMdText !== undefined
    ? { ...input, baseHistoryMdText: opts.baseHistoryMdText }
    : input;
}

describe("checkHistoryCumulative (3.4 KM_LINT_HISTORY_TRUNCATED)", () => {
  it("passes when the base entry is preserved in the current text", () => {
    const historyMd = `## 1.2 (2024-03-01)\n* Added shift layer.\n\n${BASE_HISTORY}`;
    expect(checkHistoryCumulative(makeInput({ historyMd, baseHistoryMdText: BASE_HISTORY }))).toEqual([]);
  });

  it("fires when a base entry is missing from the current text", () => {
    const historyMd = "## 1.2 (2024-03-01)\n* Added shift layer.\n";
    const findings = checkHistoryCumulative(makeInput({ historyMd, baseHistoryMdText: BASE_HISTORY }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_HISTORY_TRUNCATED");
    expect(findings[0]?.message).toContain("1.0");
    expect(findings[0]?.location?.file).toBe("HISTORY.md");
  });

  it("returns [] when there is no base HISTORY.md (Track 1, no base)", () => {
    expect(checkHistoryCumulative(makeInput({ historyMd: BASE_HISTORY }))).toEqual([]);
  });

  it("returns [] when history-md is absent", () => {
    expect(checkHistoryCumulative(makeInput({ baseHistoryMdText: BASE_HISTORY }))).toEqual([]);
  });
});
