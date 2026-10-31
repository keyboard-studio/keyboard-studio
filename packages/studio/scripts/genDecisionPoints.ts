// Writes the decision-point fixtures (spec 106 US1) from the committed walk
// records: one DecisionSet JSON per base keyboard x decision point, under
// src/lib/__fixtures__/decision-points/<base>/<profile>/<point>.decisions.json.
//
// Run through the content-i18n macro shim (the question registry pulls in Lingui
// macros that only compile under vite). Deterministic: same records in, same
// bytes out (no timestamps, fixed key order, stable indentation). Never
// hand-edit the output; re-run
//   pnpm --filter @keyboard-studio/studio run fixtures:decision-points

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DECISION_POINTS,
  DECISION_POINT_BASES,
  DECISION_POINT_FIXTURE_DIR,
  fixtureRelPath,
} from "../src/test/decisionPointBases.ts";
import { recordToDecisionSet } from "../src/test/recordToDecisionSet.ts";

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(studioRoot, DECISION_POINT_FIXTURE_DIR);

/** Stable text: decision ids sorted, values keep their recorded key order. */
function serialize(set: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.entries(set).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

let written = 0;
for (const b of DECISION_POINT_BASES) {
  const record = readFileSync(resolve(fixtureRoot, "records", b.recordFile), "utf-8");
  for (const point of DECISION_POINTS) {
    const out = resolve(fixtureRoot, fixtureRelPath(b, point));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, serialize(recordToDecisionSet(record, point)), "utf-8");
    written++;
  }
}
process.stdout.write(`[OK] wrote ${written} decision-point fixtures under ${DECISION_POINT_FIXTURE_DIR}\n`);
