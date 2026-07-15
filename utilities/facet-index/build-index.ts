/**
 * Build orchestrator for the per-keyboard facet index (spec 036 T018).
 *
 * load facet defs -> scanCorpus -> per keyboard: classify (content-derived) or
 * fall back (declared-metadata / default-fallback / undetermined) -> assemble
 * records + per-keyboard freshness -> build the manifest -> write via
 * writeStable.
 *
 * US1 MVP scope note: only one facet (`script`) has a classifier wired below.
 * A future `content/keyboard-facets/*.yaml` definition without a registered
 * classifier fails the build loud (rather than silently shipping a partial
 * index) — that is the honest expression of "lands exactly one facet" (plan
 * Summary) until 037 registers more classifiers here.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "../../packages/engine/src/codec/index.js";
import { parseKps, extractScriptSubtag } from "../../packages/engine/src/base-browser/kps-parser.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";

import { loadFacetDefs } from "./load-defs.js";
import { validateCategorization } from "./validate.js";
import { scanCorpus, type ScannedKeyboard } from "./scan.js";
import {
  computeSourceHashes,
  planRescan,
  scannerVersion,
  unicodeVersion,
  INDEX_SCHEMA_VERSION,
} from "./freshness.js";
import { writeStable, writeTextIfChanged } from "./writeStable.js";
import { renderCompanionMd } from "./companion.js";
import { classifyScript } from "./script-classifier.js";
import { deriveScriptFallback } from "./fallback.js";
import type {
  Categorization,
  FacetDefinition,
  FacetIndex,
  FacetTierCounts,
  IndexManifest,
  KeyboardRecord,
  ReferencePin,
} from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const FACET_DEFS_DIR = resolve(REPO_ROOT, "content", "keyboard-facets");
const UCD_SOURCES_PATH = resolve(HERE, "data", "SOURCES.json");
const LANGTAGS_PIN_PATH = resolve(REPO_ROOT, "scripts", "langtags-version.json");
/** Default write target: `docs/keyboard-facet-index.json` at the repo root. */
export const DEFAULT_OUT_PATH = resolve(REPO_ROOT, "docs", "keyboard-facet-index.json");

// ---------------------------------------------------------------------------
// Classifier registry (US1: only `script` is wired)
// ---------------------------------------------------------------------------

/**
 * One facet's derivation pair: `classify` reads the parsed IR (content-derived
 * tier, may return null when there is no evidence); `fallback` derives from
 * declared metadata / defaults when `classify` yields nothing. The build shell
 * is facet-agnostic — it iterates `facetIds` and dispatches through this
 * registry; nothing script-specific lives in the per-keyboard loop (T026).
 */
export interface ClassifierPair {
  classify: (ir: KeyboardIR, def: FacetDefinition) => Categorization | null;
  fallback: (kb: ScannedKeyboard, def: FacetDefinition) => Categorization;
}

function scriptFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  const kpsSource = kb.sources.find((s) => s.path === kb.kpsPath);
  const kpsXml = kpsSource ? kpsSource.bytes.toString("utf8") : "";
  const kpsMeta = parseKps(kpsXml);
  const declaredScript = extractDeclaredScript(kpsMeta.languages);
  return deriveScriptFallback({ bcp47Tags: kpsMeta.languages, declaredScript }, def);
}

/**
 * An explicit script subtag already present in a declared BCP47 tag (e.g.
 * "Deva" from "hi-Deva"), or null when none of the declared tags carry one.
 *
 * Deliberately NOT `parseKps(...).script` — that field defaults to "Latn"
 * when no tag carries an explicit script subtag (a UI-display convenience),
 * which would misreport every such keyboard as having a *declared* Latin
 * script instead of falling through to the langtags default-fallback tier.
 */
function extractDeclaredScript(bcp47Tags: string[]): string | null {
  for (const tag of bcp47Tags) {
    const script = extractScriptSubtag(tag);
    if (script !== null) return script;
  }
  return null;
}

/**
 * The shipped classifier registry (US1: only `script` is wired; 037 registers
 * more). Exported so tests can compose it with a demo facet to prove the shell
 * is pure-addition extensible (T026/T022) without polluting the shipped set.
 */
export const DEFAULT_CLASSIFIERS: Record<string, ClassifierPair> = {
  script: { classify: classifyScript, fallback: scriptFallback },
};

// ---------------------------------------------------------------------------
// Per-keyboard record assembly
// ---------------------------------------------------------------------------

