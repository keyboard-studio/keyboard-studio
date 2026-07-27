/**
 * UCD fetch-guard test (spec 036 T029; FR-005; research D2).
 *
 * `codegen-ucd.mjs` SHA-256-verifies every pinned UCD file BEFORE deriving the
 * lookup: a PLACEHOLDER or mismatched hash must exit non-zero and write NOTHING
 * partial. Verified hermetically — a throwaway fake repo (copied script + dummy
 * UCD files + a tampered pin) is driven as a subprocess so the real committed
 * pin and generated lookup are never touched.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
