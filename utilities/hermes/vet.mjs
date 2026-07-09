#!/usr/bin/env node
// vet.mjs — Unattended overnight MODEL-VETTING orchestrator.
//
// Shells out to hermes-run.mjs for all model work (no Claude calls, no source writes).
// Runs models SEQUENTIALLY (single GPU). RESILIENT: one bad model never aborts the batch.
//
// Scorecard A — SIMPLIFIER: per-file fan-out, scored against gold findings (gold-s10.json
//   gold-s07.json) using line-range overlap (±5-line tolerance) and confidence-weighted recall.
//   FILE LISTS:
//     S10 = ['packages/engine/src/codec/parse.ts']  (gold has 8 findings)
//     S07 = all non-test .ts files in packages/engine/src/pattern-apply/  (gold has 22 findings)
//   For each model × file: one `hermes-run --file <path> --reason-mode monolithic --no-judge`.
//   Aggregate across all files per shard to get that model's finding set; score vs gold.
//
// Scorecard B — JUDGE: precision/recall/F1 on the labeled judge-benchmark.json (UNCHANGED).
//
// Output: reports/vet/scorecard.md + reports/vet/scorecard.json
//
// Usage (from repo root):
//   node utilities/hermes/vet.mjs
//
// Dependency-free: Node built-ins only. Node >= 20 required.

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..'); // repo root

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Full 7-model vetting roster for the overnight run.
// Nemotron excluded (24 GB — won't fit alongside the 32k context window).
const ALL_MODELS = [
  'qwen3:30b-a3b-instruct-2507-q4_K_M',  // champion
  'qwen3-coder:30b',
  'gpt-oss:20b',
  'devstral-small-2',
  'gemma4:26b-a4b-it-qat',
  'deepcoder:14b',
  'hermes-simplify-14b',
];

// `--only <substr>[,<substr>...]` restricts the roster to models whose id contains any
// of the comma-separated substrings — for re-running a single model (e.g. gpt-oss)
// without the full ~5.5h matrix. Note: a partial run overwrites scorecard.{md,json}
// with a scorecard for only the selected model(s); back up the full scorecard first.
function selectModels() {
  const idx = process.argv.indexOf('--only');
  if (idx === -1 || !process.argv[idx + 1]) return ALL_MODELS;
  const needles = process.argv[idx + 1].split(',').map((s) => s.trim()).filter(Boolean);
  const picked = ALL_MODELS.filter((m) => needles.some((n) => m.includes(n)));
  if (picked.length === 0) {
    console.error(`[ERROR] --only ${process.argv[idx + 1]} matched no models in the roster: ${ALL_MODELS.join(', ')}`);
    process.exit(1);
  }
  return picked;
}
const MODELS = selectModels();

// ---------------------------------------------------------------------------
// Self-consistency sample count for Scorecard A
// ---------------------------------------------------------------------------
//
// Each per-file hermes-run call in runScorecardA passes --samples SAMPLES so the
// simplifier runs SAMPLES independent reason->structure passes and unions the results.
// Higher SAMPLES recovers misses (high-variance free-form step) at the cost of wall
// time. Set to 1 to disable multi-sample (falls back to single-pass behaviour).
const SAMPLES = 5;

// ---------------------------------------------------------------------------
// Shard file lists
// ---------------------------------------------------------------------------

// S10: single file
const S10_FILES = ['packages/engine/src/codec/parse.ts'];

// S07: all non-test .ts files in packages/engine/src/pattern-apply/
// Enumerated at runtime (excludes *.test.* and index.ts barrel if desired per spec).
const PATTERN_APPLY_DIR = join(ROOT, 'packages', 'engine', 'src', 'pattern-apply');

