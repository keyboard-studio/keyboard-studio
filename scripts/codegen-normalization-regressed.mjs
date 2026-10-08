#!/usr/bin/env node
/**
 * Derives the studio's slim list of keyboards the corpus harness found
 * `regressed` under the spec 086 normalization step, from the committed
 * verification record.
 *
 * The record (`docs/context-normalization-verification.json`) is far too large
 * to ship in the SPA bundle, and the studio needs exactly one fact from it: for
 * which keyboard ids must the step never be proposed. This script copies that
 * fact and nothing else.
 *
 * Usage:
 *   node scripts/codegen-normalization-regressed.mjs
 *
 * Input:  docs/context-normalization-verification.json (committed; no corpus needed)
 * Output: packages/studio/src/lib/generated/normalizationRegressed.generated.json
 *
 * The output is committed so studio tests run without a prebuild, and the
 * prebuild chain regenerates it, so a record refresh cannot leave it stale
 * (normalizationVerification.test.ts also fails on drift).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = resolve(ROOT, "docs", "context-normalization-verification.json");
const OUT = resolve(ROOT, "packages", "studio", "src", "lib", "generated", "normalizationRegressed.generated.json");

/** Pure derivation, exported for the drift test. */
export function deriveRegressedList(record) {
  const regressed = Object.entries(record.keyboards)
    .filter(([, entry]) => entry.outcome === "regressed")
    .map(([id]) => id)
    .sort();
  return {
    generatorVersion: record.manifest.generatorVersion,
    corpusCommit: record.manifest.corpusCommit,
    regressed,
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(RECORD)) {
    console.error(`[ERROR] ${RECORD} not found; run the normalization-step harness first.`);
    process.exit(1);
  }
  const list = deriveRegressedList(JSON.parse(readFileSync(RECORD, "utf8")));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(list, null, 2)}\n`, "utf8");
  console.log(`[OK] ${list.regressed.length} regressed keyboard id(s) -> ${OUT}`);
}
