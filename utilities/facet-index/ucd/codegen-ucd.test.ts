/**
 * UCD fetch-guard test (spec 070 T029; FR-005; research D2).
 *
 * `codegen-ucd.mjs` SHA-256-verifies every pinned UCD file BEFORE deriving the
 * lookup: a PLACEHOLDER or mismatched hash must exit non-zero and write NOTHING
 * partial. Verified hermetically — a throwaway fake repo (copied script + dummy
 * UCD files + a tampered pin) is driven as a subprocess so the real committed
 * pin and generated lookup are never touched.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const REAL_MJS = resolve(__dir, "codegen-ucd.mjs");

const UCD_FILES = ["Scripts.txt", "ScriptExtensions.txt", "PropertyValueAliases.txt", "Blocks.txt"];

/**
 * Stand up a fake repo skeleton mirroring codegen-ucd.mjs's path expectations
 * (REPO_ROOT = <mjs>/../../..), with dummy UCD files and a pin whose hashes are
 * supplied by `hashFor`. Returns the fake repo root + the generated-file path.
 */
function fakeRepo(hashFor: (file: string) => string): { root: string; mjs: string; generated: string } {
  const root = mkdtempSync(join(tmpdir(), "ucd-guard-"));
  const ucdDir = join(root, "lib", "ucd");
  const scriptDir = join(root, "scripts");
  const mjsDir = join(root, "utilities", "facet-index", "ucd");
  mkdirSync(ucdDir, { recursive: true });
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(mjsDir, { recursive: true });

  for (const f of UCD_FILES) writeFileSync(join(ucdDir, f), `dummy ${f}\n`, "utf8");

  const pin = {
    unicodeVersion: "17.0.0",
    files: UCD_FILES.map((f) => ({ path: `lib/ucd/${f}`, sha256: hashFor(f) })),
  };
  writeFileSync(join(scriptDir, "ucd-version.json"), JSON.stringify(pin, null, 2) + "\n", "utf8");

  const mjs = join(mjsDir, "codegen-ucd.mjs");
  cpSync(REAL_MJS, mjs);
  return { root, mjs, generated: join(mjsDir, "generated", "scriptLookup.ts") };
}

describe("codegen-ucd.mjs fetch guard (FR-005)", () => {
  it("a PLACEHOLDER hash exits non-zero and writes no lookup", () => {
    const { mjs, generated } = fakeRepo(() => "PLACEHOLDER");
    const res = spawnSync(process.execPath, [mjs], { encoding: "utf8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/placeholder/i);
    expect(existsSync(generated)).toBe(false);
  });

  it("a mismatched hash exits non-zero and writes no lookup", () => {
    const { mjs, generated } = fakeRepo(() => "0".repeat(64));
    const res = spawnSync(process.execPath, [mjs], { encoding: "utf8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/mismatch/i);
    expect(existsSync(generated)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SOURCES.json merge-by-file-key (regression: this exact behavior once
// silently deleted every other tool's pinned entry — see codegen-ucd.mjs's
// SOURCES.json comment).
// ---------------------------------------------------------------------------

/** Minimal but well-formed UCD content — passes the full derivation, not just the hash guard. */
const REALISTIC_UCD: Record<string, string> = {
  "Scripts.txt": "0041..005A    ; Latin # Basic Latin\n",
  "ScriptExtensions.txt": "0041          ; Latn\n",
  "PropertyValueAliases.txt": "sc ; Zyyy ; Common\nsc ; Latn ; Latin\n",
  "Blocks.txt": "0000..007F; Basic Latin\n",
  "DerivedAge.txt": "0041..005A    ; 1.1\n",
};

/**
 * Stand up a fake repo whose UCD files are realistic enough for a full,
 * successful codegen-ucd.mjs run (not just the hash-verify step exercised
 * above) — needed to reach the SOURCES.json merge logic at all.
 */
function fakeFullRepo(): { root: string; mjs: string; sourcesFile: string } {
  const root = mkdtempSync(join(tmpdir(), "ucd-merge-"));
  const ucdDir = join(root, "lib", "ucd");
  const scriptDir = join(root, "scripts");
  const mjsDir = join(root, "utilities", "facet-index", "ucd");
  mkdirSync(ucdDir, { recursive: true });
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(mjsDir, { recursive: true });

  const files = Object.entries(REALISTIC_UCD).map(([name, content]) => {
    writeFileSync(join(ucdDir, name), content, "utf8");
    return { path: `lib/ucd/${name}`, sha256: createHash("sha256").update(content).digest("hex") };
  });
  const pin = { unicodeVersion: "17.0.0", files };
  writeFileSync(join(scriptDir, "ucd-version.json"), JSON.stringify(pin, null, 2) + "\n", "utf8");

  const mjs = join(mjsDir, "codegen-ucd.mjs");
  cpSync(REAL_MJS, mjs);
  return { root, mjs, sourcesFile: join(root, "utilities", "facet-index", "data", "SOURCES.json") };
}

describe("codegen-ucd.mjs SOURCES.json merge", () => {
  it("first run (no existing SOURCES.json) writes only the UCD entries", () => {
    const { mjs, sourcesFile } = fakeFullRepo();
    const res = spawnSync(process.execPath, [mjs], { encoding: "utf8" });
    expect(res.status).toBe(0);
    const sources = JSON.parse(readFileSync(sourcesFile, "utf8"));
    expect(sources.files.map((f: { file: string }) => f.file)).toEqual([
      "lib/ucd/Blocks.txt",
      "lib/ucd/DerivedAge.txt",
      "lib/ucd/PropertyValueAliases.txt",
      "lib/ucd/ScriptExtensions.txt",
      "lib/ucd/Scripts.txt",
    ]);
  });

  it("preserves an unrelated tool's entry and keeps deterministic sort order", () => {
    const { mjs, sourcesFile } = fakeFullRepo();
    mkdirSync(dirname(sourcesFile), { recursive: true });
    writeFileSync(
      sourcesFile,
      JSON.stringify({
        unicodeVersion: "16.0.0",
        files: [{ file: "packages/contracts/data/some-other-tool.json", sha256: "a".repeat(64) }],
      }),
      "utf8",
    );
    const res = spawnSync(process.execPath, [mjs], { encoding: "utf8" });
    expect(res.status).toBe(0);
    const sources = JSON.parse(readFileSync(sourcesFile, "utf8"));
    const names = sources.files.map((f: { file: string }) => f.file);
    expect(names).toContain("packages/contracts/data/some-other-tool.json");
    expect(names).toEqual([...names].sort());
    expect(sources.unicodeVersion).toBe("17.0.0"); // this run's pin, not the stale seeded value
  });

  it("an existing-but-unparsable SOURCES.json fails loud instead of silently discarding it", () => {
    const { mjs, sourcesFile } = fakeFullRepo();
    mkdirSync(dirname(sourcesFile), { recursive: true });
    writeFileSync(sourcesFile, "{ not valid json", "utf8");
    const res = spawnSync(process.execPath, [mjs], { encoding: "utf8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/SOURCES\.json exists but failed to parse/i);
  });
});