function enumerateS07Files() {
  if (!existsSync(PATTERN_APPLY_DIR)) return [];
  let entries;
  try {
    entries = readdirSync(PATTERN_APPLY_DIR);
  } catch {
    return [];
  }
  const files = [];
  for (const name of entries) {
    if (!/\.ts$/.test(name)) continue;
    if (/\.test\./.test(name)) continue; // exclude *.test.*
    const full = join(PATTERN_APPLY_DIR, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    files.push(relative(ROOT, full).split(sep).join('/'));
  }
  return files.sort();
}

// ---------------------------------------------------------------------------
// Gold loading and recall scoring
// ---------------------------------------------------------------------------

const GOLD_LINE_TOLERANCE = 5; // ±5 lines for a hit

/**
 * Parse a "start-end" or "start" lines string into { start, end } integers.
 * Returns { start: 0, end: 0 } if unparseable.
 * Handles comma-separated multi-ranges like "179, 243" by taking the full span.
 */
function parseLineRange(linesStr) {
  const s = String(linesStr ?? '');
  // Multi-range: "179, 243" — take full span of all mentioned numbers
  const allNums = s.match(/\d+/g);
  if (!allNums || allNums.length === 0) return { start: 0, end: 0 };
  const nums = allNums.map((n) => parseInt(n, 10));
  return { start: Math.min(...nums), end: Math.max(...nums) };
}

/**
 * Returns true if two line ranges overlap within ±GOLD_LINE_TOLERANCE.
 */
function rangesOverlap(linesA, linesB) {
  const a = parseLineRange(linesA);
  const b = parseLineRange(linesB);
  if (a.start === 0 || b.start === 0) return false;
  return a.start <= b.end + GOLD_LINE_TOLERANCE && b.start <= a.end + GOLD_LINE_TOLERANCE;
}

/**
 * Load a gold JSON file. Returns [] on error.
 * Gold format: array of { id, file, lines, confidence, ... }
 */
function loadGold(filePath) {
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const GOLD_S10_PATH = join(__dirname, 'eval', 'gold-s10.json');
const GOLD_S07_PATH = join(__dirname, 'eval', 'gold-s07.json');

// Common English and code stopwords to exclude from key-term extraction.
// These appear frequently but carry no discriminating signal for issue identity.
const STOPWORDS = new Set([
  'the', 'this', 'that', 'than', 'then', 'with', 'from', 'into', 'onto',
  'have', 'has', 'had', 'are', 'were', 'was', 'will', 'would', 'could',
  'should', 'does', 'done', 'been', 'being',
  'function', 'const', 'return', 'value', 'type', 'call', 'calls',
  'each', 'every', 'both', 'some', 'same', 'also', 'only', 'just',
  'when', 'where', 'which', 'while', 'there', 'their', 'they',
  'null', 'true', 'false', 'void', 'undefined', 'object', 'array',
  'string', 'number', 'boolean', 'line', 'lines', 'file', 'files',
  'already', 'inside', 'outside', 'before', 'after', 'instead',
  'scope', 'since', 'once', 'using', 'used', 'uses', 'use',
  'here', 'thus', 'note', 'case', 'block', 'node', 'name', 'item',
  'loop', 'code', 'text', 'list', 'flag', 'data', 'size', 'move',
  'push', 'call', 'emit', 'read', 'write', 'parse', 'build',
]);

/**
 * Extract key terms from a gold finding's text fields (summary + suggestion).
 *
 * Extracts two categories:
 *   1. Backtick-quoted tokens: `identifierName`
 *   2. Identifier-like tokens: camelCase, PascalCase, snake_case, or ALL_CAPS
 *      of length >= 4, after stripping punctuation.
 *
 * All terms are lowercased for case-insensitive comparison.
 * Stopwords are removed.
 *
 * Returns { terms: Set<string>, isFallback: boolean }
 * isFallback=true when no identifier terms were extracted (gold has only prose).
 */
function extractGoldKeyTerms(goldFinding) {
  const text = `${goldFinding.summary ?? ''} ${goldFinding.suggestion ?? ''}`;
  const terms = new Set();

  // 1. Backtick-quoted tokens (highest priority)
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    const tok = m[1].trim();
    if (tok.length >= 2) terms.add(tok.toLowerCase());
  }

  // 2. Identifier-like tokens: camelCase, PascalCase, snake_case, ALL_CAPS (len >= 4)
  // Strip common punctuation first, then split on whitespace
  const stripped = text.replace(/[`"'()[\]{},;:.<>!=+\-*/\\|@#$%^&?]/g, ' ');
  for (const tok of stripped.split(/\s+/)) {
    if (tok.length < 4) continue;
    // Must contain at least one uppercase letter, underscore, or be all-caps
    // to qualify as an identifier-like token (filters pure prose words)
    const isIdentifierLike = /[A-Z_]/.test(tok) && /[a-zA-Z]/.test(tok);
    if (!isIdentifierLike) continue;
    const lower = tok.toLowerCase();
    if (!STOPWORDS.has(lower)) terms.add(lower);
  }

  const isFallback = terms.size === 0;

  // Fallback: extract distinctive non-stopword tokens of length >= 5 from raw text
  if (isFallback) {
    const words = text.toLowerCase().split(/\W+/);
    for (const w of words) {
      if (w.length >= 5 && !STOPWORDS.has(w)) terms.add(w);
    }
  }

  return { terms, isFallback };
}

/**
 * Returns true if at least one gold key term appears in the local finding text,
 * using a word-boundary-ish match (case-insensitive, not embedded in another word).
 */
function localFindingContainsTerm(localFinding, terms) {
  const localText = `${localFinding.summary ?? ''} ${localFinding.suggestion ?? ''} ${localFinding.reuse_target ?? ''}`.toLowerCase();
  for (const term of terms) {
    // Word-ish boundary: term must not be immediately preceded/followed by word chars
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`);
    if (re.test(localText)) return true;
  }
  return false;
}

/**
 * Score a set of local findings against gold findings for a given shard.
 *
 * A gold finding G is HIT (strict) if some local finding L satisfies:
 *   L.file === G.file  AND  rangesOverlap(L.lines, G.lines)  AND  sharedKeyTerm(L, G)
 *
 * A gold finding G is HIT (loose) if some local finding L satisfies:
 *   L.file === G.file  AND  rangesOverlap(L.lines, G.lines)
 *   (the old behavior)
 *
 * Returns:
 *   hits              — strict hits (line-overlap + key-term gate)
 *   hitsLoose         — loose hits (line-overlap only, old metric)
 *   totalGold         — total gold findings in this shard
 *   weightedRecall    — confidence-weighted strict recall (used as primary metric)
 *   weightedRecallLoose — confidence-weighted loose recall (for comparison)
 *   extras            — local findings that hit NO gold finding (strict, noise/bonus proxy)
 *   hitGoldIds        — Set of gold ids that were strictly hit
 *   hitGoldIdsLoose   — Set of gold ids that were loosely hit
 *   matchDetail       — per-gold-finding match record for gold-match-detail.json
 */
function scoreGoldRecall(localFindings, goldFindings) {
  const totalGold = goldFindings.length;
  if (totalGold === 0) {
    return {
      hits: 0, hitsLoose: 0, totalGold: 0,
      weightedRecall: 0, weightedRecallLoose: 0,
      extras: localFindings.length,
      hitGoldIds: new Set(), hitGoldIdsLoose: new Set(),
      matchDetail: [],
    };
  }

  const hitGoldIds = new Set();      // strict
  const hitGoldIdsLoose = new Set(); // loose (line-only)
  const matchDetail = [];

  for (const g of goldFindings) {
    const { terms, isFallback } = extractGoldKeyTerms(g);
    let strictHitBy = null;
    let looseHitBy = null;

    for (const l of localFindings) {
      if (l.file !== g.file) continue;
      if (!rangesOverlap(l.lines, g.lines)) continue;

      // Loose: line-overlap only (old behavior)
      if (looseHitBy === null) {
        looseHitBy = l;
        hitGoldIdsLoose.add(g.id);
      }

      // Strict: additionally requires a shared key term
      if (strictHitBy === null && localFindingContainsTerm(l, terms)) {
        strictHitBy = l;
        hitGoldIds.add(g.id);
      }

      // Once we have both, no need to keep scanning
      if (strictHitBy !== null && looseHitBy !== null) break;
    }

    matchDetail.push({
      goldId: g.id,
      goldFile: g.file,
      goldLines: g.lines,
      goldSummary: g.summary,
      goldKeyTerms: [...terms],
      goldKeyTermsFallback: isFallback,
      strictHit: strictHitBy !== null,
      strictHitBy: strictHitBy
        ? { id: strictHitBy.id ?? null, summary: strictHitBy.summary ?? '', suggestion: strictHitBy.suggestion ?? '' }
        : null,
      looseHit: looseHitBy !== null,
      looseHitBy: looseHitBy
        ? { id: looseHitBy.id ?? null, summary: looseHitBy.summary ?? '', suggestion: looseHitBy.suggestion ?? '' }
        : null,
    });
  }

  const hits = hitGoldIds.size;
  const hitsLoose = hitGoldIdsLoose.size;

  // Confidence-weighted recall
  const totalConf = goldFindings.reduce((s, g) => s + (typeof g.confidence === 'number' ? g.confidence : 0.5), 0);
  const hitConf = goldFindings
    .filter((g) => hitGoldIds.has(g.id))
    .reduce((s, g) => s + (typeof g.confidence === 'number' ? g.confidence : 0.5), 0);
  const hitConfLoose = goldFindings
    .filter((g) => hitGoldIdsLoose.has(g.id))
    .reduce((s, g) => s + (typeof g.confidence === 'number' ? g.confidence : 0.5), 0);
  const weightedRecall = totalConf > 0 ? hitConf / totalConf : 0;
  const weightedRecallLoose = totalConf > 0 ? hitConfLoose / totalConf : 0;

  // Extras: local findings that matched no gold finding (strict gate for extras)
  let extras = 0;
  for (const l of localFindings) {
    const { terms } = extractGoldKeyTerms({ summary: '', suggestion: '' }); // not used here
    const hitsSomeGold = goldFindings.some((g) => {
      if (l.file !== g.file) return false;
      if (!rangesOverlap(l.lines, g.lines)) return false;
      const { terms: gTerms } = extractGoldKeyTerms(g);
      return localFindingContainsTerm(l, gTerms);
    });
    if (!hitsSomeGold) extras++;
  }

  return {
    hits, hitsLoose, totalGold,
    weightedRecall, weightedRecallLoose,
    extras,
    hitGoldIds, hitGoldIdsLoose,
    matchDetail,
  };
}

// ---------------------------------------------------------------------------
// Keyword-marker fallback (only used when gold file is missing)
// ---------------------------------------------------------------------------

const MARKERS = {
  S10: ['KNOWN_MODIFIERS', 'makeStoreParser', 'RegExp', 'isSmpLiteral', 'Array.from', 'opaqueFeatures', 'storeDirectives'],
  S07: ['entryContentAsString', 'TextDecoder', 'RegExp', 'split', 'early'],
};

function scoreMarkersForFallback(findings, markerList) {
  const patterns = markerList.map((m) => new RegExp(m.replace(/\./g, '\\.'), 'i'));
  const hitMarkers = new Set();
  for (const f of findings) {
    const text = `${f.summary ?? ''} ${f.suggestion ?? ''} ${f.reuse_target ?? ''}`;
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i].test(text)) hitMarkers.add(markerList[i]);
    }
  }
  return hitMarkers;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Derive a short filesystem-safe key from a model name.
 * e.g. "qwen3:30b-a3b-instruct-2507-q4_K_M" → "qwen3-30b"
 */
