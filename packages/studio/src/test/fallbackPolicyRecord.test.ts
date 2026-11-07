// The keyboard-wide fallback policy in the decision record (issue #2366).
//
// A walk records `fallback-policy` through the real recorder (recordGalleryDecisions
// -> the decision log), the record round-trips through its JSON form, and
// recordToDecisionSet hands it to the replay. A record that predates the decision
// carries nothing, which the replay reads as DEFAULT_FALLBACK_POLICY.

import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FALLBACK_POLICY } from "@keyboard-studio/contracts";
import type { FallbackPolicy } from "@keyboard-studio/contracts";
import { parseDecisionRecord } from "@keyboard-studio/engine";
import {
  resetDecisionEntryIds,
  snapshotDecisionRecord,
  useDecisionLogStore,
} from "../decisions/decisionLogStore.ts";
import { recordGalleryDecisions } from "../decisions/recordGalleryDecisions.ts";
import { migrateFallbackPolicy } from "../survey/carve/fallbackPolicyMigration.ts";
import { recordToDecisionSet } from "./recordToDecisionSet.ts";

const here = dirname(fileURLToPath(import.meta.url));
const legacyRecord = readFileSync(
  resolve(here, "../lib/__fixtures__/decision-points/records/kbdus.json"),
  "utf-8",
);

function walkRecord(policy: FallbackPolicy): string {
  useDecisionLogStore.setState({ entries: [] });
  resetDecisionEntryIds();
  recordGalleryDecisions("fallback_policy", {
    append: useDecisionLogStore.getState().append,
    decisions: [{ id: "fallback-policy", value: policy, provenance: "asked" }],
  });
  return JSON.stringify(snapshotDecisionRecord());
}

describe("fallback-policy in the decision record", () => {
  beforeEach(() => {
    useDecisionLogStore.setState({ entries: [] });
    resetDecisionEntryIds();
  });

  it("a non-default policy is written to the record and replays at assignments", () => {
    const record = walkRecord("pass-through");
    expect(parseDecisionRecord(record).record.entries.map((e) => e.payload)).toEqual([
      expect.objectContaining({ kind: "decision", decisionId: "fallback-policy", value: "pass-through" }),
    ]);
    const set = recordToDecisionSet(record, "assignments");
    expect(migrateFallbackPolicy({ fallbackPolicy: set["fallback-policy"]?.value })).toBe("pass-through");
  });

  it("is not part of the earlier decision points", () => {
    const record = walkRecord("pass-through");
    expect(recordToDecisionSet(record, "carve")["fallback-policy"]).toBeUndefined();
    expect(recordToDecisionSet(record, "marks")["fallback-policy"]).toBeUndefined();
  });

  it("a record without the decision replays with the default", () => {
    const set = recordToDecisionSet(legacyRecord, "tolerance");
    expect(set["fallback-policy"]).toBeUndefined();
    expect(migrateFallbackPolicy({ fallbackPolicy: set["fallback-policy"]?.value })).toBe(DEFAULT_FALLBACK_POLICY);
  });

  it("an unknown recorded value reads as the default", () => {
    expect(migrateFallbackPolicy({ fallbackPolicy: "bogus" })).toBe(DEFAULT_FALLBACK_POLICY);
  });
});
