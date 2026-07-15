/**
 * Deterministic JSON writer for the facet index (FR-006; research "Determinism
 * recipe"). Identical input ⇒ byte-identical output — no timestamps, all object
 * keys recursively sorted, 2-space indent. Mirrors codegen-langtags.mjs's
 * write-only-if-changed discipline so a no-op rebuild produces no git diff.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Recursively sort object keys so serialization is order-independent. Arrays
 * keep their order (array order is meaningful and set by the caller); only
 * plain-object keys are sorted. Primitives pass through untouched.
 */
export function sortDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sortDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      out[key] = sortDeep(src[key]);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Serialize to the canonical form: recursively key-sorted, 2-space indent,
 * trailing newline. This is the exact byte sequence a determinism/`--check`
 * diff compares against (FR-006, SC-004).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2) + "\n";
}

/**
 * Write `value` to `path` in canonical form, but only if the bytes differ from
 * what is already on disk. Returns `true` when a write happened, `false` when
 * the file was already up to date. Creates parent directories as needed.
 */
export function writeStable(path: string, value: unknown): boolean {
  const content = stableStringify(value);
  let existing = "";
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    /* file does not exist yet — treat as changed */
  }
  if (existing === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return true;
}
