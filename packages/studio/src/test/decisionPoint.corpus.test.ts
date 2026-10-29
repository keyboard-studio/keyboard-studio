// Decision-point fixtures (spec 106 US1, SC-006): each base keyboard x the walk
// record's decisions cut at each point, run through the real download path
// (buildOutputBundle), compiled, simulated and gate-checked.
//
// Gaps that later stories close are `it.fails` with the owning story in the
// test name. The story that closes one removes its row from KNOWN_GAPS, which
// flips the assertion to a plain pass: that flip is the story's proof.
//
// Reads the sibling ../keyboards corpus, so it runs under vitest.corpus.config.ts.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SimKeyInput } from "@keyboard-studio/contracts";
import type { DecisionSet } from "../decisions/decisionTypes.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { buildDecisionPointFixture, type DecisionPointFixture } from "./decisionPointFixture.ts";
import {
  DECISION_POINTS,
  DECISION_POINT_BASES,
  DECISION_POINT_FIXTURE_DIR,
  fixtureRelPath,
  type DecisionPoint,
  type DecisionPointBase,
} from "./decisionPointBases.ts";
import type { GateId } from "./consistencyGates.ts";
import { announceSc004Skip, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("decision-point fixtures", (name) => it.skip(name, () => {}));

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR);

const GATES: readonly GateId[] = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G8-start"];

/** What each gap is waiting on. G6 is walk-only, so it has no row here. */
type Owner = "US2" | "US3" | "US4" | "US5" | "US6" | "#2361" | "engine T_-key bug";

const AFTER_MARKS: readonly DecisionPoint[] = ["marks", "carve", "assignments", "caps", "tolerance"];
const AFTER_ASSIGNMENTS: readonly DecisionPoint[] = ["assignments", "caps", "tolerance"];

interface Gap {
  gate: GateId;
  owner: Owner;
  bases: readonly string[];
  points: readonly DecisionPoint[];
}

const ALL_BASES = DECISION_POINT_BASES.map((b) => b.base);

// Measured, not assumed: a gate that already passes on a fixture has no row,
// even where the spec names a story for it (G2 on basic_kbdus / basic_kbdfr and
// G5 everywhere pass today, because those fixtures do not yet contain the shape
// the story fixes).
const KNOWN_GAPS: readonly Gap[] = [
  // E1: the marks guard never reaches the download.
  { gate: "G3", owner: "US2", bases: ALL_BASES, points: AFTER_MARKS },
  // E2: base-plus-mark output form: the S-02 deadkey store is precomposed.
  { gate: "G4", owner: "US3", bases: ["basic_kbdus"], points: AFTER_ASSIGNMENTS },
  // E3: starting rules shadowed by assignments survive carve. Unreachable
  // hints come from assignment shadowing, so G1 starts at `assignments`.
  { gate: "G1", owner: "US4", bases: ["basic_kbdus", "basic_kbdfr"], points: AFTER_ASSIGNMENTS },
  // E5: contexts are not tolerant (camqwerty has one gap).
  { gate: "G2", owner: "US6", bases: ["sil_cameroon_qwerty"], points: ["tolerance"] },
  // Not E5: the tolerance analysis itself throws on camazerty, because it hands
  // a rule keyed to a touch-only T_ key to the desktop simulator. The live
  // station calls the same analysis, so this is an engine defect of its own.
  { gate: "G2", owner: "engine T_-key bug", bases: ["sil_cameroon_azerty"], points: ["tolerance"] },
  // nul/beep inside starting stores is deferred to keymanapp/keyboards#4181.
  { gate: "G8-start", owner: "#2361", bases: ["sil_cameroon_qwerty", "sil_cameroon_azerty"], points: DECISION_POINTS },
];

function ownerOf(base: string, point: DecisionPoint, gate: GateId): Owner | undefined {
  return KNOWN_GAPS.find((g) => g.gate === gate && g.bases.includes(base) && g.points.includes(point))?.owner;
}

function loadDecisions(b: DecisionPointBase, point: DecisionPoint): DecisionSet {
  return JSON.parse(readFileSync(resolve(fixtureRoot, fixtureRelPath(b, point)), "utf-8")) as DecisionSet;
}

const key = (vkey: string): SimKeyInput => ({ vkey, modifiers: [], caps: false });

describe.skipIf(!sc004GatesEnabled)("decision-point fixtures", () => {
  for (const b of DECISION_POINT_BASES) {
    describe(`${b.base} (${b.profile})`, () => {
      for (const point of DECISION_POINTS) {
        describe(`at ${point}`, () => {
          let fx: DecisionPointFixture;
          beforeAll(async () => {
            fx = await buildDecisionPointFixture({ ...b, point, decisions: loadDecisions(b, point) });
          }, 120_000);

          it("compiles to an installable keyboard that types", () => {
            expect(fx.compiled.artifacts.map((a) => a.filename.split(".").pop())).toEqual(
              expect.arrayContaining(["kmx", "js"]),
            );
            expect(fx.simulate([key("K_SPACE")]).finalOutput).toBe(" ");
          });

          for (const gate of GATES) {
            const owner = ownerOf(b.base, point, gate);
            const check = (): void => {
              const r = fx.gates.find((g) => g.gate === gate);
              expect(r, `no ${gate} result`).toBeDefined();
              expect(r!.pass, `${gate}: ${r!.detail.join("; ")}`).toBe(true);
            };
            if (owner === undefined) it(`${gate} holds`, check);
            else it.fails(`${gate} fails until ${owner} lands`, check);
          }
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// T014: the fixtures reproduce what the UI produces.
//
// p1-whole-bafut-kbdus at its last decision point must give the same
// source/bafut.kmn as the walk zip it was recorded from. Anything beyond the
// listed expected diffs fails, and the diff is printed.
// ---------------------------------------------------------------------------

/** Per story, the lines the fixture is allowed to differ from the walk zip by. Exact match at US1. */
const EXPECTED_DIFFS: Record<string, string[]> = { US1: [] };

// The zip may carry the walk harness's `zzq` placeholder assignments; both sides
// are reduced to the same placeholder before comparing.
const normalize = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/zzq[0-9A-Fa-f]+/g, "zzq");

function lineDiff(walk: string, fixture: string): string[] {
  const a = walk.split("\n");
  const b = fixture.split("\n");
  const diff: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (a[i] !== undefined) diff.push(`- ${i + 1}: ${a[i]}`);
    if (b[i] !== undefined) diff.push(`+ ${i + 1}: ${b[i]}`);
  }
  return diff;
}

describe.skipIf(!sc004GatesEnabled)("decision-point fidelity", () => {
  it("p1-whole-bafut-kbdus at tolerance gives the walk zip's .kmn", async () => {
    const b = DECISION_POINT_BASES.find((x) => x.profile === "p1-whole-bafut-kbdus")!;
    const fx = await buildDecisionPointFixture({ ...b, point: "tolerance", decisions: loadDecisions(b, "tolerance") });
    const walk = readFileSync(resolve(fixtureRoot, "records", "kbdus.walk.kmn"), "utf-8");
    const built = readVfsText(fx.vfs, `source/${fx.keyboardId}.kmn`);
    expect(built, "projected .kmn").toBeDefined();

    const diff = lineDiff(normalize(walk), normalize(built!));
    expect(diff, `fixture differs from the walk zip:\n${diff.slice(0, 40).join("\n")}`).toEqual(EXPECTED_DIFFS.US1);
  }, 120_000);
});
