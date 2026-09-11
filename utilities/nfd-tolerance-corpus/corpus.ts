// Corpus discovery: which `.kmn` files this harness runs over.
//
// Scope comes from the shared `release/<vendor>/<id>/[source/]<id>.kps`
// matcher in `@keyboard-studio/engine`'s `corpus-scope` module — the same one
// utilities/facet-index and base-browser use — so the three tools cannot
// disagree about what "a corpus keyboard" is. The `.kmn` is then the `.kps`'s
// sibling; a package with no `.kmn` beside its `.kps` is skipped.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dedupeKpsPathsById,
  matchKeyboardScopePath,
} from "../../packages/engine/src/base-browser/corpus-scope.js";

import type { KmnInput } from "./analyze.js";

/** A discovered keyboard, before its source is read. */
export interface KeyboardSource {
  id: string;
  /** Corpus-relative path of the `.kmn`. */
  path: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

/**
 * Default corpus root — the sibling `keymanapp/keyboards` checkout, exactly
 * as CLAUDE.md and utilities/facet-index resolve it. Overridable with
 * `--corpus-root`; never hardcoded to an absolute path.
 */
export const DEFAULT_CORPUS_ROOT = resolve(REPO_ROOT, "..", "keyboards");

function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Recursively collect `.kps` paths under `release/`, corpus-root-relative.
 * Near-identical to utilities/facet-index/scan.ts's walker; the part worth
 * sharing (the scope regexes) already is, via `corpus-scope`, and the two
 * tools stay independent rather than importing each other.
 */
function findScopedKps(corpusRoot: string): string[] {
  const releaseDir = join(corpusRoot, "release");
  if (!existsSync(releaseDir)) return [];

  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".kps")) {
        const rel = toPosix(relative(corpusRoot, full));
        if (matchKeyboardScopePath(rel) !== null) found.push(rel);
      }
    }
  };
  walk(releaseDir);
  return found.sort();
}

/**
 * Every corpus keyboard that has a `.kmn`, sorted by id so a run is
 * reproducible and `--limit` always takes the same prefix. Sources are not
 * read here — the caller filters first, then reads only what it will analyse.
 */
export function discoverKeyboards(corpusRoot: string): KeyboardSource[] {
  const found: KeyboardSource[] = [];
  for (const kpsPath of dedupeKpsPathsById(findScopedKps(corpusRoot))) {
    const id = matchKeyboardScopePath(kpsPath)!.id;
    const path = toPosix(join(dirname(kpsPath), `${id}.kmn`));
    if (!existsSync(join(corpusRoot, path))) continue;
    found.push({ id, path });
  }
  return found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Read one discovered keyboard's `.kmn` into the shape `analyzeKeyboard` takes. */
export function readKeyboard(corpusRoot: string, source: KeyboardSource): KmnInput {
  return { ...source, text: readFileSync(join(corpusRoot, source.path), "utf8") };
}

/**
 * `git rev-parse HEAD` of the corpus checkout, or `"unknown"` if it is not a
 * git tree.
 *
 * A third, narrower variant of the corpus-provenance resolvers in
 * utilities/facet-index/scan.ts and utilities/supportability-scanner/scan.ts.
 * Those two also read `git remote get-url origin` and return the composite
 * `<org>/<repo>@<sha>` label, because their outputs are committed artifacts
 * (docs/keyboard-facet-index.json) where which corpus fork was scanned is
 * part of the record. This run report is not committed, and `corpusCommit` is
 * typed as the bare SHA (see types.ts) so the value drops straight into a
 * `git show` — so the remote lookup is deliberately omitted rather than
 * inherited. Not a shared helper for the same reason as the walker above: the
 * three tools stay independent.
 */
export function resolveCorpusCommit(corpusRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: corpusRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}
