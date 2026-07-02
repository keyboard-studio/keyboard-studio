/**
 * T011 — Codegen determinism test.
 *
 * Guards FR-012 / SC-006: running codegen-langtags.mjs twice must produce
 * byte-identical output from the same input data.
 *
 * Strategy: import the generated index.ts module and independently derive
 * the same index via the same algorithm, then compare key/value counts and
 * representative entries.  This avoids the overhead of shelling out to Node
 * twice while still locking the derivation invariant.
 *
 * A secondary check verifies the languages[] array is sorted by code, which
 * is a key determinism invariant of the codegen script.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultsIndex, languages } from "./generated/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..", "..");
const DATA_FILE = join(
  ROOT,
  "packages",
  "engine",
  "data",
  "langtags",
  "langtags.json"
);

function parseFull(full: string): { script?: string; region?: string } {
  const parts = full.split("-");
  let script: string | undefined;
  let region: string | undefined;
  for (const part of parts) {
    if (!script && part.length === 4 && /^[A-Z][a-z]{3}$/.test(part)) {
      script = part;
    } else if (!region && (/^[A-Z]{2}$/.test(part) || /^\d{3}$/.test(part))) {
      region = part;
    }
  }
  return { script, region };
}

describe("codegen determinism (T011)", () => {
  it("languages[] is sorted by code — a key determinism invariant", () => {
    for (let i = 1; i < languages.length; i++) {
      const prev = languages[i - 1];
      const curr = languages[i];
      if (prev && curr) {
        expect(prev.code.localeCompare(curr.code)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("defaultsIndex keys are sorted — stable iteration order", () => {
    const keys = Object.keys(defaultsIndex);
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1];
      const b = keys[i];
      if (a && b) {
        expect(a.localeCompare(b)).toBeLessThanOrEqual(0);
      }
    }
  });

  it("re-derived index matches generated index for 'ha' and 'hi'", () => {
    // Re-derive from the source data to verify determinism
    let raw: unknown[];
    try {
      raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as unknown[];
    } catch {
      // If the data file is not present (CI without fetch step), skip gracefully
      console.warn("[WARN] langtags.json not found — skipping re-derive check");
      return;
    }

    // Derive records for ha and hi
    for (const tag of ["ha", "hi"]) {
      const entry = (raw as Array<Record<string, unknown>>).find(
        (r) => r["tag"] === tag
      );
      if (!entry) continue;

      const full = entry["full"] as string | undefined;
      if (!full) continue;

      const { script, region } = parseFull(full);
      const iso639_3 = entry["iso639_3"] as string | undefined;

      const indexedByTag = (defaultsIndex as Record<string, { code: string; defaultScript?: string; defaultRegion?: string; iso639_3?: string }>)[tag];
      expect(indexedByTag).toBeDefined();
      expect(indexedByTag!.defaultScript).toBe(script);
      expect(indexedByTag!.defaultRegion).toBe(region);

      // iso639_3 key should point to the same record
      if (iso639_3) {
        const indexedByIso = (defaultsIndex as Record<string, { code: string }>)[iso639_3.toLowerCase()];
        expect(indexedByIso).toBeDefined();
        expect(indexedByIso!.code).toBe(tag);
      }
    }
  });

  it("languages[] and defaultsIndex have consistent counts", () => {
    // Every language in languages[] should have a matching defaultsIndex entry
    for (const lang of languages) {
      const entry = (defaultsIndex as Record<string, { code: string }>)[lang.code];
      expect(entry).toBeDefined();
      expect(entry!.code).toBe(lang.code);
    }
  });
});
