/**
 * Splice tool for the `script-family` / `combining-mark-repertoire` data-hole
 * fix (data/iso15924-script-family.json gained 49 ISO-15924 codes).
 *
 * The shipped `docs/keyboard-facet-index.json` was built against the pinned
 * corpus commit recorded in its manifest (`corpusCommit`), which is OLDER than
 * the local `../keyboards` checkout. A full rebuild would therefore churn
 * hundreds of unrelated keyboards against a different corpus commit — forbidden.
 * Instead this script surgically recomputes exactly two facets
 * (`script-family`, `combining-mark-repertoire`) for exactly the keyboards the
 * data-file edit can affect, scanning a throwaway worktree of the corpus pinned
 * at the manifest's `corpusCommit`, and leaves every other byte of the artifact
 * untouched.
 *
 * Reuses the tool's own scan/codec/classifier/validator plumbing — does not
 * reimplement any classification logic.
 *
 * TODO: this is a one-shot transitional tool (has-icon precedent) — delete it
 * once a full facet-index rebuild against a newer pinned corpus subsumes this
 * splice.
 *
 * Usage: tsx splice-script-family.ts --pinned-corpus <path> [--out <path>]
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "../../packages/engine/src/codec/index.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";

import { loadFacetDefs } from "./load-defs.js";
import { validateCategorization } from "./validate.js";
import { scanCorpus, type ScannedKeyboard } from "./scan.js";
import { classifyScriptFamily } from "./script-family-classifier.js";
import {
  classifyCombiningMarkRepertoire,
  combiningMarkRepertoireFallback,
} from "./combining-mark-repertoire-classifier.js";
import { emptyTierCounts, bumpTierCounts } from "./build-index.js";
import { writeStable, writeTextIfChanged } from "./writeStable.js";
import { renderCompanionMd } from "./companion.js";
import type { Categorization, FacetDefinition, FacetIndex } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const FACET_DEFS_DIR = resolve(REPO_ROOT, "content", "keyboard-facets");
const DEFAULT_OUT_PATH = resolve(REPO_ROOT, "docs", "keyboard-facet-index.json");

function parseArgs(argv: string[]): { pinnedCorpus: string; outPath: string } {
  let pinnedCorpus = "";
  let outPath = DEFAULT_OUT_PATH;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pinned-corpus") pinnedCorpus = argv[++i] ?? "";
    else if (argv[i] === "--out") outPath = resolve(argv[++i] ?? DEFAULT_OUT_PATH);
  }
  if (!pinnedCorpus) {
    throw new Error("splice-script-family: --pinned-corpus <path> is required");
  }
  return { pinnedCorpus: resolve(pinnedCorpus), outPath };
}

/** True when a keyboard's committed record is a candidate for recompute: its
 * `script` is a determined ISO-15924 code (not "undetermined") but its
 * `script-family` did not resolve to one of the five families. */
function isAffected(rec: FacetIndex["keyboards"][string], familyValues: Set<string>): boolean {
  const scriptVal = rec.facets.script?.value;
  if (typeof scriptVal !== "string" || scriptVal === "undetermined") return false;
  const familyVal = rec.facets["script-family"]?.value;
  return !(typeof familyVal === "string" && familyValues.has(familyVal));
}

function parseIr(kb: ScannedKeyboard): KeyboardIR | undefined {
  if (kb.kmnText === null) return undefined;
  try {
    return parse(kb.kmnText, kb.id).ir;
  } catch {
    return undefined;
  }
}

function main(): void {
  const { pinnedCorpus, outPath } = parseArgs(process.argv.slice(2));

  const index = JSON.parse(readFileSync(outPath, "utf8")) as FacetIndex;
  const defs = loadFacetDefs(FACET_DEFS_DIR);
  const sfDef = defs.find((d): d is FacetDefinition => d.id === "script-family");
  const cmrDef = defs.find((d): d is FacetDefinition => d.id === "combining-mark-repertoire");
  if (!sfDef || !cmrDef) {
    throw new Error("splice-script-family: script-family / combining-mark-repertoire facet defs not found");
  }
  if (!sfDef.limits.values) {
    throw new Error("splice-script-family: script-family facet def has no limits.values");
  }
  const familyValues = new Set(sfDef.limits.values);

  const affectedIds = Object.keys(index.keyboards)
    .filter((id) => isAffected(index.keyboards[id]!, familyValues))
    .sort();

  console.log(`[splice-script-family] affected candidates: ${affectedIds.length}`);

  const scan = scanCorpus({ corpusRoot: pinnedCorpus });
  const byId = new Map(scan.keyboards.map((kb) => [kb.id, kb]));

  const changedIds: string[] = [];
  const stillUndeterminedIds: string[] = [];

  for (const id of affectedIds) {
    const kb = byId.get(id);
    if (!kb) {
      throw new Error(`splice-script-family: keyboard "${id}" not found in pinned corpus scan`);
    }
    const ir = parseIr(kb);
    const contentSf = ir ? classifyScriptFamily(ir, sfDef) : null;
    if (!contentSf) {
      // Still unmapped (one of the 7 deliberately-undetermined codes, or a
      // genuine parse failure) — leave this keyboard's facets byte-identical.
      stillUndeterminedIds.push(id);
      continue;
    }

    const contentCmr = ir ? classifyCombiningMarkRepertoire(ir, cmrDef) : null;
    const cmr: Categorization = contentCmr ?? combiningMarkRepertoireFallback(kb, cmrDef);

    const problems = [
      ...validateCategorization(id, sfDef, contentSf),
      ...validateCategorization(id, cmrDef, cmr),
    ];
    if (problems.length > 0) {
      throw new Error(`splice-script-family: ${problems.length} validation failure(s):\n  ${problems.join("\n  ")}`);
    }

    const rec = index.keyboards[id]!;
    rec.facets = {
      ...rec.facets,
      "script-family": contentSf,
      "combining-mark-repertoire": cmr,
    };
    changedIds.push(id);
  }

  // Recompute ONLY the facetCoverage tallies for the two spliced facets.
  for (const facetId of ["script-family", "combining-mark-repertoire"]) {
    const counts = emptyTierCounts();
    for (const rec of Object.values(index.keyboards)) {
      const cat = rec.facets[facetId];
      if (!cat) throw new Error(`splice-script-family: keyboard missing facet "${facetId}"`);
      bumpTierCounts(counts, cat);
    }
    index.manifest.facetCoverage[facetId] = counts;
  }

  writeStable(outPath, index);
  // Companion audit md mirrors the JSON (same write-only-if-changed discipline).
  writeTextIfChanged(outPath.replace(/\.json$/, ".md"), renderCompanionMd(index));

  console.log(`[splice-script-family] changed: ${changedIds.length}`);
  console.log(`[splice-script-family] changedIds: ${JSON.stringify(changedIds.sort())}`);
  console.log(`[splice-script-family] still undetermined (unchanged): ${stillUndeterminedIds.length}`);
  console.log(`[splice-script-family] stillUndeterminedIds: ${JSON.stringify(stillUndeterminedIds.sort())}`);
}

main();