interface ParseIrResult {
  ir: KeyboardIR | undefined;
  /**
   * Set only when `parse()` THREW (a genuine codec parse failure) — carries
   * `err.message` so it can be surfaced on the fallback categorization's
   * `notes` field. Undefined when the keyboard simply has no primary `.kmn`
   * (`kb.kmnText === null`); that is not a failure and must not get a note.
   */
  parseError: string | undefined;
}

function parseIr(kb: ScannedKeyboard): ParseIrResult {
  if (kb.kmnText === null) return { ir: undefined, parseError: undefined };
  try {
    return { ir: parse(kb.kmnText, kb.id).ir, parseError: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ir: undefined, parseError: message };
  }
}

function buildKeyboardRecord(
  kb: ScannedKeyboard,
  defs: FacetDefinition[],
  classifiers: Record<string, ClassifierPair>,
): KeyboardRecord {
  const { ir, parseError } = parseIr(kb);

  const facets: Record<string, Categorization> = {};
  for (const def of defs) {
    const pair = classifiers[def.id];
    if (!pair) {
      throw new Error(
        `facet-index build: no classifier registered for facet id "${def.id}" ` +
          `(content/keyboard-facets/${def.id}.yaml exists but utilities/facet-index/build-index.ts ` +
          `has no DEFAULT_CLASSIFIERS entry for it)`,
      );
    }
    const contentCategorization = ir ? pair.classify(ir, def) : null;
    if (contentCategorization) {
      facets[def.id] = contentCategorization;
    } else {
      const fallback = pair.fallback(kb, def);
      // Distinguish a genuine codec parse failure from "no .kmn at all" /
      // "parsed fine but no content evidence for this facet" — only the
      // former gets a note (audit honesty, P1-A).
      facets[def.id] = parseError ? { ...fallback, notes: `parse failure: ${parseError}` } : fallback;
    }
  }

  // SC-001 / X3: every keyboard in scope MUST have a record for every defined
  // facet. The loop above guarantees this by construction (throw above), but
  // assert it explicitly so a future refactor that breaks the guarantee fails
  // loud here rather than downstream in the lint.
  if (Object.keys(facets).length !== defs.length) {
    throw new Error(`facet-index build: keyboard "${kb.id}" is missing a facet record (SC-001/X3)`);
  }

  // X1/X2/X4: validate every freshly-produced categorization at the point of
  // production (T025; FR-008). A bad value — a classifier emitting outside its
  // facet's limits, a malformed distribution — fails the build loud rather than
  // being written (US2 acceptance 2). The repo lint (T032) re-checks the
  // committed artifact as a second gate.
  const problems: string[] = [];
  for (const def of defs) {
    for (const p of validateCategorization(kb.id, def, facets[def.id]!)) problems.push(p);
  }
  if (problems.length > 0) {
    throw new Error(
      `facet-index build: ${problems.length} record-validation failure(s):\n  ` + problems.join("\n  "),
    );
  }

  return {
    freshness: {
      sourceHashes: computeSourceHashes(kb),
      analyzedAtScannerVersion: scannerVersion,
    },
    facets,
  };
}

// ---------------------------------------------------------------------------
// Manifest assembly
// ---------------------------------------------------------------------------

function loadReferencePins(): ReferencePin[] {
  const pins: ReferencePin[] = [];
  if (existsSync(UCD_SOURCES_PATH)) {
    const sources = JSON.parse(readFileSync(UCD_SOURCES_PATH, "utf8")) as {
      files: Array<{ file: string; sha256: string }>;
    };
    for (const f of sources.files) pins.push({ file: f.file, sha256: f.sha256 });
  }
  if (existsSync(LANGTAGS_PIN_PATH)) {
    const langtagsPin = JSON.parse(readFileSync(LANGTAGS_PIN_PATH, "utf8")) as { sha256: string };
    pins.push({ file: "scripts/langtags-version.json", sha256: langtagsPin.sha256 });
  }
  return pins;
}

function emptyTierCounts(): FacetTierCounts {
  return { content: 0, declared: 0, fallback: 0, undetermined: 0 };
}