function modelKey(model) {
  const base = model.split(':')[0];
  return base.replace(/[^a-zA-Z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Derive a short filesystem-safe slug from a file path.
 * e.g. "packages/engine/src/codec/parse.ts" → "parse"
 */
function fileSlug(relPath) {
  return relPath.split('/').pop()?.replace(/\.tsx?$/, '') ?? relPath.replace(/[^a-zA-Z0-9]/g, '-');
}

const HERMES_RUN = join(__dirname, 'hermes-run.mjs');
const JUDGE_BENCHMARK = join(__dirname, 'eval', 'judge-benchmark.json');
const VET_DIR = join(__dirname, 'reports', 'vet');

// Per-call timeout: generous for a 30B model on one file (20 min)
const CALL_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Run a hermes-run.mjs command synchronously.
 * Returns { ok, stdout, stderr, exitCode }.
 * Never throws.
 */
function runHermes(args, timeoutMs = CALL_TIMEOUT_MS) {
  const result = spawnSync(
    process.execPath,
    [HERMES_RUN, ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const ok = result.status === 0 && result.error == null;
  return {
    ok,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
    error: result.error ?? null,
  };
}

/**
 * Read and parse a JSON file, returning null on any error.
 */
function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Extract all findings from a findings.json artifact.
 * Returns [] on any error.
 */
function extractFindings(findingsJsonPath) {
  const data = readJson(findingsJsonPath);
  if (!data || !Array.isArray(data.shards)) return [];
  return data.shards.flatMap((s) => Array.isArray(s.findings) ? s.findings : []);
}

// ---------------------------------------------------------------------------
// Scorecard A — per-file fan-out + gold-recall scoring
// ---------------------------------------------------------------------------

/**
 * Run Scorecard A for one model.
 * For each file in S10 and S07: run --file <path> --reason-mode monolithic --no-judge.
 * Aggregate all files' findings per shard; score vs gold.
 * Returns a modelResult object.
 */
function runScorecardA(model, mkey, vetDir, s07Files) {
  const goldS10 = existsSync(GOLD_S10_PATH) ? loadGold(GOLD_S10_PATH) : null;
  const goldS07 = existsSync(GOLD_S07_PATH) ? loadGold(GOLD_S07_PATH) : null;

  // ---- S10: fan out over S10_FILES (1 file) ----
  let s10AllFindings = [];
  let s10Ok = true;

  for (const filePath of S10_FILES) {
    const slug = fileSlug(filePath);
    const outDir = join(vetDir, `simp-${mkey}-s10-${slug}`);
    mkdirSync(outDir, { recursive: true });

    process.stdout.write(`  [simp] ${mkey} S10 file=${slug} ... `);
    const result = runHermes([
      '--file', filePath,
      '--reason-mode', 'monolithic',
      '--no-judge',
      '--model', model,
      '--out', outDir,
      '--samples', String(SAMPLES),
    ]);

    if (!result.ok) {
      const reason = result.error ? result.error.message : `exit ${result.exitCode}`;
      console.log(`[SKIP] ${reason}`);
      s10Ok = false;
      continue;
    }

    const findings = extractFindings(join(outDir, 'findings.json'));
    s10AllFindings = s10AllFindings.concat(findings);
    console.log(`${findings.length} findings`);
  }

  // Score S10 vs gold (or keyword fallback)
  let s10GoldHits = 0, s10GoldHitsLoose = 0, s10GoldTotal = 0;
  let s10WeightedRecall = 0, s10WeightedRecallLoose = 0;
  let s10Extras = 0;
  let s10MatchDetail = [];
  let s10UsedGold = false;
  if (goldS10) {
    const scored = scoreGoldRecall(s10AllFindings, goldS10);
    s10GoldHits = scored.hits;
    s10GoldHitsLoose = scored.hitsLoose;
    s10GoldTotal = scored.totalGold;
    s10WeightedRecall = scored.weightedRecall;
    s10WeightedRecallLoose = scored.weightedRecallLoose;
    s10Extras = scored.extras;
    s10MatchDetail = scored.matchDetail;
    s10UsedGold = true;
    console.log(`  [simp] ${mkey} S10 recall_strict=${s10GoldHits}/${s10GoldTotal}(wtd=${s10WeightedRecall.toFixed(3)}) recall_loose=${s10GoldHitsLoose}/${s10GoldTotal}(wtd=${s10WeightedRecallLoose.toFixed(3)}) extras=${s10Extras} total-findings=${s10AllFindings.length}`);
  } else {
    // Keyword fallback
    const hitMarkers = scoreMarkersForFallback(s10AllFindings, MARKERS.S10);
    s10GoldHits = hitMarkers.size;
    s10GoldHitsLoose = s10GoldHits;
    s10GoldTotal = MARKERS.S10.length;
    s10WeightedRecall = s10GoldTotal > 0 ? s10GoldHits / s10GoldTotal : 0;
    s10WeightedRecallLoose = s10WeightedRecall;
    console.log(`  [simp] ${mkey} S10 marker-fallback: ${s10GoldHits}/${s10GoldTotal} (no gold file)`);
  }

  // ---- S07: fan out over all pattern-apply files ----
  let s07AllFindings = [];
  let s07Ok = true;

  for (const filePath of s07Files) {
    const slug = fileSlug(filePath);
    const outDir = join(vetDir, `simp-${mkey}-s07-${slug}`);
    mkdirSync(outDir, { recursive: true });

    process.stdout.write(`  [simp] ${mkey} S07 file=${slug} ... `);
    const result = runHermes([
      '--file', filePath,
      '--reason-mode', 'monolithic',
      '--no-judge',
      '--model', model,
      '--out', outDir,
      '--samples', String(SAMPLES),
    ]);

    if (!result.ok) {
      const reason = result.error ? result.error.message : `exit ${result.exitCode}`;
      console.log(`[SKIP] ${reason}`);
      s07Ok = false;
      continue;
    }

    const findings = extractFindings(join(outDir, 'findings.json'));
    s07AllFindings = s07AllFindings.concat(findings);
    console.log(`${findings.length} findings`);
  }

  // Score S07 vs gold (or keyword fallback)
  let s07GoldHits = 0, s07GoldHitsLoose = 0, s07GoldTotal = 0;
  let s07WeightedRecall = 0, s07WeightedRecallLoose = 0;
  let s07Extras = 0;
  let s07MatchDetail = [];
  let s07UsedGold = false;
  if (goldS07) {
    const scored = scoreGoldRecall(s07AllFindings, goldS07);
    s07GoldHits = scored.hits;
    s07GoldHitsLoose = scored.hitsLoose;
    s07GoldTotal = scored.totalGold;
    s07WeightedRecall = scored.weightedRecall;
    s07WeightedRecallLoose = scored.weightedRecallLoose;
    s07Extras = scored.extras;
    s07MatchDetail = scored.matchDetail;
    s07UsedGold = true;
    console.log(`  [simp] ${mkey} S07 recall_strict=${s07GoldHits}/${s07GoldTotal}(wtd=${s07WeightedRecall.toFixed(3)}) recall_loose=${s07GoldHitsLoose}/${s07GoldTotal}(wtd=${s07WeightedRecallLoose.toFixed(3)}) extras=${s07Extras} total-findings=${s07AllFindings.length}`);
  } else {
    const hitMarkers = scoreMarkersForFallback(s07AllFindings, MARKERS.S07);
    s07GoldHits = hitMarkers.size;
    s07GoldHitsLoose = s07GoldHits;
    s07GoldTotal = MARKERS.S07.length;
    s07WeightedRecall = s07GoldTotal > 0 ? s07GoldHits / s07GoldTotal : 0;
    s07WeightedRecallLoose = s07WeightedRecall;
    console.log(`  [simp] ${mkey} S07 marker-fallback: ${s07GoldHits}/${s07GoldTotal} (no gold file)`);
  }

  // Overall (combined) gold recall
  const overallHits = s10GoldHits + s07GoldHits;
  const overallHitsLoose = s10GoldHitsLoose + s07GoldHitsLoose;
  const overallTotal = s10GoldTotal + s07GoldTotal;
  const allFindings = [...s10AllFindings, ...s07AllFindings];

  // Overall weighted recall: compute from both gold arrays together
  let overallWeightedRecall = 0;
  let overallWeightedRecallLoose = 0;
  if (s10UsedGold && s07UsedGold && goldS10 && goldS07) {
    const allGold = [...goldS10, ...goldS07];
    const combined = scoreGoldRecall(allFindings, allGold);
    overallWeightedRecall = combined.weightedRecall;
    overallWeightedRecallLoose = combined.weightedRecallLoose;
  } else if (overallTotal > 0) {
    overallWeightedRecall = overallHits / overallTotal;
    overallWeightedRecallLoose = overallHitsLoose / overallTotal;
  }

  // Write gold-match-detail.json for this model
  const matchDetailPath = join(vetDir, `gold-match-detail-${mkey}.json`);
  try {
    writeFileSync(matchDetailPath, JSON.stringify({
      model, mkey,
      generatedAt: new Date().toISOString(),
      s10: s10MatchDetail,
      s07: s07MatchDetail,
    }, null, 2), 'utf8');
    console.log(`  [simp] ${mkey} match detail -> ${matchDetailPath}`);
  } catch {
    console.warn(`  [WARN] ${mkey} could not write gold-match-detail`);
  }

  return {
    model, mkey,
    s10AllFindings, s07AllFindings, allFindings,
    s10GoldHits, s10GoldHitsLoose, s10GoldTotal, s10WeightedRecall, s10WeightedRecallLoose, s10Extras,
    s07GoldHits, s07GoldHitsLoose, s07GoldTotal, s07WeightedRecall, s07WeightedRecallLoose, s07Extras,
    overallHits, overallHitsLoose, overallTotal, overallWeightedRecall, overallWeightedRecallLoose,
    s10UsedGold, s07UsedGold,
  };
}

// ---------------------------------------------------------------------------
// Scorecard B — JUDGE scoring per model (UNCHANGED)
// ---------------------------------------------------------------------------

/**
 * Run Scorecard B for one model: judge-set evaluation.
 * Returns a judgeScorecardEntry or null on skip.
 */
function runScorecardB(model, mkey, vetDir) {
  const outDir = join(vetDir, `judge-${mkey}`);
  mkdirSync(outDir, { recursive: true });

  process.stdout.write(`  [judge] ${mkey} ... `);
  const result = runHermes([
    '--judge-set', JUDGE_BENCHMARK,
    '--model', model,
    '--out', outDir,
  ], 30 * 60 * 1000);

  if (!result.ok) {
    const reason = result.error ? result.error.message : `exit ${result.exitCode}`;
    console.log(`[SKIP] ${reason}`);
    return null;
  }

  const verdicts = readJson(join(outDir, 'verdicts.json'));
  if (!Array.isArray(verdicts)) {
    console.log('[SKIP] verdicts.json missing or malformed');
    return null;
  }

  // Load benchmark to get labels
  const benchmark = readJson(JUDGE_BENCHMARK);
  const items = Array.isArray(benchmark?.items) ? benchmark.items : [];
  const labelMap = new Map(items.map((it) => [it.id, it.label]));

  // Score: real=positive, not-real/uncertain=negative
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const v of verdicts) {
    const label = labelMap.get(v.id) ?? v.label;
    const predicted = v.verdict === 'real' ? 'positive' : 'negative';
    const actual = label === 'real' ? 'positive' : 'negative';
    if (actual === 'positive' && predicted === 'positive') tp++;
    else if (actual === 'negative' && predicted === 'positive') fp++;
    else if (actual === 'positive' && predicted === 'negative') fn++;
    else tn++;
  }

  const total = verdicts.length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy = total > 0 ? (tp + tn) / total : 0;

  console.log(`F1=${f1.toFixed(3)} P=${precision.toFixed(3)} R=${recall.toFixed(3)} acc=${accuracy.toFixed(3)}`);

  return { model, mkey, precision, recall, f1, accuracy, tp, fp, fn, tn, total };
}

// ---------------------------------------------------------------------------
// Ensemble computation (after all models)
// ---------------------------------------------------------------------------

/**
 * Build the ensemble from all models' aggregated findings (S10 + S07 combined).
 * Merges by file + overlapping/adjacent line range (gap=5 lines — same as gold tolerance).
 * Returns { mergedFindings, goldRecallS10, goldRecallS07, goldRecallOverall, convergenceDist }
 */
function buildEnsemble(allModelResults, goldS10, goldS07) {
  const ENSEMBLE_GAP = 5;

  // Collect all findings from all models, tagged with their mkey
  const tagged = [];
  for (const mr of allModelResults) {
    for (const f of mr.allFindings) {
      tagged.push({ ...f, _mkey: mr.mkey });
    }
  }

  if (tagged.length === 0) {
    return {
      mergedFindings: [],
      goldRecallS10: { hits: 0, total: 0, weighted: 0 },
      goldRecallS07: { hits: 0, total: 0, weighted: 0 },
      goldRecallOverall: { hits: 0, total: 0, weighted: 0 },
      convergenceDist: { 1: 0, 2: 0, 3: 0 },
    };
  }

  // Union-Find grouping by file + overlapping line range
  const parent = tagged.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(x, y) {
    const px = find(x), py = find(y);
    if (px !== py) parent[px] = py;
  }

  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      if (tagged[i].file !== tagged[j].file) continue;
      const a = parseLineRange(tagged[i].lines);
      const b = parseLineRange(tagged[j].lines);
      if (a.start === 0 || b.start === 0) continue;
      if (a.start <= b.end + ENSEMBLE_GAP && b.start <= a.end + ENSEMBLE_GAP) {
        union(i, j);
      }
    }
  }

  // Group by root
  const groups = new Map();
  for (let i = 0; i < tagged.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(tagged[i]);
  }

  // Build merged finding per group
  const mergedFindings = [];
  const convergenceDist = { 1: 0, 2: 0, 3: 0 };

  for (const group of groups.values()) {
    const distinctModels = new Set(group.map((f) => f._mkey));
    const conv = distinctModels.size;
    const convKey = Math.min(conv, 3);
    convergenceDist[convKey] = (convergenceDist[convKey] ?? 0) + 1;

    const best = group.reduce((a, b) => {
      const ca = typeof a.confidence === 'number' ? a.confidence : 0.5;
      const cb = typeof b.confidence === 'number' ? b.confidence : 0.5;
      return cb > ca ? b : a;
    });
    mergedFindings.push({ ...best, _convergence: conv, _models: [...distinctModels].sort() });
  }

  // Score ensemble against gold (strict + loose)
  const scoreEnsemble = (gold) => {
    if (!gold || gold.length === 0) return { hits: 0, hitsLoose: 0, total: 0, weighted: 0, weightedLoose: 0 };
    const scored = scoreGoldRecall(mergedFindings, gold);
    return {
      hits: scored.hits, hitsLoose: scored.hitsLoose,
      total: scored.totalGold,
      weighted: scored.weightedRecall, weightedLoose: scored.weightedRecallLoose,
    };
  };

  const goldRecallS10 = scoreEnsemble(goldS10);
  const goldRecallS07 = scoreEnsemble(goldS07);
  const allGold = [...(goldS10 ?? []), ...(goldS07 ?? [])];
  const goldRecallOverall = allGold.length > 0 ? scoreEnsemble(allGold) : { hits: 0, hitsLoose: 0, total: 0, weighted: 0, weightedLoose: 0 };

  return { mergedFindings, goldRecallS10, goldRecallS07, goldRecallOverall, convergenceDist };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateScorecard(simpResults, ensembleResult, judgeResults, s07Files, goldS10, goldS07) {
  const lines = [];
  lines.push('# Hermes Model-Vetting Scorecard');
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Benchmark: ${JUDGE_BENCHMARK}`);
  lines.push(`> Gold S10: ${GOLD_S10_PATH} (${goldS10 ? goldS10.length : 'missing — keyword fallback'} findings)`);
  lines.push(`> Gold S07: ${GOLD_S07_PATH} (${goldS07 ? goldS07.length : 'missing — keyword fallback'} findings)`);
  lines.push(`> S10 files (${S10_FILES.length}): ${S10_FILES.join(', ')}`);
  lines.push(`> S07 files (${s07Files.length}): ${s07Files.join(', ')}`);
  lines.push('');

  // --- Scorecard A: Simplifier ---
  lines.push('## Scorecard A — Simplifier (per-file fan-out, gold-recall, ranked by overall strict weighted recall)');
  lines.push('');
  lines.push(`Scoring: **recall_strict** (primary) = line-overlap ±${GOLD_LINE_TOLERANCE} lines AND shared key term from gold summary/suggestion.`);
  lines.push(`**recall_loose** (old metric, shown for comparison) = line-overlap ±${GOLD_LINE_TOLERANCE} lines only.`);
  lines.push(`Confidence-weighted recall = sum(gold.confidence for hits) / sum(gold.confidence for all gold in shard).`);
  lines.push(`Extras = local findings that hit no gold finding (strict gate; noise/bonus proxy).`);
  lines.push(`Per-finding match detail: \`reports/vet/gold-match-detail-<model>.json\``);
  lines.push('');
  lines.push('| Model | S10 strict (hits/total, wtd) | S10 loose (hits/total, wtd) | S07 strict (hits/total, wtd) | S07 loose (hits/total, wtd) | overall strict (wtd) | overall loose (wtd) | total findings | extras |');
  lines.push('|---|---|---|---|---|---|---|---|---|');

  // Sort by overall strict weighted recall descending (primary metric)
  const sortedSimp = [...simpResults].sort((a, b) => b.overallWeightedRecall - a.overallWeightedRecall);
  for (const mr of sortedSimp) {
    const s10Strict = mr.s10UsedGold
      ? `${mr.s10GoldHits}/${mr.s10GoldTotal}, wtd=${mr.s10WeightedRecall.toFixed(3)}`
      : `${mr.s10GoldHits}/${mr.s10GoldTotal} (marker)`;
    const s10Loose = mr.s10UsedGold
      ? `${mr.s10GoldHitsLoose}/${mr.s10GoldTotal}, wtd=${mr.s10WeightedRecallLoose.toFixed(3)}`
      : '-';
    const s07Strict = mr.s07UsedGold
      ? `${mr.s07GoldHits}/${mr.s07GoldTotal}, wtd=${mr.s07WeightedRecall.toFixed(3)}`
      : `${mr.s07GoldHits}/${mr.s07GoldTotal} (marker)`;
    const s07Loose = mr.s07UsedGold
      ? `${mr.s07GoldHitsLoose}/${mr.s07GoldTotal}, wtd=${mr.s07WeightedRecallLoose.toFixed(3)}`
      : '-';
    const overallStrict = `**${mr.overallHits}/${mr.overallTotal}, wtd=${mr.overallWeightedRecall.toFixed(3)}**`;
    const overallLoose = `${mr.overallHitsLoose}/${mr.overallTotal}, wtd=${mr.overallWeightedRecallLoose.toFixed(3)}`;
    const totalExtras = mr.s10Extras + mr.s07Extras;
    lines.push(
      `| ${mr.mkey} | ${s10Strict} | ${s10Loose} | ${s07Strict} | ${s07Loose} | ${overallStrict} | ${overallLoose} | ${mr.allFindings.length} | ${totalExtras} |`
    );
  }
  lines.push('');

  // --- Ensemble ---
  const ens = ensembleResult;
  lines.push('## Ensemble (S10 + S07 — all models union, deduped by file+line range ±5)');
  lines.push('');
  lines.push(`- Merged findings: ${ens.mergedFindings.length}`);
  lines.push(`- S10 gold-recall (strict): **${ens.goldRecallS10.hits}/${ens.goldRecallS10.total}** (wtd=${ens.goldRecallS10.weighted.toFixed(3)}) | loose: ${ens.goldRecallS10.hitsLoose}/${ens.goldRecallS10.total} (wtd=${ens.goldRecallS10.weightedLoose.toFixed(3)})`);
  lines.push(`- S07 gold-recall (strict): **${ens.goldRecallS07.hits}/${ens.goldRecallS07.total}** (wtd=${ens.goldRecallS07.weighted.toFixed(3)}) | loose: ${ens.goldRecallS07.hitsLoose}/${ens.goldRecallS07.total} (wtd=${ens.goldRecallS07.weightedLoose.toFixed(3)})`);
  lines.push(`- Overall gold-recall (strict): **${ens.goldRecallOverall.hits}/${ens.goldRecallOverall.total}** (wtd=${ens.goldRecallOverall.weighted.toFixed(3)}) | loose: ${ens.goldRecallOverall.hitsLoose}/${ens.goldRecallOverall.total} (wtd=${ens.goldRecallOverall.weightedLoose.toFixed(3)})`);
  lines.push('');
  lines.push('### Convergence distribution');
  lines.push('');
  lines.push('| Flagged by 1 model | 2 models | 3+ models |');
  lines.push('|---|---|---|');
  lines.push(`| ${ens.convergenceDist[1]} | ${ens.convergenceDist[2]} | ${ens.convergenceDist[3]} |`);
  lines.push('');

  // --- Scorecard B: Judge ---
  lines.push('## Scorecard B — Judge (precision/recall/F1, ranked by F1)');
  lines.push('');
  lines.push('Labels: real=positive, not-real/uncertain=negative');
  lines.push('');
  lines.push('| Model | F1 | Precision | Recall | Accuracy | TP | FP | FN | TN |');
  lines.push('|---|---|---|---|---|---|---|---|---|');

  const validJudge = judgeResults.filter(Boolean);
  const sortedJudge = [...validJudge].sort((a, b) => b.f1 - a.f1);
  for (const jr of sortedJudge) {
    lines.push(
      `| ${jr.mkey} | **${jr.f1.toFixed(3)}** | ${jr.precision.toFixed(3)} | ${jr.recall.toFixed(3)} | ${jr.accuracy.toFixed(3)} | ${jr.tp} | ${jr.fp} | ${jr.fn} | ${jr.tn} |`
    );
  }
  const skippedJudge = judgeResults.filter((r) => r == null).length;
  if (skippedJudge > 0) lines.push(`\n_${skippedJudge} model(s) skipped (OOM/timeout/error)_`);
  lines.push('');

  // --- Finalists ---
  const top2Simp = sortedSimp.slice(0, 2).map((mr) => mr.mkey);
  const top1Judge = sortedJudge[0]?.mkey ?? '(none)';
  lines.push('## Finalists');
  lines.push('');
  lines.push(`- **Top simplifiers (by overall confidence-weighted gold-recall):** ${top2Simp.join(', ')}`);
  lines.push(`- **Top judge (by F1):** ${top1Judge}`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Self-test (--self-test): static proof of strict vs loose divergence
// ---------------------------------------------------------------------------

/**
 * Run two synthetic test cases:
 *   (a) local "rename var" at gold lines, NO shared identifier -> strict miss, loose hit
 *   (b) local "reuse escapeRegExp helper" at gold's escapeRegExp lines -> strict hit, loose hit
 * Prints results and exits 0 (pass) or 1 (fail).
 */
function runSelfTest() {
  console.log('[SELF-TEST] Starting static recall strict-vs-loose proof...');
  let passed = true;

  // Synthetic gold finding: escapeRegExp duplicates escapeForRegex at line 394
  const goldEscapeRegExp = {
    id: 'test-gold-01',
    file: 'src/utils.ts',
    lines: '390-398',
    type: 'reuse',
    severity: 'safe-auto',
    summary: '`escapeRegExp` duplicates `escapeForRegex` — inline function body is identical',
    suggestion: 'Replace `escapeRegExp` with a re-export alias of `escapeForRegex`.',
    confidence: 0.9,
  };

  // Case (a): local finding at same lines but NO shared identifier term (just "rename var")
  const localRenameVar = {
    id: 'local-a',
    file: 'src/utils.ts',
    lines: '394',
    summary: 'rename var to improve readability at line 394',
    suggestion: 'Consider a more descriptive variable name.',
  };

  // Case (b): local finding that mentions escapeRegExp — genuine semantic hit
  const localReuseEscapeRegExp = {
    id: 'local-b',
    file: 'src/utils.ts',
    lines: '393-396',
    summary: 'reuse escapeRegExp helper instead of duplicating the logic',
    suggestion: 'Call escapeRegExp directly to avoid the duplicated escapeForRegex implementation.',
  };

  // Score case (a): rename-var vs gold-escapeRegExp
  const scoreA = scoreGoldRecall([localRenameVar], [goldEscapeRegExp]);
  const caseAStrictMiss = scoreA.hits === 0;       // must NOT count strict
  const caseALooseHit  = scoreA.hitsLoose === 1;   // WOULD count loose

  if (caseAStrictMiss && caseALooseHit) {
    console.log('[SELF-TEST] [OK] Case (a): rename-var at same lines -> strict=miss (0/1), loose=hit (1/1) — overcounting confirmed and rejected');
  } else {
    console.log(`[SELF-TEST] [FAIL] Case (a): expected strict=0 loose=1, got strict=${scoreA.hits} loose=${scoreA.hitsLoose}`);
    console.log(`            gold key terms: ${[...extractGoldKeyTerms(goldEscapeRegExp).terms].join(', ')}`);
    passed = false;
  }

  // Score case (b): reuse-escapeRegExp vs gold-escapeRegExp
  const scoreB = scoreGoldRecall([localReuseEscapeRegExp], [goldEscapeRegExp]);
  const caseBStrictHit = scoreB.hits === 1;
  const caseBLooseHit  = scoreB.hitsLoose === 1;

  if (caseBStrictHit && caseBLooseHit) {
    console.log('[SELF-TEST] [OK] Case (b): reuse-escapeRegExp at gold lines -> strict=hit (1/1), loose=hit (1/1)');
  } else {
    console.log(`[SELF-TEST] [FAIL] Case (b): expected strict=1 loose=1, got strict=${scoreB.hits} loose=${scoreB.hitsLoose}`);
    console.log(`            gold key terms: ${[...extractGoldKeyTerms(goldEscapeRegExp).terms].join(', ')}`);
    passed = false;
  }

  // Verify the two recall numbers differ on case (a): strict < loose
  const strictDiffersFromLoose = scoreA.weightedRecall < scoreA.weightedRecallLoose;
  if (strictDiffersFromLoose) {
    console.log(`[SELF-TEST] [OK] Case (a) recall_strict (${scoreA.weightedRecall.toFixed(3)}) < recall_loose (${scoreA.weightedRecallLoose.toFixed(3)}) — metrics diverge as expected`);
  } else {
    console.log(`[SELF-TEST] [FAIL] Case (a): recall_strict (${scoreA.weightedRecall.toFixed(3)}) should be < recall_loose (${scoreA.weightedRecallLoose.toFixed(3)})`);
    passed = false;
  }

  // Also print extracted key terms for human inspection
  const { terms, isFallback } = extractGoldKeyTerms(goldEscapeRegExp);
  console.log(`[SELF-TEST] Gold key terms extracted: [${[...terms].join(', ')}] (fallback=${isFallback})`);

  if (passed) {
    console.log('[SELF-TEST] All cases passed.');
    process.exit(0);
  } else {
    console.log('[SELF-TEST] One or more cases FAILED.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[OK] vet.mjs — overnight model-vetting orchestrator (per-file fan-out + gold-recall)');
  console.log(`     models: ${MODELS.length} (${MODELS.map(modelKey).join(', ')})`);
  console.log(`     out dir: ${VET_DIR}`);

  const s07Files = enumerateS07Files();
  console.log(`     S10 files: ${S10_FILES.length} (${S10_FILES.join(', ')})`);
  console.log(`     S07 files: ${s07Files.length} (pattern-apply/*.ts excluding tests)`);
  console.log('');

  mkdirSync(VET_DIR, { recursive: true });

  // Check hermes-run.mjs exists
  if (!existsSync(HERMES_RUN)) {
    console.error(`[ERROR] hermes-run.mjs not found at ${HERMES_RUN}`);
    process.exit(1);
  }
  if (!existsSync(JUDGE_BENCHMARK)) {
    console.error(`[ERROR] judge-benchmark.json not found at ${JUDGE_BENCHMARK}`);
    process.exit(1);
  }

  // Load gold files
  const goldS10 = existsSync(GOLD_S10_PATH) ? loadGold(GOLD_S10_PATH) : null;
  const goldS07 = existsSync(GOLD_S07_PATH) ? loadGold(GOLD_S07_PATH) : null;
  if (!goldS10) console.warn(`[WARN] Gold file missing: ${GOLD_S10_PATH} — will use keyword-marker fallback for S10`);
  else console.log(`[OK] Gold S10: ${goldS10.length} findings loaded`);
  if (!goldS07) console.warn(`[WARN] Gold file missing: ${GOLD_S07_PATH} — will use keyword-marker fallback for S07`);
  else console.log(`[OK] Gold S07: ${goldS07.length} findings loaded`);
  console.log('');

  const simpResults = [];
  const judgeResults = [];

  for (const model of MODELS) {
    const mkey = modelKey(model);
    console.log(`\n=== Model: ${model} (key: ${mkey}) ===`);

    // Scorecard A
    let simpResult;
    try {
      simpResult = runScorecardA(model, mkey, VET_DIR, s07Files);
      simpResults.push(simpResult);
    } catch (err) {
      console.error(`[SKIP] ${mkey} Scorecard A crashed: ${err.message}`);
      simpResults.push({
        model, mkey,
        s10AllFindings: [], s07AllFindings: [], allFindings: [],
        s10GoldHits: 0, s10GoldHitsLoose: 0, s10GoldTotal: goldS10?.length ?? 0,
        s10WeightedRecall: 0, s10WeightedRecallLoose: 0, s10Extras: 0,
        s07GoldHits: 0, s07GoldHitsLoose: 0, s07GoldTotal: goldS07?.length ?? 0,
        s07WeightedRecall: 0, s07WeightedRecallLoose: 0, s07Extras: 0,
        overallHits: 0, overallHitsLoose: 0,
        overallTotal: (goldS10?.length ?? 0) + (goldS07?.length ?? 0),
        overallWeightedRecall: 0, overallWeightedRecallLoose: 0,
        s10UsedGold: !!goldS10, s07UsedGold: !!goldS07,
      });
    }

    // Scorecard B
    let judgeResult;
    try {
      judgeResult = runScorecardB(model, mkey, VET_DIR);
      judgeResults.push(judgeResult);
    } catch (err) {
      console.error(`[SKIP] ${mkey} Scorecard B crashed: ${err.message}`);
      judgeResults.push(null);
    }
  }

  console.log('\n=== Building ensemble ===');
  const ensembleResult = buildEnsemble(simpResults, goldS10, goldS07);
  console.log(`    merged findings: ${ensembleResult.mergedFindings.length}`);
  console.log(`    ensemble S10 gold-recall: ${ensembleResult.goldRecallS10.hits}/${ensembleResult.goldRecallS10.total} (wtd=${ensembleResult.goldRecallS10.weighted.toFixed(3)})`);
  console.log(`    ensemble S07 gold-recall: ${ensembleResult.goldRecallS07.hits}/${ensembleResult.goldRecallS07.total} (wtd=${ensembleResult.goldRecallS07.weighted.toFixed(3)})`);
  console.log(`    ensemble overall gold-recall: ${ensembleResult.goldRecallOverall.hits}/${ensembleResult.goldRecallOverall.total} (wtd=${ensembleResult.goldRecallOverall.weighted.toFixed(3)})`);
  console.log(`    convergence dist: 1-model=${ensembleResult.convergenceDist[1]} 2-model=${ensembleResult.convergenceDist[2]} 3+-model=${ensembleResult.convergenceDist[3]}`);

  console.log('\n=== Generating scorecard ===');
  const scorecardMd = generateScorecard(simpResults, ensembleResult, judgeResults, s07Files, goldS10, goldS07);
  const scorecardJson = {
    generatedAt: new Date().toISOString(),
    models: MODELS,
    goldFiles: {
      s10: GOLD_S10_PATH,
      s07: GOLD_S07_PATH,
      s10Count: goldS10?.length ?? null,
      s07Count: goldS07?.length ?? null,
    },
    filesets: {
      s10: S10_FILES,
      s07: s07Files,
    },
    simplifier: simpResults.map((mr) => ({
      model: mr.model, mkey: mr.mkey,
      s10GoldHits: mr.s10GoldHits, s10GoldHitsLoose: mr.s10GoldHitsLoose, s10GoldTotal: mr.s10GoldTotal,
      s10WeightedRecall: mr.s10WeightedRecall, s10WeightedRecallLoose: mr.s10WeightedRecallLoose,
      s10Extras: mr.s10Extras,
      s07GoldHits: mr.s07GoldHits, s07GoldHitsLoose: mr.s07GoldHitsLoose, s07GoldTotal: mr.s07GoldTotal,
      s07WeightedRecall: mr.s07WeightedRecall, s07WeightedRecallLoose: mr.s07WeightedRecallLoose,
      s07Extras: mr.s07Extras,
      overallHits: mr.overallHits, overallHitsLoose: mr.overallHitsLoose, overallTotal: mr.overallTotal,
      overallWeightedRecall: mr.overallWeightedRecall, overallWeightedRecallLoose: mr.overallWeightedRecallLoose,
      totalFindings: mr.allFindings.length,
    })),
    ensemble: {
      mergedCount: ensembleResult.mergedFindings.length,
      goldRecallS10: ensembleResult.goldRecallS10,
      goldRecallS07: ensembleResult.goldRecallS07,
      goldRecallOverall: ensembleResult.goldRecallOverall,
      convergenceDist: ensembleResult.convergenceDist,
    },
    judge: judgeResults.map((jr) => jr ? {
      model: jr.model, mkey: jr.mkey,
      precision: jr.precision, recall: jr.recall, f1: jr.f1, accuracy: jr.accuracy,
      tp: jr.tp, fp: jr.fp, fn: jr.fn, tn: jr.tn, total: jr.total,
    } : null),
  };

  const scorecardMdPath = join(VET_DIR, 'scorecard.md');
  const scorecardJsonPath = join(VET_DIR, 'scorecard.json');
  writeFileSync(scorecardMdPath, scorecardMd, 'utf8');
  writeFileSync(scorecardJsonPath, JSON.stringify(scorecardJson, null, 2), 'utf8');

  console.log(`[OK] scorecard.md: ${scorecardMdPath}`);
  console.log(`[OK] scorecard.json: ${scorecardJsonPath}`);
  console.log('[OK] vet.mjs complete.');
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  main().catch((err) => {
    console.error(`[ERROR] Unhandled error: ${err.message}`);
    process.exit(1);
  });
}
