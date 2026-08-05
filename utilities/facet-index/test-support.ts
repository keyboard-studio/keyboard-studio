/**
 * Shared test support for the facet-index suite (not a *.test.ts — imported by
 * the specs, never collected as a test itself).
 *
 * `classifiedDefsDir()` returns a temp facet-definition dir holding only the
 * shipped facets that have a registered classifier (the ids in
 * DEFAULT_CLASSIFIERS). It isolates 036's fixture-corpus builds from
 * classifier-less, forward-looking definition YAMLs that later specs
 * (037/038/039) land in `content/keyboard-facets/` ahead of their classifiers:
 * `buildIndex` fails loud (by design, T025/FR-008) on the first defined facet
 * it cannot classify, so a suite that built over the raw shipped dir would break
 * the moment a downstream spec adds a definition-only YAML. Scoping the tests to
 * the classified set keeps them hermetic and auto-tracking as 037 registers more
 * classifiers.
 */

import { cpSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_CLASSIFIERS } from "./build-index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const REAL_CONTENT_DIR = resolve(__dir, "..", "..", "content", "keyboard-facets");

let cached: string | undefined;

/** Temp defs dir with only the shipped, classifier-backed facet definitions. */
export function classifiedDefsDir(): string {
  if (cached) return cached;
  const dir = mkdtempSync(join(tmpdir(), "facet-defs-classified-"));
  const shipped = new Set(Object.keys(DEFAULT_CLASSIFIERS));
  for (const f of readdirSync(REAL_CONTENT_DIR).filter((n) => n.endsWith(".yaml"))) {
    // C1 (id === filename) is lint-enforced, so basename is the facet id.
    if (shipped.has(basename(f, ".yaml"))) cpSync(join(REAL_CONTENT_DIR, f), join(dir, f));
  }
  cached = dir;
  return dir;
}
