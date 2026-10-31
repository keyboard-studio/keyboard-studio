// The 053 decision record of an author run (spec 107 T015, FR-006). The record
// is the one the UI's recording path built during the walk -- the
// decision-log store, appended by the studio recorder the reducer deps carry
// -- never a hand-built JSON. This module only reads it back and proves it
// round-trips: parseDecisionRecord accepts its serialized form and
// recordToDecisionSet folds it.

import type { DecisionRecord } from "@keyboard-studio/contracts";
import { parseDecisionRecord } from "@keyboard-studio/engine";
import { snapshotDecisionRecord } from "../../decisions/decisionLogStore.ts";
import { recordToDecisionSet } from "../recordToDecisionSet.ts";

export function readRunRecord(): DecisionRecord {
  const record = snapshotDecisionRecord();
  // The draft-restore idiom (lib/draftPersistence.ts): the record as JSON, read back.
  const parsed = parseDecisionRecord(JSON.stringify(record));
  if (parsed.unreadable === true) throw new Error("decision record: parseDecisionRecord found it unreadable");
  if (parsed.droppedCount > 0) {
    throw new Error(`decision record: parseDecisionRecord dropped ${parsed.droppedCount} entr(y/ies)`);
  }
  // Folds without throwing; the folded set is what parity compares.
  recordToDecisionSet(parsed.record, "tolerance");
  return parsed.record;
}
