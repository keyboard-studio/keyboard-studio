#!/usr/bin/env node
// hermes-run.mjs — Phase 2 + Phase 4 shard-runner for the repo-wide /simplify pass.
//
// REPORT ONLY: this tool never edits source files, never commits, never calls
// gh pr comment / gh pr edit / gh pr review / gh label / git commit / git push.
// Read-only git/gh ops (gh pr view/diff, git show, git diff) are allowed for
// scoping mode only.
//
// MODEL CALL DESIGN — TWO-STEP DECODING (per shard / sub-batch):
//   Step 1 REASON  : call REASON_MODEL without format:json; ask for free-form findings prose.
//                    No suppressive framing — encourages high recall. Input capped at ~18k
//                    tokens (leaving ~14k for verbose reasoning output within the 32k window).
//                    Transient failures (network/connection) are retried up to 3 times with
//                    increasing backoff (2s / 5s / 10s). A per-call timeout (MODEL_TIMEOUT_MS)
//                    prevents stalls on verbose 30B reasoning runs; timeouts are treated as
//                    transient and enter the retry path.
//   Step 2 STRUCTURE: feed Step 1 prose into STRUCTURE_MODEL with format:json to convert to
//                    the findings schema. Purely mechanical — does not add or invent findings.
//                    Same MODEL_TIMEOUT_MS timeout applied; SyntaxError retried once (existing).
//   If Step 1 returns effectively nothing, Step 2 is skipped and 0 findings are recorded.
//   Phase 4 reconciliation stays as a single structured call (STRUCTURE_MODEL).
//
// NO-SWAP DEFAULT: STRUCTURE_MODEL defaults to the resolved REASON_MODEL so a stock run
//   loads only one model on the GPU and never swap-thrashes. Pass --structure-model to
//   override for split-model setups.
//
// Usage (from repo root):
//   node utilities/hermes/hermes-run.mjs [options]
//
// Manifest-mode options:
//   --shard S07           run one shard by id
//   --limit N             run first N shards
//   --dry-run             assemble prompts + print token estimates; do NOT call the model
//
// Scoping-mode options (mutually exclusive; derive changed-file set instead of manifest):
//   --pr <n>              changed files from PR n  (gh pr view/diff — READ ONLY)
//   --commit <sha>        changed files from a single commit (git show -- READ ONLY)
//   --since <ref>         changed files since <ref>...HEAD  (git diff -- READ ONLY)
//
// Shared options:
//   --model <name>          override REASON_MODEL  (default: qwen3:30b-a3b-instruct-2507-q4_K_M)
//   --structure-model <n>   override STRUCTURE_MODEL (default: same as resolved REASON_MODEL —
//                           no-swap; set to a lighter model for split-model setups)
//   --endpoint <url>        default: http://localhost:11434/api/generate
//   --out <dir>             default: utilities/hermes/reports
//   --reason-temp <t>       REASON (Step 1) sampling temperature, [0,2] (default 0.3). Raising this
//                           is what makes --samples / ensemble unions actually diversify. 0.3 is the
//                           swept optimum (2026-07-09 temp-sweep: peak gold-recall for devstral +
//                           gpt-oss; 0.5/0.7 degrade monotonically). Below it S10 recall collapses.
//   --judge-temp <t>        JUDGE sampling temperature, [0,2] (default 0.2). Keep low — the judge
//                           is deterministic in practice (18/18 unanimous across 9 votes).
//                           STRUCTURE + reconciliation temperature is fixed at 0.1 (mechanical).
//   --no-judge              skip the per-finding judge pass (fast, unfiltered; escalation.md uses
//                           self-scored ACT criteria only — no judge_verdict filtering)
//   --judge                 harmless no-op alias (judge is ON by default)
//
// JUDGE PASS (default-ON):
//   Each finding gets one extra model call (same loaded model, temperature=0.2, format:json)
//   for an independent verdict: "real" | "not-real" | "uncertain".
//   Only "real" verdicts survive into the ACT bucket and escalation set.
//   Experiment: 18/18 findings unanimous across 9 votes — the judge is effectively deterministic,
//   so K=1 is the right setting (no multi-vote self-consistency needed).
//
// ARTIFACTS (written to --out dir):
//   findings.json     — full raw output (all shards, all findings, reconciliation)
//   report.md         — full bucketed view (ACT/REVIEW/NOISE) — the audit trail
//   escalation.md     — SURFACED set: auto-safe + needs-human + uncertain tiers, each split
//                       Converged (>=2 sources) vs Single-source. NOISE excluded. Fix-risk
//                       (danger) TAGS a finding needs-human; it never filters it out.
//   escalation.json   — machine form of escalation.md (findings + surfaceTier/agreement/converged)
//
// Node >= 20 required (global fetch).

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..', '..'); // repo root (two levels up from utilities/hermes)

// Two-step model constants.
// REASON_MODEL  — high-recall free-form reasoning pass (Step 1). Best recall/precision balance
//                 tested at 32k; fits now that whisperX idle-unloads (~20 GB load).
// STRUCTURE_MODEL — schema conversion pass (Step 2 + Phase 4 reconciliation). Defaults to the
//                 resolved REASON_MODEL so a stock run loads only ONE model on the GPU and
//                 never swap-thrashes (~20 GB + ~14 GB can't co-reside on a 24 GB card).
//                 Pass --structure-model to override for split-model setups.
// MODEL_TIMEOUT_MS — per-call request timeout for both model steps. Verbose 30B reasoning can
//                 run long; 300 s is generous but prevents indefinite stalls. Timeouts are
//                 treated as transient and enter the retry path in callModelReason.
const DEFAULT_REASON_MODEL = 'qwen3:30b-a3b-instruct-2507-q4_K_M';
const MODEL_TIMEOUT_MS = 300_000; // 300 s — generous for verbose 30B reasoning; applies to both steps

// Hard output-token caps per call type — prevent runaway/degenerate generation that fills
// the context window (~15 min pegged GPU) when the 30B enters a repetitive loop.
// Reason is free-form and can be legitimately verbose; structure emits a JSON findings list;
// judge emits a tiny verdict object.
const REASON_NUM_PREDICT = 4096;    // free-form reasoning; bounded but roomy
const STRUCTURE_NUM_PREDICT = 2048; // schema conversion; JSON output is compact
const JUDGE_NUM_PREDICT = 384;      // verdict JSON; tiny
const DEFAULT_ENDPOINT = 'http://localhost:11434/api/generate';
const DEFAULT_OUT = join(ROOT, 'utilities', 'hermes', 'reports');
const SHARD_MANIFEST = join(__dirname, 'shard-manifest.md');
const PROMPT_TEMPLATES = join(__dirname, 'prompt-templates.md');
const BUILD_REPO_MAP = join(__dirname, 'build-repo-map.mjs');

// Step 1 (REASON) token budget: cap INPUT at ~14k tokens so that input + expected verbose
// reasoning output fits within the 32k context window (~18k reserved for Step 1 output).
// Reduced from 18k → 14k: after two large sub-batches the 30B model showed consistent
// compute-exhaustion timeouts (AbortController fired) at the original 18k cap; smaller
// sub-batches spread the load and keep each call well within MODEL_TIMEOUT_MS.
// Step 2 (STRUCTURE) receives only the Step 1 prose — much smaller; no separate cap needed.
const TOKEN_BUDGET = 14000; // input cap for REASON step; ~18k reserved for verbose output
const CHARS_BUDGET = TOKEN_BUDGET * 4;

// LOC cross-check tolerance: within 10% of manifest stated LOC
const LOC_TOLERANCE = 0.10;

// ---------------------------------------------------------------------------
// Scoring constants (ACT/REVIEW/NOISE bucketing thresholds)
// ---------------------------------------------------------------------------

// Minimum confidence to be eligible for ACT bucket (self-rating mode).
const ACT_CONFIDENCE_MIN = 0.6;
// Judge context window: lines before/after the finding's line range.
const JUDGE_CONTEXT_LINES = 15;

// Heuristic danger patterns — applied AFTER model-rated danger to produce final danger.
// final danger = max(modelDanger, heuristicDanger) where low < med < high.
const DANGER_HIGH_RE = /\b(export|public\s+API|signature|return\s+type|rename|relocat|throw|exception|async|await)\b/i;
const DANGER_LOW_RE = /\b(dead|unused|redundant|hoist|inline|one.use|whitespace|comment|duplicate\s+literal|constant)\b/i;
// Types considered cross-file (automatically elevated to REVIEW bucket regardless of danger score).
const CROSS_FILE_TYPES = new Set(['reuse', 'crosslink', 'altitude']);
// Barrel file pattern (index.ts / index.tsx anywhere in path).
const BARREL_RE = /(?:^|\/)index\.tsx?$/;

// Same exclude regex as build-repo-map.mjs
const EXCLUDE_RE =
  /(\.test\.[tj]sx?$|\.d\.ts$|vitest\.config\.[tj]s$|[/\\]__tests__[/\\]|[/\\]__fixtures__[/\\]|[/\\]generated[/\\]|[/\\]simulator[/\\]vendor[/\\]|[/\\]dist[/\\]|[/\\]node_modules[/\\])/;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

// Value-expecting flags: if the flag is the last argument (no value follows), abort early.
const VALUE_FLAGS = ['--shard', '--limit', '--model', '--structure-model', '--judge-model', '--endpoint', '--out', '--pr', '--commit', '--since', '--reason-mode', '--judge-set', '--file', '--samples', '--reason-models', '--reason-temp', '--judge-temp'];
// --no-judge / --judge / --self-test are boolean flags (no value); listed separately so the help text is accurate.
for (const vf of VALUE_FLAGS) {
  const i = argv.indexOf(vf);
  if (i !== -1 && (i + 1 >= argv.length || argv[i + 1].startsWith('--'))) {
    console.error(`[ERROR] Flag ${vf} requires a value but none was provided.`);
    process.exit(1);
  }
}

function flag(name) {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] ?? null : null;
}
function hasFlag(name) {
  return argv.includes(name);
}

const SELF_TEST = hasFlag('--self-test');
// --judge-set <path>: evaluate a labeled benchmark file with the judge model only.
// When set, the normal shard/simplify pipeline is skipped entirely.
const JUDGE_SET_PATH = flag('--judge-set');

// --reason-mode lenses|monolithic  (default: lenses — current 3-lens behavior unchanged)
const REASON_MODE_RAW = flag('--reason-mode') ?? 'lenses';
if (REASON_MODE_RAW !== 'lenses' && REASON_MODE_RAW !== 'monolithic') {
  console.error(`[ERROR] --reason-mode must be "lenses" or "monolithic" (got "${REASON_MODE_RAW}")`);
  process.exit(1);
}
const REASON_MODE = REASON_MODE_RAW;
const ONLY_SHARD = flag('--shard');
const LIMIT = flag('--limit') !== null ? parseInt(flag('--limit'), 10) : null;
// --model overrides the Step 1 REASON model; --structure-model overrides Step 2 STRUCTURE model.
// No-swap default: STRUCTURE_MODEL = REASON_MODEL so a stock run loads only one model.
// --judge-model overrides the JUDGE pass model. Defaults to STRUCTURE_MODEL so existing
// single-model and split-model setups are unaffected when the flag is absent.
const REASON_MODEL = flag('--model') ?? DEFAULT_REASON_MODEL;
const STRUCTURE_MODEL = flag('--structure-model') ?? REASON_MODEL;
const JUDGE_MODEL = flag('--judge-model') ?? STRUCTURE_MODEL;

// --reason-temp / --judge-temp: sampling temperature for the REASON (Step 1) and JUDGE
// passes respectively. Defaults are the swept optima
// (reason 0.3 per the 2026-07-09 temp-sweep, judge 0.2) so omitting both flags is the tuned baseline.
// STRUCTURE + reconciliation stay hardcoded at 0.1 (mechanical JSON conversion — no
// reason to vary). Raising --reason-temp is what makes --samples / ensemble unions
// actually diversify; keep --judge-temp low (the judge is deterministic in practice).
function parseTemp(flagName, def) {
  const raw = flag(flagName);
  if (raw === null) return def;
  const t = parseFloat(raw);
  if (isNaN(t) || t < 0 || t > 2) {
    console.error(`[ERROR] ${flagName} must be a number in [0, 2] (got "${raw}")`);
    process.exit(1);
  }
  return t;
}
const REASON_TEMP = parseTemp('--reason-temp', 0.3);
const JUDGE_TEMP = parseTemp('--judge-temp', 0.2);

// --reason-models <m1,m2,...>: ENSEMBLE mode — run multiple reason models per file, union
// findings across models, then judge the unioned set with JUDGE_MODEL.
// When present, supersedes --model (logs a [WARN] if --model is also given).
// Only compatible with --reason-mode monolithic; errors out if combined with lenses.
const REASON_MODELS_RAW = flag('--reason-models');
const ENSEMBLE_MODELS = REASON_MODELS_RAW !== null
  ? REASON_MODELS_RAW.split(',').map((m) => m.trim()).filter(Boolean)
  : null;
const IS_ENSEMBLE = ENSEMBLE_MODELS !== null && ENSEMBLE_MODELS.length > 0;

// Validate ensemble flag interactions
if (IS_ENSEMBLE && flag('--model') !== null) {
  console.warn('[WARN] --reason-models and --model are both set; --reason-models wins (ignoring --model)');
}
// Error out only if --reason-mode lenses was EXPLICITLY passed alongside --reason-models.
// When --reason-mode is absent (defaults to 'lenses'), ensemble silently runs in monolithic style.
if (IS_ENSEMBLE && flag('--reason-mode') === 'lenses') {
  console.error('[ERROR] --reason-models is not compatible with --reason-mode lenses. Omit --reason-mode (ensemble always runs monolithic per model) or pass --reason-mode monolithic explicitly.');
  process.exit(1);
}
if (IS_ENSEMBLE && ENSEMBLE_MODELS.length < 2) {
  console.error('[ERROR] --reason-models requires at least 2 comma-separated model names (got 1).');
  process.exit(1);
}

// Cross-model confidence boost: +MODEL_BOOST_PER_EXTRA per additional model that agreed.
// Composing with existing lens-convergence and sample boosts under the 1.0 cap.
const MODEL_BOOST_PER_EXTRA = 0.1;
// Cross-model union-find line gap (same as SAMPLE_LINE_GAP — same dedup intent).
const MODEL_LINE_GAP = 5;
const ENDPOINT = flag('--endpoint') ?? DEFAULT_ENDPOINT;
const OUT_DIR = flag('--out') ?? DEFAULT_OUT;
const DRY_RUN = hasFlag('--dry-run');
// Judge verdict pass runs by DEFAULT (single pass per finding, temperature 0.2).
// --no-judge: skip the judge pass entirely (fast, unfiltered — escalation.md will list all ACT findings).
// --judge: harmless no-op alias (kept for backwards compatibility with any existing scripts).
const USE_JUDGE = !hasFlag('--no-judge');

// --file <path>: single-file review mode. Mutually exclusive with --shard/--pr/--commit/--since.
// Path may be repo-relative or absolute; it is resolved to a repo-relative path for the shard.
const SCOPE_FILE = flag('--file');

// Scoping-mode flags (mutually exclusive).
const SCOPE_PR = flag('--pr');
const SCOPE_COMMIT = flag('--commit');
const SCOPE_SINCE = flag('--since');
const SCOPE_MODE_COUNT = [SCOPE_PR, SCOPE_COMMIT, SCOPE_SINCE, SCOPE_FILE].filter(Boolean).length;
if (SCOPE_MODE_COUNT > 1) {
  console.error('[ERROR] --pr, --commit, --since, and --file are mutually exclusive — pick one.');
  process.exit(1);
}
// --file is also mutually exclusive with --shard (manifest filter)
if (SCOPE_FILE && argv.includes('--shard')) {
  console.error('[ERROR] --file and --shard are mutually exclusive — use one or the other.');
  process.exit(1);
}
const IS_SCOPING_MODE = SCOPE_PR !== null || SCOPE_COMMIT !== null || SCOPE_SINCE !== null;
const IS_FILE_MODE = SCOPE_FILE !== null;

// --samples N: run the reason->structure step N times per file/shard and union findings.
// Default 1 = current single-pass behaviour (no change in model call count).
// Prompt + repo-map assembly happens ONCE; only the model calls repeat.
const SAMPLES_RAW = flag('--samples');
const SAMPLES = SAMPLES_RAW !== null ? parseInt(SAMPLES_RAW, 10) : 1;
if (isNaN(SAMPLES) || SAMPLES < 1) {
  console.error(`[ERROR] --samples must be a positive integer (got "${SAMPLES_RAW}")`);
  process.exit(1);
}

// Circuit breaker: abort a multi-shard pass early on a *systemic* failure signature
// (input=zero-files, pipeline=error, output=empty) instead of churning through every
// remaining shard. Isolated sub-batch failures are NOT systemic — they are flagged into
// retry-queue.json and the pass continues. On by default; --no-circuit-breaker forces a
// full pass. --cb-consecutive N sets how many consecutive broken shards trip it mid-run
// (default 2); the first batch trips immediately when fully broken (an all-error/zero-files
// first shard is unambiguously systemic — an all-empty first shard only in a multi-shard pass).
const CIRCUIT_BREAKER = !hasFlag('--no-circuit-breaker');
const CB_CONSECUTIVE = flag('--cb-consecutive') !== null ? Math.max(1, parseInt(flag('--cb-consecutive'), 10)) : 2;

// ---------------------------------------------------------------------------
// Package -> pnpm filter name mapping
// (matches the package column in shard-manifest.md to the npm package name)
// ---------------------------------------------------------------------------

const PKG_FILTER_MAP = {
  contracts: '@keyboard-studio/contracts',
  engine: '@keyboard-studio/engine',
  'keyboard-lint': '@keymanapp/keyboard-lint',
  llm: '@keyboard-studio/llm',
  studio: '@keyboard-studio/studio',
  'api (Vercel functions)': 'api',
  'utilities/oauth-backend': 'oauth-backend',
  api: 'api',
  'oauth-backend': 'oauth-backend',
};

// Root-relative package root for each package column.
// The covers cells in shard-manifest.md use paths relative to the package root
// (e.g. "src/*.ts" means "<pkg-root>/src/*.ts").
// Keys are the exact strings from the "package" column in shard-manifest.md.
const PKG_SRC_PREFIX = {
  contracts: 'packages/contracts',
  engine: 'packages/engine',
  'keyboard-lint': 'packages/keyboard-lint',
  llm: 'packages/llm',
  studio: 'packages/studio',
  // S38: package column is "api (Vercel functions)"; covers use repo-root-relative paths
  'api (Vercel functions)': '', // empty prefix → paths are already repo-root-relative
  // S39: package column is "utilities/oauth-backend"
  'utilities/oauth-backend': 'utilities/oauth-backend',
  // Aliases for convenience (e.g. --package api)
  api: '',
  'oauth-backend': 'utilities/oauth-backend',
};

// ---------------------------------------------------------------------------
// Shard manifest parsing
// ---------------------------------------------------------------------------

/**
 * Parse the markdown table in shard-manifest.md.
 * Returns an array of shard descriptors:
 *   { num, id, package, covers, loc }
 */
function parseShardManifest() {
  const src = readFileSync(SHARD_MANIFEST, 'utf8');
  const shards = [];
  // Find the table rows: lines starting with | that are not the header or separator
  const lines = src.split('\n');
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (inTable) break; // table ended
      continue;
    }
    // Skip header and separator rows
    if (trimmed.startsWith('| #') || trimmed.startsWith('|---') || trimmed.startsWith('| ---')) {
      inTable = true;
      continue;
    }
    // Data row
    const cols = trimmed
      .slice(1, -1) // strip leading and trailing |
      .split('|')
      .map((c) => c.trim());
    if (cols.length < 5) continue;
    // The covers cell may contain `|` (e.g. `*.tsx|ts`), which splits into extra columns.
    // Layout is always: # | shard id | package | covers... | LOC
    // So: cols[0]=num, cols[1]=id, cols[2]=pkg, cols[last]=loc, cols[3..last-1]=covers joined
    const numStr = cols[0];
    const id = cols[1];
    const pkg = cols[2];
    const locStr = cols[cols.length - 1];
    const covers = cols.slice(3, cols.length - 1).join('|');
    // numStr is like "S01", "S17" etc.
    const numMatch = numStr.match(/[Ss](\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : NaN;
    const loc = parseInt(locStr.replace(/[^0-9]/g, ''), 10);
    if (!id || !pkg || !covers || isNaN(loc)) continue;
    shards.push({ num, id, package: pkg, covers, loc });
    inTable = true;
  }
  return shards;
}

// ---------------------------------------------------------------------------
// Brace expansion for "covers" cell patterns like `src/{a.ts, b.ts}`
// ---------------------------------------------------------------------------

/**
 * Expand a single glob-like token that may contain `{a, b, c}` brace groups.
 * Returns an array of expanded strings. Only one brace group per token is supported
 * (the manifest uses simple patterns).
 */
function expandBraces(token) {
  const m = token.match(/^(.*?)\{([^}]+)\}(.*)$/);
  if (!m) return [token];
  const [, pre, inner, post] = m;
  return inner.split(',').map((part) => pre + part.trim() + post);
}

/**
 * Parse the "covers" cell from the shard manifest into a list of file/dir patterns.
 * Input: prose like `src/{keyboard-ir.ts, ir-path.ts} + src/ir/`
 * Output: array of { type: 'file'|'dir'|'glob-flat', path: string } relative to pkg root.
 *
 * Handles:
 * - `+`-separated segments
 * - brace expansion
 * - `(own shard — N LOC)` annotations
 * - `(non-generated)`, `(root)`, `(incl. ...)` inline annotations on paths — stripped
 * - `except <token>` exclusions
 * - `(excl. <tokens>)` parenthetical exclusions
 * - `src/*.ts` glob — treated as a flat (non-recursive) scan of src/ for .ts/.tsx
 * - `src/*.tsx|ts` — the `|ts` is a manifest typo for `|.tsx`; treat as flat .ts/.tsx scan
 */
