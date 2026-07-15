/**
 * Corpus scanner for the per-keyboard facet index (spec 036 T009).
 *
 * Enumerates every keyboard in a `keymanapp/keyboards` `release/` checkout and
 * reads the source bytes each classifier + the freshness plumbing need. Scope
 * is `release/**` only (research D6), and the keyboard `id` is the directory
 * name — matched by the shared corpus-scope helper below.
 *
 * SCOPE NOTE (#1126). The `release/<vendor>/<id>/[source/]<id>.kps` scope
 * regexes are shared with base-browser.ts (which matches the same path shape
 * against the GitHub *recursive-tree* API rather than a local checkout) via
 * `@keyboard-studio/engine`'s `corpus-scope` module, so the two consumers
 * cannot diverge again the way they did in #1125 (base-browser had not yet
 * been reconciled with the corpus's move to the `source/` layout).
 *
 * Modelled on utilities/supportability-scanner/scan.ts: a standalone tsx tool
 * that imports engine SOURCE directly (parseKmnHeaderStores) and walks the
 * sibling checkout. NOT a packages/* member.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseKmnHeaderStores } from "../../packages/engine/src/compiler/parseKmnHeaderStores.js";
import { matchKeyboardScopePath } from "../../packages/engine/src/base-browser/corpus-scope.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

/** Default sibling corpus root — the keymanapp/keyboards checkout. */
export const DEFAULT_CORPUS_ROOT = resolve(REPO_ROOT, "..", "keyboards");

/** Matches either scoped layout, returning the captured `<id>` or null. */
function matchKpsScope(relPath: string): string | null {
  return matchKeyboardScopePath(relPath)?.id ?? null;
}

/** Normalize Windows path separators to forward slashes for stable ids. */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** One discovered source file: its corpus-relative path and raw bytes. */
export interface ScannedSource {
  /** Path relative to the corpus root (forward slashes), e.g. `release/a/x/source/x.kmn`. */
  path: string;
  bytes: Buffer;
}

/** One keyboard in scope, with the source bytes its records derive from. */
export interface ScannedKeyboard {
  /** Keyboard id = the `<id>` directory name (unique within `release/`). */
  id: string;
  /** Corpus-relative path of the `.kps` package (always present — it defines scope). */
  kpsPath: string;
  /** Corpus-relative path of the primary `.kmn`, or null (e.g. LDML/model keyboards). */
  kmnPath: string | null;
  /** UTF-8 text of the primary `.kmn`, or null when there is none. */
  kmnText: string | null;
  /**
   * Every discovered source file (the `.kps`, the `.kmn` if present, and the
   * `.kmn` header-store siblings that exist), keyed by corpus-relative path.
   * This is the exact file set freshness hashes over (FR-005).
   */
  sources: ScannedSource[];
}

export interface ScanOptions {
  /** Corpus root (contains `release/`). Defaults to the sibling checkout. */
  corpusRoot?: string;
  /** Dev cap: scan only the first N keyboards (by sorted id). */
  limit?: number | null;
}

export interface ScanResult {
  corpusRoot: string;
  /** `release/**` — recorded into the manifest `corpusScope`. */
  corpusScope: string;
  /** Provenance string `keymanapp/keyboards@<sha>` (or `@unknown`). */
  corpusCommit: string;
  /** Keyboards in scope, sorted by id (determinism). */
  keyboards: ScannedKeyboard[];
}

/** Recursively collect corpus-relative paths of files matching `matchKeyboardScopePath`. */
function findScopedKps(corpusRoot: string): string[] {
  const releaseDir = join(corpusRoot, "release");
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".git" || e.name === "node_modules" || e.name === "build") continue;
        walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".kps")) {
        const relPath = toPosix(relative(corpusRoot, full));
        if (matchKpsScope(relPath) !== null) out.push(relPath);
      }
    }
  };
  walk(releaseDir);
  return out.sort();
}

/** Read a corpus-relative file's bytes, or null if it cannot be read. */
function readBytes(corpusRoot: string, relPath: string): Buffer | null {
  try {
    return readFileSync(join(corpusRoot, relPath));
  } catch {
    return null;
  }
}