function bumpTierCounts(counts: FacetTierCounts, categorization: Categorization): void {
  if (categorization.value === "undetermined") {
    counts.undetermined += 1;
  } else if (categorization.provenanceTier === "content-derived") {
    counts.content += 1;
  } else if (categorization.provenanceTier === "declared-metadata") {
    counts.declared += 1;
  } else {
    counts.fallback += 1;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildOptions {
  corpusRoot?: string;
  limit?: number | null;
  incremental?: boolean;
  outPath?: string;
  /** Override the facet-definition dir (default `content/keyboard-facets`). Tests only. */
  facetDefsDir?: string;
  /** Override the classifier registry (default `DEFAULT_CLASSIFIERS`). Tests only. */
  classifiers?: Record<string, ClassifierPair>;
}

/**
 * Build the facet index and return it. Writes to `opts.outPath` (default
 * `docs/keyboard-facet-index.json`) via `writeStable` when a path is set (the
 * default is always set; pass `outPath: ""` from a caller that wants an
 * in-memory-only build for tests).
 */
export function buildIndex(opts: BuildOptions = {}): FacetIndex {
  const outPath = opts.outPath ?? DEFAULT_OUT_PATH;
  const incremental = opts.incremental ?? false;

  const defs = loadFacetDefs(opts.facetDefsDir ?? FACET_DEFS_DIR);
  const classifiers = opts.classifiers ?? DEFAULT_CLASSIFIERS;
  const scanOpts: { corpusRoot?: string; limit?: number | null } = { limit: opts.limit ?? null };
  if (opts.corpusRoot !== undefined) scanOpts.corpusRoot = opts.corpusRoot;
  const scan = scanCorpus(scanOpts);

  // Incremental rescan (US3, T030): read the prior committed index and carry a
  // keyboard's record forward verbatim when its source hashes are unchanged and
  // no version bump forces a full recompute; only the dirty set re-analyzes.
  const currentFacetIds = defs.map((d) => d.id).sort();
  let prior: FacetIndex | null = null;
  if (incremental && outPath && existsSync(outPath)) {
    try {
      const parsed = JSON.parse(readFileSync(outPath, "utf8")) as FacetIndex;
      // A change to the facet SET (a facet added/removed since the prior build)
      // reshapes every record — the prior records would be missing/carrying an
      // extra facet key. Discard the prior so the build falls back to a full
      // rescan rather than carrying forward stale-shaped records (which would
      // trip the X3 coverage assert below with a confusing message).
      const priorFacetIds = [...(parsed.manifest?.facetIds ?? [])].sort();
      if (JSON.stringify(priorFacetIds) === JSON.stringify(currentFacetIds)) prior = parsed;
    } catch {
      prior = null;
    }
  }

  const scannedWithHashes = scan.keyboards.map((kb) => ({
    id: kb.id,
    sourceHashes: computeSourceHashes(kb),
  }));
  const plan = incremental
    ? planRescan(prior, scannedWithHashes, { scannerVersion, unicodeVersion })
    : { dirtyIds: scan.keyboards.map((k) => k.id), carryForwardIds: [] as string[], fullRescan: true };
  const dirtyIds = new Set(plan.dirtyIds);

  const keyboards: Record<string, KeyboardRecord> = {};
  for (const kb of scan.keyboards) {
    const priorRecord = prior?.keyboards[kb.id];
    if (!dirtyIds.has(kb.id) && priorRecord) {
      keyboards[kb.id] = priorRecord;
      continue;
    }
    keyboards[kb.id] = buildKeyboardRecord(kb, defs, classifiers);
  }

  const facetIds = currentFacetIds;
  const facetCoverage: Record<string, FacetTierCounts> = {};
  for (const facetId of facetIds) facetCoverage[facetId] = emptyTierCounts();
  for (const record of Object.values(keyboards)) {
    for (const facetId of facetIds) {
      const categorization = record.facets[facetId];
      if (!categorization) {
        throw new Error(`facet-index build: a keyboard record is missing facet "${facetId}" (SC-001/X3)`);
      }
      bumpTierCounts(facetCoverage[facetId]!, categorization);
    }
  }

  const manifest: IndexManifest = {
    schemaVersion: INDEX_SCHEMA_VERSION,
    scannerVersion,
    corpusCommit: scan.corpusCommit,
    corpusScope: scan.corpusScope,
    unicodeVersion,
    referencePins: loadReferencePins(),
    keyboardCount: Object.keys(keyboards).length,
    facetCoverage,
    facetIds,
  };

  const index: FacetIndex = { manifest, keyboards };

  if (outPath) {
    writeStable(outPath, index);
    // Companion audit md alongside the JSON (same stem, `.md`) — FR-007, T034.
    writeTextIfChanged(outPath.replace(/\.json$/, ".md"), renderCompanionMd(index));
  }

  return index;
}
