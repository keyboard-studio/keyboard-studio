// T022 [US3] — Codegen determinism (spec 036, FR-003, SC-005).
//
// Guards the "no-code-change guarantee": running codegen-glottolog.mjs against
// the vendored source produces byte-identical output every time. Because the
// script rewrites the generated index only on content change, a fresh codegen
// over the same input must reproduce the committed file exactly — so a second
// run reports "Unchanged" and the bytes match run-to-run.
//
// Mirrors packages/engine/src/langtags/codegen-determinism.test.ts. Requires the
// vendored CSVs (gitignored, produced by `pnpm run fetch-glottolog`); on a
// checkout without them (e.g. CI without the fetch step) the test skips.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..", "..");
const DATA_DIR = join(ROOT, "packages", "glottolog", "data", "glottolog");
const LANGUAGES_CSV = join(DATA_DIR, "languages.csv");
const VALUES_CSV = join(DATA_DIR, "values.csv");
const CODEGEN = join(ROOT, "scripts", "codegen-glottolog.mjs");
const OUT_FILE = join(__dirname, "generated", "index.ts");

const dataPresent = existsSync(LANGUAGES_CSV) && existsSync(VALUES_CSV);

// Snapshot the committed generated index so a codegen run during the test never
// leaves the working tree modified, even if it were to (it must not) differ.
const original = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : null;

afterAll(() => {
  if (original !== null && readFileSync(OUT_FILE, "utf8") !== original) {
    writeFileSync(OUT_FILE, original, "utf8");
  }
});

function runCodegen(): void {
  execFileSync(process.execPath, [CODEGEN], { cwd: ROOT, stdio: "pipe" });
}

describe("codegen determinism (T022, FR-003/SC-005)", () => {
  // Codegen parses a ~21 MB values.csv per run, so a double run needs a generous
  // timeout well above vitest's 5 s default.
  it.skipIf(!dataPresent)(
    "codegen twice over the vendored source ⇒ byte-identical generated/index.ts",
    () => {
      runCodegen();
      const first = readFileSync(OUT_FILE, "utf8");
      runCodegen();
      const second = readFileSync(OUT_FILE, "utf8");
      expect(second).toBe(first);
    },
    60_000,
  );

  it.skipIf(!dataPresent)(
    "a fresh codegen reproduces the committed index exactly (no-code-change guarantee)",
    () => {
      // The committed file IS the codegen output; regenerating must not change it.
      runCodegen();
      expect(readFileSync(OUT_FILE, "utf8")).toBe(original);
    },
    60_000,
  );
});
