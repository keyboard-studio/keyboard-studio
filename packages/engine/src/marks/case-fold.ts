// Uppercase attachment expansion (spec 049, US2 / FR-002).
//
// The marks attachment station asks only about lowercase/caseless bases (the
// display fold, spec 049 US1). To keep accented capitals typeable without a
// second question, the author's per-mark/per-base attachment map is expanded
// just before buildPlacementWorklist: every checked cased base additively
// checks its uppercase counterpart when that counterpart is present in the
// confirmed alphabet. Reuses the caseCounterpart primitive — no new casing
// rule — and never clears an existing check (FR-007).

import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { caseCounterpart } from "../character-discovery/casePair.js";

/**
 * Additively expand a per-mark/per-base attachment map so every checked cased
 * base also checks its uppercase counterpart when that counterpart is present
 * in `alphabet.bases`. Returns a new map; the input map (and its rows) are not
 * mutated. Caseless bases and bases with no single-character uppercase
 * counterpart are left untouched (FR-003). An existing check is never cleared
 * (FR-007).
 */
export function expandCaseCounterpartAttachments(
  alphabet: ConfirmedAlphabet,
  attachments: Record<string, Record<string, boolean>>,
  bcp47?: string,
): Record<string, Record<string, boolean>> {
  const present = new Set(alphabet.bases);
  const out: Record<string, Record<string, boolean>> = {};

  for (const [mark, row] of Object.entries(attachments)) {
    const next: Record<string, boolean> = { ...row };
    for (const [base, checked] of Object.entries(row)) {
      if (checked !== true) continue;
      const cc = caseCounterpart(base, bcp47);
      if (cc?.direction === "toUpper" && present.has(cc.counterpart)) {
        next[cc.counterpart] = true;
      }
    }
    out[mark] = next;
  }

  return out;
}
