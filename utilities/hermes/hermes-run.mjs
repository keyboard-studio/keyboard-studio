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

// Same exclude regex as build-repo-map.mjs
const EXCLUDE_RE =
  /(\.test\.[tj]sx?$|\.d\.ts$|vitest\.config\.[tj]s$|[/\\]__tests__[/\\]|[/\\]__fixtures__[/\\]|[/\\]generated[/\\]|[/\\]simulator[/\\]vendor[/\\]|[/\\]dist[/\\]|[/\\]node_modules[/\\])/;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

// Value-expecting flags: if the flag is the last argument (no value follows), abort early.
const VALUE_FLAGS = ['--shard', '--limit', '--model', '--structure-model', '--endpoint', '--out', '--pr', '--commit', '--since'];
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

const ONLY_SHARD = flag('--shard');
const LIMIT = flag('--limit') !== null ? parseInt(flag('--limit'), 10) : null;
// --model overrides the Step 1 REASON model; --structure-model overrides Step 2 STRUCTURE model.
// No-swap default: STRUCTURE_MODEL = REASON_MODEL so a stock run loads only one model.
const REASON_MODEL = flag('--model') ?? DEFAULT_REASON_MODEL;
const STRUCTURE_MODEL = flag('--structure-model') ?? REASON_MODEL;
const ENDPOINT = flag('--endpoint') ?? DEFAULT_ENDPOINT;
const OUT_DIR = flag('--out') ?? DEFAULT_OUT;
const DRY_RUN = hasFlag('--dry-run');

// Scoping-mode flags (mutually exclusive).
const SCOPE_PR = flag('--pr');
const SCOPE_COMMIT = flag('--commit');
const SCOPE_SINCE = flag('--since');
const SCOPE_MODE_COUNT = [SCOPE_PR, SCOPE_COMMIT, SCOPE_SINCE].filter(Boolean).length;
if (SCOPE_MODE_COUNT > 1) {
  console.error('[ERROR] --pr, --commit, and --since are mutually exclusive — pick one.');
  process.exit(1);
}
const IS_SCOPING_MODE = SCOPE_MODE_COUNT === 1;

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
    options: { temperature: 0.1, num_ctx: 32768 },
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
 * Step 2 STRUCTURE: call STRUCTURE_MODEL with format:json to convert Step 1 prose
 * to the findings schema. Returns the parsed JSON object.
 * Retries once on SyntaxError (JSON parse failure). Applies MODEL_TIMEOUT_MS timeout.
 */
