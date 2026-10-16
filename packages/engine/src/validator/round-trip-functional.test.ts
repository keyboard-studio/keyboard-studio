/**
 * Functional I2 end-to-end tests (#882) — the REAL harness: kmcmplib
 * compile() + KeymanWeb simulate(), no fakes.
 *
 * The unit branches (severity contract, modifier bridge, VFS assembly) are
 * covered with fakes in layer-a-prime.test.ts; this file proves the wiring
 * works against the actual compiler and JS runtime, the same environment
 * as simulator/simulate.test.ts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { importKeyboard } from "../codec/import-keyboard.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import {
  checkRoundTrip,
  ROUND_TRIP_DIVERGENCE_CODE,
} from "./layer-a-prime.js";
import type { RoundTripDeps } from "./layer-a-prime.js";

const here = dirname(fileURLToPath(import.meta.url));
const kmnText = readFileSync(
  resolve(here, "__fixtures__", "roundtrip_simple.kmn"),
  "utf8",
);

function realDeps(originalKmn: string, emittedKmn: string): RoundTripDeps {
  return {
    originalKmn,
    emittedKmn,
    keyboardId: "roundtrip_simple",
    compileFn: compile,
    simulateFn: simulate,
  };
}

describe("functional I2 — real compile + simulate harness", () => {
  it("parse → emit round-trip is functionally equivalent (no findings)", async () => {
    const { ir } = parse(kmnText, "roundtrip_simple");
    const emitted = emit(ir);
    const findings = await checkRoundTrip(ir, realDeps(kmnText, emitted));
    expect(findings).toEqual([]);
  }, 60_000);

  it("a behaviour-changing emit is a blocking divergence error", async () => {
    const { ir } = parse(kmnText, "roundtrip_simple");
    // Hand-break the emitted text: K_A now outputs 'z' (U+007A) instead of
    // 'a' (U+0061 — the emitter's canonical form for the fixture's 'a').
    const brokenEmitted = emit(ir).replace("U+0061", "U+007A");
    expect(brokenEmitted).not.toBe(emit(ir));
    const findings = await checkRoundTrip(ir, realDeps(kmnText, brokenEmitted));
    const errors = findings.filter((f) => f.code === ROUND_TRIP_DIVERGENCE_CODE);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.severity).toBe("error");
    expect(errors[0]?.message).toContain("[K_A]");
  }, 60_000);

  it("importKeyboard with the harness reports no RoundTripDivergence for a clean import", async () => {
    const vfs = createVirtualFS();
    const { report, findings } = await importKeyboard(kmnText, "roundtrip_simple", vfs, {
      compileFn: compile,
      simulateFn: simulate,
    });
    expect(report.status).not.toBe("RoundTripDivergence");
    expect(findings.some((f) => f.code === ROUND_TRIP_DIVERGENCE_CODE)).toBe(false);
  }, 60_000);
});
