/**
 * Tap-parity differ tests — spec 104, T014 (FR-014, SC-002).
 *
 * The copy parity gate's engine half: for every idiom fixture, a keyboard
 * compiled from the same sources twice (source vs "copy") must show an
 * EMPTY behaviour diff across all probe classes — table, the SC-002
 * seeded contexts (letter / space / digit), and deadkey pairs. Mutated
 * copies must produce diffs naming the changed key and probe class, which
 * is what makes the empty-diff assertions meaningful.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
import { compile } from "../compiler/index.js";
import { TouchTapSession } from "./tapSimulation.js";
import { diffTapBehaviour } from "./tapParity.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../pattern-apply/__fixtures__/touch-id");

const FIXTURES = [
  "sil_cameroon_qwerty",
  "hindi_flick",
  "gff_mesobe_fidelat",
  "fv_southern_carrier",
  "basic_kbdus",
  "deadkey_probe",
] as const;

function fixtureSources(name: string): { kmn: string; layout: string } {
  const dir = resolve(fixtureRoot, name);
  return {
    kmn: readFileSync(resolve(dir, `${name}.kmn`), "utf8"),
    layout: readFileSync(resolve(dir, `${name}.keyman-touch-layout`), "utf8"),
  };
}

async function compileSources(
  name: string,
  kmn: string,
  layout: string,
): Promise<CompileResult> {
  const vfs = createVirtualFS([
    { path: `source/${name}.kmn`, content: kmn, isBinary: false },
    { path: `source/${name}.keyman-touch-layout`, content: layout, isBinary: false },
  ]);
  const compiled = await compile(vfs, name);
  expect(
    compiled.success,
    `fixture ${name} must compile: ${JSON.stringify(compiled.diagnostics)}`,
  ).toBe(true);
  return compiled;
}

async function compileFixture(name: string): Promise<CompileResult> {
  const { kmn, layout } = fixtureSources(name);
  return compileSources(name, kmn, layout);
}

describe("tapParity — self-copy parity over the idiom fixtures (SC-002)", () => {
  for (const name of FIXTURES) {
    it(`${name}: source vs identical copy diff is empty, probes non-vacuous`, async () => {
      const source = await compileFixture(name);
      const copy = await compileFixture(name);
      const report = diffTapBehaviour(source, copy);
      expect(report.diffs).toEqual([]);
      expect(report.equal).toBe(true);
      expect(report.probesRun.table).toBeGreaterThan(0);
      expect(report.probesRun["seed:letter"]).toBe(report.probesRun.table);
      expect(report.probesRun["seed:space"]).toBe(report.probesRun.table);
      expect(report.probesRun["seed:digit"]).toBe(report.probesRun.table);
    }, 120_000);
  }

  it("deadkey_probe: the deadkey-pair probe class actually runs", async () => {
    const source = await compileFixture("deadkey_probe");
    const copy = await compileFixture("deadkey_probe");
    const report = diffTapBehaviour(source, copy);
    expect(report.equal).toBe(true);
    expect(report.probesRun["deadkey-pair"]).toBeGreaterThan(0);
  }, 120_000);
});

describe("tapPair — deadkey state carries across the pair", () => {
  it("deadkey + letter composes; deadkey + space emits the accent", async () => {
    const session = TouchTapSession.fromCompiled(await compileFixture("deadkey_probe"));
    expect(session.tapPair("default", "T_ACUTE", "K_A").buffer).toBe("á");
    expect(session.tapPair("default", "T_ACUTE", "K_E").buffer).toBe("é");
    expect(session.tapPair("default", "T_ACUTE", "K_SPACE").buffer).toBe("´");
    // The arming tap alone leaves the deadkey pending and types nothing.
    const arm = session.tap("default", "T_ACUTE");
    expect(arm.buffer).toBe("");
    expect(arm.pendingDeadkeys.length).toBeGreaterThan(0);
  }, 120_000);
});

describe("tapParity — mutations are caught and named", () => {
  it("dropping the diablock swallow rule diffs the guarded mark under space/digit seeds", async () => {
    const { kmn, layout } = fixtureSources("sil_cameroon_qwerty");
    const mutated = kmn
      .split("\n")
      .filter((line) => !(line.includes("T_0300") && line.includes("context")))
      .join("\n");
    expect(mutated).not.toBe(kmn);
    const source = await compileSources("sil_cameroon_qwerty", kmn, layout);
    const copy = await compileSources("sil_cameroon_qwerty", mutated, layout);
    const report = diffTapBehaviour(source, copy);
    expect(report.equal).toBe(false);
    const markDiffs = report.diffs.filter((d) => d.keyId === "T_0300");
    expect(markDiffs.length).toBeGreaterThan(0);
    expect(markDiffs.some((d) => d.probe === "seed:space" || d.probe === "seed:digit")).toBe(
      true,
    );
  }, 120_000);

  it("dropping the ruled U_ rule revives the decode — diff names the key", async () => {
    const { kmn, layout } = fixtureSources("hindi_flick");
    const mutated = kmn
      .split("\n")
      .filter((line) => !line.includes("+ [U_0905] >"))
      .join("\n");
    expect(mutated).not.toBe(kmn);
    const source = await compileSources("hindi_flick", kmn, layout);
    const copy = await compileSources("hindi_flick", mutated, layout);
    const report = diffTapBehaviour(source, copy);
    expect(report.equal).toBe(false);
    expect(report.diffs.some((d) => d.keyId === "U_0905" && d.probe === "table")).toBe(true);
  }, 120_000);

  it("breaking a deadkey composition diffs the pair probe", async () => {
    const { kmn, layout } = fixtureSources("deadkey_probe");
    const mutated = kmn.replace("deadkey(1) + [K_A] > 'á'", "deadkey(1) + [K_A] > 'à'");
    expect(mutated).not.toBe(kmn);
    const source = await compileSources("deadkey_probe", kmn, layout);
    const copy = await compileSources("deadkey_probe", mutated, layout);
    const report = diffTapBehaviour(source, copy);
    expect(report.equal).toBe(false);
    expect(
      report.diffs.some(
        (d) => d.probe === "deadkey-pair" && d.deadkeyKeyId === "T_ACUTE" && d.keyId === "K_A",
      ),
    ).toBe(true);
  }, 120_000);

  it("a key present only on the copy is a diff, not a skip", async () => {
    const { kmn, layout } = fixtureSources("deadkey_probe");
    const biggerLayout = layout.replace(
      '{"id":"K_SPACE","text":" "}',
      '{"id":"K_SPACE","text":" "},{"id":"T_EXTRA","text":"x"}',
    );
    expect(biggerLayout).not.toBe(layout);
    const source = await compileSources("deadkey_probe", kmn, layout);
    const copy = await compileSources("deadkey_probe", kmn, biggerLayout);
    const report = diffTapBehaviour(source, copy);
    expect(report.equal).toBe(false);
    expect(report.diffs.some((d) => d.keyId === "T_EXTRA" && d.source === "<absent>")).toBe(true);
  }, 120_000);
});
