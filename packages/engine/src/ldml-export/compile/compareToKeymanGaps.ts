// Splits a Keyman compile's messages into known Keyman limitations and exporter defects
// (spec 108 FR-072). Pure: no I/O, no clock.
//
// An error is expected only when a Keyman-gap (K) row that is present in this export lists its code
// in `keymanCodes`. A code listed by a K row the export does not have is still unexpected: the
// gap it names is not what this export hit.

import type { ProfileRow, TargetProfile } from "../profiles/types.js";
import type { LdmlClassification } from "../types.js";
import type { KeymanMessage } from "./loadLdmlCompiler.js";

export interface ExpectedKeymanError {
  message: KeymanMessage;
  row: ProfileRow;
}

export interface KeymanGapComparison {
  /** Errors a present K row accounts for, each tied to its row. */
  expected: ExpectedKeymanError[];
  /** Errors nothing accounts for: exporter defects, with the compiler's own message and line. */
  unexpected: KeymanMessage[];
  /** Warnings and hints, passed through; never counted as errors. */
  warnings: KeymanMessage[];
}

export function compareToKeymanGaps(
  messages: readonly KeymanMessage[],
  classification: LdmlClassification,
  profile: TargetProfile,
): KeymanGapComparison {
  const rowByCode = new Map<string, ProfileRow>();
  for (const item of classification.items) {
    if (item.status !== "K") continue;
    const row = profile.rows.get(item.rowId);
    for (const code of row?.keymanCodes ?? []) if (row !== undefined && !rowByCode.has(code)) rowByCode.set(code, row);
  }
  const out: KeymanGapComparison = { expected: [], unexpected: [], warnings: [] };
  for (const message of messages) {
    if (message.severity === "warn" || message.severity === "hint") {
      out.warnings.push(message);
    } else if (message.severity === "error" || message.severity === "fatal") {
      const row = rowByCode.get(message.code);
      if (row === undefined) out.unexpected.push(message);
      else out.expected.push({ message, row });
    }
  }
  return out;
}
