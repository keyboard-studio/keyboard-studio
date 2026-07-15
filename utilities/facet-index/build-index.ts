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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "../../packages/engine/src/codec/index.js";
import { parseKps, extractScriptSubtag } from "../../packages/engine/src/base-browser/kps-parser.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse as parseYaml } from "yaml";

import { scanCorpus, type ScannedKeyboard } from "./scan.js";
import {
  computeSourceHashes,
  planRescan,
  scannerVersion,
  unicodeVersion,
  INDEX_SCHEMA_VERSION,
} from "./freshness.js";
import { writeStable } from "./writeStable.js";
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
// Facet-definition loading (minimal — the full loader + validator is T024)
// ---------------------------------------------------------------------------

/**
 * Read every `content/keyboard-facets/*.yaml` definition. This is
 * intentionally minimal (no schema validation beyond what YAML parsing
 * itself enforces) — the full C1-C5-validating loader is T024's job. US1
 * only needs the fields build-index reads: `id`.
 */
function loadFacetDefs(): FacetDefinition[] {
  if (!existsSync(FACET_DEFS_DIR)) return [];
  const files = readdirSync(FACET_DEFS_DIR).filter((f) => f.endsWith(".yaml"));
  return files
    .map((f) => parseYaml(readFileSync(join(FACET_DEFS_DIR, f), "utf8")) as FacetDefinition)
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Classifier registry (US1: only `script` is wired)
// ---------------------------------------------------------------------------

interface ClassifierPair {
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

const CLASSIFIERS: Record<string, ClassifierPair> = {
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

function buildKeyboardRecord(kb: ScannedKeyboard, defs: FacetDefinition[]): KeyboardRecord {
  const { ir, parseError } = parseIr(kb);

  const facets: Record<string, Categorization> = {};
  for (const def of defs) {
    const pair = CLASSIFIERS[def.id];
    if (!pair) {
      throw new Error(
        `facet-index build: no classifier registered for facet id "${def.id}" ` +
          `(content/keyboard-facets/${def.id}.yaml exists but utilities/facet-index/build-index.ts ` +
          `has no CLASSIFIERS entry for it)`,
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

  const defs = loadFacetDefs();
  const scanOpts: { corpusRoot?: string; limit?: number | null } = { limit: opts.limit ?? null };
  if (opts.corpusRoot !== undefined) scanOpts.corpusRoot = opts.corpusRoot;
  const scan = scanCorpus(scanOpts);

  // US3's full incremental wiring is T030; this is the minimal pass-through
  // so the `incremental` option is not silently ignored — carry forward a
  // keyboard's prior record verbatim when its source hashes are unchanged and
  // no version bump forces a full rescan.
  let prior: FacetIndex | null = null;
  if (incremental && outPath && existsSync(outPath)) {
    try {
      prior = JSON.parse(readFileSync(outPath, "utf8")) as FacetIndex;
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
    keyboards[kb.id] = buildKeyboardRecord(kb, defs);
  }

  const facetIds = defs.map((d) => d.id).sort();
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

  if (outPath) writeStable(outPath, index);

  return index;
}