async function callModelStructure(structureSystem, notesPrompt, shardId) {
  const body = {
    model: STRUCTURE_MODEL,
    system: structureSystem,
    prompt: notesPrompt,
    stream: false,
    format: 'json',
    options: { temperature: 0.1, num_ctx: 32768 },
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
    // Retry ONLY on JSON parse failure.
    if (!(err instanceof SyntaxError)) throw err;
    console.error(`[WARN] shard ${shardId}: structure JSON parse failed (${err.message}), retrying once…`);
    try {
      return await attempt();
    } catch (err2) {
      throw new Error(`Structure model call failed after retry: ${err2.message}`);
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
    options: { temperature: 0.1, num_ctx: 32768 },
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
// Two-step orchestrator — used by the per-shard runner
// ---------------------------------------------------------------------------

// Step 2 structure system prompt (injected inline, not from prompt-templates.md, because
// it describes the mechanical schema transform rather than the review rubric).
const STRUCTURE_SYSTEM = `Convert the following code-review notes into JSON.
Emit exactly {"findings":[{"id":"<shard>-<seq>","type":"reuse|quality|efficiency|crosslink","file":"<path>","lines":"<start>-<end>","severity":"safe-auto|needs-human","summary":"<one line>","suggestion":"<concrete change>","reuse_target":"<path:symbol or null>"}]}.
Do NOT add or invent findings; only structure what is present in the notes.
Severity rule: safe-auto = mechanical, behavior-preserving, single-file, touches no exported symbol, not on the REFUSE list; else needs-human.
If there are no findings, emit {"findings":[]}.`;

/**
 * Run the two-step decode for one sub-batch.
 * Returns an array of finding objects (may be empty).
 *
 * @param {string} reasonSystem  - Step 1 system prompt (from prompt-templates.md section A)
 * @param {string} batchPrompt   - assembled shard content prompt
 * @param {string} shardLabel    - e.g. "S10" or "S10[1/2]" (for log messages)
 * @param {Set<string>} fileSet  - files in this sub-batch (used to drop out-of-shard findings)
 */
async function callModelTwoStep(reasonSystem, batchPrompt, shardLabel, fileSet) {
  // Step 1: REASON — free-form prose
  let notes;
  try {
    notes = await callModelReason(reasonSystem, batchPrompt);
  } catch (err) {
    throw new Error(`Step 1 (reason) failed: ${err.message}`);
  }

  // If Step 1 returned effectively nothing, skip Step 2.
  const trimmedNotes = notes.trim();
  if (!trimmedNotes || trimmedNotes.length < 20) {
    console.log(`    ${shardLabel}: Step 1 returned no content — skipping Step 2`);
    return [];
  }

  console.log(`    ${shardLabel}: Step 1 done (${trimmedNotes.length} chars prose) — running Step 2…`);

  // Step 2: STRUCTURE — convert prose to schema
  const structurePrompt = `REVIEW NOTES:\n${trimmedNotes}`;
  let parsed;
  try {
    parsed = await callModelStructure(STRUCTURE_SYSTEM, structurePrompt, shardLabel);
  } catch (err) {
    throw new Error(`Step 2 (structure) failed: ${err.message}`);
  }

  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

  // Drop findings whose file is outside the sub-batch file set
  const valid = findings.filter((f) => f.file && fileSet.has(f.file));
  const dropped = findings.length - valid.length;
  if (dropped > 0) {
    console.log(`    ${shardLabel}: dropped ${dropped} finding(s) with files outside sub-batch set`);
  }

  // Default missing reuse_target to null
  for (const f of valid) {
    if (!('reuse_target' in f)) f.reuse_target = null;
  }

  return valid;
}

// ---------------------------------------------------------------------------
// Step 1 system prompt (REASON — precision-guarded, not silencing)
// ---------------------------------------------------------------------------

// Built inline so the recall-oriented framing stays separate from the legacy
// structured-output template in prompt-templates.md (which is now used only for
// Phase 4 reconciliation reference). The REFUSE list and behavior-preservation
// constraint are kept intact; the suppressive "emit JSON only / never report"
// framing is removed.
const REASON_SYSTEM = `You are a code-simplification reviewer scanning a shard of TypeScript source files.

GOAL: List every concrete simplification you find. Finding many is good.

FINDINGS TO LOOK FOR (report all you can find):
- Dead / unused variables, imports, or branches that can be removed
- Redundant code: a variable used exactly once that could be inlined, a condition that is always true/false, a check that duplicates an earlier check
- Per-call allocations: a RegExp literal, Set, Map, or array reconstructed on every call that could be hoisted to module scope
- Duplicated blocks within a file: two or more code sections that do the same thing and could be collapsed to one
- One-use intermediates: a named variable that holds a value used immediately and nowhere else
- Cheaper equivalents: an O(n^2) pass with an O(n) form, repeated array scans that could be a single pass, array.find() where a Map lookup would do

PRECISION GUARD — report ONLY behavior-preserving simplifications:
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

// ---------------------------------------------------------------------------
// Per-shard runner
// ---------------------------------------------------------------------------

async function runShard(shard) {
  const startTime = new Date().toISOString();
  const result = {
    shardId: shard.id,
    package: shard.package,
    reasonModel: REASON_MODEL,
    structureModel: STRUCTURE_MODEL,
    files: [],
    tokenEstimate: 0,
    droppedCount: 0,
    timestamp: startTime,
    findings: [],
    errors: [],
    warnings: [],
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

  // 6. Token estimate (input only — Step 1 reserves ~14k for reasoning output)
  const systemChars = REASON_SYSTEM.length;
  const totalChars = systemChars + userPrompt.length;
  const tokenEstimate = Math.round(totalChars / 4);
  result.tokenEstimate = tokenEstimate;

  const budgetMsg = `  ${shard.id}: files=${files.length}, LOC=${actualLOC}, chars=${totalChars}, ~${tokenEstimate} tokens (input cap ${TOKEN_BUDGET})`;
  console.log(budgetMsg);

  if (DRY_RUN) {
    if (tokenEstimate > TOKEN_BUDGET) {
      result.warnings.push(`[WARN] Token estimate ${tokenEstimate} exceeds input cap ${TOKEN_BUDGET} — would sub-batch in live run`);
    }
    return result;
  }

  // 7. Sub-batch if over input cap, then run two-step per batch
  let allFindings = [];
  if (totalChars > CHARS_BUDGET) {
    result.warnings.push(`[WARN] ${shard.id}: prompt ${tokenEstimate} tokens > input cap ${TOKEN_BUDGET} — splitting into sub-batches`);
    console.warn(`[WARN] ${shard.id}: splitting into sub-batches`);

    // Split files into chunks that fit within the input cap
    const batches = [];
    let batch = [];
    let batchChars = systemChars + repoMapStr.length + 100; // header overhead
    for (const f of files) {
      const { assembled: fc } = assembleShardContent([f]);
      if (batchChars + fc.length > CHARS_BUDGET && batch.length > 0) {
        batches.push([...batch]);
        batch = [f];
        batchChars = systemChars + repoMapStr.length + fc.length + 100;
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
        const bFindings = await callModelTwoStep(REASON_SYSTEM, batchPrompt, batchLabel, batchFileSet);
        allFindings.push(...bFindings);
      } catch (err) {
        result.errors.push(`Sub-batch ${bi + 1} failed: ${err.message}`);
        console.error(`[ERROR] ${shard.id} sub-batch ${bi + 1}: ${err.message}`);
      }
    }
  } else {
    // Single two-step call
    const fileSet = new Set(files);
    try {
      allFindings = await callModelTwoStep(REASON_SYSTEM, userPrompt, shard.id, fileSet);
    } catch (err) {
      result.errors.push(`Model call failed: ${err.message}`);
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

  // 9. Default missing reuse_target to null (callModelTwoStep also does this; belt-and-suspenders)
  for (const f of validFindings) {
    if (!('reuse_target' in f)) f.reuse_target = null;
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

function generateReport(allResults, reconciliation) {
  const lines = [];
  lines.push('# Hermes Simplify Report');
  lines.push('');
  lines.push('> REPORT ONLY — nothing was applied/committed. This report is read-only output.');
  lines.push('> No source files were edited, no git operations were run, no GitHub API was called.');
  lines.push('');
  lines.push(`**Reason model (Step 1):** ${REASON_MODEL}`);
  lines.push(`**Structure model (Step 2 + Phase 4):** ${STRUCTURE_MODEL}`);
  lines.push(`**Endpoint:** ${ENDPOINT}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Mode:** ${DRY_RUN ? 'DRY RUN (no model calls)' : 'live'}`);
  lines.push('');

  // Summary table
  const totalFindings = allResults.reduce((n, r) => n + r.findings.length, 0);
  const totalSafeAuto = allResults.reduce(
    (n, r) => n + r.findings.filter((f) => f.severity === 'safe-auto').length,
    0,
  );
  const totalNeedsHuman = totalFindings - totalSafeAuto;
  const totalErrors = allResults.reduce((n, r) => n + r.errors.length, 0);

  lines.push('## Summary');
  lines.push('');
  lines.push(`| Shards run | Total findings | safe-auto | needs-human | Errors |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(`| ${allResults.length} | ${totalFindings} | ${totalSafeAuto} | ${totalNeedsHuman} | ${totalErrors} |`);
  lines.push('');

  // Per-shard sections
  lines.push('## Per-shard findings');
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

    const safeAuto = r.findings.filter((f) => f.severity === 'safe-auto');
    const needsHuman = r.findings.filter((f) => f.severity !== 'safe-auto');

    if (r.findings.length === 0 && r.errors.length === 0) {
      lines.push('_No findings._');
    } else {
      if (safeAuto.length > 0) {
        lines.push('#### safe-auto');
        lines.push('');
        for (const f of safeAuto) {
          lines.push(`**[${f.id ?? '?'}]** \`${f.file}\` lines ${f.lines ?? '?'}`);
          lines.push(`- type: ${f.type}, severity: ${severityLabel(f.severity)}`);
          lines.push(`- ${f.summary}`);
          lines.push(`- Suggestion: ${f.suggestion}`);
          if (f.reuse_target) lines.push(`- Reuse target: \`${f.reuse_target}\``);
          lines.push('');
        }
      }
      if (needsHuman.length > 0) {
        lines.push('#### needs-human');
        lines.push('');
        for (const f of needsHuman) {
          lines.push(`**[${f.id ?? '?'}]** \`${f.file}\` lines ${f.lines ?? '?'}`);
          lines.push(`- type: ${f.type}, severity: ${severityLabel(f.severity)}`);
          lines.push(`- ${f.summary}`);
          lines.push(`- Suggestion: ${f.suggestion}`);
          if (f.reuse_target) lines.push(`- Reuse target: \`${f.reuse_target}\``);
          lines.push('');
        }
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

async function main() {
  console.log(`[OK] hermes-run.mjs — report-only shard runner (two-step decoding)`);
  console.log(`     reason model   : ${REASON_MODEL}`);
  console.log(`     structure model: ${STRUCTURE_MODEL}`);
  console.log(`     endpoint : ${ENDPOINT}`);
  console.log(`     out dir  : ${OUT_DIR}`);
  console.log(`     mode     : ${DRY_RUN ? 'DRY RUN' : 'live'}${IS_SCOPING_MODE ? ' (scoping)' : ''}`);
  if (IS_SCOPING_MODE) {
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

  if (IS_SCOPING_MODE) {
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
            `  Models expected: reason=${REASON_MODEL}, structure=${STRUCTURE_MODEL}\n` +
            `  Error: ${err.message}\n` +
            `  Start Ollama with: ollama serve\n` +
            `  Pull models with:  ollama pull ${REASON_MODEL} && ollama pull ${STRUCTURE_MODEL}`,
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
  for (const shard of shards) {
    console.log(`--- Shard ${shard.id} (${shard.package}) ---`);
    const result = await runShard(shard);
    allResults.push(result);
    console.log(
      `    findings: ${result.findings.length} (${result.findings.filter((f) => f.severity === 'safe-auto').length} safe-auto), errors: ${result.errors.length}`,
    );
    console.log('');
  }

  // Phase 4 reconciliation (skip if only one shard or dry-run with --shard)
  let reconciliation = { clusters: [] };
  if (!ONLY_SHARD || allResults.length > 1) {
    console.log('--- Phase 4: Reconciliation ---');
    const fullMap = DRY_RUN ? null : getRepoMapSlice('_full_');
    reconciliation = await runReconciliation(allResults, fullMap);
    console.log('');
  }

  // Write artifacts
  const findingsArtifact = {
    generatedAt: new Date().toISOString(),
    reasonModel: REASON_MODEL,
    structureModel: STRUCTURE_MODEL,
    endpoint: ENDPOINT,
    dryRun: DRY_RUN,
    shards: allResults,
    reconciliation,
  };

  const findingsPath = join(OUT_DIR, 'findings.json');
  const reportPath = join(OUT_DIR, 'report.md');

  writeFileSync(findingsPath, JSON.stringify(findingsArtifact, null, 2), 'utf8');
  writeFileSync(reportPath, generateReport(allResults, reconciliation), 'utf8');

  console.log(`[OK] Artifacts written:`);
  console.log(`     ${findingsPath}`);
  console.log(`     ${reportPath}`);

  // Summary
  const totalFindings = allResults.reduce((n, r) => n + r.findings.length, 0);
  const totalErrors = allResults.reduce((n, r) => n + r.errors.length, 0);
  console.log('');
  console.log(`[OK] Done. ${allResults.length} shard(s), ${totalFindings} finding(s), ${totalErrors} error(s).`);
  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`[ERROR] Unhandled error: ${err.message}`);
  process.exit(1);
});
