// Spec 104 T014 — the studio copy-flow parity gate over the idiom fixtures.
//
// For every engine touch-id fixture, the gate run over (fixture sources,
// the same fixture sources as the "copy") must pass with an empty diff —
// including the SC-002 context probes (letter / space / digit seeds and
// deadkey pairs). A copy whose rules were mutated must fail the gate with
// a diff naming the changed key. Fixture files are read from the engine
// package's fixture tree (the same readFileSync-across-packages pattern as
// src/crash/engine-reachability.test.ts).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import { checkCopyTouchParity } from "./copyTouchParity.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(
  here,
  "../../../engine/src/pattern-apply/__fixtures__/touch-id",
);

const FIXTURES = [
  "sil_cameroon_qwerty",
  "hindi_flick",
  "gff_mesobe_fidelat",
  "fv_southern_carrier",
  "basic_kbdus",
  "deadkey_probe",
] as const;

function fixtureVfs(name: string, kmnOverride?: string): VirtualFS {
  const dir = resolve(fixtureRoot, name);
  const kmn =
    kmnOverride ?? readFileSync(resolve(dir, `${name}.kmn`), "utf8");
  const layout = readFileSync(resolve(dir, `${name}.keyman-touch-layout`), "utf8");
  return createVirtualFS([
    { path: `source/${name}.kmn`, content: kmn, isBinary: false },
    { path: `source/${name}.keyman-touch-layout`, content: layout, isBinary: false },
  ]);
}

describe("checkCopyTouchParity — idiom fixtures (FR-014 / SC-002)", () => {
  for (const name of FIXTURES) {
    it(`${name}: identical copy passes with an empty diff`, async () => {
      const result = await checkCopyTouchParity({
        sourceVfs: fixtureVfs(name),
        copyVfs: fixtureVfs(name),
        keyboardId: name,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.report.equal).toBe(true);
      expect(result.report.diffs).toEqual([]);
      expect(result.report.probesRun.table).toBeGreaterThan(0);
      expect(result.report.probesRun["seed:space"]).toBe(result.report.probesRun.table);
    }, 120_000);
  }

  it("deadkey_probe: deadkey-pair probes ran through the studio gate", async () => {
    const result = await checkCopyTouchParity({
      sourceVfs: fixtureVfs("deadkey_probe"),
      copyVfs: fixtureVfs("deadkey_probe"),
      keyboardId: "deadkey_probe",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.probesRun["deadkey-pair"]).toBeGreaterThan(0);
  }, 120_000);

  it("a copy missing the guarded mark's swallow rule fails, naming key + probe", async () => {
    const dir = resolve(fixtureRoot, "sil_cameroon_qwerty");
    const kmn = readFileSync(resolve(dir, "sil_cameroon_qwerty.kmn"), "utf8");
    const mutated = kmn
      .split("\n")
      .filter((line) => !(line.includes("T_0300") && line.includes("context")))
      .join("\n");
    const result = await checkCopyTouchParity({
      sourceVfs: fixtureVfs("sil_cameroon_qwerty"),
      copyVfs: fixtureVfs("sil_cameroon_qwerty", mutated),
      keyboardId: "sil_cameroon_qwerty",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.equal).toBe(false);
    expect(
      result.report.diffs.some(
        (d) => d.keyId === "T_0300" && (d.probe === "seed:space" || d.probe === "seed:digit"),
      ),
    ).toBe(true);
  }, 120_000);
});
