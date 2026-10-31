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
import { ownerOf } from "./decisionPointKnownGaps.fixture.ts";
import { announceSc004Skip, sc004GatesEnabled } from "./sc004Harness.ts";

announceSc004Skip("decision-point fixtures", (name) => it.skip(name, () => {}));

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "..", "..", DECISION_POINT_FIXTURE_DIR);

const GATES: readonly GateId[] = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G8-start"];

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
            // The replay walks no touch step, so walk-only rows do not apply here.
            const owner = ownerOf(b.base, point, gate, { walked: false });
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

/**
 * Per story, the diff lines (`+ added` / `- removed`) the fixture may have
 * against the walk zip; every diff line must match one pattern of the latest
 * story. Exact match at US1. US2 only adds what the marks series generates:
 * the guard group, its stores and hop, and the whole-stack backspace rules
 * (E1: the walk zip had neither). US3: the walk recorded base-plus-mark, so
 * the caron deadkey leaves the parallel store pair for the self-indexing
 * shape (km-keyman ruling R5).
 */
const US2_DIFFS: RegExp[] = [
  /^\+ $/,
  /^\+ group\(generated_marks_guard\)$/,
  /^\+ store\(generated_marks_allowed_[0-9A-F_]+\) /,
  /^\+ .*\(marks series\)$/,
  /^\+ match > use\(generated_marks_guard\) c generated: marks-series guard hop$/,
];
const US3_DIFFS: RegExp[] = [
  ...US2_DIFFS,
  /^\+ dk\(3000\) \+ any\(dk_3000_bases\) > index\(dk_3000_bases, 2\) U\+030C$/,
  /^- dk\(3000\) \+ any\(dk_3000_bases\) > index\(dk_3000_output, 2\)$/,
  /^- store\(dk_3000_output\) 'ǎǍěĚ'$/,
];
const EXPECTED_DIFFS = {
  US1: [] as RegExp[],
  US2: US2_DIFFS,
  US3: US3_DIFFS,
  // US4: the starting rules the session's assignments shadow are dropped
  // (they never fired; the walk's 14 unreachable-rule hints).
  US4: [
    ...US3_DIFFS,
    /^- \+ \[K_(5|BKQUOTE|COLON|LBRKT|QUOTE|RBRKT|X)\] > U\+[0-9A-F]{4}$/,
  ],
};
const CURRENT_STORY = "US4" satisfies keyof typeof EXPECTED_DIFFS;

// The zip may carry the walk harness's `zzq` placeholder assignments; both sides
// are reduced to the same placeholder before comparing.
const normalize = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/zzq[0-9A-Fa-f]+/g, "zzq");

/**
 * Lines only the walk has (`- `) and lines only the fixture has (`+ `), as
 * multisets: a story that inserts rules shifts every later line, and a
 * positional diff would report all of them.
 */
function lineDiff(walk: string, fixture: string): string[] {
  const count = (lines: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const a = count(walk.split("\n"));
  const b = count(fixture.split("\n"));
  const diff: string[] = [];
  for (const [l, n] of a) for (let i = (b.get(l) ?? 0); i < n; i++) diff.push(`- ${l}`);
  for (const [l, n] of b) for (let i = (a.get(l) ?? 0); i < n; i++) diff.push(`+ ${l}`);
  return diff.sort();
}

describe.skipIf(!sc004GatesEnabled)("decision-point fidelity", () => {
  it("p1-whole-bafut-kbdus at tolerance gives the walk zip's .kmn", async () => {
    const b = DECISION_POINT_BASES.find((x) => x.profile === "p1-whole-bafut-kbdus")!;
    const fx = await buildDecisionPointFixture({ ...b, point: "tolerance", decisions: loadDecisions(b, "tolerance") });
    const walk = readFileSync(resolve(fixtureRoot, "records", "kbdus.walk.kmn"), "utf-8");
    const built = readVfsText(fx.vfs, `source/${fx.keyboardId}.kmn`);
    expect(built, "projected .kmn").toBeDefined();

    const diff = lineDiff(normalize(walk), normalize(built!));
    const allowed = EXPECTED_DIFFS[CURRENT_STORY];
    const unexpected = diff.filter((line) => !allowed.some((re) => re.test(line)));
    expect(unexpected, `fixture differs from the walk zip:\n${unexpected.slice(0, 40).join("\n")}`).toEqual([]);
  }, 120_000);
});
