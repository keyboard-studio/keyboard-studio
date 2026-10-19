// Shape pin for the §7.5.1 corpus-evaluation record (issue #297): a record
// and a cluster construct with exactly the documented fields, and the
// agreement-relevant fields round-trip through JSON unchanged (the report
// is a JSON artifact).

import { describe, expect, it } from "vitest";

import { ImportStatus } from "./keyboard-ir";
import type { StrategyDivergence, StrategyDivergenceCluster } from "./strategyDivergence";

describe("StrategyDivergence record shape", () => {
  it("constructs a complete record and survives a JSON round-trip", () => {
    const record: StrategyDivergence = {
      keyboardId: "sil_euro_latin",
      sourcePath: "release/sil/sil_euro_latin/source/sil_euro_latin.kmn",
      importStatus: ImportStatus.CleanWithOpaque,
      axes: {
        scale: "large",
        scriptClass: "alphabetic",
        phoneticIntuition: "strong",
        diacriticBehavior: "multi-family",
        multiMode: "single",
        constraintEnforcement: "none",
        spareKeyAvailability: "RAlt only",
        remapPosture: "addition",
      },
      axisFills: [{ axis: "multiMode", value: "single", source: "script-class-prior" }],
      treePrimary: "S-05",
      treeSecondaries: ["S-04"],
      triggeredRule: 5,
      recognizedPrimary: "S-02",
      recognizedTally: { "S-02": 38, "S-01": 3 },
      recognizedRatio: 0.27,
    };
    const roundTripped = JSON.parse(JSON.stringify(record)) as StrategyDivergence;
    expect(roundTripped).toEqual(record);
    expect(roundTripped.treePrimary).not.toBe(roundTripped.recognizedPrimary);
  });

  it("constructs a cluster over member records", () => {
    const cluster: StrategyDivergenceCluster = {
      treePrimary: "S-05",
      triggeredRule: 5,
      recognizedPrimary: "S-02",
      count: 2,
      keyboardIds: ["kb_a", "kb_b"],
    };
    expect(cluster.count).toBe(cluster.keyboardIds.length);
  });
});
