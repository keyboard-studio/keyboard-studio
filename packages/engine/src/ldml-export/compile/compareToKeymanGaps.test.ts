import { describe, expect, it } from "vitest";
import { resolveLdmlProfile } from "../profiles/resolve.js";
import type { ProfileRow, TargetProfile } from "../profiles/types.js";
import type { CompatibilityItem, LdmlClassification, RowId } from "../types.js";
import { compareToKeymanGaps } from "./compareToKeymanGaps.js";
import type { KeymanMessage } from "./loadLdmlCompiler.js";

/** Profile 46 with two K rows that name Keyman codes (the shipped profile lists none yet). */
function profileWithGaps(): TargetProfile {
  const base = resolveLdmlProfile("46");
  const rows = new Map<RowId, ProfileRow>(base.rows);
  rows.set("4.10", { ...(rows.get("4.10") as ProfileRow), keymanCodes: ["ERROR_GapOne", "ERROR_GapTwo"] });
  rows.set("5.15", { ...(rows.get("5.15") as ProfileRow), keymanCodes: ["ERROR_TouchGap"] });
  return { ...base, rows };
}

function item(rowId: RowId, status: CompatibilityItem["status"]): CompatibilityItem {
  return {
    siteKey: `X|${rowId}|n`,
    rowId,
    status,
    code: null,
    severity: null,
    nodeKey: "n",
    line: null,
    owner: null,
    construct: "c",
    consequence: "q",
    params: {},
    side: "hardware",
  };
}

function classification(...items: CompatibilityItem[]): LdmlClassification {
  return {
    profileId: "46",
    items,
    counts: { M: 0, A: 0, N: 0, K: items.filter((i) => i.status === "K").length },
    baseLayout: { id: "us", label: "US", source: "en-US" },
    ansiOnly: false,
    touchPresent: false,
  };
}

const msg = (code: string, severity: KeymanMessage["severity"], line?: number): KeymanMessage => ({
  code,
  severity,
  text: `text of ${code}`,
  ...(line === undefined ? {} : { line }),
});

describe("compareToKeymanGaps", () => {
  it("gives nothing expected and nothing unexpected for a clean compile without K rows", () => {
    const r = compareToKeymanGaps([], classification(item("2.1", "M")), profileWithGaps());
    expect(r).toEqual({ expected: [], unexpected: [], warnings: [] });
  });

  it("ties every error whose code a present K row lists to that row", () => {
    const r = compareToKeymanGaps(
      [msg("ERROR_GapOne", "error"), msg("ERROR_TouchGap", "fatal")],
      classification(item("4.10", "K"), item("5.15", "K")),
      profileWithGaps(),
    );
    expect(r.unexpected).toEqual([]);
    expect(r.expected.map((e) => [e.message.code, e.row.id])).toEqual([
      ["ERROR_GapOne", "4.10"],
      ["ERROR_TouchGap", "5.15"],
    ]);
  });

  it("treats an error no present K row covers as unexpected, keeping the compiler text and line", () => {
    const r = compareToKeymanGaps(
      [msg("ERROR_GapOne", "error"), msg("ERROR_Surprise", "error", 12)],
      classification(item("4.10", "K")),
      profileWithGaps(),
    );
    expect(r.expected).toHaveLength(1);
    expect(r.unexpected).toEqual([{ code: "ERROR_Surprise", severity: "error", text: "text of ERROR_Surprise", line: 12 }]);
  });

  it("keeps a code listed by an absent K row unexpected", () => {
    const r = compareToKeymanGaps([msg("ERROR_TouchGap", "error")], classification(item("4.10", "K")), profileWithGaps());
    expect(r.expected).toEqual([]);
    expect(r.unexpected.map((m) => m.code)).toEqual(["ERROR_TouchGap"]);
  });

  it("does not count a non-K item as a present K row", () => {
    const r = compareToKeymanGaps([msg("ERROR_GapOne", "error")], classification(item("4.10", "N")), profileWithGaps());
    expect(r.expected).toEqual([]);
    expect(r.unexpected).toHaveLength(1);
  });

  it("passes warnings and hints through and never counts them as errors", () => {
    const r = compareToKeymanGaps(
      [msg("WARN_X", "warn"), msg("HINT_Y", "hint"), msg("INFO_Z", "info")],
      classification(),
      profileWithGaps(),
    );
    expect(r.expected).toEqual([]);
    expect(r.unexpected).toEqual([]);
    expect(r.warnings.map((m) => m.code)).toEqual(["WARN_X", "HINT_Y"]);
  });
});
