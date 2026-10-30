// Reviewed explanations of parity differences (spec 107 FR-021, FR-022).
//
// Each entry needs a case id, the decision id, the reason, and the product
// change (commit or PR) or record age (`record-age:<build>`) that explains it.
// The records under lib/__fixtures__/decision-points/records/ are never edited
// to make parity pass. An entry whose difference no longer occurs is reported
// as stale and must be removed.
//
// The fix for a difference is never author logic (FR-017): make the author
// call the product as the UI does, lift the rule, or list it Playwright-only.
// Only a product change or an old record earns an entry here.

import type { ParityAllowEntry } from "./caseTypes.ts";

export const PARITY_ALLOW_LIST: readonly ParityAllowEntry[] = [];