/**
 * Resolve the git SHA of the corpus checkout for provenance (FR-005). Returns
 * `keymanapp/keyboards@<sha>` or `@unknown` when the SHA can't be determined.
 * Mirrors supportability-scanner's provenance helper.
 */
function resolveCorpusCommit(corpusRoot: string): string {
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: corpusRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha ? `keymanapp/keyboards@${sha}` : "keymanapp/keyboards@unknown";
  } catch {
    return "keymanapp/keyboards@unknown";
  }
}

/**
 * Build the source-file set for one keyboard: the `.kps`, the primary `.kmn`,
 * and the `.kmn` header-store siblings (touch layout, visual keyboard, etc.)
 * that actually exist on disk. Paths are corpus-relative and de-duplicated.
 */
function collectSources(
  corpusRoot: string,
  kpsPath: string,
  kmnPath: string | null,
  kmnText: string | null,
): ScannedSource[] {
  const sourceDir = toPosix(dirname(kpsPath)); // release/<vendor>/<id>/source
  const relPaths = new Set<string>([kpsPath]);
  if (kmnPath) relPaths.add(kmnPath);

  if (kmnText) {
    for (const store of parseKmnHeaderStores(kmnText)) {
      // Header-store paths are relative to source/. Resolve, re-relativize to
      // the corpus root, and keep only files inside the corpus that exist.
      const abs = resolve(corpusRoot, sourceDir, store.path);
      const rel = toPosix(relative(corpusRoot, abs));
      if (rel.startsWith("..")) continue; // outside the corpus — ignore
      if (existsSync(join(corpusRoot, rel))) relPaths.add(rel);
    }
  }

  return [...relPaths]
    .sort()
    .map((path) => {
      const bytes = readBytes(corpusRoot, path);
      return bytes === null ? null : { path, bytes };
    })
    .filter((s): s is ScannedSource => s !== null);
}

/**
 * Scan the corpus. Fails loud (throws) if the `release/` tree is absent — the
 * caller (cli.ts) reports it and exits non-zero (Edge Case: no corpus checkout).
 */
export function scanCorpus(opts: ScanOptions = {}): ScanResult {
  const corpusRoot = opts.corpusRoot ?? DEFAULT_CORPUS_ROOT;
  const releaseDir = join(corpusRoot, "release");
  if (!existsSync(releaseDir)) {
    throw new Error(
      `corpus release/ tree not found: ${toPosix(releaseDir)}\n` +
        "  Clone keymanapp/keyboards next to this repo (see docs/keyboard-index.md),\n" +
        "  or pass an explicit corpusRoot.",
    );
  }

  let kpsPaths = findScopedKps(corpusRoot);
  if (opts.limit != null) kpsPaths = kpsPaths.slice(0, opts.limit);

  const keyboards: ScannedKeyboard[] = kpsPaths.map((kpsPath) => {
    const id = matchKpsScope(kpsPath) ?? basename(kpsPath, ".kps");

    // Primary .kmn is the sibling source/<id>.kmn (may be absent for LDML/model keyboards).
    const kmnRel = toPosix(join(dirname(kpsPath), `${id}.kmn`));
    const kmnExists = existsSync(join(corpusRoot, kmnRel));
    const kmnPath = kmnExists ? kmnRel : null;
    const kmnText = kmnExists ? (readBytes(corpusRoot, kmnRel)?.toString("utf8") ?? null) : null;

    return {
      id,
      kpsPath,
      kmnPath,
      kmnText,
      sources: collectSources(corpusRoot, kpsPath, kmnPath, kmnText),
    };
  });

  // Sort by id for deterministic output (the scoped-kps walk is path-sorted,
  // which is vendor-then-id; re-sort purely by id to match the artifact order).
  keyboards.sort((a, b) => a.id.localeCompare(b.id));

  return {
    corpusRoot,
    corpusScope: "release/**",
    corpusCommit: resolveCorpusCommit(corpusRoot),
    keyboards,
  };
}
