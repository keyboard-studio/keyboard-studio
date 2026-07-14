// T023 [US3] — Fetch-guard (spec 036, FR-002, SC-005).
//
// The pin-and-regen flow must fail loudly on a corrupt/untrustworthy download:
// a placeholder or mismatched SHA-256 aborts fetch-glottolog.mjs with a non-zero
// exit and writes nothing. This test exercises the placeholder guard, which the
// script checks BEFORE any network access — so the test is hermetic (no fetch)
// and deterministic. The mismatch case shares the identical fail-loud path
// (verify-before-write), so this covers the guarantee without a live download.
//
// The script's GLOTTOLOG_VERSION_FILE / GLOTTOLOG_OUT_DIR env overrides exist
// only to let this test point at a throwaway pin + output dir.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const FETCH = join(ROOT, "scripts", "fetch-glottolog.mjs");

const tmp = mkdtempSync(join(tmpdir(), "glottolog-fetchguard-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Run fetch-glottolog.mjs against a throwaway pin + out dir. Returns exit info. */
function runFetch(pin: unknown, outDir: string): {
  status: number | null;
  stderr: string;
} {
  const versionFile = join(tmp, "version.json");
  writeFileSync(versionFile, JSON.stringify(pin), "utf8");
  try {
    execFileSync(process.execPath, [FETCH], {
      cwd: ROOT,
      stdio: "pipe",
      env: {
        ...process.env,
        GLOTTOLOG_VERSION_FILE: versionFile,
        GLOTTOLOG_OUT_DIR: outDir,
      },
    });
    return { status: 0, stderr: "" };
  } catch (err) {
    const e = err as { status?: number | null; stderr?: Buffer };
    return { status: e.status ?? 1, stderr: e.stderr?.toString() ?? "" };
  }
}

const basePin = {
  source: "https://example.invalid/glottolog-cldf",
  commit: "0000000000000000000000000000000000000000",
  urlTemplate: "https://example.invalid/{commit}/{path}",
  notice: "test",
};

describe("fetch-glottolog guard (T023, FR-002/SC-005)", () => {
  it("exits non-zero on a placeholder SHA-256, before any network access", () => {
    const outDir = join(tmp, "out-placeholder");
    const { status, stderr } = runFetch(
      { ...basePin, files: [{ path: "languages.csv", sha256: "PLACEHOLDER" }] },
      outDir,
    );
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/placeholder SHA-256/i);
  });

  it("writes nothing when the guard trips (no partial output)", () => {
    const outDir = join(tmp, "out-nowrite");
    runFetch(
      { ...basePin, files: [{ path: "languages.csv", sha256: "TODO" }] },
      outDir,
    );
    // The guard fires before mkdir/write, so the output dir must not exist (or
    // at minimum contain no vendored files / SOURCES.json).
    const wrote =
      existsSync(outDir) &&
      readdirSync(outDir).length > 0;
    expect(wrote).toBe(false);
  });

  it("rejects an empty files[] array", () => {
    const outDir = join(tmp, "out-empty");
    const { status, stderr } = runFetch({ ...basePin, files: [] }, outDir);
    expect(status).not.toBe(0);
    expect(stderr).toMatch(/non-empty array/i);
  });
});