function parseCoverage(coversCell, srcPrefix) {
  // Strip parenthetical annotations that modify the whole segment:
  //   "(own shard — N LOC)", "(incl. ...)", "(root)" after a path, "(non-generated)" inside path
  // We need to strip trailing annotations like `src/*.ts` (root) but NOT strip
  // `(excl. ...)` until we've captured the exclusions.
  let cell = coversCell
    .replace(/\(own shard[^)]*\)/gi, '')
    .replace(/\(incl\.[^)]*\)/gi, '');

  // Extract `(excl. <tokens>)` exclusions
  const exclMatch = cell.match(/\(excl\.\s*([^)]+)\)/i);
  const exclTokens = exclMatch ? exclMatch[1].split(',').map((s) => s.trim()) : [];
  cell = cell.replace(/\(excl\.[^)]*\)/gi, '');

  // Extract `except <token>` exclusions (before splitting on +)
  const exceptMatch = cell.match(/\bexcept\s+(\S+)/i);
  const exceptToken = exceptMatch ? exceptMatch[1] : null;
  cell = cell.replace(/\bexcept\s+\S+/gi, '');

  // Strip remaining parenthetical inline annotations like `(root)`, `(non-generated)`,
  // `(alphabetical first half)`, `(alphabetical second half)`, `(own shard ...)` etc.
  // These are cosmetic; don't strip inside brace groups (handled separately below).
  cell = cell.replace(/\s*\([^)]*\)/g, '');

  // Split on +
  const segments = cell.split('+').map((s) => s.trim()).filter(Boolean);

  const inclPatterns = [];
  for (const seg of segments) {
    // Each segment may contain brace groups; strip inline (annotations) from brace items too
    const expanded = expandBraces(seg);
    for (const e of expanded) {
      // Strip trailing annotations that survived brace expansion (shouldn't after above strip)
      const trimmed = e.replace(/\s*\([^)]*\)/g, '').trim();
      if (!trimmed) continue;
      inclPatterns.push(trimmed);
    }
  }

  // Map patterns to { type, path } relative to repo root
  const inclItems = [];
  for (const pat of inclPatterns) {
    // If the pattern has prose before a backtick-quoted path, extract just the path token.
    // E.g. "rest of `src/survey/*.tsx` root" → `src/survey/*.tsx`
    const backtickMatch = pat.match(/`([^`]+)`/);
    const rawPat = backtickMatch ? backtickMatch[1] : pat;
    // Remove backtick quotes from final path
    const p = rawPat.replace(/[`'"]/g, '').trim();
    if (!p || p === '+') continue;

    if (p.includes('*')) {
      // Glob pattern like `src/*.ts` or `src/*.tsx|ts`
      // Treat as a FLAT (non-recursive) directory scan — the shard explicitly lists subdirs
      // separately, so `src/*.ts` means "only direct children of src/".
      const dirPart = p.replace(/\/\*.*$/, '');
      const fullDir = join(ROOT, srcPrefix, dirPart);
      inclItems.push({ type: 'glob-flat', path: fullDir });
    } else if (p.endsWith('/')) {
      const fullDir = join(ROOT, srcPrefix, p.slice(0, -1));
      inclItems.push({ type: 'dir', path: fullDir });
    } else {
      // Could be a file or directory
      const fullPath = join(ROOT, srcPrefix, p);
      inclItems.push({ type: 'auto', path: fullPath, rawPat: rawPat });
    }
  }

  // Build exclusion set (full paths)
  const exclPaths = new Set();
  for (const et of [...exclTokens, ...(exceptToken ? [exceptToken] : [])]) {
    const ep = et.replace(/[`'"]/g, '').trim();
    if (!ep) continue;
    exclPaths.add(join(ROOT, srcPrefix, ep));
  }

  return { inclItems, exclPaths };
}

// ---------------------------------------------------------------------------
// File walking (same logic as build-repo-map.mjs)
// ---------------------------------------------------------------------------

function walkDir(dir, out = []) {
  if (!existsSync(dir)) return out;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walkDir(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      const rel = relative(ROOT, full).split(sep).join('/');
      if (!EXCLUDE_RE.test(rel)) out.push(rel);
    }
  }
  return out;
}

/**
 * Count non-blank, non-comment lines in a file as a rough LOC metric.
 * We just count all lines (same as wc -l) for consistency with the manifest numbers.
 */
function countLines(filePath) {
  try {
    const src = readFileSync(filePath, 'utf8');
    return src.split('\n').length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Shard "rest of" + "alphabetical split" detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the covers cell describes a "rest of <dir>" shard — i.e. it
 * should receive files NOT already claimed by other shards in the same package.
 */
function isRestOfShard(coversCell) {
  return /\brest of\b/i.test(coversCell);
}

/**
 * Returns 'first' | 'second' | null for alphabetical-split shards (S36/S37).
 */
function alphaHalf(coversCell) {
  if (/alphabetical first half/i.test(coversCell)) return 'first';
  if (/alphabetical second half/i.test(coversCell)) return 'second';
  return null;
}

/**
 * Extract the target directory path from a "rest of `src/foo/`" cell.
 * Returns a full absolute path to the directory, or null if not parseable.
 */
function restOfDir(coversCell, srcPrefix) {
  // Match `rest of src/foo/` or `rest of \`src/foo/\``
  const m = coversCell.match(/rest of\s+[`']?(\S+?)[`']?(?:\s|$)/i);
  if (!m) return null;
  let dirPat = m[1];
  // Strip glob suffix like /*.tsx|ts
  dirPat = dirPat.replace(/\/\*.*$/, '');
  // Strip trailing slash
  dirPat = dirPat.replace(/\/$/, '');
  return join(ROOT, srcPrefix, dirPat);
}

/**
 * Extract the target directory for an alphabetical-split shard.
 * Cells look like: `src/survey/questions/b/` — files … (alphabetical first half)
 */
function alphaSplitDir(coversCell, srcPrefix) {
  // Match a path segment before `—` or `(alphabetical`
  const m = coversCell.match(/`?([^\s`—(]+\/)[`\s—(]/);
  if (!m) return null;
  let dirPat = m[1].replace(/\/$/, '');
  return join(ROOT, srcPrefix, dirPat);
}

// ---------------------------------------------------------------------------
// Low-level file collector (used by both single-shard and two-pass logic)
// ---------------------------------------------------------------------------

/**
 * Collect all in-scope .ts/.tsx files from the given inclItems, minus exclPaths.
 * Returns a sorted array of repo-relative paths.
 */
function collectFiles(inclItems, exclPaths, warnings = []) {
  const fileSet = new Set();

  for (const item of inclItems) {
    if (item.type === 'dir') {
      if (!existsSync(item.path)) {
        warnings.push(`Directory not found: ${item.path}`);
        continue;
      }
      for (const f of walkDir(item.path)) {
        if (!isExcluded(f, exclPaths)) fileSet.add(f);
      }
    } else if (item.type === 'glob-flat') {
      // Flat (non-recursive) scan: only direct children of the directory
      if (!existsSync(item.path)) {
        warnings.push(`Directory not found (glob-flat): ${item.path}`);
        continue;
      }
      let entries;
      try {
        entries = readdirSync(item.path);
      } catch {
        warnings.push(`Could not read directory (glob-flat): ${item.path}`);
        continue;
      }
      for (const name of entries) {
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const full = join(item.path, name);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (!st.isFile()) continue;
        const rel = relative(ROOT, full).split(sep).join('/');
        if (!EXCLUDE_RE.test(rel) && !isExcluded(rel, exclPaths)) fileSet.add(rel);
      }
    } else if (item.type === 'auto') {
      if (existsSync(item.path) && statSync(item.path).isDirectory()) {
        // It's a directory
        for (const f of walkDir(item.path)) {
          if (!isExcluded(f, exclPaths)) fileSet.add(f);
        }
      } else {
        // Try as a file (resolve .ts/.tsx if no extension given)
        const candidates = [
          item.path,
          item.path + '.ts',
          item.path + '.tsx',
          item.path + '/index.ts',
          item.path + '/index.tsx',
        ];
        let resolved = false;
        for (const c of candidates) {
          if (existsSync(c) && statSync(c).isFile()) {
            const rel = relative(ROOT, c).split(sep).join('/');
            if (!EXCLUDE_RE.test(rel) && !isExcluded(rel, exclPaths)) {
              fileSet.add(rel);
              resolved = true;
              break;
            }
          }
        }
        if (!resolved) {
          warnings.push(`Could not resolve path: ${item.rawPat ?? item.path}`);
        }
      }
    }
  }

  return [...fileSet].sort();
}

// ---------------------------------------------------------------------------
// Two-pass shard resolution
//
// Pass 1: resolve every shard whose covers cell DOES NOT use "rest of" or
//         "alphabetical * half" phrasing. Build a global set of explicitly-
//         claimed file paths per package.
// Pass 2: resolve "rest of <dir>" shards as:
//           (all in-scope files under <dir>) MINUS (Pass-1 claimed files for
//           the same package) MINUS (any `except` named in the cell).
//         Resolve "alphabetical * half" shards by sorting the target dir's
//         in-scope files and splitting in half.
// ---------------------------------------------------------------------------

/**
 * Run two-pass resolution over all shards and attach a `resolvedFiles` +
 * `resolveWarnings` property to each shard object (mutates in place).
 * Returns the mutated shard array.
 */
function twoPassResolveShards(shards) {
  // Map: package -> Set of explicitly-claimed repo-relative paths (from Pass 1)
  const explicitByPkg = new Map();

  // --- Pass 1 ---
  for (const shard of shards) {
    const srcPrefix = PKG_SRC_PREFIX[shard.package];
    if (srcPrefix === undefined) {
      shard.resolvedFiles = [];
      shard.resolveWarnings = [`Unknown package "${shard.package}" — no src prefix mapping`];
      continue;
    }

    if (isRestOfShard(shard.covers) || alphaHalf(shard.covers) !== null) {
      // Defer to Pass 2
      shard._deferred = true;
      continue;
    }

    const warnings = [];
    const { inclItems, exclPaths } = parseCoverage(shard.covers, srcPrefix);
    const files = collectFiles(inclItems, exclPaths, warnings);
    shard.resolvedFiles = files;
    shard.resolveWarnings = warnings;

    // Accumulate into the per-package explicit set
    if (!explicitByPkg.has(shard.package)) explicitByPkg.set(shard.package, new Set());
    const pkgSet = explicitByPkg.get(shard.package);
    for (const f of files) pkgSet.add(f);
  }

  // --- Pass 2 ---
  // Process deferred shards in dependency order: alpha-split shards FIRST so their
  // files land in the explicit set before "rest of" shards subtract from it.
  // (S34 "rest of src/survey root" must see S36/S37 questions/b/ already claimed.)
  const deferred = shards.filter((s) => s._deferred);
  const deferredAlpha = deferred.filter((s) => alphaHalf(s.covers) !== null);
  const deferredRest = deferred.filter((s) => alphaHalf(s.covers) === null);
  const deferredOrdered = [...deferredAlpha, ...deferredRest];
  // Restore processing order for non-deferred shards (already done above); iterate
  // only over the ordered deferred list.
  for (const shard of deferredOrdered) {
    if (!shard._deferred) continue;

    const srcPrefix = PKG_SRC_PREFIX[shard.package];
    const warnings = [];
    const explicitForPkg = explicitByPkg.get(shard.package) ?? new Set();

    const half = alphaHalf(shard.covers);

    if (half !== null) {
      // Alphabetical-split shard (S36/S37): get all files in the target dir, sort, split half.
      const dirPath = alphaSplitDir(shard.covers, srcPrefix);
      if (!dirPath || !existsSync(dirPath)) {
        warnings.push(`alphabetical-split: target dir not found for covers cell: ${shard.covers}`);
        shard.resolvedFiles = [];
        shard.resolveWarnings = warnings;
        continue;
      }
      // All in-scope files under that dir (not already claimed by non-deferred siblings)
      // Note: alphabetical shards are siblings of each other — they should NOT subtract each
      // other from the explicit set. We just sort and split the full dir.
      const allInDir = walkDir(dirPath).sort();
      const mid = Math.ceil(allInDir.length / 2);
      shard.resolvedFiles = half === 'first' ? allInDir.slice(0, mid) : allInDir.slice(mid);
      shard.resolveWarnings = warnings;
      // Add to explicit set so future passes don't double-count
      if (!explicitByPkg.has(shard.package)) explicitByPkg.set(shard.package, new Set());
      for (const f of shard.resolvedFiles) explicitByPkg.get(shard.package).add(f);
      continue;
    }

    // "rest of <dir>" shard
    const { inclItems, exclPaths } = parseCoverage(shard.covers, srcPrefix);

    // Identify the target directory from the "rest of" phrasing.
    // If the covers cell uses a glob pattern like "rest of src/foo/*.tsx|ts root",
    // treat the target as a flat (non-recursive) scan — the "(root)" annotation
    // signals that only direct children of the directory are wanted here, while
    // subdirectories are covered by explicit inclItems added via "+".
    const restDir = restOfDir(shard.covers, srcPrefix);
    const restUsesGlob = /rest of\s+[`']?[^\s`']+\*/.test(shard.covers);

    let restCandidates;
    if (restDir && existsSync(restDir)) {
      if (restUsesGlob) {
        // Flat scan: only direct children (mimics glob-flat behaviour)
        restCandidates = [];
        try {
          for (const name of readdirSync(restDir)) {
            if (!/\.(ts|tsx)$/.test(name)) continue;
            const full = join(restDir, name);
            let st;
            try {
              st = statSync(full);
            } catch {
              continue;
            }
            if (!st.isFile()) continue;
            const rel = relative(ROOT, full).split(sep).join('/');
            if (!EXCLUDE_RE.test(rel)) restCandidates.push(rel);
          }
        } catch {
          warnings.push(`Could not read rest-of dir (flat): ${restDir}`);
        }
        restCandidates.sort();
      } else {
        // Recursive walk for "rest of <dir>/" shards (no glob)
        restCandidates = walkDir(restDir).sort();
      }
    } else {
      restCandidates = [];
    }

    // Collect the explicit additions from the "+" segments (e.g. questions/f/, questions/*.ts)
    // These are NOT subject to the "rest of" subtraction — add them directly.
    const { inclItems: inclItemsAll, exclPaths: exclPathsAll } = parseCoverage(shard.covers, srcPrefix);
    // Separate the rest-of target dir from the explicit additions:
    // inclItems that are NOT the restDir itself are explicit additions.
    const explicitInclItems = inclItemsAll.filter((item) => {
      if (!restDir) return true;
      const restDirRel = relative(ROOT, restDir).split(sep).join('/');
      const itemRel = relative(ROOT, item.path).split(sep).join('/');
      return !itemRel.startsWith(restDirRel) || itemRel !== restDirRel;
    });
    const explicitAdditions = collectFiles(explicitInclItems, exclPathsAll, warnings);

    // Subtract files already explicitly claimed by any other shard in the same package
    const remaining = [
      ...restCandidates.filter((f) => {
        if (explicitForPkg.has(f)) return false; // claimed by a Pass-1 shard
        if (isExcluded(f, exclPathsAll)) return false;
        return true;
      }),
      ...explicitAdditions.filter((f) => !explicitForPkg.has(f)),
    ].filter((f, i, arr) => arr.indexOf(f) === i).sort();

    shard.resolvedFiles = remaining;
    shard.resolveWarnings = warnings;

    if (!explicitByPkg.has(shard.package)) explicitByPkg.set(shard.package, new Set());
    for (const f of remaining) explicitByPkg.get(shard.package).add(f);
  }

  // Clean up internal marker
  for (const shard of shards) delete shard._deferred;

  return shards;
}

/**
 * Resolve a shard's "covers" cell to a list of repo-relative file paths.
 * Returns { files: string[], resolveWarnings: string[] }
 *
 * NOTE: This single-shard path is used only when a shard already has its
 * `resolvedFiles` set by twoPassResolveShards (called from main). If called
 * standalone it falls back to a direct resolution without two-pass correction.
 */
function resolveShardFiles(shard) {
  // If the two-pass resolver already ran, use its result.
  if (shard.resolvedFiles !== undefined) {
    return { files: shard.resolvedFiles, resolveWarnings: shard.resolveWarnings ?? [] };
  }

  const srcPrefix = PKG_SRC_PREFIX[shard.package];
  if (srcPrefix === undefined) {
    return {
      files: [],
      resolveWarnings: [`Unknown package "${shard.package}" — no src prefix mapping`],
    };
  }

  const warnings = [];
  const { inclItems, exclPaths } = parseCoverage(shard.covers, srcPrefix);
  const files = collectFiles(inclItems, exclPaths, warnings);
  return { files, resolveWarnings: warnings };
}

function isExcluded(relPath, exclPaths) {
  for (const ep of exclPaths) {
    const epRel = relative(ROOT, ep).split(sep).join('/');
    // Exact match or directory-prefix match (e.g. "src/foo/" excludes "src/foo/bar.ts")
    if (relPath === epRel || relPath.startsWith(epRel + '/')) return true;
    // Suffix match: `except parse.ts` in a shard for package/src/ must only exclude
    // files whose repo-relative path ENDS with the exclusion token (e.g.
    // "packages/engine/src/codec/parse.ts"), not every file named parse.ts repo-wide.
    // This avoids the bare-basename false-positive of the old basename comparison.
    if (relPath.endsWith('/' + epRel)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// LOC cross-check
// ---------------------------------------------------------------------------

/**
 * Sum lines for a list of repo-relative files.
 */
function sumLOC(files) {
  let total = 0;
  for (const f of files) {
    total += countLines(join(ROOT, f));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Repo-map invocation (cached per package)
// ---------------------------------------------------------------------------

const repoMapCache = new Map(); // package -> parsed JSON

// Map from shard "package" column to the short name used by build-repo-map.mjs --package
function buildRepoMapPkgName(shardPkg) {
  if (shardPkg === '_full_') return '_full_';
  // build-repo-map.mjs pkgOf() returns: the dir name under packages/, "api", or "oauth-backend"
  const map = {
    contracts: 'contracts',
    engine: 'engine',
    'keyboard-lint': 'keyboard-lint',
    llm: 'llm',
    studio: 'studio',
    'api (Vercel functions)': 'api',
    'utilities/oauth-backend': 'oauth-backend',
    api: 'api',
    'oauth-backend': 'oauth-backend',
  };
  return map[shardPkg] ?? shardPkg;
}

function getRepoMapSlice(pkg) {
  if (repoMapCache.has(pkg)) return repoMapCache.get(pkg);

  const mapPkg = buildRepoMapPkgName(pkg);
  const outFile = join(ROOT, mapPkg === '_full_' ? 'repo-map.json' : `repo-map.${mapPkg}.json`);
  const args = mapPkg === '_full_' ? '' : `--package ${mapPkg}`;

  // Run build-repo-map.mjs; capture stdout; suppress stderr via stdio option
  try {
    execSync(`node ${JSON.stringify(BUILD_REPO_MAP)} ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch (err) {
    console.error(`[WARN] build-repo-map failed for package "${pkg}": ${err.message}`);
    return null;
  }

  if (!existsSync(outFile)) {
    console.error(`[WARN] Expected repo-map file not found: ${outFile}`);
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
    repoMapCache.set(pkg, parsed);
    return parsed;
  } catch (err) {
    console.error(`[WARN] Failed to parse repo-map JSON at ${outFile}: ${err.message}`);
    return null;
  }
}

/**
 * Produce a minified JSON string for the repo-map slice, trimmed if it exceeds budget.
 * Returns { minified, wasTrimed, warning }
 */
function serializeRepoMapSlice(mapData, shardFiles) {
  if (!mapData) return { minified: '{}', wasTrimmed: false, warning: null };

  // Attempt full minification first
  const full = JSON.stringify(mapData);
  if (full.length <= CHARS_BUDGET * 0.3) {
    // Fits within 30% of budget — use full
    return { minified: full, wasTrimmed: false, warning: null };
  }

  // Trim: keep exportInventory + boundaryRules, trim importGraph edges not touching shard files
  const shardFileSet = new Set(shardFiles);
  const trimmedEdges = (mapData.importGraph?.edges ?? []).filter((e) => {
    return shardFiles.some((f) => e.includes(f.split('/').pop() ?? ''));
  });

  const trimmed = {
    generatedAt: mapData.generatedAt,
    scope: mapData.scope,
    exportInventory: mapData.exportInventory,
    importGraph: { source: mapData.importGraph?.source, edges: trimmedEdges },
    boundaryRules: mapData.boundaryRules,
  };

  const trimmedStr = JSON.stringify(trimmed);
  const warning =
    trimmedStr.length < full.length
      ? `[WARN] Repo-map slice trimmed: ${full.length} → ${trimmedStr.length} chars (kept exportInventory + boundaryRules; filtered importGraph edges)`
      : null;

  return { minified: trimmedStr, wasTrimmed: true, warning };
}

// ---------------------------------------------------------------------------
// Prompt templates loading
// ---------------------------------------------------------------------------

let _promptTemplatesCache = null;
function loadPromptTemplates() {
  if (_promptTemplatesCache) return _promptTemplatesCache;
  const src = readFileSync(PROMPT_TEMPLATES, 'utf8');
  _promptTemplatesCache = src;
  return src;
}

/**
 * Extract the SYSTEM block from section (A) in prompt-templates.md.
 * Returns the text inside the first ``` block after "(A) Per-shard simplify prompt".
 */
function extractSystemPromptA() {
  const src = loadPromptTemplates();
  // Find section (A)
  const secIdx = src.indexOf('## (A) Per-shard simplify prompt');
  if (secIdx === -1) throw new Error('Could not find "(A) Per-shard simplify prompt" in prompt-templates.md');
  const after = src.slice(secIdx);
  // Find first ``` block (the SYSTEM: ... ``` block)
  const startMark = after.indexOf('```\n');
  if (startMark === -1) throw new Error('Could not find opening ``` in section (A)');
  const contentStart = startMark + 4;
  const endMark = after.indexOf('\n```', contentStart);
  if (endMark === -1) throw new Error('Could not find closing ``` in section (A)');
  // The system prompt starts with "SYSTEM:\n" — strip that label line
  let block = after.slice(contentStart, endMark);
  block = block.replace(/^SYSTEM:\n/, '');
  return block;
}

/**
 * Extract the SYSTEM block from section (B) in prompt-templates.md.
 */
function extractSystemPromptB() {
  const src = loadPromptTemplates();
  const secIdx = src.indexOf('## (B) Reconciliation prompt');
  if (secIdx === -1) throw new Error('Could not find "(B) Reconciliation prompt" in prompt-templates.md');
  const after = src.slice(secIdx);
  const startMark = after.indexOf('```\n');
  if (startMark === -1) throw new Error('Could not find opening ``` in section (B)');
  const contentStart = startMark + 4;
  const endMark = after.indexOf('\n```', contentStart);
  if (endMark === -1) throw new Error('Could not find closing ``` in section (B)');
  let block = after.slice(contentStart, endMark);
  block = block.replace(/^SYSTEM:\n/, '');
  return block;
}

// ---------------------------------------------------------------------------
// Shard file assembly with line numbers
// ---------------------------------------------------------------------------

/**
 * Read files and format them with `// ==== <path> ====` headers and line numbers.
 * Returns { assembled: string, charCount: number }
 */
function assembleShardContent(files) {
  const parts = [];
  for (const f of files) {
    const fullPath = join(ROOT, f);
    let src;
    try {
      src = readFileSync(fullPath, 'utf8');
    } catch {
      parts.push(`// ==== ${f} ====\n// [ERROR: could not read file]\n`);
      continue;
    }
    const lines = src.split('\n');
    const numbered = lines.map((line, i) => `${String(i + 1).padStart(4, ' ')}: ${line}`).join('\n');
    parts.push(`// ==== ${f} ====\n${numbered}\n`);
  }
  const assembled = parts.join('\n');
  return { assembled, charCount: assembled.length };
}

// ---------------------------------------------------------------------------
// Model calls — two-step decoding
// ---------------------------------------------------------------------------

/**
 * Returns true if the error is a transient network/connection failure or a timeout —
 * safe to retry. Returns false for clean HTTP 4xx client errors (don't retry those).
 */
function isTransientError(err) {
  // AbortError: our own timeout fired
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  const msg = (err.message ?? '').toLowerCase();
  // Node fetch / undici network errors
  if (msg.includes('fetch failed')) return true;
  if (msg.includes('econnrefused')) return true;
  if (msg.includes('econnreset')) return true;
  if (msg.includes('enotfound')) return true;
  if (msg.includes('etimedout')) return true;
  if (msg.includes('network')) return true;
  if (msg.includes('socket hang up')) return true;
  return false;
}

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry backoff schedule (ms) for transient reason-step failures.
const REASON_RETRY_DELAYS = [2_000, 5_000, 10_000];

/**
 * Step 1 REASON: call REASON_MODEL without format:json.
 * Returns the raw prose string from .response, or throws on hard failure.
 * Retries up to 3 times with increasing backoff on transient network/timeout errors.
 * Does NOT retry on clean HTTP 4xx (client errors).
 */
async function callModelReason(system, prompt) {
  const body = {
    model: REASON_MODEL,
    system,
    prompt,
    stream: false,
    // NO format:json — free-form reasoning for high recall
    options: {
      temperature: REASON_TEMP,
      num_ctx: 32768,
      num_predict: REASON_NUM_PREDICT,
      repeat_penalty: 1.15,
      repeat_last_n: 256,
    },
  };

  const maxAttempts = 1 + REASON_RETRY_DELAYS.length; // 4 total (1 original + 3 retries)
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        // HTTP 4xx = client error; do not retry
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const outer = await res.json();
      const raw = outer.response;
      if (typeof raw !== 'string') {
        throw new Error(`Unexpected response shape: .response is ${typeof raw}`);
      }
      // Degenerate-generation detection: if the response is within 5% of the num_predict*4
      // char ceiling the model likely hit the cap (repetitive loop or genuinely very verbose).
      const capChars = REASON_NUM_PREDICT * 4;
      if (raw.length >= capChars * 0.95) {
        console.warn(`[WARN] reason output hit num_predict cap — possible runaway/verbose; findings may be truncated`);
      }
      return raw;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (!isTransientError(err)) throw err; // hard failure — surface immediately
      if (attempt < maxAttempts) {
        const delayMs = REASON_RETRY_DELAYS[attempt - 1];
        console.warn(`[WARN] reason step transient failure (attempt ${attempt}/${maxAttempts - 1}): ${err.message}; retrying in ${delayMs / 1000}s`);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`reason step failed after ${maxAttempts - 1} retries: ${lastErr.message}`);
}

/**
 * Lenient JSON extraction from free-form model text. Scans for the first balanced
 * {...} block that contains the substring `"${requiredKey}"` and JSON.parse-s it.
 * Returns the parsed object, or null if no such block parses.
 * Used as the gpt-oss / reasoning-model fallback when format:json yields empty output.
 */
function lenientExtractObject(text, requiredKey) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const marker = `"${requiredKey}"`;
  let searchFrom = 0;
  while (true) {
    const open = text.indexOf('{', searchFrom);
    if (open === -1) return null;
    // Balance braces from `open`, respecting string literals + escapes.
    let depth = 0;
    let inStr = false;
    let esc = false;
    let close = -1;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close === -1) return null; // unbalanced to EOF
    const candidate = text.slice(open, close + 1);
    if (candidate.includes(marker)) {
      try {
        return JSON.parse(candidate);
      } catch {
        // fall through and keep scanning for the next {
      }
    }
    searchFrom = open + 1;
  }
}

/**
 * Model-parameterised variant of callModelReason. Used by ensemble mode to run each
 * reason model independently without mutating the global REASON_MODEL constant.
 */
async function callModelReasonWith(modelName, system, prompt) {
  const body = {
    model: modelName,
    system,
    prompt,
    stream: false,
    options: {
      temperature: REASON_TEMP,
      num_ctx: 32768,
      num_predict: REASON_NUM_PREDICT,
      repeat_penalty: 1.15,
      repeat_last_n: 256,
    },
  };

  const maxAttempts = 1 + REASON_RETRY_DELAYS.length;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const outer = await res.json();
      const raw = outer.response;
      if (typeof raw !== 'string') throw new Error(`Unexpected response shape: .response is ${typeof raw}`);
      const capChars = REASON_NUM_PREDICT * 4;
      if (raw.length >= capChars * 0.95) {
        console.warn(`[WARN] reason output hit num_predict cap — possible runaway/verbose; findings may be truncated`);
      }
      return raw;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (!isTransientError(err)) throw err;
      if (attempt < maxAttempts) {
        const delayMs = REASON_RETRY_DELAYS[attempt - 1];
        console.warn(`[WARN] reason step transient failure (attempt ${attempt}/${maxAttempts - 1}): ${err.message}; retrying in ${delayMs / 1000}s`);
        await sleep(delayMs);
      }
    }
  }

  throw new Error(`reason step failed after ${maxAttempts - 1} retries: ${lastErr.message}`);
}

/**
 * Model-parameterised variant of callModelStructure. Used by ensemble mode so each
 * reason model's output is structured by the same model (gpt-oss structures via its
 * own free-form fallback path — that fallback is intact via callModelStructureWith).
 */
async function callModelStructureWith(modelName, structureSystem, notesPrompt, shardId) {
  const jsonBody = {
    model: modelName,
    system: structureSystem,
    prompt: notesPrompt,
    stream: false,
    format: 'json',
    options: {
      temperature: 0.1,
      num_ctx: 32768,
      num_predict: STRUCTURE_NUM_PREDICT,
      repeat_penalty: 1.15,
      repeat_last_n: 256,
    },
  };

  async function attempt(useJson) {
    const body = useJson
      ? jsonBody
      : {
          ...jsonBody,
          format: undefined,
          system: `${structureSystem}\n\nRespond with ONLY the JSON object, no prose, no markdown fences.`,
        };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const outer = await res.json();
      const raw = typeof outer.response === 'string' ? outer.response : '';
      const think = typeof outer.thinking === 'string' ? outer.thinking : '';
      if (useJson) {
        if (raw.length === 0) throw new SyntaxError('empty response under format:json');
        return JSON.parse(raw);
      }
      const parsed = lenientExtractObject(raw, 'findings') ?? lenientExtractObject(think, 'findings');
      if (!parsed) throw new SyntaxError('no {…"findings"…} block found in free-form output');
      return parsed;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  try {
    return await attempt(true);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    console.error(`[WARN] shard ${shardId}: structure JSON parse failed (${err.message}), retrying once…`);
    try {
      return await attempt(true);
    } catch (err2) {
      if (!(err2 instanceof SyntaxError)) throw err2;
      console.error(`[WARN] shard ${shardId}: format:json still failing (${err2.message}); falling back to free-form structure…`);
      try {
        return await attempt(false);
      } catch (err3) {
        throw new Error(`Structure model call failed after free-form fallback: ${err3.message}`);
      }
    }
  }
}

/**
 * Step 2 STRUCTURE: call STRUCTURE_MODEL with format:json to convert Step 1 prose
 * to the findings schema. Returns the parsed JSON object.
 * Retries once on SyntaxError (JSON parse failure). Applies MODEL_TIMEOUT_MS timeout.
 *
 * gpt-oss / reasoning-model fallback: some harmony models return EMPTY output under
 * Ollama `format:json` (both .response and .thinking length 0). When the format:json
 * path yields empty/unparseable output after its retry, fall back to ONE free-form call
 * (no format:json) and lenient-extract the first {…"findings"…} block from .response or
 * .thinking. The 6 models that already work under format:json never reach the fallback.
 */
async function callModelStructure(structureSystem, notesPrompt, shardId) {
  const jsonBody = {
    model: STRUCTURE_MODEL,
    system: structureSystem,
    prompt: notesPrompt,
    stream: false,
    format: 'json',
    options: {
      temperature: 0.1,
      num_ctx: 32768,
      num_predict: STRUCTURE_NUM_PREDICT,
      repeat_penalty: 1.15,
      repeat_last_n: 256,
    },
  };

  // One request/parse attempt. `useJson` toggles format:json; when false we read from
  // .response OR .thinking and lenient-extract instead of a strict JSON.parse.
  async function attempt(useJson) {
    const body = useJson
      ? jsonBody
      : {
          ...jsonBody,
          format: undefined,
          system: `${structureSystem}\n\nRespond with ONLY the JSON object, no prose, no markdown fences.`,
        };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const outer = await res.json();
      const raw = typeof outer.response === 'string' ? outer.response : '';
      const think = typeof outer.thinking === 'string' ? outer.thinking : '';
      if (useJson) {
        if (raw.length === 0) {
          // Empty output under format:json (the gpt-oss symptom) — signal the fallback.
          throw new SyntaxError('empty response under format:json');
        }
        return JSON.parse(raw);
      }
      // Free-form fallback: try .response then .thinking as the JSON source.
      const parsed = lenientExtractObject(raw, 'findings') ?? lenientExtractObject(think, 'findings');
      if (!parsed) {
        throw new SyntaxError('no {…"findings"…} block found in free-form output');
      }
      return parsed;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  try {
    return await attempt(true);
  } catch (err) {
    // Retry / fall back ONLY on JSON parse (or empty-output) failure.
    if (!(err instanceof SyntaxError)) throw err;
    console.error(`[WARN] shard ${shardId}: structure JSON parse failed (${err.message}), retrying once…`);
    try {
      return await attempt(true);
    } catch (err2) {
      if (!(err2 instanceof SyntaxError)) throw err2;
      console.error(`[WARN] shard ${shardId}: format:json still failing (${err2.message}); falling back to free-form structure…`);
      try {
        return await attempt(false);
      } catch (err3) {
        throw new Error(`Structure model call failed after free-form fallback: ${err3.message}`);
      }
    }
  }
}

/**
 * callModel — used for Phase 4 reconciliation (single structured call; stays on STRUCTURE_MODEL).
 * Returns the parsed JSON from .response, or throws on hard failure.
 * Retries once on JSON parse failure. Applies MODEL_TIMEOUT_MS timeout.
 */
async function callModel(system, prompt, shardId) {
  const body = {
    model: STRUCTURE_MODEL,
    system,
    prompt,
    stream: false,
    format: 'json',
    options: {
      temperature: 0.1,
      num_ctx: 32768,
      num_predict: STRUCTURE_NUM_PREDICT,
      repeat_penalty: 1.15,
      repeat_last_n: 256,
    },
  };

  async function attempt() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const outer = await res.json();
      const raw = outer.response;
      if (typeof raw !== 'string') {
        throw new Error(`Unexpected response shape: .response is ${typeof raw}`);
      }
      return JSON.parse(raw);
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  try {
    return await attempt();
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    console.error(`[WARN] shard ${shardId}: JSON parse failed (${err.message}), retrying once…`);
    try {
      return await attempt();
    } catch (err2) {
      throw new Error(`Model call failed after retry: ${err2.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Multi-lens orchestrator — replaces the single two-step call
// ---------------------------------------------------------------------------

// Step 2 structure system prompt (injected inline, not from prompt-templates.md, because
// it describes the mechanical schema transform rather than the review rubric).
// SCORING FIELDS (A2 extension):
//   confidence  : 0..1 — model's estimate that the finding is REAL and behavior-preserving.
//   impact      : "trivial"|"minor"|"moderate"|"significant" — value of applying the change.
//   modelDanger : "low"|"med"|"high" — model's assessment of behavior-change risk.
// The deterministic heuristic then sets the final `danger` field (max of modelDanger and
// heuristicDanger). modelDanger is preserved so the override is auditable.
const STRUCTURE_SYSTEM = `Convert the following code-review notes into JSON.
Emit exactly {"findings":[{"id":"<shard>-<seq>","type":"reuse|quality|efficiency|crosslink","file":"<path>","lines":"<start>-<end>","severity":"safe-auto|needs-human","summary":"<one line>","suggestion":"<concrete change>","reuse_target":"<path:symbol or null>","confidence":<0..1>,"impact":"trivial|minor|moderate|significant","modelDanger":"low|med|high"}]}.
Do NOT add or invent findings; only structure what is present in the notes.
Severity rule: safe-auto = mechanical, behavior-preserving, single-file, touches no exported symbol, not on the REFUSE list; else needs-human.
Scoring rules:
  confidence: 0.9 = clearly real, mechanical. 0.7 = likely real. 0.5 = plausible but uncertain. 0.3 = possible false positive. 0.1 = very uncertain.
  impact: trivial = cosmetic/micro-opt with no measurable effect; minor = small clarity gain; moderate = meaningful cleanup; significant = removes substantial duplication or cost.
  modelDanger: low = purely structural/cosmetic, touches no observable behavior; med = touches logic or a non-exported but wide-reach symbol; high = touches exported API, signature, exception, or async boundary.
If there are no findings, emit {"findings":[]}.`;

/**
 * Parse a finding's `lines` string into a list of numeric ranges.
 * Handles all the shapes models actually emit:
 *   "88-134"              → [{88,134}]
 *   "312"                 → [{312,312}]
 *   "727, 796, 820"       → [{727,727},{796,796},{820,820}]
 *   "284-292 and 394-406" → [{284,292},{394,406}]
 *   "~L312" / "L88"       → [{312,312}] / [{88,88}]   (prefix noise ignored)
 * Returns [] when no line numbers are present. Backwards range endpoints are normalised.
 */
function parseLineRanges(linesStr) {
  const s = String(linesStr ?? '');
  const ranges = [];
  const re = /(\d+)\s*-\s*(\d+)|(\d+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1] !== undefined) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      ranges.push({ start: a, end: b });
    } else {
      const n = parseInt(m[3], 10);
      ranges.push({ start: n, end: n });
    }
  }
  return ranges;
}

/**
 * Parse a lines string into a single { start, end } envelope (min start, max end
 * across all ranges present). Used by the convergence/sample/model overlap checks,
 * which only need a spanning interval. Returns { start: 0, end: 0 } if unparseable.
 * (Previously a single-range regex — multi-location refs like "727, 796, 820" fell
 * through to {0,0} and could never converge; they now envelope correctly.)
 */
function parseLineRange(linesStr) {
  const ranges = parseLineRanges(linesStr);
  if (ranges.length === 0) return { start: 0, end: 0 };
  let start = ranges[0].start;
  let end = ranges[0].end;
  for (const r of ranges) {
    if (r.start < start) start = r.start;
    if (r.end > end) end = r.end;
  }
  return { start, end };
}

/**
 * Returns true if two findings' line ranges overlap or are within CONVERGENCE_LINE_GAP lines.
 */
function rangesConverge(linesA, linesB) {
  const a = parseLineRange(linesA);
  const b = parseLineRange(linesB);
  if (a.start === 0 || b.start === 0) return false;
  // Overlap or within gap
  return a.start <= b.end + CONVERGENCE_LINE_GAP && b.start <= a.end + CONVERGENCE_LINE_GAP;
}

/**
 * Merge all per-lens findings for a shard into a deduplicated list.
 * Two findings converge if they share the same file AND their line ranges
 * overlap or are within CONVERGENCE_LINE_GAP lines.
 *
 * Merged finding carries:
 *   lens       : name of the lens that produced it (for solo findings)
 *   lenses     : Set (converted to Array) of all distinct lenses that flagged the location
 *   convergence: count of distinct lenses (1..3)
 *   confidence_pre_boost  : original confidence (from best single finding)
 *   confidence : boosted confidence (pre + 0.15 * (convergence - 1), capped at 1.0)
 *
 * For merged groups the best summary/suggestion is the one with the highest confidence.
 *
 * @param {Array<{lens: string, findings: object[]}>} lensResults
 * @returns {object[]} merged findings array
 */
function mergeByConvergence(lensResults) {
  // Flatten all findings, tagging each with its lens name.
  const tagged = [];
  for (const { lens, findings } of lensResults) {
    for (const f of findings) {
      tagged.push({ ...f, lens });
    }
  }

  if (tagged.length === 0) return [];

  // Union-Find for grouping convergent findings.
  const parent = tagged.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(x, y) {
    const px = find(x), py = find(y);
    if (px !== py) parent[px] = py;
  }

  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      if (tagged[i].file === tagged[j].file && rangesConverge(tagged[i].lines, tagged[j].lines)) {
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

  const merged = [];
  for (const group of groups.values()) {
    // Collect distinct lenses
    const lensSet = new Set(group.map((f) => f.lens));
    const convergence = lensSet.size;

    // Pick the representative finding: highest confidence
    const best = group.reduce((a, b) => {
      const ca = typeof a.confidence === 'number' ? a.confidence : 0.5;
      const cb = typeof b.confidence === 'number' ? b.confidence : 0.5;
      return cb > ca ? b : a;
    });

    // If multiple members have different summaries, append a brief note
    const altSummaries = group
      .filter((f) => f !== best && f.summary && f.summary !== best.summary)
      .map((f) => f.summary);
    const mergedSummary =
      altSummaries.length > 0 ? `${best.summary ?? ''}; also: ${altSummaries.join('; ')}` : (best.summary ?? '');

    const preBoost = typeof best.confidence === 'number' ? best.confidence : 0.5;
    const boosted = Math.min(1.0, preBoost + CONVERGENCE_BOOST_PER_LENS * (convergence - 1));

    merged.push({
      ...best,
      summary: mergedSummary,
      lens: best.lens,
      lenses: [...lensSet].sort(),
      convergence,
      confidence_pre_boost: parseFloat(preBoost.toFixed(3)),
      confidence: parseFloat(boosted.toFixed(3)),
    });
  }

  return merged;
}

/**
 * Union N samples' structured findings into a deduplicated list.
 *
 * @param {Array<{sample: number, findings: object[]}>} sampleResults
 * @returns {object[]} merged findings with samples_hit and confidence boost
 *
 * Each merged finding gains:
 *   samples_hit          : count of samples that produced this finding
 *   confidence_pre_sample_boost : confidence BEFORE the sample boost is applied
 *   confidence           : boosted (both lens-convergence boost already present + sample boost
 *                          applied on top, capped at 1.0 — does not double-count lens boost)
 *
 * Dedup rule: two findings converge if same file AND line ranges overlap or are within
 * SAMPLE_LINE_GAP (5) lines. Reuses the same union-find as mergeByConvergence.
 */
function mergeByConvergenceMultiSample(sampleResults) {
  if (sampleResults.length === 0) return [];

  // If only one sample, stamp samples_hit=1 and return as-is (no union needed).
  if (sampleResults.length === 1) {
    const { findings } = sampleResults[0];
    return findings.map((f) => {
      const preBoost = typeof f.confidence === 'number' ? f.confidence : 0.5;
      return {
        ...f,
        samples_hit: 1,
        confidence_pre_sample_boost: parseFloat(preBoost.toFixed(3)),
        // boost = 0 (samples_hit - 1 = 0) → confidence unchanged
      };
    });
  }

  // Flatten all findings, tagging each with its sample index.
  const tagged = [];
  for (const { sample, findings } of sampleResults) {
    for (const f of findings) {
      tagged.push({ ...f, _sample: sample });
    }
  }

  if (tagged.length === 0) return [];

  // Union-Find grouping: converge by file + overlapping/adjacent line range.
  const parent = tagged.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
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
      if (a.start <= b.end + SAMPLE_LINE_GAP && b.start <= a.end + SAMPLE_LINE_GAP) {
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

  const merged = [];
  for (const group of groups.values()) {
    // Distinct samples that produced this finding.
    const sampleSet = new Set(group.map((f) => f._sample));
    const samplesHit = sampleSet.size;

    // Pick the representative: highest confidence.
    const best = group.reduce((a, b) => {
      const ca = typeof a.confidence === 'number' ? a.confidence : 0.5;
      const cb = typeof b.confidence === 'number' ? b.confidence : 0.5;
      return cb > ca ? b : a;
    });

    // Merge summaries from other samples if different.
    const altSummaries = group
      .filter((f) => f !== best && f.summary && f.summary !== best.summary)
      .map((f) => f.summary);
    const mergedSummary =
      altSummaries.length > 0 ? `${best.summary ?? ''}; also: ${altSummaries.join('; ')}` : (best.summary ?? '');

    // Apply sample-agreement confidence boost on top of whatever confidence the finding
    // already has (which may already include a lens-convergence boost).
    // boost = SAMPLE_BOOST_PER_HIT * (samplesHit - 1), capped at 1.0.
    const preBoost = typeof best.confidence === 'number' ? best.confidence : 0.5;
    const boosted = Math.min(1.0, preBoost + SAMPLE_BOOST_PER_HIT * (samplesHit - 1));

    // Remove internal _sample tag from emitted finding
    const { _sample: _ignored, ...rest } = best;
    merged.push({
      ...rest,
      summary: mergedSummary,
      samples_hit: samplesHit,
      confidence_pre_sample_boost: parseFloat(preBoost.toFixed(3)),
      confidence: parseFloat(boosted.toFixed(3)),
    });
  }

  return merged;
}

/**
 * Run one lens (reason + structure) for a sub-batch.
 * Returns an array of finding objects tagged with `lens` name (may be empty).
 *
 * @param {string} lensName        - lens name for tagging
 * @param {string} lensSystem      - lens-specific Step 1 system prompt
 * @param {string} batchPrompt     - assembled shard content prompt (REPO MAP + SHARD FILES)
 * @param {string} shardLabel      - e.g. "S10[lens=reuse]" (for log messages)
 * @param {Set<string>} fileSet    - files in this sub-batch (used to drop out-of-shard findings)
 * @param {string} [extraContext]  - optional text to prepend to the batchPrompt (hook A/B injections)
 * @returns {object[]}
 */
async function callOneLens(lensName, lensSystem, batchPrompt, shardLabel, fileSet, extraContext = '') {
  // Inject hook context (ADJACENT EXPORTS for reuse, CONFIRMED-UNUSED for simplification)
  // before the REPO MAP block in the prompt.
  const fullPrompt = extraContext ? `${extraContext}${batchPrompt}` : batchPrompt;

  // Step 1: REASON — free-form prose
  let notes;
  try {
    notes = await callModelReason(lensSystem, fullPrompt);
  } catch (err) {
    throw new Error(`Step 1 (reason/${lensName}) failed: ${err.message}`);
  }

  const trimmedNotes = notes.trim();
  if (!trimmedNotes || trimmedNotes.length < 20) {
    console.log(`    ${shardLabel}[${lensName}]: Step 1 returned no content — skipping Step 2`);
    return [];
  }

  console.log(`    ${shardLabel}[${lensName}]: Step 1 done (${trimmedNotes.length} chars) — Step 2…`);

  // Step 2: STRUCTURE — convert prose to schema
  const structurePrompt = `REVIEW NOTES:\n${trimmedNotes}`;
  let parsed;
  try {
    parsed = await callModelStructure(STRUCTURE_SYSTEM, structurePrompt, `${shardLabel}[${lensName}]`);
  } catch (err) {
    throw new Error(`Step 2 (structure/${lensName}) failed: ${err.message}`);
  }

  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

  // Drop findings whose file is outside the sub-batch file set
  const valid = findings.filter((f) => f.file && fileSet.has(f.file));
  const dropped = findings.length - valid.length;
  if (dropped > 0) {
    console.log(`    ${shardLabel}[${lensName}]: dropped ${dropped} finding(s) outside sub-batch`);
  }

  // Tag with lens; default missing reuse_target; apply danger override
  for (const f of valid) {
    f.lens = lensName;
    if (!('reuse_target' in f)) f.reuse_target = null;
    applyDangerOverride(f);
  }

  return valid;
}

/**
 * Run one monolithic reason→structure pass using a specific model name.
 * Used by ensemble mode so each reason model runs independently.
 * Returns an array of finding objects tagged with `lens='monolithic'` (may be empty).
 */
async function callOneLensWithModel(modelName, lensSystem, batchPrompt, shardLabel, fileSet, extraContext = '') {
  const fullPrompt = extraContext ? `${extraContext}${batchPrompt}` : batchPrompt;

  let notes;
  try {
    notes = await callModelReasonWith(modelName, lensSystem, fullPrompt);
  } catch (err) {
    throw new Error(`Step 1 (reason/${modelName}) failed: ${err.message}`);
  }

  const trimmedNotes = notes.trim();
  if (!trimmedNotes || trimmedNotes.length < 20) {
    console.log(`    ${shardLabel}[${modelName}]: Step 1 returned no content — skipping Step 2`);
    return [];
  }

  console.log(`    ${shardLabel}[${modelName}]: Step 1 done (${trimmedNotes.length} chars) — Step 2…`);

  const structurePrompt = `REVIEW NOTES:\n${trimmedNotes}`;
  let parsed;
  try {
    // Each model structures its own output (gpt-oss gets the free-form fallback intact).
    parsed = await callModelStructureWith(modelName, STRUCTURE_SYSTEM, structurePrompt, `${shardLabel}[${modelName}]`);
  } catch (err) {
    throw new Error(`Step 2 (structure/${modelName}) failed: ${err.message}`);
  }

  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const valid = findings.filter((f) => f.file && fileSet.has(f.file));
  const dropped = findings.length - valid.length;
  if (dropped > 0) {
    console.log(`    ${shardLabel}[${modelName}]: dropped ${dropped} finding(s) outside sub-batch`);
  }

  for (const f of valid) {
    f.lens = 'monolithic';
    f._reasonModel = modelName; // internal tag for cross-model union
    if (!('reuse_target' in f)) f.reuse_target = null;
    applyDangerOverride(f);
  }

  return valid;
}

/**
 * Cross-model union: merge per-model finding sets into a deduplicated list.
 *
 * Two findings converge if same file AND line ranges overlap or are within
 * MODEL_LINE_GAP (5) lines — the same union-find as samples/lenses.
 *
 * Each merged finding gains:
 *   models_hit               : number of distinct reason models that produced it
 *   models_hit_names         : sorted array of those model names
 *   confidence_pre_model_boost: confidence BEFORE the model-agreement boost
 *   confidence               : min(1.0, base + MODEL_BOOST_PER_EXTRA * (models_hit - 1))
 *
 * REPRESENTATIVE selection: when multiple models agree on a location, pick the finding
 * with the LONGEST suggestion text as the representative (more actionable description).
 * Tie-break: highest confidence. This empirically favors gpt-oss's detailed descriptions
 * without hardcoding a model name.
 *
 * @param {Array<{model: string, findings: object[]}>} modelResults
 * @returns {object[]} merged findings array
 */
function mergeByConvergenceMultiModel(modelResults) {
  if (modelResults.length === 0) return [];

  // Flatten all findings, tagging each with its source model.
  const tagged = [];
  for (const { model, findings } of modelResults) {
    for (const f of findings) {
      tagged.push({ ...f, _reasonModel: model });
    }
  }

  if (tagged.length === 0) return [];

  // Union-Find grouping: converge by file + overlapping/adjacent line range.
  const parent = tagged.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
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
      if (a.start <= b.end + MODEL_LINE_GAP && b.start <= a.end + MODEL_LINE_GAP) {
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

  const merged = [];
  for (const group of groups.values()) {
    const modelSet = new Set(group.map((f) => f._reasonModel));
    const modelsHit = modelSet.size;

    // Pick the representative: LONGEST suggestion text (prefer more actionable description).
    // Empirically favors gpt-oss's detailed fixes (with drop-in snippets) over terse pointer descriptions.
    // Tie-break: highest confidence.
    const best = group.reduce((a, b) => {
      const lenA = (a.suggestion ?? '').length;
      const lenB = (b.suggestion ?? '').length;
      if (lenB !== lenA) return lenB > lenA ? b : a;
      const ca = typeof a.confidence === 'number' ? a.confidence : 0.5;
      const cb = typeof b.confidence === 'number' ? b.confidence : 0.5;
      return cb > ca ? b : a;
    });

    const preBoost = typeof best.confidence === 'number' ? best.confidence : 0.5;
    const boosted = Math.min(1.0, preBoost + MODEL_BOOST_PER_EXTRA * (modelsHit - 1));

    // Remove internal _reasonModel tag from emitted finding (replace with public field)
    const { _reasonModel: _ignored, ...rest } = best;
    merged.push({
      ...rest,
      models_hit: modelsHit,
      models_hit_names: [...modelSet].sort(),
      confidence_pre_model_boost: parseFloat(preBoost.toFixed(3)),
      confidence: parseFloat(boosted.toFixed(3)),
    });
  }

  return merged;
}

/**
 * ENSEMBLE orchestrator: run the monolithic reason→structure stage once per model in
 * ENSEMBLE_MODELS, union the per-model finding sets with mergeByConvergenceMultiModel,
 * then apply hook B post-filter. Hook A and B are injected (same as monolithic path).
 *
 * This is the production entry point for the locked devstral∪gpt-oss baseline.
 *
 * @param {string} batchPrompt   - assembled shard content prompt (REPO MAP + SHARD FILES)
 * @param {string} shardLabel    - e.g. "S10" or "S10[1/2]" (for log messages)
 * @param {Set<string>} fileSet  - files in this sub-batch
 * @param {object|null} mapData  - parsed repo-map JSON for hook A (adjacent exports)
 */
async function callModelEnsemble(batchPrompt, shardLabel, fileSet, mapData = null) {
  const batchFiles = [...fileSet];

  // Hook A: adjacent exports (same as monolithic path)
  const adjacentExportsBlock = buildAdjacentExportsBlock(batchFiles, mapData);
  if (adjacentExportsBlock) {
    console.log(`    ${shardLabel}[hook-A]: adjacent-exports block: ${adjacentExportsBlock.split('\n').length - 1} entries`);
  }

  // Hook B pre-pass: caller-grep (same as monolithic path)
  const { confirmedUnused, checkedCount, unusedCount, skipped: grepSkipped, skipReason } = computeConfirmedUnused(batchFiles);
  if (grepSkipped) {
    console.log(`    ${shardLabel}[hook-B]: caller-grep skipped (${skipReason ?? 'unknown reason'}) — dead-code post-filter will drop all unverified claims`);
  } else {
    console.log(`    ${shardLabel}[hook-B]: caller-grep checked ${checkedCount} symbols, confirmed unused: ${unusedCount}`);
  }
  const confirmedUnusedBlock = buildConfirmedUnusedBlock(confirmedUnused);

  const extraContext = [adjacentExportsBlock, confirmedUnusedBlock].filter(Boolean).join('');

  // Run each ensemble model independently.
  const modelResults = [];
  for (const modelName of ENSEMBLE_MODELS) {
    // --samples applies per-model: each model runs SAMPLES times, findings unioned within that model.
    const sampleResults = [];
    for (let sIdx = 1; sIdx <= SAMPLES; sIdx++) {
      const sampleLabel = SAMPLES > 1 ? `${shardLabel}[${modelName}][s${sIdx}/${SAMPLES}]` : `${shardLabel}[${modelName}]`;
      try {
        const sFindings = await callOneLensWithModel(modelName, MONOLITHIC_REASON_SYSTEM, batchPrompt, sampleLabel, fileSet, extraContext);
        sampleResults.push({ sample: sIdx, findings: sFindings });
      } catch (err) {
        console.error(`[WARN] ${shardLabel} ensemble model ${modelName} sample ${sIdx}/${SAMPLES} failed: ${err.message} — skipping sample`);
        sampleResults.push({ sample: sIdx, findings: [] });
      }
    }

    // Union across samples within this model (same as monolithic path).
    const unionedForModel = mergeByConvergenceMultiSample(sampleResults);
    if (SAMPLES > 1) {
      const dist = {};
      for (const f of unionedForModel) {
        const k = `${f.samples_hit}x`;
        dist[k] = (dist[k] ?? 0) + 1;
      }
      const distStr = Object.entries(dist).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`[samples] ${shardLabel}[${modelName}]: ${SAMPLES} runs -> ${unionedForModel.length} merged (samples_hit dist: ${distStr || 'none'})`);
    }

    // Stamp convergence=1 and lenses=['monolithic'] (single monolithic pass per model)
    for (const f of unionedForModel) {
      f.convergence = 1;
      f.lenses = ['monolithic'];
      f.confidence_pre_boost = f.confidence_pre_sample_boost ?? (typeof f.confidence === 'number' ? parseFloat(f.confidence.toFixed(3)) : 0.5);
    }

    console.log(`    ${shardLabel}[${modelName}]: ${unionedForModel.length} finding(s) after sample union`);
    modelResults.push({ model: modelName, findings: unionedForModel });
  }

  // Cross-model union: merge finding sets from all models.
  const crossModelUnioned = mergeByConvergenceMultiModel(modelResults);

  // Log models_hit distribution
  const mDist = {};
  for (const f of crossModelUnioned) {
    const k = `${f.models_hit}x`;
    mDist[k] = (mDist[k] ?? 0) + 1;
  }
  const mDistStr = Object.entries(mDist).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`    ${shardLabel}[ensemble]: cross-model union -> ${crossModelUnioned.length} finding(s) (models_hit dist: ${mDistStr || 'none'})`);

  // Hook B post-filter: drop unverified dead-code claims.
  const beforePostFilter = crossModelUnioned.length;
  const postFiltered = postFilterDeadCodeClaims(crossModelUnioned, confirmedUnused);
  const droppedByPostFilter = beforePostFilter - postFiltered.length;
  if (droppedByPostFilter > 0) {
    console.log(`    ${shardLabel}[hook-B]: post-filter dropped ${droppedByPostFilter} unverified dead-code claim(s)`);
  }

  console.log(`    ${shardLabel}: ensemble findings after post-filter: ${postFiltered.length}`);
  return postFiltered;
}

/**
 * Run all three lenses for one sub-batch, then merge by convergence.
 * Injects hook A (adjacent exports) for the reuse lens and hook B (confirmed-unused
 * pre-pass + post-filter) for the simplification lens.
 *
 * Returns a merged array of findings (with convergence/lenses/confidence boost).
 *
 * @param {string} batchPrompt   - assembled shard content prompt (REPO MAP + SHARD FILES)
 * @param {string} shardLabel    - e.g. "S10" or "S10[1/2]" (for log messages)
 * @param {Set<string>} fileSet  - files in this sub-batch
 * @param {object|null} mapData  - parsed repo-map JSON for hook A (adjacent exports)
 */
async function callModelMultiLens(batchPrompt, shardLabel, fileSet, mapData = null) {
  const batchFiles = [...fileSet];

  // --- Hook A: adjacent exports block for the REUSE lens ---
  const adjacentExportsBlock = buildAdjacentExportsBlock(batchFiles, mapData);
  if (adjacentExportsBlock) {
    console.log(`    ${shardLabel}[hook-A]: adjacent-exports block: ${adjacentExportsBlock.split('\n').length - 1} entries`);
  }

  // --- Hook B pre-pass: caller-grep to build CONFIRMED-UNUSED set ---
  const { confirmedUnused, checkedCount, unusedCount, skipped: grepSkipped, skipReason } = computeConfirmedUnused(batchFiles);
  if (grepSkipped) {
    console.log(`    ${shardLabel}[hook-B]: caller-grep skipped (${skipReason ?? 'unknown reason'}) — dead-code post-filter will drop all unverified claims`);
  } else {
    console.log(`    ${shardLabel}[hook-B]: caller-grep checked ${checkedCount} symbols, confirmed unused: ${unusedCount}`);
  }
  const confirmedUnusedBlock = buildConfirmedUnusedBlock(confirmedUnused);

  const lensResults = [];
  let totalRaw = 0;

  for (const { name, system } of LENSES) {
    // Select the hook injection for this lens
    let extraContext = '';
    if (name === 'reuse') extraContext = adjacentExportsBlock;
    if (name === 'simplification') extraContext = confirmedUnusedBlock;

    // Run SAMPLES times; prompt+repo-map assembled once above (batchPrompt); only model repeats.
    const sampleResults = [];
    for (let sIdx = 1; sIdx <= SAMPLES; sIdx++) {
      const sampleLabel = SAMPLES > 1 ? `${shardLabel}[${name}][s${sIdx}/${SAMPLES}]` : `${shardLabel}`;
      try {
        const findings = await callOneLens(name, system, batchPrompt, sampleLabel, fileSet, extraContext);
        sampleResults.push({ sample: sIdx, findings });
      } catch (err) {
        console.error(`[WARN] ${shardLabel} lens ${name} sample ${sIdx}/${SAMPLES} failed: ${err.message} — skipping sample`);
        sampleResults.push({ sample: sIdx, findings: [] });
      }
    }

    // Union across samples for this lens; records samples_hit + confidence boost.
    const unionedFindings = mergeByConvergenceMultiSample(sampleResults);
    if (SAMPLES > 1) {
      // Build samples_hit distribution for log.
      const dist = {};
      for (const f of unionedFindings) {
        const k = `${f.samples_hit}x`;
        dist[k] = (dist[k] ?? 0) + 1;
      }
      const distStr = Object.entries(dist).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`[samples] ${shardLabel}[${name}]: ${SAMPLES} runs -> ${unionedFindings.length} merged (samples_hit dist: ${distStr || 'none'})`);
    }

    lensResults.push({ lens: name, findings: unionedFindings });
    totalRaw += unionedFindings.length;
  }

  const perLensCounts = lensResults.map(({ lens, findings }) => `${lens}:${findings.length}`).join(' ');
  console.log(`    ${shardLabel}: per-lens raw counts — ${perLensCounts} (total raw: ${totalRaw})`);

  const merged = mergeByConvergence(lensResults);

  // --- Hook B post-filter: drop unverified dead-code claims from simplification lens ---
  const beforePostFilter = merged.length;
  const postFiltered = postFilterDeadCodeClaims(merged, confirmedUnused);
  const droppedByPostFilter = beforePostFilter - postFiltered.length;
  if (droppedByPostFilter > 0) {
    console.log(`    ${shardLabel}[hook-B]: post-filter dropped ${droppedByPostFilter} unverified dead-code claim(s)`);
  }

  // Convergence distribution for log
  const convDist = [1, 2, 3].map((k) => {
    const n = postFiltered.filter((f) => f.convergence === k).length;
    return n > 0 ? `${k}-lens:${n}` : null;
  }).filter(Boolean).join(' ');
  console.log(`    ${shardLabel}: merged findings: ${postFiltered.length} (convergence distribution — ${convDist || 'none'})`);

  return postFiltered;
}

// ---------------------------------------------------------------------------
// Monolithic orchestrator — single-pass variant of callModelMultiLens
// ---------------------------------------------------------------------------

/**
 * Run ONE monolithic reason pass (MONOLITHIC_REASON_SYSTEM) + the same structure step,
 * then apply hook B post-filter. Hook A (adjacent exports) and hook B (confirmed-unused)
 * are both injected, identical to the lenses path.
 *
 * Convergence is trivially 1 for every finding (single pass — no merging needed).
 * Each finding gets: convergence=1, lenses=['monolithic'], no confidence boost.
 *
 * Everything downstream (danger override, judge, bucketing, escalation) is IDENTICAL to
 * the lenses path — the ONLY difference is this function produces findings instead of
 * callModelMultiLens.
 *
 * @param {string} batchPrompt   - assembled shard content prompt (REPO MAP + SHARD FILES)
 * @param {string} shardLabel    - e.g. "S10" or "S10[1/2]" (for log messages)
 * @param {Set<string>} fileSet  - files in this sub-batch
 * @param {object|null} mapData  - parsed repo-map JSON for hook A (adjacent exports)
 */
async function callModelMonolithic(batchPrompt, shardLabel, fileSet, mapData = null) {
  const batchFiles = [...fileSet];

  // Hook A: adjacent exports (same as lenses path — monolithic gets it too)
  const adjacentExportsBlock = buildAdjacentExportsBlock(batchFiles, mapData);
  if (adjacentExportsBlock) {
    console.log(`    ${shardLabel}[hook-A]: adjacent-exports block: ${adjacentExportsBlock.split('\n').length - 1} entries`);
  }

  // Hook B pre-pass: caller-grep (same as lenses path)
  const { confirmedUnused, checkedCount, unusedCount, skipped: grepSkipped, skipReason } = computeConfirmedUnused(batchFiles);
  if (grepSkipped) {
    console.log(`    ${shardLabel}[hook-B]: caller-grep skipped (${skipReason ?? 'unknown reason'}) — dead-code post-filter will drop all unverified claims`);
  } else {
    console.log(`    ${shardLabel}[hook-B]: caller-grep checked ${checkedCount} symbols, confirmed unused: ${unusedCount}`);
  }
  const confirmedUnusedBlock = buildConfirmedUnusedBlock(confirmedUnused);

  // Inject both hook blocks (adjacent exports + confirmed-unused) into the monolithic prompt
  const extraContext = [adjacentExportsBlock, confirmedUnusedBlock].filter(Boolean).join('');

  // Run SAMPLES times; prompt+repo-map assembled once (batchPrompt reused); only model repeats.
  const sampleResults = [];
  for (let sIdx = 1; sIdx <= SAMPLES; sIdx++) {
    const sampleLabel = SAMPLES > 1 ? `${shardLabel}[mono][s${sIdx}/${SAMPLES}]` : shardLabel;
    try {
      const sFindings = await callOneLens('monolithic', MONOLITHIC_REASON_SYSTEM, batchPrompt, sampleLabel, fileSet, extraContext);
      sampleResults.push({ sample: sIdx, findings: sFindings });
    } catch (err) {
      console.error(`[WARN] ${shardLabel} monolithic sample ${sIdx}/${SAMPLES} failed: ${err.message} — skipping sample`);
      sampleResults.push({ sample: sIdx, findings: [] });
    }
  }

  // Union across samples; records samples_hit + confidence boost.
  const findings = mergeByConvergenceMultiSample(sampleResults);

  if (SAMPLES > 1) {
    const dist = {};
    for (const f of findings) {
      const k = `${f.samples_hit}x`;
      dist[k] = (dist[k] ?? 0) + 1;
    }
    const distStr = Object.entries(dist).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[samples] ${shardLabel}[monolithic]: ${SAMPLES} runs -> ${findings.length} merged (samples_hit dist: ${distStr || 'none'})`);
  }

  console.log(`    ${shardLabel}: monolithic raw count — ${findings.length}`);

  // Stamp convergence=1 and lenses=['monolithic'] on every finding (single pass — no merge).
  for (const f of findings) {
    f.convergence = 1;
    f.lenses = ['monolithic'];
    // confidence_pre_boost from lens-convergence perspective (convergence=1 → no lens boost).
    // confidence_pre_sample_boost is already set by mergeByConvergenceMultiSample.
    f.confidence_pre_boost = f.confidence_pre_sample_boost ?? (typeof f.confidence === 'number' ? parseFloat(f.confidence.toFixed(3)) : 0.5);
  }

  // Hook B post-filter: same dead-code claim filter as lenses path
  const beforePostFilter = findings.length;
  const postFiltered = postFilterDeadCodeClaims(findings, confirmedUnused);
  const droppedByPostFilter = beforePostFilter - postFiltered.length;
  if (droppedByPostFilter > 0) {
    console.log(`    ${shardLabel}[hook-B]: post-filter dropped ${droppedByPostFilter} unverified dead-code claim(s)`);
  }

  console.log(`    ${shardLabel}: monolithic findings after post-filter: ${postFiltered.length}`);
  return postFiltered;
}

// ---------------------------------------------------------------------------
// Deterministic danger heuristic
// ---------------------------------------------------------------------------

/**
 * Compute a heuristic danger level for a finding based on its text fields.
 * Returns "low" | "med" | "high".
 *
 * Rules (in priority order):
 *   HIGH if suggestion or summary matches DANGER_HIGH_RE, OR type is cross-file
 *        (reuse/crosslink/altitude), OR file is a barrel (index.ts/index.tsx).
 *   LOW  if suggestion or summary matches DANGER_LOW_RE AND type is quality|efficiency
 *        AND file is NOT a barrel.
 *   else MED.
 */
function heuristicDanger(finding) {
  const text = `${finding.summary ?? ''} ${finding.suggestion ?? ''}`;
  const isBarrel = BARREL_RE.test(finding.file ?? '');
  const isCrossFile = CROSS_FILE_TYPES.has(finding.type);

  if (DANGER_HIGH_RE.test(text) || isCrossFile || isBarrel) return 'high';

  const isLowType = finding.type === 'quality' || finding.type === 'efficiency';
  if (DANGER_LOW_RE.test(text) && isLowType && !isBarrel) return 'low';

  return 'med';
}

/**
 * Danger level as a comparable integer (for max() operation).
 */
const DANGER_ORD = { low: 0, med: 1, high: 2 };

/**
 * Apply the deterministic danger override to a finding (mutates in place).
 * Sets finding.danger = max(modelDanger, heuristicDanger).
 * Records finding.heuristicDanger for auditability.
 * Normalises missing/invalid modelDanger to "med".
 */
function applyDangerOverride(finding) {
  const mRaw = finding.modelDanger;
  const modelD = (mRaw === 'low' || mRaw === 'med' || mRaw === 'high') ? mRaw : 'med';
  const heurD = heuristicDanger(finding);
  const finalD =
    (DANGER_ORD[modelD] ?? 1) >= (DANGER_ORD[heurD] ?? 1) ? modelD : heurD;
  finding.modelDanger = modelD;
  finding.heuristicDanger = heurD;
  finding.danger = finalD;
}

// ---------------------------------------------------------------------------
// Judge pass — per-finding verdict (--judge mode)
// ---------------------------------------------------------------------------

/**
 * Merge line ranges into non-overlapping windows, each padded by `ctx` lines on both
 * sides and clamped to [1, total]. Adjacent/overlapping windows are coalesced so the
 * result is a minimal ordered list of { start, end }.
 */
function buildContextWindows(ranges, total, ctx) {
  const padded = ranges
    .map((r) => ({ start: Math.max(1, r.start - ctx), end: Math.min(total, r.end + ctx) }))
    .filter((w) => w.start <= w.end)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const w of padded) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end + 1) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  return merged;
}

/**
 * Render numbered source lines for a set of windows, separating non-contiguous
 * windows with an elision marker so the judge sees each referenced location.
 */
function renderWindows(srcLines, windows) {
  const parts = [];
  windows.forEach((w, i) => {
    if (i > 0) parts.push('        …');
    for (let ln = w.start; ln <= w.end; ln++) {
      parts.push(`${String(ln).padStart(4, ' ')}: ${srcLines[ln - 1] ?? ''}`);
    }
  });
  return parts.join('\n');
}

/**
 * Read a code snippet from the current working-tree file for a finding's line ref.
 * Handles multi-location refs ("727, 796, 820", "284-292 and 394-406") by emitting
 * one padded window per location. Returns '' if the file cannot be read; falls back
 * to the file head when the line ref carries no parseable line numbers.
 */
function readFindingSnippet(finding) {
  const filePath = join(ROOT, finding.file ?? '');
  let src;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
  const srcLines = src.split('\n');
  const total = srcLines.length;

  const ranges = parseLineRanges(finding.lines).filter((r) => r.start >= 1 && r.start <= total);
  if (ranges.length === 0) {
    // Unparseable / out-of-range ref — show the file head as a best-effort snippet.
    return renderWindows(srcLines, [{ start: 1, end: Math.min(total, 2 * JUDGE_CONTEXT_LINES) }]);
  }
  return renderWindows(srcLines, buildContextWindows(ranges, total, JUDGE_CONTEXT_LINES));
}

const JUDGE_SYSTEM = `You are a strict code-review judge.
You will receive a single simplification finding (type/summary/suggestion/file/lines) plus the relevant code snippet.
Return ONLY valid JSON: {"verdict":"real"|"not-real"|"uncertain","judge_confidence":0..1,"judge_danger":"low"|"med"|"high","note":"<one line>"}
- verdict "real": the finding is genuinely actionable and behavior-preserving.
- verdict "not-real": the finding is a false positive, the change would alter behavior, or there is nothing to do.
- verdict "uncertain": you cannot tell without more context.
- judge_confidence: 0.9 = very sure; 0.5 = uncertain.
- judge_danger: low = purely cosmetic; med = logic touches; high = exported/API/async.
- note: one sentence explaining the verdict.`;

/**
 * Run the judge call for a single finding.
 * Returns { verdict, judge_confidence, judge_danger, judge_note } or null on failure.
 */
async function callModelJudge(finding, snippet, findingLabel) {
  const findingDesc = JSON.stringify({
    type: finding.type,
    summary: finding.summary,
    suggestion: finding.suggestion,
    file: finding.file,
    lines: finding.lines,
  });
  const prompt = `FINDING:\n${findingDesc}\n\nCODE SNIPPET (file: ${finding.file ?? '?'}, lines shown):\n\`\`\`\n${snippet}\n\`\`\``;

  const jsonBody = {
    model: JUDGE_MODEL,
    system: JUDGE_SYSTEM,
    prompt,
    stream: false,
    format: 'json',
    options: {
      temperature: JUDGE_TEMP, // default 0.2 — greedy-ish, stable; judge is deterministic in practice
      num_ctx: 32768,
      num_predict: JUDGE_NUM_PREDICT,
      repeat_penalty: 1.15,
      repeat_last_n: 256,
    },
  };

  // useJson=false is the gpt-oss / reasoning-model fallback: some harmony models return
  // EMPTY output under Ollama format:json, so we retry free-form and lenient-extract the
  // {…"verdict"…} block from .response or .thinking. Models that work under format:json
  // never reach the fallback.
  async function attempt(useJson) {
    const body = useJson
      ? jsonBody
      : {
          ...jsonBody,
          format: undefined,
          system: `${JUDGE_SYSTEM}\n\nRespond with ONLY the JSON object, no prose, no markdown fences.`,
        };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const outer = await res.json();
      const raw = typeof outer.response === 'string' ? outer.response : '';
      const think = typeof outer.thinking === 'string' ? outer.thinking : '';
      if (useJson) {
        if (raw.length === 0) throw new SyntaxError('empty response under format:json');
        return JSON.parse(raw);
      }
      const parsed = lenientExtractObject(raw, 'verdict') ?? lenientExtractObject(think, 'verdict');
      if (!parsed) throw new SyntaxError('no {…"verdict"…} block found in free-form output');
      return parsed;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  const shape = (parsed) => ({
    judge_verdict: parsed.verdict ?? 'uncertain',
    judge_confidence: typeof parsed.judge_confidence === 'number' ? parsed.judge_confidence : 0.5,
    judge_danger: parsed.judge_danger ?? 'med',
    judge_note: parsed.note ?? '',
  });

  try {
    return shape(await attempt(true));
  } catch (err) {
    // Retry once on JSON parse / empty-output failure, then fall back to free-form.
    if (err instanceof SyntaxError) {
      console.error(`[WARN] judge ${findingLabel}: JSON parse failed, retrying once…`);
      try {
        return shape(await attempt(true));
      } catch (err2) {
        if (err2 instanceof SyntaxError) {
          console.error(`[WARN] judge ${findingLabel}: format:json still failing; falling back to free-form…`);
          try {
            return shape(await attempt(false));
          } catch {
            // fall through
          }
        }
      }
    }
    console.error(`[WARN] judge ${findingLabel}: call failed (${err.message}); skipping`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Three-lens system prompts (REASON step — precision-guarded, not silencing)
// ---------------------------------------------------------------------------
//
// DESIGN: Claude's official /simplify reviewer prompts, adapted for WHOLE-FILE
// review. Three focused lenses — REUSE, SIMPLIFICATION, EFFICIENCY — each hunt
// exactly their category. Diverse specialised passes improve recall; agreement
// ACROSS lenses is a genuine confidence signal (unlike repeating the same prompt,
// which is trivially deterministic). Local compute is the cheap resource, so
// spending ~3 passes per shard is the intended trade-off.
//
// Each lens shares:
//   - the precision guardrail: "behavior-preserving only"
//   - the REFUSE list
//   - the severity rules
//   - the file/finding format
//
// Lens names correspond to the `lens` field tagged on each finding after STRUCTURE.
//
// Harness verification hooks injected at call time (see callModelMultiLens):
//   Hook A (REUSE only): ADJACENT EXPORTS block — exported symbols from modules
//     adjacent to the shard's files (same package/dir), from exportInventory.
//   Hook B (SIMPLIFICATION only): CONFIRMED-UNUSED list — symbols with no external
//     callers (pre-pass grep); dead-code post-filter drops unverified claims.

const PRECISION_GUARDRAIL = `PRECISION GUARD — report ONLY behavior-preserving simplifications:
If a change would alter output, timing, error type, RETURN TYPE, or any public/exported shape, do NOT list it.

REFUSE LIST — never propose a change to these; if you notice something, note it as needs-human only:
- packages/contracts/src/pattern.ts, strategy.ts, validator.ts, lintEngine.ts
- the 300ms debounce (decision D3)
- the WASM-oracle bridge (kmcmplib)
- the VirtualFS (spec §11)
- §7 wiring
- NEVER rename a public API, change a signature / return shape / exception type, or relocate a module.

SEVERITY:
- safe-auto  : mechanical, behavior-preserving, single-file, touches NO exported symbol, not on REFUSE list
- needs-human: anything cross-file, anything touching exported/public symbols, anything on the REFUSE list

FILES: each file is presented with a // ==== <path> ==== header and line numbers. Cite the exact file path and line number(s) for every finding.

For each finding, write:
- File: <path>
- Lines: <start>-<end>
- Type: reuse | quality | efficiency | crosslink
- Severity: safe-auto | needs-human
- Summary: <one line — what and why>
- Suggestion: <the concrete change>
- Reuse target: <path:symbol or null>

REPO MAP (for detecting reuse targets and checking dependency edges — do NOT report findings against files not in the shard):`;

// LENS_REUSE: official /simplify REUSE reviewer, whole-file framed.
// types: reuse, crosslink
// Hook A injection: the harness prepends an ADJACENT EXPORTS block before REPO MAP.
const LENS_REUSE = `You are the REUSE reviewer in a /simplify pass. Do NOT hunt for correctness bugs — only reuse/duplication.

In the file(s) below, flag code that re-implements something the codebase already has. Use the ADJACENT EXPORTS list and the repo-map export inventory to identify the existing helper; name the existing symbol to call instead.

Watch for: repeated extraction/parsing patterns, comparison helpers, conversion helpers, recursive walks, safe-access/optional patterns, and label/fallback formatting that may already exist.

Behavior-preserving only.

${PRECISION_GUARDRAIL}`;

// LENS_SIMPLIFICATION: official /simplify SIMPLIFICATION reviewer, whole-file framed.
// types: quality, altitude
// Hook B injection: the harness appends a CONFIRMED-UNUSED list before REPO MAP.
// Only claim something is dead if it appears in the CONFIRMED-UNUSED list provided
// (the harness verified callers); do not guess dead code otherwise.
const LENS_SIMPLIFICATION = `You are the SIMPLIFICATION reviewer in a /simplify pass. Do NOT hunt for correctness bugs — only unnecessary complexity.

Flag: redundant or derivable state, copy-paste with slight variation, deep nesting, overly defensive branches, legacy-format tolerance no longer needed, and DEAD code (functions/vars retained but unused).

Only claim something is dead if it appears in the CONFIRMED-UNUSED list provided (the harness verified callers); do not guess dead code otherwise. Name the simpler form.

Behavior-preserving only.

${PRECISION_GUARDRAIL}`;

// LENS_EFFICIENCY: official /simplify EFFICIENCY reviewer, whole-file framed.
// type: efficiency
const LENS_EFFICIENCY = `You are the EFFICIENCY reviewer in a /simplify pass. Do NOT hunt for correctness bugs — only wasted work.

Flag: redundant computation or repeated I/O, work recomputed inside loops that could be hoisted, per-call allocations (a RegExp/Set/array rebuilt on every call), repeated enumerations/scans, string re-parsing, and long-lived closures that capture large scopes.

Name the cheaper alternative. Behavior-preserving only.

${PRECISION_GUARDRAIL}`;

// All three lenses in order — used by the multi-lens orchestrator.
const LENSES = [
  { name: 'reuse',          system: LENS_REUSE },
  { name: 'simplification', system: LENS_SIMPLIFICATION },
  { name: 'efficiency',     system: LENS_EFFICIENCY },
];

// ---------------------------------------------------------------------------
// Monolithic reason mode — single free-form pass covering all simplification kinds
// ---------------------------------------------------------------------------
//
// Used when --reason-mode monolithic is passed. One prompt replaces the 3 lens passes;
// everything downstream (structure, danger override, judge, bucketing, escalation) is
// IDENTICAL. Convergence is trivially 1 for every finding (single pass).
// Hook A (adjacent exports) and hook B (confirmed-unused) are both injected, same as lenses mode.
const MONOLITHIC_REASON_SYSTEM = `You are a code-simplification reviewer doing a SINGLE comprehensive pass. Find EVERY kind of simplification opportunity: reuse (re-implemented helpers the codebase already has), dead/redundant code (unused symbols or no-longer-needed branches), per-call allocations (RegExp/Set/array rebuilt on every invocation), duplicated blocks (copy-paste with slight variation), over-nesting (deep conditionals that can be flattened), and cheaper equivalents (linear scan where a Set/Map lookup would do). Name the existing symbol for reuse findings. For dead code: only claim something is unused if it appears in the CONFIRMED-UNUSED list provided (the harness verified callers). Behavior-preserving only.

${PRECISION_GUARDRAIL}`;

// ---------------------------------------------------------------------------
// Harness verification hook A — ADJACENT EXPORTS for the REUSE lens
// ---------------------------------------------------------------------------
//
// Compute the exported symbols of modules ADJACENT to the shard's files (same
// package/dir) from the repo-map exportInventory, and return a formatted block
// to inject into the REUSE lens prompt. Capped to ADJACENT_EXPORTS_MAX entries
// (symbol names + module path only — no signatures) to stay within token budget.

const ADJACENT_EXPORTS_MAX = 120; // symbol-name entries; each is ~30 chars

/**
 * Compute adjacent-module exports for the REUSE lens.
 * "Adjacent" = modules in the same package (all exportInventory entries) that are
 * NOT themselves in the shard's file set. This gives the model a concrete list of
 * existing helpers to reference rather than having to hallucinate them.
 *
 * @param {string[]} shardFiles   repo-relative paths of files in this shard/sub-batch
 * @param {object|null} mapData   parsed repo-map JSON (may be null)
 * @returns {string} formatted block ready to prepend to the reuse-lens prompt
 */
function buildAdjacentExportsBlock(shardFiles, mapData) {
  if (!mapData || !Array.isArray(mapData.exportInventory) || mapData.exportInventory.length === 0) {
    return ''; // no data — inject nothing
  }

  const shardFileSet = new Set(shardFiles);
  const entries = [];

  for (const entry of mapData.exportInventory) {
    // Skip files that are IN the shard (we want adjacent, not the same file)
    if (shardFileSet.has(entry.file)) continue;
    if (!Array.isArray(entry.exports) || entry.exports.length === 0) continue;
    for (const sym of entry.exports) {
      entries.push(`  ${sym}  (${entry.file})`);
      if (entries.length >= ADJACENT_EXPORTS_MAX) break;
    }
    if (entries.length >= ADJACENT_EXPORTS_MAX) break;
  }

  if (entries.length === 0) return '';

  const truncNote = entries.length >= ADJACENT_EXPORTS_MAX ? `\n  ... (capped at ${ADJACENT_EXPORTS_MAX} entries)` : '';
  return `ADJACENT EXPORTS (existing helpers you may reference — do NOT flag these as missing if present here):
${entries.join('\n')}${truncNote}

`;
}

// ---------------------------------------------------------------------------
// Harness verification hook B — caller-grep for dead-code false-positive killing
// ---------------------------------------------------------------------------
//
// Pre-pass: for each top-level/exported symbol defined in the shard's files, grep
// the whole repo (packages/, utilities/) for OTHER references (exclude the definition
// site + test files). Build a CONFIRMED-UNUSED set = symbols with no references outside
// their own file/definition.
//
// Post-filter: after structuring, drop any finding whose text claims dead/unused/no-
// longer-called AND names a symbol that is NOT in the confirmed-unused set.
//
// Uses ripgrep (rg) if available, else falls back to grep -r. Skips gracefully if
// neither is available (logs [WARN], does not crash).

const DEAD_CODE_CLAIM_RE = /\b(dead|unused|no.longer.called|retained\s+but\s+unused|never\s+called|not\s+used|can\s+be\s+removed|unreferenced)\b/i;
// Scope dirs for caller grep (repo-relative, from ROOT)
const GREP_SCOPE_DIRS = ['packages', 'utilities', 'api'];

/**
 * Detect which grep tool is available: 'rg', 'grep', or null.
 * Cached after first call.
 */
let _grepTool = undefined;
function detectGrepTool() {
  if (_grepTool !== undefined) return _grepTool;
  try {
    execSync('rg --version', { stdio: 'ignore', windowsHide: true });
    _grepTool = 'rg';
    return _grepTool;
  } catch { /* not available */ }
  try {
    execSync('grep --version', { stdio: 'ignore', windowsHide: true });
    _grepTool = 'grep';
    return _grepTool;
  } catch { /* not available */ }
  _grepTool = null;
  return null;
}

/**
 * Extract top-level exported + non-exported named symbols from a TS file's source text.
 * Captures: exported functions/classes/const/let/var declarations, and top-level
 * function declarations (non-exported). Returns an array of symbol name strings.
 * This is a heuristic regex scan — intentionally conservative (may miss some symbols;
 * never incorrectly includes non-symbols).
 */
function extractTopLevelSymbols(src) {
  const symbols = new Set();
  // export function/class/const/let/var/type/interface/enum Foo
  const exportRe = /^export\s+(?:async\s+)?(?:function\s+|class\s+|const\s+|let\s+|var\s+|type\s+|interface\s+|enum\s+)(\w+)/gm;
  // top-level non-exported function/class declarations
  const topLevelRe = /^(?:async\s+)?(?:function\s+|class\s+)(\w+)/gm;
  // top-level const/let/var (non-exported)
  const varRe = /^(?:const|let|var)\s+(\w+)\s*=/gm;
  for (const re of [exportRe, topLevelRe, varRe]) {
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[1] && m[1].length > 1) symbols.add(m[1]);
    }
  }
  return [...symbols];
}

/**
 * Grep the repo for references to `symbol` outside of `definitionFile`.
 * Returns true if at least one external reference was found, false if none.
 * Returns null if the grep tool is unavailable (skip verification).
 *
 * Excludes: the definition file itself, test files (*.test.ts, *.spec.ts,
 * __tests__/, __fixtures__/, generated/).
 */
function hasExternalCallers(symbol, definitionFile, grepTool) {
  if (!grepTool) return null; // can't verify

  const scopeDirs = GREP_SCOPE_DIRS.map((d) => join(ROOT, d)).filter(existsSync);
  if (scopeDirs.length === 0) return null;

  // Build the grep command
  // We search for the word boundary match of the symbol name.
  // Use -l (files-with-matches) for speed — we only need to know if ANY match exists.
  let cmd;
  if (grepTool === 'rg') {
    // rg: --word-regexp, exclude the definition file and test patterns
    const excludeGlobs = [
      `--glob=!${relative(ROOT, join(ROOT, definitionFile)).split(sep).join('/')}`,
      '--glob=!*.test.ts',
      '--glob=!*.test.tsx',
      '--glob=!*.spec.ts',
      '--glob=!*.spec.tsx',
      '--glob=!**/__tests__/**',
      '--glob=!**/__fixtures__/**',
      '--glob=!**/generated/**',
    ];
    cmd = `rg --word-regexp --files-with-matches ${excludeGlobs.join(' ')} -- ${JSON.stringify(symbol)} ${scopeDirs.map((d) => JSON.stringify(d)).join(' ')}`;
  } else {
    // grep -r: word-regexp, only list files
    const defAbs = join(ROOT, definitionFile);
    cmd = `grep -rl --word-regexp -- ${JSON.stringify(symbol)} ${scopeDirs.map((d) => JSON.stringify(d)).join(' ')}`;
    // We'll filter out the definition file from results below
  }

  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 10_000, // 10 s cap per symbol grep
    }).trim();

    if (!out) return false; // no matches

    if (grepTool === 'grep') {
      // Filter out the definition file and test files manually
      const defAbs = join(ROOT, definitionFile);
      const matchingFiles = out.split('\n').map((l) => l.trim()).filter(Boolean);
      const externalFiles = matchingFiles.filter((f) => {
        if (f === defAbs) return false;
        if (/\.test\.[tj]sx?$|\.spec\.[tj]sx?$|[/\\]__tests__[/\\]|[/\\]__fixtures__[/\\]|[/\\]generated[/\\]/.test(f)) return false;
        return true;
      });
      return externalFiles.length > 0;
    }

    return true; // rg already excluded the definition file
  } catch (err) {
    // grep/rg returns exit code 1 when no matches found — that is NOT an error
    if (err.status === 1) return false;
    // Other errors (timeout, etc.) — treat as unknown
    return null;
  }
}

/**
 * Pre-pass: compute CONFIRMED-UNUSED set for all top-level symbols in the shard files.
 * Returns { confirmedUnused: Set<string>, checkedCount: number, unusedCount: number,
 *           skipped: boolean, skipReason: string|null }
 *
 * "confirmed unused" = symbol appears to have no external callers (grep found nothing
 * outside its own file and test files). This is conservative: a false negative
 * (calling it "used" when it isn't) means we miss a dead-code finding. That is safe.
 * A false positive (calling it "unused" when it is used) would give a wrong claim.
 * We avoid false positives by checking ALL grep scope dirs.
 */
function computeConfirmedUnused(shardFiles) {
  const grepTool = detectGrepTool();
  if (!grepTool) {
    return { confirmedUnused: new Set(), checkedCount: 0, unusedCount: 0, skipped: true, skipReason: 'grep tool unavailable' };
  }

  const confirmedUnused = new Set();
  let checkedCount = 0;

  for (const relFile of shardFiles) {
    const fullPath = join(ROOT, relFile);
    let src;
    try {
      src = readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    const symbols = extractTopLevelSymbols(src);
    for (const sym of symbols) {
      checkedCount++;
      const result = hasExternalCallers(sym, relFile, grepTool);
      if (result === false) {
        // Definitively no external callers found
        confirmedUnused.add(sym);
      }
      // result === true → has callers → NOT in confirmed-unused set
      // result === null → tool error → conservatively omit (don't mark as unused)
    }
  }

  return { confirmedUnused, checkedCount, unusedCount: confirmedUnused.size, skipped: false, skipReason: null };
}

/**
 * Build the CONFIRMED-UNUSED block to inject into the SIMPLIFICATION lens prompt.
 * Returns an empty string if the set is empty.
 */
function buildConfirmedUnusedBlock(confirmedUnused) {
  if (confirmedUnused.size === 0) return '';
  const list = [...confirmedUnused].sort().join(', ');
  return `CONFIRMED-UNUSED (symbols the harness verified have no external callers — safe to flag as dead):
${list}

`;
}

// Common short English words to skip when scanning for symbol names
const COMMON_WORDS = new Set([
  'the', 'and', 'or', 'not', 'but', 'if', 'is', 'it', 'be', 'to', 'of', 'in', 'on', 'at',
  'by', 'an', 'as', 'so', 'do', 'no', 'up', 'can', 'has', 'had', 'was', 'are', 'for',
  'from', 'with', 'this', 'that', 'have', 'will', 'been', 'its', 'new', 'may', 'also',
  'code', 'file', 'line', 'type', 'that', 'then', 'when', 'used', 'use', 'via', 'more',
  'remove', 'delete', 'dead', 'unused', 'since', 'still', 'once', 'each', 'now',
]);

/**
 * Extract the most likely symbol name from a dead-code finding's text.
 * Priority order:
 *   1. Backtick-quoted identifier(s): `symbolName` — highest precision
 *   2. camelCase/PascalCase/snake_case identifiers with length >= 4 that are not common English words
 *   3. Fallback: null (cannot identify)
 */
function extractClaimedSymbol(text) {
  // 1. Backtick-quoted
  const btMatch = text.match(/`([A-Za-z_$][\w$]{1,})`/);
  if (btMatch) return btMatch[1];

  // 2. camelCase / PascalCase / snake_case with length >= 4 (excludes common words)
  // Scan all word tokens, pick the first that looks like a symbol
  const words = text.match(/\b[A-Za-z_$][\w$]{3,}\b/g) ?? [];
  for (const w of words) {
    if (COMMON_WORDS.has(w.toLowerCase())) continue;
    // Prefer words with underscore or mixed case (strong code indicator)
    if (/_/.test(w) || /[A-Z]/.test(w)) return w;
  }
  // Second pass: any word >= 4 chars not in common words
  for (const w of words) {
    if (!COMMON_WORDS.has(w.toLowerCase())) return w;
  }
  return null;
}

/**
 * Post-filter: drop dead-code findings that claim a symbol is unused but the symbol
 * is NOT in the confirmedUnused set. Logs a [verify] line for each dropped finding.
 * Returns the filtered array.
 */
function postFilterDeadCodeClaims(findings, confirmedUnused) {
  if (confirmedUnused.size === 0) {
    // No confirmed-unused data → drop ALL unverified dead-code claims conservatively.
    // (This handles the case where grep was skipped entirely.)
    return findings.filter((f) => {
      const text = `${f.summary ?? ''} ${f.suggestion ?? ''}`;
      if (DEAD_CODE_CLAIM_RE.test(text)) {
        const sym = extractClaimedSymbol(text);
        const label = sym ?? '(unidentified symbol)';
        console.log(`[verify] dropped unverified dead-code claim: ${label} (grep unavailable — cannot confirm unused)`);
        return false;
      }
      return true;
    });
  }

  return findings.filter((f) => {
    const text = `${f.summary ?? ''} ${f.suggestion ?? ''}`;
    if (!DEAD_CODE_CLAIM_RE.test(text)) return true; // not a dead-code claim — keep

    // Extract the symbol being claimed dead/unused
    const sym = extractClaimedSymbol(text);

    if (!sym) return true; // can't identify the symbol — keep (don't over-filter)

    if (confirmedUnused.has(sym)) {
      return true; // verified unused — keep the finding
    }

    // Symbol not in confirmed-unused set → unverified claim → drop
    console.log(`[verify] dropped unverified dead-code claim: ${sym} (still has callers)`);
    return false;
  });
}

// ---------------------------------------------------------------------------
// Cross-lens convergence constants
// ---------------------------------------------------------------------------

// Two findings converge if they are in the same file AND their line ranges
// overlap or are within CONVERGENCE_LINE_GAP lines of each other.
const CONVERGENCE_LINE_GAP = 3;

// Confidence boost per additional lens that flags the same location.
// e.g. flagged by 2 lenses → +0.15; by 3 lenses → +0.30 (max with 3-lens set).
// Capped at 1.0 (cap applied after boost).
const CONVERGENCE_BOOST_PER_LENS = 0.15;

// ---------------------------------------------------------------------------
// Multi-sample self-consistency constants
// ---------------------------------------------------------------------------

// Line-range tolerance for deduplicating findings across N samples.
// Two findings from different samples converge if same file AND line ranges
// overlap or are within SAMPLE_LINE_GAP lines — same union-find as lenses.
const SAMPLE_LINE_GAP = 5;

// Confidence boost per additional sample hit beyond the first.
// e.g. samples_hit=3 of 5 → base + 0.1*(3-1) = base + 0.2.
// Capped at 1.0 after applying both sample and lens boosts.
const SAMPLE_BOOST_PER_HIT = 0.1;

// ---------------------------------------------------------------------------
// Per-shard runner
// ---------------------------------------------------------------------------

async function runShard(shard) {
  const startTime = new Date().toISOString();
  const result = {
    shardId: shard.id,
    package: shard.package,
    reasonModel: IS_ENSEMBLE ? ENSEMBLE_MODELS.join(',') : REASON_MODEL,
    structureModel: STRUCTURE_MODEL,
    ensembleMode: IS_ENSEMBLE,
    files: [],
    tokenEstimate: 0,
    droppedCount: 0,
    timestamp: startTime,
    findings: [],
    errors: [],
    warnings: [],
    retriable: [],
  };

  // 1. Resolve files
  const { files, resolveWarnings } = resolveShardFiles(shard);
  result.files = files;
  result.warnings.push(...resolveWarnings);

  if (files.length === 0) {
    result.errors.push(`Shard ${shard.id}: resolved to 0 files — check covers cell: "${shard.covers}"`);
    console.error(`[ERROR] ${shard.id}: resolved to 0 files`);
    return result;
  }

  // 2. LOC cross-check (skip for ad-hoc scoping-mode shards where manifest LOC is 0)
  const actualLOC = sumLOC(files);
  const manifestLOC = shard.loc;
  if (manifestLOC === 0) {
    // Scoping-mode shard: no manifest LOC to check against — just report actual
    const locMsg = `LOC: actual=${actualLOC} (ad-hoc shard — no manifest target)`;
    result.warnings.push(`[OK] ${shard.id}: ${locMsg}`);
    console.log(`[OK]   ${shard.id}: ${locMsg}`);
  } else {
    const locRatio = Math.abs(actualLOC - manifestLOC) / Math.max(manifestLOC, 1);
    const locMsg = `LOC check: manifest=${manifestLOC}, actual=${actualLOC}, delta=${Math.round(locRatio * 100)}%`;
    if (locRatio > LOC_TOLERANCE) {
      result.warnings.push(`[WARN] ${shard.id}: ${locMsg} (exceeds ${Math.round(LOC_TOLERANCE * 100)}% tolerance)`);
      console.warn(`[WARN] ${shard.id}: ${locMsg}`);
    } else {
      result.warnings.push(`[OK] ${shard.id}: ${locMsg}`);
      console.log(`[OK]   ${shard.id}: ${locMsg}`);
    }
  }

  // 3. Repo-map slice
  const mapData = getRepoMapSlice(shard.package);
  const { minified: repoMapStr, wasTrimmed, warning: trimWarn } = serializeRepoMapSlice(mapData, files);
  if (trimWarn) {
    result.warnings.push(trimWarn);
    console.warn(trimWarn);
  }

  // 4. Assemble shard content
  const { assembled: shardContent, charCount: shardChars } = assembleShardContent(files);

  // 5. Build Step 1 prompt: repo map + shard files
  //    REASON_SYSTEM already contains the rubric; the prompt carries the data.
  const userPrompt = `REPO MAP:\n${repoMapStr}\n\nSHARD FILES:\n${shardContent}`;

  // 6. Token estimate (input only — per-lens Step 1 reserves ~14k for reasoning output each).
  //    lenses mode: use average lens system prompt length as system overhead per pass.
  //    monolithic mode: use the monolithic system prompt length (single pass).
  const systemOverheadChars = REASON_MODE === 'monolithic'
    ? MONOLITHIC_REASON_SYSTEM.length
    : Math.round(LENSES.reduce((s, l) => s + l.system.length, 0) / LENSES.length);
  const totalChars = systemOverheadChars + userPrompt.length;
  const tokenEstimate = Math.round(totalChars / 4);
  result.tokenEstimate = tokenEstimate;

  const budgetMsg = `  ${shard.id}: files=${files.length}, LOC=${actualLOC}, chars=${totalChars}, ~${tokenEstimate} tokens (input cap ${TOKEN_BUDGET})`;
  console.log(budgetMsg);

  if (DRY_RUN) {
    if (tokenEstimate > TOKEN_BUDGET) {
      result.warnings.push(`[WARN] Token estimate ${tokenEstimate} exceeds input cap ${TOKEN_BUDGET} — would sub-batch in live run`);
    }

    // Dry-run proofs: show prompts assemble, hook A adjacent-exports block,
    // and hook B confirmed-unused pre-pass (grep runs — it is deterministic, no model needed).
    // Also prove that repo-map/prompt assembly happens ONCE regardless of --samples N.
    if (IS_ENSEMBLE) {
      const totalModelCalls = ENSEMBLE_MODELS.length * SAMPLES;
      console.log(`  ${shard.id} [dry-run]: mode: ensemble (${ENSEMBLE_MODELS.length} reason models, reason→structure stage runs ${totalModelCalls}x total, then cross-model union, then judge)`);
      console.log(`    ensemble models: ${ENSEMBLE_MODELS.join(', ')}`);
      console.log(`    judge model: ${JUDGE_MODEL}`);
      console.log(`    samples per model: ${SAMPLES} (prompt assembled ONCE per model; model called ${SAMPLES}x per model)`);
      for (const modelName of ENSEMBLE_MODELS) {
        console.log(`    model=${modelName}: reason→structure ${SAMPLES} sample(s) (${SAMPLES} model calls)`);
      }
    } else if (REASON_MODE === 'monolithic') {
      const totalModelCalls = SAMPLES;
      console.log(`  ${shard.id} [dry-run]: assembling 1 monolithic reasoning prompt (prompt assembled ONCE; model will be called ${totalModelCalls}x for --samples ${SAMPLES})…`);
      console.log(`    reason-mode=monolithic: system prompt ${MONOLITHIC_REASON_SYSTEM.length} chars`);
    } else {
      const totalModelCalls = LENSES.length * SAMPLES;
      console.log(`  ${shard.id} [dry-run]: assembling ${LENSES.length} lens prompt(s) (prompt assembled ONCE per lens; each lens model called ${SAMPLES}x → ${totalModelCalls} model calls total for --samples ${SAMPLES})…`);
      for (const { name, system } of LENSES) {
        console.log(`    lens=${name}: system prompt ${system.length} chars, ${SAMPLES} sample(s)`);
      }
    }

    // Hook A: adjacent exports (uses mapData already loaded above)
    const adjBlock = buildAdjacentExportsBlock(files, mapData);
    if (adjBlock) {
      const adjLines = adjBlock.split('\n').filter((l) => l.startsWith('  ')).length;
      console.log(`  ${shard.id} [hook-A dry-run]: adjacent-exports block: ${adjLines} entries (injected into reuse lens)`);
    } else {
      console.log(`  ${shard.id} [hook-A dry-run]: adjacent-exports block: 0 entries (no mapData or empty inventory)`);
    }

    // Hook B: caller-grep pre-pass (deterministic — runs grep now, no model)
    const { confirmedUnused: dryUnused, checkedCount: dryChecked, unusedCount: dryUnusedCount, skipped: drySkipped, skipReason: drySkipReason } = computeConfirmedUnused(files);
    if (drySkipped) {
      console.log(`  ${shard.id} [hook-B dry-run]: caller-grep skipped (${drySkipReason ?? 'unknown'}) — would drop all unverified dead-code claims`);
    } else {
      console.log(`  ${shard.id} [hook-B dry-run]: caller-grep checked ${dryChecked} symbols, confirmed unused: ${dryUnusedCount}`);
      if (dryUnusedCount > 0) {
        const sample = [...dryUnused].slice(0, 5).join(', ');
        console.log(`  ${shard.id} [hook-B dry-run]: sample confirmed-unused: ${sample}${dryUnusedCount > 5 ? ` (+${dryUnusedCount - 5} more)` : ''}`);
      }
    }

    return result;
  }

  // 7. Sub-batch if over input cap, then run three-lens pass per batch
  let allFindings = [];
  if (totalChars > CHARS_BUDGET) {
    result.warnings.push(`[WARN] ${shard.id}: prompt ${tokenEstimate} tokens > input cap ${TOKEN_BUDGET} — splitting into sub-batches`);
    console.warn(`[WARN] ${shard.id}: splitting into sub-batches`);

    // Split files into chunks that fit within the input cap
    const batches = [];
    let batch = [];
    let batchChars = repoMapStr.length + 100; // header overhead (no single-lens system now)
    for (const f of files) {
      const { assembled: fc } = assembleShardContent([f]);
      if (batchChars + fc.length > CHARS_BUDGET && batch.length > 0) {
        batches.push([...batch]);
        batch = [f];
        batchChars = repoMapStr.length + fc.length + 100;
      } else {
        batch.push(f);
        batchChars += fc.length;
      }
    }
    if (batch.length > 0) batches.push(batch);

    for (let bi = 0; bi < batches.length; bi++) {
      const batchFiles = batches[bi];
      const batchFileSet = new Set(batchFiles);
      const { assembled: batchContent } = assembleShardContent(batchFiles);
      const batchPrompt = `REPO MAP:\n${repoMapStr}\n\nSHARD FILES:\n${batchContent}`;
      const batchLabel = `${shard.id}[${bi + 1}/${batches.length}]`;
      try {
        const bFindings = IS_ENSEMBLE
          ? await callModelEnsemble(batchPrompt, batchLabel, batchFileSet, mapData)
          : REASON_MODE === 'monolithic'
            ? await callModelMonolithic(batchPrompt, batchLabel, batchFileSet, mapData)
            : await callModelMultiLens(batchPrompt, batchLabel, batchFileSet, mapData);
        allFindings.push(...bFindings);
      } catch (err) {
        result.errors.push(`Sub-batch ${bi + 1} failed: ${err.message}`);
        result.retriable.push({ files: batchFiles, reason: err.message });
        console.error(`[ERROR] ${shard.id} sub-batch ${bi + 1}: ${err.message} — flagged for retry`);
      }
    }
  } else {
    // Single reasoning pass (ensemble, lenses, or monolithic)
    const fileSet = new Set(files);
    try {
      allFindings = IS_ENSEMBLE
        ? await callModelEnsemble(userPrompt, shard.id, fileSet, mapData)
        : REASON_MODE === 'monolithic'
          ? await callModelMonolithic(userPrompt, shard.id, fileSet, mapData)
          : await callModelMultiLens(userPrompt, shard.id, fileSet, mapData);
    } catch (err) {
      result.errors.push(`Model call failed: ${err.message}`);
      result.retriable.push({ files, reason: err.message });
      console.error(`[ERROR] ${shard.id}: ${err.message}`);
      return result;
    }
  }

  // 8. Final filter: drop findings whose file is not in the full shard file set
  //    (callModelTwoStep already filters per sub-batch; this catches any stragglers)
  const shardFileSet = new Set(files);
  const beforeCount = allFindings.length;
  const validFindings = allFindings.filter((f) => f.file && shardFileSet.has(f.file));
  result.droppedCount = beforeCount - validFindings.length;
  if (result.droppedCount > 0) {
    result.warnings.push(`[WARN] Dropped ${result.droppedCount} findings whose file was outside shard set`);
  }

  // 9. Default missing reuse_target to null; apply danger override (belt-and-suspenders —
  //    callModelTwoStep already does this, but for any findings that bypassed that path).
  for (const f of validFindings) {
    if (!('reuse_target' in f)) f.reuse_target = null;
    if (!('danger' in f)) applyDangerOverride(f);
  }

  // 10. Judge pass (default-ON, single pass per finding; skip with --no-judge):
  //     one model call per finding at temperature 0.2 for an independent verdict.
  if (USE_JUDGE && validFindings.length > 0) {
    console.log(`    ${shard.id}: running judge pass (K=1) on ${validFindings.length} finding(s)…`);
    for (let k = 0; k < validFindings.length; k++) {
      const f = validFindings[k];
      console.log(`    [judge] finding ${k + 1}/${validFindings.length} (${f.id ?? '?'})`);
      const snippet = readFindingSnippet(f);
      const judgeResult = await callModelJudge(f, snippet, `${f.id ?? String(k)}`);
      if (judgeResult) {
        f.judge_verdict = judgeResult.judge_verdict;
        f.judge_confidence = judgeResult.judge_confidence;
        f.judge_danger = judgeResult.judge_danger;
        f.judge_note = judgeResult.judge_note;
      }
    }
    console.log(`    ${shard.id}: judge pass complete`);
  }

  result.findings = validFindings;
  return result;
}

// ---------------------------------------------------------------------------
// Phase 4: Reconciliation
// ---------------------------------------------------------------------------

async function runReconciliation(allShardResults, fullMapData) {
  const reuseCrosslinkFindings = allShardResults
    .flatMap((r) => r.findings)
    .filter((f) => f.type === 'reuse' || f.type === 'crosslink');

  if (reuseCrosslinkFindings.length === 0) {
    console.log('[OK] No reuse/crosslink findings to reconcile.');
    return { clusters: [] };
  }

  const systemB = extractSystemPromptB();
  const boundaryRules = JSON.stringify(fullMapData?.boundaryRules ?? []);
  const system = systemB.replace('{{BOUNDARY_RULES}}', boundaryRules);
  const prompt = `INPUT FINDINGS:\n${JSON.stringify(reuseCrosslinkFindings, null, 2)}`;

  const totalChars = system.length + prompt.length;
  const tokenEst = Math.round(totalChars / 4);
  console.log(`[OK] Phase 4 reconciliation: ${reuseCrosslinkFindings.length} findings, ~${tokenEst} tokens`);

  if (DRY_RUN) {
    return { clusters: [], dryRun: true, tokenEstimate: tokenEst };
  }

  try {
    const parsed = await callModel(system, prompt, 'reconciliation');
    return parsed;
  } catch (err) {
    console.error(`[ERROR] Reconciliation failed: ${err.message}`);
    return { clusters: [], error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function severityLabel(sev) {
  return sev === 'safe-auto' ? 'safe-auto' : 'needs-human';
}

/**
 * Classify a finding into ACT / REVIEW / NOISE bucket.
 *
 * ACT:    confidence >= ACT_CONFIDENCE_MIN AND danger == "low" AND impact != "trivial"
 *         AND (judge is default-ON: judge_verdict == "real"; --no-judge: judge fields absent).
 * REVIEW: danger in {med, high} OR type is cross-file (reuse/crosslink/altitude)
 *         AND not already NOISE.
 * NOISE:  confidence < ACT_CONFIDENCE_MIN OR impact == "trivial"
 *         OR (judge default-ON: judge_verdict == "not-real" or "uncertain").
 *
 * Priority: NOISE > REVIEW > ACT (a finding only enters ACT if it avoids both
 * NOISE and REVIEW conditions).
 */
/**
 * Cross-source agreement count for a finding: the max of lens-convergence,
 * sample-agreement, and cross-model agreement (whichever mode(s) ran). 1 = single
 * source; >=2 = multiple independent sources flagged the same location.
 */
function agreementCount(f) {
  return Math.max(
    typeof f.convergence === 'number' ? f.convergence : 1,
    typeof f.samples_hit === 'number' ? f.samples_hit : 1,
    typeof f.models_hit === 'number' ? f.models_hit : 1,
  );
}
function isConverged(f) {
  return agreementCount(f) >= 2;
}

/**
 * Surfacing tier for a finding — the escalation-facing classification.
 * Separates the two orthogonal meters the tool models:
 *   confidence (is it real) gates surfacing; fix-risk (danger) only TAGS a surfaced
 *   finding as needs-human vs auto-safe — it never routes it out of sight.
 *
 *   'auto-safe'   : real, non-trivial, conf >= floor, danger=low        → apply w/ light review
 *   'needs-human' : real, non-trivial, conf >= floor, danger med/high OR cross-file type
 *   'uncertain'   : judge said "uncertain" (model still conf >= floor, non-trivial) → worth a look
 *   'noise'       : conf < floor OR trivial OR judge said "not-real"     → excluded from escalation
 *
 * In --no-judge mode the judge branches are inert, so findings split auto-safe/needs-human
 * by danger exactly as the old ACT/REVIEW split did.
 */
function surfaceTier(f) {
  const conf = typeof f.confidence === 'number' ? f.confidence : 0.5;
  const impact = f.impact ?? 'minor';
  const danger = f.danger ?? 'med';
  const type = f.type ?? '';
  const judged = USE_JUDGE && f.judge_verdict !== undefined;

  // Hard-noise conditions (excluded from escalation entirely).
  if (impact === 'trivial') return 'noise';
  if (conf < ACT_CONFIDENCE_MIN) return 'noise';
  if (judged && f.judge_verdict === 'not-real') return 'noise';

  // Judge-uncertain gets its own surfaced tier rather than being dropped as noise —
  // recovers judge false-negatives (a "not-real" the judge wasn't actually sure about).
  if (judged && f.judge_verdict === 'uncertain') return 'uncertain';

  // Real (or no-judge mode): fix-risk decides the tag, not visibility.
  const needsHuman = danger === 'med' || danger === 'high' || CROSS_FILE_TYPES.has(type);
  return needsHuman ? 'needs-human' : 'auto-safe';
}

/**
 * Classify a finding into ACT / REVIEW / NOISE for report.md (the audit trail).
 * Delegates to surfaceTier so the two views can't diverge: auto-safe → ACT,
 * needs-human + uncertain → REVIEW (both need human eyes), noise → NOISE.
 */
function bucketFinding(f) {
  const tier = surfaceTier(f);
  if (tier === 'auto-safe') return 'ACT';
  if (tier === 'noise') return 'NOISE';
  return 'REVIEW'; // needs-human or uncertain
}

/**
 * Impact ordering for within-bucket sort (higher = better).
 */
const IMPACT_ORD = { trivial: 0, minor: 1, moderate: 2, significant: 3 };

/**
 * Sort findings: confidence desc, then impact desc.
 */
function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const ca = typeof a.confidence === 'number' ? a.confidence : 0.5;
    const cb = typeof b.confidence === 'number' ? b.confidence : 0.5;
    if (cb !== ca) return cb - ca;
    const ia = IMPACT_ORD[a.impact ?? 'minor'] ?? 1;
    const ib = IMPACT_ORD[b.impact ?? 'minor'] ?? 1;
    return ib - ia;
  });
}

/**
 * Format a single finding as markdown lines for the report.
 * When --judge is active, self-rated scores and judge scores are shown side by side.
 * Shows lens provenance and convergence as a confidence cue.
 */
function formatFinding(f) {
  const lines = [];
  lines.push(`**[${f.id ?? '?'}]** \`${f.file}\` lines ${f.lines ?? '?'}`);
  lines.push(`- type: ${f.type ?? '?'}, severity: ${severityLabel(f.severity)}`);
  lines.push(`- ${f.summary ?? '?'}`);
  lines.push(`- Suggestion: ${f.suggestion ?? '?'}`);
  if (f.reuse_target) lines.push(`- Reuse target: \`${f.reuse_target}\``);

  // Lens provenance + convergence cue
  const convergence = typeof f.convergence === 'number' ? f.convergence : 1;
  const lensesArr = Array.isArray(f.lenses) ? f.lenses : (f.lens ? [f.lens] : ['?']);
  const convergenceNote =
    convergence >= 2
      ? `flagged by ${convergence} lenses: ${lensesArr.join(', ')}`
      : `lens: ${lensesArr[0] ?? '?'}`;
  lines.push(`- **Lens:** ${convergenceNote}`);

  // Self-rated scores (with pre/post boost if convergence > 1)
  const conf = typeof f.confidence === 'number' ? f.confidence.toFixed(2) : '?';
  const preBoost = typeof f.confidence_pre_boost === 'number' ? f.confidence_pre_boost.toFixed(2) : null;
  const boostNote = preBoost && preBoost !== conf ? ` (pre-boost: ${preBoost}, +${CONVERGENCE_BOOST_PER_LENS} x ${convergence - 1})` : '';
  const dangerSuffix = f.heuristicDanger && f.heuristicDanger !== f.modelDanger
    ? ` (model:${f.modelDanger}, heuristic:${f.heuristicDanger} -> final:${f.danger})`
    : ` (model:${f.modelDanger ?? '?'}, final:${f.danger ?? '?'})`;
  lines.push(`- **Self:** confidence=${conf}${boostNote}, impact=${f.impact ?? '?'}, danger=${f.danger ?? '?'}${dangerSuffix}`);

  // Judge scores (present when judge ran — default unless --no-judge was passed)
  if (f.judge_verdict !== undefined) {
    const jconf = typeof f.judge_confidence === 'number' ? f.judge_confidence.toFixed(2) : '?';
    lines.push(`- **Judge:** verdict=${f.judge_verdict}, confidence=${jconf}, danger=${f.judge_danger ?? '?'} — ${f.judge_note ?? ''}`);
  }

  lines.push('');
  return lines;
}

// ---------------------------------------------------------------------------
// Escalation artifact — ACT-bucket survivors for Claude / human hand-off
// ---------------------------------------------------------------------------

/**
 * Check whether a finding qualifies for the escalation set.
 * Escalation = the full surfaced set (auto-safe + needs-human + uncertain);
 * only 'noise' (below the confidence floor, trivial, or judge=not-real) is excluded.
 */
function isEscalation(f) {
  return surfaceTier(f) !== 'noise';
}

/**
 * Render a single finding as escalation.md lines (shared across tiers).
 */
function formatEscalationFinding(f) {
  const lines = [];
  const fileLine = `${f.file ?? '?'}:${f.lines ?? '?'}`;
  const agree = agreementCount(f);
  const agreeBadge = agree >= 2 ? ` — agreed by ${agree} sources` : '';
  lines.push(`### ${f.id ?? '?'} — \`${fileLine}\`${agreeBadge}`);
  lines.push('');
  lines.push(`**Type:** ${f.type ?? '?'}  |  **Impact:** ${f.impact ?? '?'}  |  **Fix-risk (danger):** ${f.danger ?? '?'}`);

  // Provenance: lens convergence and/or sample/model agreement, whichever ran.
  const lensesArr = Array.isArray(f.lenses) ? f.lenses : (f.lens ? [f.lens] : []);
  const prov = [];
  if (typeof f.convergence === 'number' && f.convergence >= 2) prov.push(`${f.convergence} lenses (${lensesArr.join(', ')})`);
  else if (lensesArr.length) prov.push(`lens ${lensesArr[0]}`);
  if (typeof f.samples_hit === 'number' && f.samples_hit >= 2) prov.push(`${f.samples_hit} samples`);
  if (typeof f.models_hit === 'number' && f.models_hit >= 2) prov.push(`${f.models_hit} models`);
  if (prov.length) lines.push(`**Agreement:** ${prov.join(' · ')}`);

  if (f.judge_verdict !== undefined) {
    const jconf = typeof f.judge_confidence === 'number' ? f.judge_confidence.toFixed(2) : '?';
    lines.push(`**Judge:** verdict=${f.judge_verdict}, confidence=${jconf}, danger=${f.judge_danger ?? '?'} — ${f.judge_note ?? ''}`);
  }
  lines.push('');
  lines.push(`**Summary:** ${f.summary ?? '?'}`);
  lines.push('');
  lines.push(`**Suggestion:** ${f.suggestion ?? '?'}`);
  if (f.reuse_target) lines.push(`**Reuse target:** \`${f.reuse_target}\``);
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines;
}

/**
 * Generate escalation.md: the full surfaced set, organised into three fix-risk/verdict
 * tiers (Auto-safe / Needs-human / Uncertain), each split by cross-source agreement
 * (Converged >=2 sources vs Single-source). NOISE is excluded (see report.md for it).
 */
function generateEscalationMd(surfaced, totalFindings) {
  const n = surfaced.length;
  const dropped = totalFindings - n;
  const lines = [];
  lines.push('# Hermes Escalation Set — Surfaced Findings');
  lines.push('');
  lines.push(`> ${n} of ${totalFindings} findings surfaced; ${dropped} excluded as noise`);
  lines.push(`> (confidence < ${ACT_CONFIDENCE_MIN}, impact=trivial, or judge=not-real) — see report.md for those.`);
  lines.push('> Tiers: **Auto-safe** (danger=low) · **Needs-human** (danger med/high or cross-file) · **Uncertain** (judge unsure).');
  lines.push('> Each tier is split **Converged** (>=2 independent sources agreed) vs **Single-source** (potential).');
  lines.push('');
  lines.push('---');
  lines.push('');

  if (n === 0) {
    lines.push('_No findings surfaced._');
    lines.push('');
    return lines.join('\n');
  }

  const TIERS = [
    { key: 'auto-safe', title: 'Auto-safe — apply with light review (danger=low)' },
    { key: 'needs-human', title: 'Needs-human — surfaced, do NOT auto-apply (fix-risk med/high or cross-file)' },
    { key: 'uncertain', title: 'Uncertain — judge was not sure; worth a human look' },
  ];

  for (const tier of TIERS) {
    const inTier = sortFindings(surfaced.filter((f) => surfaceTier(f) === tier.key));
    if (inTier.length === 0) continue;
    lines.push(`## ${tier.title} (${inTier.length})`);
    lines.push('');
    const converged = inTier.filter(isConverged);
    const single = inTier.filter((f) => !isConverged(f));
    if (converged.length) {
      lines.push(`### Converged (${converged.length}) — multiple sources agreed`);
      lines.push('');
      for (const f of converged) lines.push(...formatEscalationFinding(f));
    }
    if (single.length) {
      lines.push(`### Single-source (${single.length}) — potential, one source only`);
      lines.push('');
      for (const f of single) lines.push(...formatEscalationFinding(f));
    }
  }

  return lines.join('\n');
}

function generateReport(allResults, reconciliation) {
  const lines = [];
  lines.push('# Hermes Simplify Report');
  lines.push('');
  lines.push('> REPORT ONLY — nothing was applied/committed. This report is read-only output.');
  lines.push('> No source files were edited, no git operations were run, no GitHub API was called.');
  lines.push('');
  lines.push(`**Reason model (Step 1):** ${REASON_MODEL}`);
  lines.push(`**Structure model (Step 2 + Phase 4):** ${STRUCTURE_MODEL}`);
  lines.push(`**Judge model:** ${JUDGE_MODEL}`);
  lines.push(`**Endpoint:** ${ENDPOINT}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Mode:** ${DRY_RUN ? 'DRY RUN (no model calls)' : 'live'}${USE_JUDGE ? ' + judge (default-ON, K=1)' : ' + no-judge (skipped)'}`);
  lines.push(`**Reason mode:** ${REASON_MODE === 'monolithic' ? 'monolithic (single free-form pass; convergence=1 for all findings)' : 'lenses (3 focused passes: reuse | simplification | efficiency)'}`);
  if (REASON_MODE === 'lenses') {
    lines.push(`**Convergence:** findings flagged by >=2 lenses get +${CONVERGENCE_BOOST_PER_LENS} confidence per extra lens (capped at 1.0)`);
  }
  lines.push('');

  // Collect all findings across all results for bucket summary
  const allFindings = allResults.flatMap((r) => r.findings);
  const totalErrors = allResults.reduce((n, r) => n + r.errors.length, 0);

  // Bucket all findings
  const actFindings = sortFindings(allFindings.filter((f) => bucketFinding(f) === 'ACT'));
  const reviewFindings = sortFindings(allFindings.filter((f) => bucketFinding(f) === 'REVIEW'));
  const noiseFindings = sortFindings(allFindings.filter((f) => bucketFinding(f) === 'NOISE'));

  // Legacy severity counts (kept for backwards-compat)
  const totalSafeAuto = allFindings.filter((f) => f.severity === 'safe-auto').length;
  const totalNeedsHuman = allFindings.length - totalSafeAuto;

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Shards run | Total findings | safe-auto | needs-human | Errors |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(`| ${allResults.length} | ${allFindings.length} | ${totalSafeAuto} | ${totalNeedsHuman} | ${totalErrors} |`);
  lines.push('');

  // Convergence distribution across all findings
  const convCounts = [1, 2, 3].map((k) => allFindings.filter((f) => (f.convergence ?? 1) === k).length);
  lines.push('### Convergence distribution (all findings)');
  lines.push('');
  lines.push(`| 1 lens | 2 lenses | 3 lenses |`);
  lines.push(`|---|---|---|`);
  lines.push(`| ${convCounts[0]} | ${convCounts[1]} | ${convCounts[2]} |`);
  lines.push('');

  // Bucket summary
  lines.push('### Scoring buckets');
  lines.push('');
  lines.push(`| Bucket | Count | Criteria |`);
  lines.push(`|---|---|---|`);
  lines.push(`| **ACT** | ${actFindings.length} | confidence >= ${ACT_CONFIDENCE_MIN}, danger=low, impact != trivial${USE_JUDGE ? ', judge=real' : ' (no-judge mode)'} |`);
  lines.push(`| **REVIEW** | ${reviewFindings.length} | danger med/high, cross-file type${USE_JUDGE ? ', or judge=uncertain' : ''} (not NOISE) |`);
  lines.push(`| **NOISE** | ${noiseFindings.length} | confidence < ${ACT_CONFIDENCE_MIN} or impact=trivial${USE_JUDGE ? ' or judge=not-real' : ' (no-judge mode)'} |`);
  lines.push('');

  // ---- ACT bucket ----
  lines.push('## ACT — apply these (low-risk, high-confidence)');
  lines.push('');
  if (actFindings.length === 0) {
    lines.push('_No findings in this bucket._');
    lines.push('');
  } else {
    for (const f of actFindings) lines.push(...formatFinding(f));
  }

  // ---- REVIEW bucket ----
  lines.push('## REVIEW — needs human judgment');
  lines.push('');
  if (reviewFindings.length === 0) {
    lines.push('_No findings in this bucket._');
    lines.push('');
  } else {
    for (const f of reviewFindings) lines.push(...formatFinding(f));
  }

  // ---- NOISE bucket ----
  lines.push('## NOISE — low confidence or trivial');
  lines.push('');
  if (noiseFindings.length === 0) {
    lines.push('_No findings in this bucket._');
    lines.push('');
  } else {
    for (const f of noiseFindings) lines.push(...formatFinding(f));
  }

  // Per-shard detail (kept for diagnostics)
  lines.push('## Per-shard detail');
  lines.push('');

  for (const r of allResults) {
    lines.push(`### ${r.shardId} (package: ${r.package})`);
    lines.push('');
    lines.push(`- Files: ${r.files.length}`);
    lines.push(`- Token estimate (input): ~${r.tokenEstimate}`);
    if (r.droppedCount > 0) lines.push(`- Dropped (out-of-shard): ${r.droppedCount}`);
    if (r.errors.length > 0) {
      lines.push('- **Errors:**');
      for (const e of r.errors) lines.push(`  - ${e}`);
    }
    if (r.warnings.length > 0) {
      lines.push('- Warnings:');
      for (const w of r.warnings) lines.push(`  - ${w}`);
    }
    lines.push('');

    if (r.findings.length === 0 && r.errors.length === 0) {
      lines.push('_No findings._');
      lines.push('');
    } else {
      // Show findings grouped by bucket within this shard
      const shardAct = r.findings.filter((f) => bucketFinding(f) === 'ACT');
      const shardReview = r.findings.filter((f) => bucketFinding(f) === 'REVIEW');
      const shardNoise = r.findings.filter((f) => bucketFinding(f) === 'NOISE');
      lines.push(`- Bucket counts: ACT=${shardAct.length} REVIEW=${shardReview.length} NOISE=${shardNoise.length}`);
      lines.push('');

      if (shardAct.length > 0) {
        lines.push('#### ACT');
        lines.push('');
        for (const f of sortFindings(shardAct)) lines.push(...formatFinding(f));
      }
      if (shardReview.length > 0) {
        lines.push('#### REVIEW');
        lines.push('');
        for (const f of sortFindings(shardReview)) lines.push(...formatFinding(f));
      }
      if (shardNoise.length > 0) {
        lines.push('#### NOISE');
        lines.push('');
        for (const f of sortFindings(shardNoise)) lines.push(...formatFinding(f));
      }
    }
  }

  // Phase 4 reconciliation clusters
  lines.push('## Phase 4 — Reconciliation clusters');
  lines.push('');
  lines.push('> These are ranked cross-file duplication clusters. Do NOT auto-apply — each becomes an issue/PR.');
  lines.push('');

  const clusters = reconciliation?.clusters ?? [];
  if (clusters.length === 0) {
    lines.push('_No clusters produced._');
  } else {
    // Sort by rank ascending (1 = highest payoff)
    const sorted = [...clusters].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    for (const c of sorted) {
      lines.push(`### Cluster ${c.id ?? '?'} (rank ${c.rank ?? '?'}) — ${c.theme ?? '?'}`);
      lines.push('');
      lines.push(`- Proposed home: \`${c.proposed_home ?? '?'}\``);
      lines.push(`- Est. LOC saved: ${c.est_loc_saved ?? '?'}`);
      lines.push(`- Rationale: ${c.rationale ?? '?'}`);
      lines.push(`- Members:`);
      for (const m of c.members ?? []) lines.push(`  - \`${m}\``);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// .gitignore advisory check (report-only — never writes the file)
// ---------------------------------------------------------------------------

function checkGitignoreEntries() {
  // This tool NEVER edits source files (including .gitignore). We only warn if
  // the required ignore entry is missing so the operator can add it manually.
  const gitignorePath = join(ROOT, '.gitignore');
  let content = '';
  try {
    content = readFileSync(gitignorePath, 'utf8');
  } catch {
    // No .gitignore — nothing to check
    return;
  }

  if (!content.includes('utilities/hermes/reports/')) {
    console.warn(`[WARN] add 'utilities/hermes/reports/' to .gitignore to avoid committing generated artifacts`);
  }
}

// ---------------------------------------------------------------------------
// Scoping mode — derive changed-file set from PR / commit / since
// ---------------------------------------------------------------------------

// Files matching these extensions/patterns contribute no shard (not TS source).
const TS_ONLY_RE = /\.(ts|tsx)$/;

/**
 * Run a shell command and return stdout as a string.
 * Throws with a descriptive error if the command fails.
 * ONLY READS: gh pr view/diff, git show, git diff.
 */
function runReadCmd(cmd, description) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    throw new Error(
      `${description} failed:\n  command: ${cmd}\n  error: ${err.message}${stderr ? `\n  stderr: ${stderr}` : ''}`,
    );
  }
}

/**
 * Derive the changed-file set from the scoping flag.
 * Returns a sorted array of repo-relative .ts/.tsx paths that pass the exclude filter.
 *
 * Scoping intent: git/gh is used ONLY to derive FILE NAMES (which files changed in
 * the PR/commit/range). File CONTENT is always read from the current working tree
 * (readFileSync on disk), never from historical git blobs. The commit/PR is only the
 * grouping signal; Hermes always scans the latest on-disk version of each file.
 */
function deriveChangedFiles() {
  let rawOutput;

  if (SCOPE_PR) {
    // Try gh pr diff first (name-only); fall back to gh pr view --json files
    try {
      rawOutput = runReadCmd(
        `gh pr diff ${SCOPE_PR} --name-only`,
        `gh pr diff ${SCOPE_PR} --name-only`,
      );
    } catch {
      rawOutput = runReadCmd(
        `gh pr view ${SCOPE_PR} --json files -q '.files[].path'`,
        `gh pr view ${SCOPE_PR} --json files`,
      );
    }
  } else if (SCOPE_COMMIT) {
    rawOutput = runReadCmd(
      `git show --name-only --pretty=format: ${SCOPE_COMMIT}`,
      `git show ${SCOPE_COMMIT}`,
    );
  } else if (SCOPE_SINCE) {
    rawOutput = runReadCmd(
      `git diff --name-only ${SCOPE_SINCE}...HEAD`,
      `git diff --name-only ${SCOPE_SINCE}...HEAD`,
    );
  } else {
    throw new Error('deriveChangedFiles called outside scoping mode');
  }

  const allPaths = rawOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Filter: only .ts/.tsx, exclude the same patterns as EXCLUDE_RE
  const filtered = allPaths.filter((p) => TS_ONLY_RE.test(p) && !EXCLUDE_RE.test(p));

  return [...new Set(filtered)].sort();
}

/**
 * Derive a short scope label for naming ad-hoc shard ids.
 * e.g. "pr-1027", "commit-a8bf78b", "since-main"
 */
function scopeLabel() {
  if (SCOPE_PR) return `pr-${SCOPE_PR}`;
  if (SCOPE_COMMIT) return `commit-${SCOPE_COMMIT.slice(0, 7)}`;
  if (SCOPE_SINCE) return `since-${SCOPE_SINCE.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  return 'scope';
}

/**
 * Map a repo-relative file path to its package name (same logic as build-repo-map.mjs pkgOf()).
 * Returns null if the file does not belong to a known package.
 */
function pkgOfFile(relPath) {
  const m = relPath.match(/^packages\/([^/]+)\//);
  if (m) return m[1];
  if (relPath.startsWith('api/')) return 'api';
  if (relPath.startsWith('utilities/oauth-backend/')) return 'oauth-backend';
  return null;
}

/**
 * Build a single-file ad-hoc shard for --file mode.
 * Accepts a repo-relative or absolute path; resolves to repo-relative.
 * Derives the package from the path using pkgOfFile().
 * Returns a shard-like object compatible with runShard(), or null if the
 * file does not exist, is not a .ts/.tsx file, or is not in a known package.
 */
function buildFileShard(rawPath) {
  // Resolve to absolute, then back to repo-relative
  const absPath = resolve(ROOT, rawPath);
  if (!existsSync(absPath)) {
    console.error(`[ERROR] --file: file not found: ${rawPath}`);
    return null;
  }
  if (!/\.(ts|tsx)$/.test(absPath)) {
    console.error(`[ERROR] --file: only .ts/.tsx files are supported (got: ${rawPath})`);
    return null;
  }
  const relPath = relative(ROOT, absPath).split(sep).join('/');
  if (EXCLUDE_RE.test(relPath)) {
    console.error(`[ERROR] --file: file is in an excluded path (test/generated/dist): ${relPath}`);
    return null;
  }
  const pkg = pkgOfFile(relPath);
  if (!pkg) {
    console.error(`[ERROR] --file: file is not in a known package (packages/*, api/, utilities/oauth-backend/): ${relPath}`);
    return null;
  }
  const manifestPkg =
    pkg === 'api'
      ? 'api (Vercel functions)'
      : pkg === 'oauth-backend'
        ? 'utilities/oauth-backend'
        : pkg;
  const slug = relPath.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return {
    id: `file-${slug}`,
    package: manifestPkg,
    covers: `(ad-hoc: single file ${relPath})`,
    loc: 0,
    resolvedFiles: [relPath],
    resolveWarnings: [],
  };
}

/**
 * Group changed files by package into ad-hoc shard descriptors.
 * Files not belonging to a known in-scope package are silently dropped.
 * Returns an array of shard-like objects compatible with runShard().
 */
function groupIntoAdHocShards(changedFiles, label) {
  const byPkg = new Map();
  for (const f of changedFiles) {
    const pkg = pkgOfFile(f);
    if (!pkg) continue; // outside a known package — no simplify shard
    if (!byPkg.has(pkg)) byPkg.set(pkg, []);
    byPkg.get(pkg).push(f);
  }

  const shards = [];
  for (const [pkg, files] of byPkg) {
    // Map pkg dir name to the shard-manifest "package" column value
    const manifestPkg =
      pkg === 'api'
        ? 'api (Vercel functions)'
        : pkg === 'oauth-backend'
          ? 'utilities/oauth-backend'
          : pkg;
    shards.push({
      id: `${label}-${pkg}`,
      package: manifestPkg,
      covers: `(ad-hoc: ${files.length} changed file(s))`,
      loc: 0, // will be measured from actual files
      // Pre-populate resolvedFiles so resolveShardFiles() uses them directly
      resolvedFiles: files.sort(),
      resolveWarnings: [],
    });
  }
  return shards;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// --self-test: deterministic dead-code-filter branch verification
// ---------------------------------------------------------------------------
//
// Constructs two synthetic findings and runs them through the post-filter:
//   1. A finding claiming `parse` is dead — `parse` is widely used → should be DROPPED.
//   2. A finding claiming `__genuinelyUnusedSymbol__` is dead — it's in the confirmed-
//      unused set → should be KEPT.
// Prints pass/fail and exits 0 on success, 1 on failure. No model calls.

function runSelfTest() {
  console.log('[self-test] Hook B dead-code post-filter — two-branch deterministic test');
  console.log('');

  let passed = 0;
  let failed = 0;

  // Build a fake confirmed-unused set with a symbol that definitely won't be in real code.
  const fakeUnused = new Set(['__genuinelyUnusedSymbol__']);

  // Branch 1: `parse` IS used — finding should be DROPPED
  const findingUsed = {
    type: 'quality',
    summary: 'The parse function is dead and unused — can be removed',
    suggestion: 'Remove the unused parse function',
    file: 'packages/engine/src/codec/parse.ts',
    lines: '1-10',
  };
  const result1 = postFilterDeadCodeClaims([findingUsed], fakeUnused);
  if (result1.length === 0) {
    console.log('[self-test] PASS branch 1: finding claiming `parse` is dead was DROPPED (parse has callers)');
    passed++;
  } else {
    console.log('[self-test] FAIL branch 1: finding claiming `parse` is dead was NOT dropped (expected DROP)');
    failed++;
  }

  // Branch 2: `__genuinelyUnusedSymbol__` is in confirmed-unused — finding should be KEPT
  const findingUnused = {
    type: 'quality',
    summary: 'The __genuinelyUnusedSymbol__ function is unused and can be removed',
    suggestion: 'Delete __genuinelyUnusedSymbol__',
    file: 'packages/engine/src/some-file.ts',
    lines: '50-60',
  };
  const result2 = postFilterDeadCodeClaims([findingUnused], fakeUnused);
  if (result2.length === 1) {
    console.log('[self-test] PASS branch 2: finding claiming `__genuinelyUnusedSymbol__` is dead was KEPT (confirmed unused)');
    passed++;
  } else {
    console.log('[self-test] FAIL branch 2: finding for confirmed-unused symbol was DROPPED (expected KEEP)');
    failed++;
  }

  // Branch 3: empty confirmed-unused set (grep unavailable) — dead-code claims drop
  const result3 = postFilterDeadCodeClaims([findingUsed], new Set());
  if (result3.length === 0) {
    console.log('[self-test] PASS branch 3: grep-unavailable path — dead-code claim was DROPPED (no confirmed-unused set)');
    passed++;
  } else {
    console.log('[self-test] FAIL branch 3: grep-unavailable path — dead-code claim was NOT dropped');
    failed++;
  }

  // ---- Surfacing/bucketing tier tests (guards the escalation reshape) ----
  // These assume judge-ON semantics (the default). USE_JUDGE is true unless --no-judge,
  // which the self-test never passes, so f.judge_verdict is honoured.
  console.log('');
  console.log('[self-test] surfaceTier / bucketFinding / agreement — deterministic classification');
  const check = (label, got, want) => {
    if (got === want) { console.log(`[self-test] PASS ${label}: ${got}`); passed++; }
    else { console.log(`[self-test] FAIL ${label}: got ${got}, want ${want}`); failed++; }
  };
  const base = { confidence: 0.8, impact: 'moderate', danger: 'low', type: 'quality', judge_verdict: 'real' };
  // auto-safe: real, low danger, confident, non-trivial
  check('auto-safe tier', surfaceTier({ ...base }), 'auto-safe');
  check('auto-safe→ACT', bucketFinding({ ...base }), 'ACT');
  // needs-human: high fix-risk must still surface (not be filtered out)
  check('high-danger → needs-human', surfaceTier({ ...base, danger: 'high' }), 'needs-human');
  check('cross-file type → needs-human', surfaceTier({ ...base, danger: 'low', type: 'reuse' }), 'needs-human');
  check('needs-human is surfaced', isEscalation({ ...base, danger: 'high' }), true);
  // uncertain: own tier, still surfaced
  check('judge uncertain → uncertain tier', surfaceTier({ ...base, judge_verdict: 'uncertain' }), 'uncertain');
  check('uncertain is surfaced', isEscalation({ ...base, judge_verdict: 'uncertain' }), true);
  check('uncertain → REVIEW bucket', bucketFinding({ ...base, judge_verdict: 'uncertain' }), 'REVIEW');
  // noise: below floor / trivial / not-real — excluded
  check('low confidence → noise', surfaceTier({ ...base, confidence: 0.4 }), 'noise');
  check('trivial impact → noise', surfaceTier({ ...base, impact: 'trivial' }), 'noise');
  check('judge not-real → noise', surfaceTier({ ...base, judge_verdict: 'not-real' }), 'noise');
  check('noise not surfaced', isEscalation({ ...base, confidence: 0.4 }), false);
  // agreement
  check('single-source not converged', isConverged({ ...base }), false);
  check('2 lenses converged', isConverged({ ...base, convergence: 2 }), true);
  check('2 models converged', isConverged({ ...base, models_hit: 2 }), true);

  // ---- line-ref parsing (the multi-location snippet/convergence fix) ----
  const rangesStr = (s) => JSON.stringify(parseLineRanges(s).map((r) => [r.start, r.end]));
  const envStr = (s) => { const e = parseLineRange(s); return `${e.start}-${e.end}`; };
  check('single range parse', rangesStr('88-134'), '[[88,134]]');
  check('point parse', rangesStr('312'), '[[312,312]]');
  check('comma multi-point', rangesStr('727, 796, 820'), '[[727,727],[796,796],[820,820]]');
  check('multi-range "and"', rangesStr('284-292 and 394-406'), '[[284,292],[394,406]]');
  check('L-prefix noise', rangesStr('~L312'), '[[312,312]]');
  check('unparseable → empty', rangesStr('n/a'), '[]');
  // envelope (feeds convergence/dedup): multi-location must NOT collapse to 0-0 anymore
  check('envelope multi-point', envStr('727, 796, 820'), '727-820');
  check('envelope multi-range', envStr('284-292 and 394-406'), '284-406');
  check('envelope unparseable', envStr('n/a'), '0-0');
  // window merge: two nearby ranges coalesce, far ones stay separate (ctx=15)
  const merged = buildContextWindows([{ start: 100, end: 100 }, { start: 110, end: 110 }], 1000, 15);
  check('nearby windows merge', JSON.stringify(merged.map((w) => [w.start, w.end])), '[[85,125]]');
  const split = buildContextWindows([{ start: 100, end: 100 }, { start: 500, end: 500 }], 1000, 15);
  check('far windows stay split', split.length, 2);

  console.log('');
  if (failed === 0) {
    console.log(`[self-test] All ${passed} checks passed.`);
    process.exit(0);
  } else {
    console.log(`[self-test] ${failed} check(s) FAILED (${passed} passed).`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// --judge-set mode — evaluate a labeled benchmark file with the judge
// ---------------------------------------------------------------------------
//
// Reads a JSON benchmark file: { items: [{id,label,file,lines,type,summary,suggestion}] }
// For each item: reads the file from disk, extracts a +/-25-line window around the
// named lines (falls back to grep on the summary's key symbol, then whole file if <1500
// lines), gives the judge: summary + suggestion + code snippet, asks for a verdict.
// Writes <OUT_DIR>/verdicts.json = [{id, label, verdict, judge_confidence, note}].
// This mode does NOT run lenses/simplify — judge only.

const JUDGE_SET_CONTEXT_LINES = 25;

/**
 * Read a code snippet for a benchmark item.
 * Priority: line-window → grep-on-symbol → whole-file (if <1500 lines).
 * Returns { snippet, method } where method is one of 'line-window'|'grep-symbol'|'whole-file'|'none'.
 */
function readBenchmarkSnippet(item) {
  const filePath = join(ROOT, item.file ?? '');
  let src;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    return { snippet: '', method: 'none' };
  }
  const srcLines = src.split('\n');
  const total = srcLines.length;

  // --- Try line-window first (handles multi-location refs) ---
  const ranges = parseLineRanges(item.lines).filter((r) => r.start >= 1 && r.start <= total);
  if (ranges.length > 0) {
    const windows = buildContextWindows(ranges, total, JUDGE_SET_CONTEXT_LINES);
    return { snippet: renderWindows(srcLines, windows), method: 'line-window' };
  }

  // --- Grep file for key symbol from summary ---
  // Extract the first backtick-quoted or camelCase/PascalCase token from summary
  const summaryText = item.summary ?? '';
  const btMatch = summaryText.match(/`([A-Za-z_$][\w$]+)`/);
  const symbolMatch = btMatch ? btMatch[1] : (summaryText.match(/\b([A-Z][a-z]\w{2,}|[a-z]\w{2,}[A-Z]\w*)\b/) ?? [])[1];
  if (symbolMatch) {
    const symbolRe = new RegExp(symbolMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const hitIdx = srcLines.findIndex((l) => symbolRe.test(l));
    if (hitIdx !== -1) {
      const ctxStart = Math.max(1, hitIdx + 1 - JUDGE_SET_CONTEXT_LINES);
      const ctxEnd = Math.min(total, hitIdx + 1 + JUDGE_SET_CONTEXT_LINES);
      const snippet = srcLines
        .slice(ctxStart - 1, ctxEnd)
        .map((l, i) => `${String(ctxStart + i).padStart(4, ' ')}: ${l}`)
        .join('\n');
      return { snippet, method: 'grep-symbol' };
    }
  }

  // --- Whole file fallback (only if small enough) ---
  if (total < 1500) {
    const snippet = srcLines.map((l, i) => `${String(i + 1).padStart(4, ' ')}: ${l}`).join('\n');
    return { snippet, method: 'whole-file' };
  }

  return { snippet: '', method: 'none' };
}

/**
 * Run judge-set mode: evaluate each benchmark item using the judge model,
 * write verdicts.json to OUT_DIR.
 */
async function runJudgeSet() {
  console.log(`[OK] hermes-run.mjs — judge-set mode`);
  console.log(`     model    : ${JUDGE_MODEL}`);
  console.log(`     endpoint : ${ENDPOINT}`);
  console.log(`     out dir  : ${OUT_DIR}`);
  console.log(`     benchmark: ${JUDGE_SET_PATH}`);
  console.log('');

  // Load benchmark file
  let benchmark;
  try {
    const raw = readFileSync(JUDGE_SET_PATH, 'utf8');
    benchmark = JSON.parse(raw);
  } catch (err) {
    console.error(`[ERROR] Could not load benchmark file ${JUDGE_SET_PATH}: ${err.message}`);
    process.exit(1);
  }

  const items = Array.isArray(benchmark.items) ? benchmark.items : [];
  if (items.length === 0) {
    console.error('[ERROR] Benchmark file has no items.');
    process.exit(1);
  }
  console.log(`[OK] Loaded ${items.length} benchmark items`);

  // Endpoint reachability check
  try {
    const parsed = new URL(ENDPOINT);
    const tagsUrl = `${parsed.origin}/api/tags`;
    const testRes = await fetch(tagsUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
    if (!testRes.ok) throw new Error(`HTTP ${testRes.status}`);
    console.log('[OK] Endpoint reachable');
  } catch (err) {
    console.error(`[ERROR] Endpoint unreachable: ${err.message}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const verdicts = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemLabel = `${item.id ?? `item-${idx}`}`;
    console.log(`  [judge-set] ${idx + 1}/${items.length} — ${itemLabel} (label=${item.label})`);

    // Build snippet
    const { snippet, method } = readBenchmarkSnippet(item);
    if (method === 'none') {
      console.warn(`    [WARN] ${itemLabel}: could not read snippet from ${item.file} — passing empty context`);
    } else {
      console.log(`    snippet method: ${method}`);
    }

    // Build a synthetic finding-like object for callModelJudge
    const syntheticFinding = {
      type: item.type ?? 'quality',
      summary: item.summary ?? '',
      suggestion: item.suggestion ?? '',
      file: item.file ?? '',
      lines: item.lines ?? '',
    };

    const judgeResult = await callModelJudge(syntheticFinding, snippet, itemLabel);
    if (judgeResult) {
      verdicts.push({
        id: item.id,
        label: item.label,
        verdict: judgeResult.judge_verdict,
        judge_confidence: judgeResult.judge_confidence,
        note: judgeResult.judge_note,
      });
      console.log(`    verdict: ${judgeResult.judge_verdict} (confidence=${judgeResult.judge_confidence.toFixed(2)}) — ${judgeResult.judge_note}`);
    } else {
      // Judge call failed — record as uncertain
      verdicts.push({
        id: item.id,
        label: item.label,
        verdict: 'uncertain',
        judge_confidence: 0,
        note: 'judge call failed',
      });
      console.warn(`    [WARN] ${itemLabel}: judge call failed — recorded as uncertain`);
    }
  }

  // Write verdicts.json
  const verdictsPath = join(OUT_DIR, 'verdicts.json');
  writeFileSync(verdictsPath, JSON.stringify(verdicts, null, 2), 'utf8');
  console.log('');
  console.log(`[OK] verdicts.json written: ${verdictsPath}`);
  console.log(`     ${verdicts.length} items judged`);

  // Print quick precision/recall (real=positive, not-real/uncertain=negative)
  const realItems = items.filter((it) => it.label === 'real').map((it) => it.id);
  const fakeItems = items.filter((it) => it.label === 'fake').map((it) => it.id);
  const verdictMap = new Map(verdicts.map((v) => [v.id, v.verdict]));
  const tp = realItems.filter((id) => verdictMap.get(id) === 'real').length;
  const fp = fakeItems.filter((id) => verdictMap.get(id) === 'real').length;
  const fn = realItems.filter((id) => verdictMap.get(id) !== 'real').length;
  const tn = fakeItems.filter((id) => verdictMap.get(id) !== 'real').length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy = (tp + tn) / items.length;
  console.log('');
  console.log('[OK] Quick judge-set scores (real=positive):');
  console.log(`     precision=${precision.toFixed(3)}  recall=${recall.toFixed(3)}  F1=${f1.toFixed(3)}  accuracy=${accuracy.toFixed(3)}`);
  console.log(`     TP=${tp}  FP=${fp}  FN=${fn}  TN=${tn}  (of ${items.length} items: ${realItems.length} real, ${fakeItems.length} fake)`);
}

/** Classify a completed shard for the circuit breaker; null = healthy (>=1 finding). */
function shardBrokenKind(result) {
  if (result.findings.length > 0) return null;
  if (result.errors.some((e) => /resolved to 0 files/i.test(e))) return 'zero-files';
  if (result.errors.length > 0) return 'error';
  return 'empty';
}

/** Best-effort cause->fix hint from the accumulated broken shards' error text. */
function circuitBreakerHint(brokenResults) {
  const kinds = new Set(brokenResults.map(shardBrokenKind));
  const errText = brokenResults.flatMap((r) => r.errors).join(' | ').toLowerCase();
  if (kinds.has('zero-files'))
    return 'INPUT: a shard resolved to 0 files. Check its "covers" cell in shard-manifest.md and the src prefix.';
  if (/fetch failed|econnrefused|socket|network/.test(errText))
    return 'PIPELINE: model calls cannot connect. Ollama is likely down/unloaded — check `docker exec ollama ollama ps` and ENDPOINT, then resume.';
  if (/http 404|not found|no such model|\bpull\b/.test(errText))
    return 'PIPELINE: model unavailable. `ollama pull <model>` and confirm --model/--structure-model/--judge-model, then resume.';
  if (/http (429|5\d\d)|timeout|timed out|aborted/.test(errText))
    return 'PIPELINE: model calls timing out / rate-limited. GPU may be contended or MODEL_TIMEOUT_MS too low — check `nvidia-smi`, then resume.';
  if (kinds.has('empty'))
    return 'OUTPUT: shards produced 0 findings and 0 errors — the format:json empty-output signature (see the gpt-oss fix) or a decode/prompt regression. Verify with `--file <path> --no-judge` before resuming.';
  return 'Consistent failures with no clear signature — inspect the shard errors above before resuming.';
}

async function main() {
  // --self-test: run the deterministic post-filter test and exit immediately
  if (SELF_TEST) {
    runSelfTest();
    return; // unreachable (runSelfTest calls process.exit), but satisfies flow
  }

  // --judge-set: evaluate a labeled benchmark file with the judge model only
  if (JUDGE_SET_PATH) {
    await runJudgeSet();
    return;
  }

  const modeLabel = DRY_RUN ? 'DRY RUN' : 'live';
  const scopeModeLabel = IS_FILE_MODE ? ' (file)' : IS_SCOPING_MODE ? ' (scoping)' : '';
  console.log(`[OK] hermes-run.mjs — report-only shard runner (3-lens multi-pass)`);
  if (IS_ENSEMBLE) {
    console.log(`     mode: ensemble (${ENSEMBLE_MODELS.length} reason models)`);
    console.log(`     reason models  : ${ENSEMBLE_MODELS.join(', ')}`);
  } else {
    console.log(`     reason model   : ${REASON_MODEL}`);
  }
  console.log(`     structure model: ${STRUCTURE_MODEL}`);
  console.log(`     judge model    : ${JUDGE_MODEL}`);
  console.log(`     endpoint : ${ENDPOINT}`);
  console.log(`     out dir  : ${OUT_DIR}`);
  console.log(`     temps    : reason=${REASON_TEMP} judge=${JUDGE_TEMP} (structure/reconcile fixed at 0.1)`);
  console.log(`     judge    : ${USE_JUDGE ? `ON (K=1, temp=${JUDGE_TEMP}) — use --no-judge to skip` : 'OFF (--no-judge)'}`);
  console.log(`     mode     : ${modeLabel}${scopeModeLabel}`);
  if (IS_ENSEMBLE) {
    console.log(`     reason-mode: ensemble (${ENSEMBLE_MODELS.length} reason models → cross-model union → ${JUDGE_MODEL} judge)`);
    console.log(`     samples  : ${SAMPLES} per model${SAMPLES > 1 ? ` (self-consistency union per model; boost +${SAMPLE_BOOST_PER_HIT} per extra hit)` : ' (single pass per model — default)'}`);
    console.log(`     model boost: +${MODEL_BOOST_PER_EXTRA} per extra model agreeing on a location (gap=${MODEL_LINE_GAP} lines)`);
  } else {
    console.log(`     reason-mode: ${REASON_MODE}${REASON_MODE === 'monolithic' ? ' (single free-form pass)' : ' (3 focused lens passes)'}`);
    console.log(`     samples  : ${SAMPLES}${SAMPLES > 1 ? ` (self-consistency union; boost +${SAMPLE_BOOST_PER_HIT} per extra hit, gap=${SAMPLE_LINE_GAP} lines)` : ' (single pass — default)'}`);
    if (REASON_MODE === 'lenses') {
      console.log(`     lenses   : ${LENSES.map((l) => l.name).join(', ')} (${LENSES.length} passes per shard)`);
      console.log(`     convergence boost: +${CONVERGENCE_BOOST_PER_LENS} per extra lens (gap=${CONVERGENCE_LINE_GAP} lines)`);
    }
  }
  if (IS_FILE_MODE) {
    console.log(`     file     : ${SCOPE_FILE}`);
  } else if (IS_SCOPING_MODE) {
    const scopeDesc = SCOPE_PR
      ? `--pr ${SCOPE_PR}`
      : SCOPE_COMMIT
        ? `--commit ${SCOPE_COMMIT}`
        : `--since ${SCOPE_SINCE}`;
    console.log(`     scope    : ${scopeDesc}`);
  }
  console.log('');

  // Advisory check: warn if .gitignore is missing the reports/ entry (never writes the file)
  checkGitignoreEntries();

  // Ensure output directory exists
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    console.log(`[OK] Created output directory: ${OUT_DIR}`);
  }

  let shards;

  if (IS_FILE_MODE) {
    // ---- Single-file mode (--file <path>) ----
    const shard = buildFileShard(SCOPE_FILE);
    if (!shard) process.exit(1);
    shards = [shard];
    console.log(`[OK] File mode: 1 file → 1 ad-hoc shard (${shard.id})`);
    console.log(`     file: ${shard.resolvedFiles[0]}`);
    console.log(`     package: ${shard.package}`);
    console.log('');
  } else if (IS_SCOPING_MODE) {
    // ---- Scoping mode: derive changed-file set; ignore manifest ----
    let changedFiles;
    try {
      changedFiles = deriveChangedFiles();
    } catch (err) {
      console.error(`[ERROR] ${err.message}`);
      process.exit(1);
    }

    if (changedFiles.length === 0) {
      console.log('[OK] Scoping mode: no in-scope .ts/.tsx files changed — nothing to run.');
      process.exit(0);
    }

    const label = scopeLabel();
    shards = groupIntoAdHocShards(changedFiles, label);

    console.log(`[OK] Scoping mode (${label}): ${changedFiles.length} in-scope changed file(s) → ${shards.length} ad-hoc shard(s):`);
    for (const s of shards) {
      console.log(`     ${s.id}: ${s.resolvedFiles.length} file(s) in package "${s.package}"`);
      for (const f of s.resolvedFiles) console.log(`       ${f}`);
    }
    console.log('');
  } else {
    // ---- Manifest mode ----
    shards = parseShardManifest();
    if (shards.length === 0) {
      console.error('[ERROR] No shards parsed from shard-manifest.md — check the file.');
      process.exit(1);
    }
    console.log(`[OK] Parsed ${shards.length} shards from manifest`);

    // Two-pass resolution: eliminates over-scanning in "rest of" shards
    twoPassResolveShards(shards);
    console.log('[OK] Two-pass shard resolution complete');

    // Apply filters
    if (ONLY_SHARD) {
      // Support both shard id (e.g. "llm") and S-number shorthand (e.g. "S17")
      const sNumMatch = ONLY_SHARD.match(/^[Ss](\d+)$/);
      const found = sNumMatch
        ? shards.find((s) => s.num === parseInt(sNumMatch[1], 10))
        : shards.find((s) => s.id === ONLY_SHARD);
      if (!found) {
        console.error(`[ERROR] Shard "${ONLY_SHARD}" not found in manifest. Available: ${shards.map((s) => `S${String(s.num).padStart(2,'0')}/${s.id}`).join(', ')}`);
        process.exit(1);
      }
      shards = [found];
      console.log(`[OK] Running single shard: S${String(found.num).padStart(2,'0')} / ${found.id}`);
    } else if (LIMIT !== null && !isNaN(LIMIT)) {
      shards = shards.slice(0, LIMIT);
      console.log(`[OK] Limited to first ${LIMIT} shards`);
    }
  }

  // Endpoint reachability check (skip for dry-run).
  // Derive the probe URL from the WHATWG URL origin to handle custom --endpoint values safely.
  if (!DRY_RUN) {
    let tagsUrl = null;
    try {
      const parsed = new URL(ENDPOINT);
      tagsUrl = `${parsed.origin}/api/tags`;
    } catch {
      console.warn(`[WARN] Could not parse endpoint as a URL — skipping reachability probe: ${ENDPOINT}`);
    }

    if (tagsUrl !== null) {
      try {
        const testRes = await fetch(tagsUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (!testRes.ok) throw new Error(`HTTP ${testRes.status}`);
        console.log('[OK] Endpoint reachable');
      } catch (err) {
        console.error(
          `[ERROR] Endpoint unreachable at ${ENDPOINT}\n` +
            `  Models expected: reason=${REASON_MODEL}, structure=${STRUCTURE_MODEL}, judge=${JUDGE_MODEL}\n` +
            `  Error: ${err.message}\n` +
            `  Start Ollama with: ollama serve\n` +
            `  Pull models with:  ollama pull ${REASON_MODEL} && ollama pull ${STRUCTURE_MODEL} && ollama pull ${JUDGE_MODEL}`,
        );
        process.exit(1);
      }
    }
  }

  // Run shards
  console.log('');
  console.log(`Running ${shards.length} shard(s)…`);
  console.log('');

  const allResults = [];
  let consecutiveBroken = 0;
  let aborted = false;
  for (const shard of shards) {
    console.log(`--- Shard ${shard.id} (${shard.package}) ---`);
    const result = await runShard(shard);
    allResults.push(result);
    console.log(
      `    findings: ${result.findings.length} (${result.findings.filter((f) => f.severity === 'safe-auto').length} safe-auto), errors: ${result.errors.length}`,
    );
    console.log('');

    if (CIRCUIT_BREAKER && !DRY_RUN) {
      const kind = shardBrokenKind(result);
      if (kind) {
        consecutiveBroken++;
        const isFirst = allResults.length === 1;
        // A fully-broken first batch is systemic by definition. Empty-first counts only in a
        // multi-shard pass — a lone shard can legitimately yield 0 findings.
        const firstBatchSystemic = isFirst && (kind !== 'empty' || shards.length > 1);
        if (firstBatchSystemic || consecutiveBroken >= CB_CONSECUTIVE) {
          aborted = true;
          const hint = circuitBreakerHint(allResults.slice(-consecutiveBroken));
          console.error('');
          console.error(`[ABORT] Systemic failure after batch ${allResults.length}/${shards.length}: ${consecutiveBroken} broken shard(s) (kind=${kind}).`);
          console.error(`[ABORT] ${hint}`);
          console.error(`[ABORT] Writing partial artifacts + retry queue, then exiting 2. --no-circuit-breaker forces a full pass.`);
          break;
        }
      } else {
        consecutiveBroken = 0;
      }
    }
  }

  // Phase 4 reconciliation (skip if only one shard, dry-run with --shard, or aborted)
  let reconciliation = { clusters: [] };
  if (!aborted && (!ONLY_SHARD || allResults.length > 1)) {
    console.log('--- Phase 4: Reconciliation ---');
    const fullMap = DRY_RUN ? null : getRepoMapSlice('_full_');
    reconciliation = await runReconciliation(allResults, fullMap);
    console.log('');
  }

  // Write artifacts
  const allFindings = allResults.flatMap((r) => r.findings);
  const totalFindings = allFindings.length;
  const surfacedFindings = sortFindings(allFindings.filter(isEscalation));

  const findingsArtifact = {
    generatedAt: new Date().toISOString(),
    reasonModel: REASON_MODEL,
    structureModel: STRUCTURE_MODEL,
    judgeModel: JUDGE_MODEL,
    endpoint: ENDPOINT,
    dryRun: DRY_RUN,
    judgeEnabled: USE_JUDGE,
    shards: allResults,
    reconciliation,
  };

  // Escalation JSON: the full surfaced set (auto-safe + needs-human + uncertain) with
  // per-finding tier + agreement stamped on, for machine consumption. NOISE excluded.
  const tierCounts = { 'auto-safe': 0, 'needs-human': 0, uncertain: 0 };
  const escalationFindings = surfacedFindings.map((f) => {
    const tier = surfaceTier(f);
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    return { ...f, surfaceTier: tier, agreementCount: agreementCount(f), converged: isConverged(f) };
  });
  const escalationArtifact = {
    generatedAt: new Date().toISOString(),
    totalFindings,
    escalationCount: surfacedFindings.length,
    droppedCount: totalFindings - surfacedFindings.length,
    tierCounts,
    filter: {
      judgeEnabled: USE_JUDGE,
      surfaced: 'auto-safe + needs-human + uncertain (noise excluded)',
      excludedAsNoise: USE_JUDGE
        ? `confidence < ${ACT_CONFIDENCE_MIN}, impact=trivial, or judge=not-real`
        : `confidence < ${ACT_CONFIDENCE_MIN} or impact=trivial (no-judge mode)`,
      confidenceMin: ACT_CONFIDENCE_MIN,
    },
    findings: escalationFindings,
  };

  const findingsPath = join(OUT_DIR, 'findings.json');
  const reportPath = join(OUT_DIR, 'report.md');
  const escalationMdPath = join(OUT_DIR, 'escalation.md');
  const escalationJsonPath = join(OUT_DIR, 'escalation.json');

  writeFileSync(findingsPath, JSON.stringify(findingsArtifact, null, 2), 'utf8');
  writeFileSync(reportPath, generateReport(allResults, reconciliation), 'utf8');
  writeFileSync(escalationMdPath, generateEscalationMd(surfacedFindings, totalFindings), 'utf8');
  writeFileSync(escalationJsonPath, JSON.stringify(escalationArtifact, null, 2), 'utf8');

  // Retry queue: isolated sub-batch failures (the shard still produced other findings) —
  // flagged for a later targeted re-run, NOT a reason to abort the pass.
  const retriable = allResults.flatMap((r) => (r.retriable ?? []).map((x) => ({ shard: r.shardId, ...x })));
  if (retriable.length > 0) {
    const retryPath = join(OUT_DIR, 'retry-queue.json');
    writeFileSync(retryPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: retriable.length, items: retriable }, null, 2), 'utf8');
    console.log(`[WARN] ${retriable.length} isolated sub-batch failure(s) flagged for retry -> ${retryPath}`);
  }

  console.log(`[OK] Artifacts written:`);
  console.log(`     ${findingsPath}`);
  console.log(`     ${reportPath}`);
  console.log(`     ${escalationMdPath}  (${surfacedFindings.length} of ${totalFindings} surfaced — auto-safe=${tierCounts['auto-safe']} needs-human=${tierCounts['needs-human']} uncertain=${tierCounts.uncertain})`);
  console.log(`     ${escalationJsonPath}`);

  // Summary
  const totalErrors = allResults.reduce((n, r) => n + r.errors.length, 0);
  console.log('');
  console.log(`[OK] Done. ${allResults.length} shard(s), ${totalFindings} finding(s), ${totalErrors} error(s).`);
  console.log(`[OK] Escalation set: ${surfacedFindings.length} of ${totalFindings} findings surfaced (noise excluded).`);
  if (aborted) process.exit(2);
  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`[ERROR] Unhandled error: ${err.message}`);
  process.exit(1);
});
