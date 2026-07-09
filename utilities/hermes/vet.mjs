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
const MODELS = [
  'qwen3:30b-a3b-instruct-2507-q4_K_M',  // champion
  'qwen3-coder:30b',
  'gpt-oss:20b',
  'devstral-small-2',
  'gemma4:26b-a4b-it-qat',
  'deepcoder:14b',
  'hermes-simplify-14b',
];

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
 */
function parseLineRange(linesStr) {
  const m = String(linesStr ?? '').match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return { start: 0, end: 0 };
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  return { start, end };
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

/**
 * Score a set of local findings against gold findings for a given shard.
 *
 * A gold finding G is HIT if some local finding L satisfies:
 *   L.file === G.file  AND  rangesOverlap(L.lines, G.lines)
 *
 * Returns:
 *   hits         — count of gold findings that matched at least one local finding
 *   totalGold    — total gold findings in this shard
 *   weightedRecall — sum(G.confidence over hits) / sum(G.confidence over all gold)
 *   extras       — local findings that hit NO gold finding (noise/bonus proxy)
 *   hitGoldIds   — Set of gold ids that were hit
 */
function scoreGoldRecall(localFindings, goldFindings) {
  const totalGold = goldFindings.length;
  if (totalGold === 0) return { hits: 0, totalGold: 0, weightedRecall: 0, extras: localFindings.length, hitGoldIds: new Set() };

  const hitGoldIds = new Set();

  for (const g of goldFindings) {
    for (const l of localFindings) {
      if (l.file === g.file && rangesOverlap(l.lines, g.lines)) {
        hitGoldIds.add(g.id);
        break; // one local hit per gold finding is enough
      }
    }
  }

  const hits = hitGoldIds.size;

  // Confidence-weighted recall: sum(G.confidence for hits) / sum(G.confidence all)
  const totalConf = goldFindings.reduce((s, g) => s + (typeof g.confidence === 'number' ? g.confidence : 0.5), 0);
  const hitConf = goldFindings
    .filter((g) => hitGoldIds.has(g.id))
    .reduce((s, g) => s + (typeof g.confidence === 'number' ? g.confidence : 0.5), 0);
  const weightedRecall = totalConf > 0 ? hitConf / totalConf : 0;

  // Extras: local findings that matched no gold finding
  let extras = 0;
  for (const l of localFindings) {
    const hitsSomeGold = goldFindings.some((g) => l.file === g.file && rangesOverlap(l.lines, g.lines));
    if (!hitsSomeGold) extras++;
  }

  return { hits, totalGold, weightedRecall, extras, hitGoldIds };
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
const VET_DIR = join(ROOT, 'reports', 'vet');

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
  let s10GoldHits = 0, s10GoldTotal = 0, s10WeightedRecall = 0, s10Extras = 0;
  let s10UsedGold = false;
  if (goldS10) {
    const scored = scoreGoldRecall(s10AllFindings, goldS10);
    s10GoldHits = scored.hits;
    s10GoldTotal = scored.totalGold;
    s10WeightedRecall = scored.weightedRecall;
    s10Extras = scored.extras;
    s10UsedGold = true;
    console.log(`  [simp] ${mkey} S10 gold-recall: ${s10GoldHits}/${s10GoldTotal} (wtd=${s10WeightedRecall.toFixed(3)}) extras=${s10Extras} total-findings=${s10AllFindings.length}`);
  } else {
    // Keyword fallback
    const hitMarkers = scoreMarkersForFallback(s10AllFindings, MARKERS.S10);
    s10GoldHits = hitMarkers.size;
    s10GoldTotal = MARKERS.S10.length;
    s10WeightedRecall = s10GoldTotal > 0 ? s10GoldHits / s10GoldTotal : 0;
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
  let s07GoldHits = 0, s07GoldTotal = 0, s07WeightedRecall = 0, s07Extras = 0;
  let s07UsedGold = false;
  if (goldS07) {
    const scored = scoreGoldRecall(s07AllFindings, goldS07);
    s07GoldHits = scored.hits;
    s07GoldTotal = scored.totalGold;
    s07WeightedRecall = scored.weightedRecall;
    s07Extras = scored.extras;
    s07UsedGold = true;
    console.log(`  [simp] ${mkey} S07 gold-recall: ${s07GoldHits}/${s07GoldTotal} (wtd=${s07WeightedRecall.toFixed(3)}) extras=${s07Extras} total-findings=${s07AllFindings.length}`);
  } else {
    const hitMarkers = scoreMarkersForFallback(s07AllFindings, MARKERS.S07);
    s07GoldHits = hitMarkers.size;
    s07GoldTotal = MARKERS.S07.length;
    s07WeightedRecall = s07GoldTotal > 0 ? s07GoldHits / s07GoldTotal : 0;
    console.log(`  [simp] ${mkey} S07 marker-fallback: ${s07GoldHits}/${s07GoldTotal} (no gold file)`);
  }

  // Overall (combined) gold recall
  const overallHits = s10GoldHits + s07GoldHits;
  const overallTotal = s10GoldTotal + s07GoldTotal;
  const allFindings = [...s10AllFindings, ...s07AllFindings];

  // Overall weighted recall: compute from both gold arrays together
  let overallWeightedRecall = 0;
  if (s10UsedGold && s07UsedGold && goldS10 && goldS07) {
    const allGold = [...goldS10, ...goldS07];
    const combined = scoreGoldRecall(allFindings, allGold);
    overallWeightedRecall = combined.weightedRecall;
  } else if (overallTotal > 0) {
    overallWeightedRecall = overallHits / overallTotal;
  }

  return {
    model, mkey,
    s10AllFindings, s07AllFindings, allFindings,
    s10GoldHits, s10GoldTotal, s10WeightedRecall, s10Extras,
    s07GoldHits, s07GoldTotal, s07WeightedRecall, s07Extras,
    overallHits, overallTotal, overallWeightedRecall,
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

  // Score ensemble against gold
  const scoreEnsemble = (gold) => {
    if (!gold || gold.length === 0) return { hits: 0, total: 0, weighted: 0 };
    const scored = scoreGoldRecall(mergedFindings, gold);
    return { hits: scored.hits, total: scored.totalGold, weighted: scored.weightedRecall };
  };

  const goldRecallS10 = scoreEnsemble(goldS10);
  const goldRecallS07 = scoreEnsemble(goldS07);
  const allGold = [...(goldS10 ?? []), ...(goldS07 ?? [])];
  const goldRecallOverall = allGold.length > 0 ? scoreEnsemble(allGold) : { hits: 0, total: 0, weighted: 0 };

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
  lines.push('## Scorecard A — Simplifier (per-file fan-out, gold-recall, ranked by overall weighted recall)');
  lines.push('');
  lines.push(`Scoring: gold hit = local finding overlaps gold within ±${GOLD_LINE_TOLERANCE} lines on the same file.`);
  lines.push(`Confidence-weighted recall = sum(gold.confidence for hits) / sum(gold.confidence for all gold in shard).`);
  lines.push(`Extras = local findings that hit no gold finding (noise/bonus proxy — unclassified without Claude).`);
  lines.push('');
  lines.push('| Model | S10 recall (hits/8, wtd) | S07 recall (hits/22, wtd) | overall (hits/30, wtd) | total findings | extras |');
  lines.push('|---|---|---|---|---|---|');

  // Sort by overall weighted recall descending
  const sortedSimp = [...simpResults].sort((a, b) => b.overallWeightedRecall - a.overallWeightedRecall);
  for (const mr of sortedSimp) {
    const s10Label = mr.s10UsedGold
      ? `${mr.s10GoldHits}/${mr.s10GoldTotal}, wtd=${mr.s10WeightedRecall.toFixed(3)}`
      : `${mr.s10GoldHits}/${mr.s10GoldTotal} (marker)`;
    const s07Label = mr.s07UsedGold
      ? `${mr.s07GoldHits}/${mr.s07GoldTotal}, wtd=${mr.s07WeightedRecall.toFixed(3)}`
      : `${mr.s07GoldHits}/${mr.s07GoldTotal} (marker)`;
    const overallLabel = `${mr.overallHits}/${mr.overallTotal}, wtd=${mr.overallWeightedRecall.toFixed(3)}`;
    const totalExtras = mr.s10Extras + mr.s07Extras;
    lines.push(
      `| ${mr.mkey} | ${s10Label} | ${s07Label} | **${overallLabel}** | ${mr.allFindings.length} | ${totalExtras} |`
    );
  }
  lines.push('');

  // --- Ensemble ---
  const ens = ensembleResult;
  lines.push('## Ensemble (S10 + S07 — all models union, deduped by file+line range ±5)');
  lines.push('');
  lines.push(`- Merged findings: ${ens.mergedFindings.length}`);
  lines.push(`- S10 gold-recall: **${ens.goldRecallS10.hits}/${ens.goldRecallS10.total}** (wtd=${ens.goldRecallS10.weighted.toFixed(3)})`);
  lines.push(`- S07 gold-recall: **${ens.goldRecallS07.hits}/${ens.goldRecallS07.total}** (wtd=${ens.goldRecallS07.weighted.toFixed(3)})`);
  lines.push(`- Overall gold-recall: **${ens.goldRecallOverall.hits}/${ens.goldRecallOverall.total}** (wtd=${ens.goldRecallOverall.weighted.toFixed(3)})`);
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
        s10GoldHits: 0, s10GoldTotal: goldS10?.length ?? 0, s10WeightedRecall: 0, s10Extras: 0,
        s07GoldHits: 0, s07GoldTotal: goldS07?.length ?? 0, s07WeightedRecall: 0, s07Extras: 0,
        overallHits: 0, overallTotal: (goldS10?.length ?? 0) + (goldS07?.length ?? 0),
        overallWeightedRecall: 0,
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
      s10GoldHits: mr.s10GoldHits, s10GoldTotal: mr.s10GoldTotal,
      s10WeightedRecall: mr.s10WeightedRecall, s10Extras: mr.s10Extras,
      s07GoldHits: mr.s07GoldHits, s07GoldTotal: mr.s07GoldTotal,
      s07WeightedRecall: mr.s07WeightedRecall, s07Extras: mr.s07Extras,
      overallHits: mr.overallHits, overallTotal: mr.overallTotal,
      overallWeightedRecall: mr.overallWeightedRecall,
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

main().catch((err) => {
  console.error(`[ERROR] Unhandled error: ${err.message}`);
  process.exit(1);
});
