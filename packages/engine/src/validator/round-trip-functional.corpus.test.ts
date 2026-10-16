/**
 * Functional I2 corpus regression tests (#882).
 *
 * Runs the real harness (kmcmplib compile + KeymanWeb simulate) over two
 * keyboards from the sibling keymanapp/keyboards checkout:
 *
 *   akan — clean baseline: the throwaway prototype proved 400/400 corpus
 *          inputs identical, so functional I2 must produce NO findings.
 *   nias — the proof case for functional over structural I2: the structural
 *          proxy flags nias as round-trip-divergent, but the emitted
 *          keyboard is functionally identical (prototype: 180/180). I2 must
 *          NOT produce a divergence error for it.
 *
 * When `../keyboards` is absent (CI without the corpus, sparse sandboxes)
 * every test is skipped — the same convention as codec/roundtrip.test.ts.
 * Run locally with the corpus vitest config:
 *   pnpm --filter @keyboard-studio/engine exec vitest run --config vitest.corpus.config.ts round-trip-functional.corpus
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import {
  checkRoundTrip,
  ROUND_TRIP_DIVERGENCE_CODE,
  ROUND_TRIP_UNAVAILABLE_CODE,
} from "./layer-a-prime.js";
import type { RoundTripDeps, RoundTripSourceFile } from "./layer-a-prime.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");

/** Extensions read as binary into the compile VFS (icons, fonts, images). */
const BINARY_EXTS = new Set([".ico", ".ttf", ".otf", ".woff", ".woff2", ".png", ".jpg", ".jpeg", ".gif", ".bmp"]);

function loadSourceDir(sourceDir: string): RoundTripSourceFile[] {
  return readdirSync(sourceDir).map((name) => {
    const full = join(sourceDir, name);
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    const isBinary = BINARY_EXTS.has(ext);
    return {
      path: `source/${name}`,
      content: isBinary ? new Uint8Array(readFileSync(full)) : readFileSync(full, "utf8"),
      isBinary,
    };
  });
}

async function runFunctionalI2(shard: string, keyboardId: string) {
  const sourceDir = join(RELEASE_ROOT, shard, keyboardId, "source");
  const kmnPath = join(sourceDir, `${keyboardId}.kmn`);
  const kmnText = readFileSync(kmnPath, "utf8");
  const { ir } = parse(kmnText, keyboardId);
  const deps: RoundTripDeps = {
    originalKmn: kmnText,
    emittedKmn: emit(ir),
    keyboardId,
    compileFn: compile,
    simulateFn: simulate,
    sourceFiles: loadSourceDir(sourceDir),
  };
  return checkRoundTrip(ir, deps);
}

const akanDir = join(RELEASE_ROOT, "a", "akan", "source");
const niasDir = join(RELEASE_ROOT, "n", "nias", "source");

describe("functional I2 — corpus regression (akan / nias)", () => {
  it.skipIf(!existsSync(join(akanDir, "akan.kmn")))(
    "akan: functionally equivalent — no findings at all",
    async () => {
      const findings = await runFunctionalI2("a", "akan");
      expect(findings).toEqual([]);
    },
    300_000,
  );

  it.skipIf(!existsSync(join(niasDir, "nias.kmn")))(
    "nias: structural divergence is emit noise — NO functional divergence error",
    async () => {
      const findings = await runFunctionalI2("n", "nias");
      const codes = findings.map((f) => f.code);
      expect(codes).not.toContain(ROUND_TRIP_DIVERGENCE_CODE);
      expect(codes).not.toContain(ROUND_TRIP_UNAVAILABLE_CODE);
    },
    300_000,
  );
});
