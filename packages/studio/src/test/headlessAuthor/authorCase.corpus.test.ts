// Headless author, one case at a time (spec 107 US1). Reads the sibling
// ../keyboards corpus, so it runs under vitest.corpus.config.ts.
//
// KS_AUTHOR_CASE=<id> runs one case of the canonical harness file (quickstart 1).

import { beforeAll, describe, expect, it } from "vitest";
import { announceSc004Skip, sc004GatesEnabled } from "../sc004Harness.ts";
import type { AuthorRun } from "./caseTypes.ts";
import { loadCases } from "./loadCases.ts";
import { formatCaseLine } from "./runReport.ts";
import { runAuthorCase } from "./runAuthorCase.ts";

announceSc004Skip("headless author", (name) => it.skip(name, () => {}));

const ONE = process.env.KS_AUTHOR_CASE;

describe.skipIf(!sc004GatesEnabled)("headless author: stub walk (T017)", () => {
  let run: AuthorRun;
  beforeAll(async () => {
    const c = loadCases().find((x) => x.id === (ONE ?? "p1-whole-bafut-kbdus"));
    if (c === undefined) throw new Error(`no case ${ONE}`);
    run = await runAuthorCase(c);
    console.log(formatCaseLine(run));
  }, 180_000);

  it("walks every step the routing yields and completes", () => {
    expect(run.failure, JSON.stringify(run.failure)).toBeUndefined();
    expect(run.outcome).toBe("completed");
  });

  it("replay compiles to .kmx and .js", () => {
    expect(run.bundle?.artifacts.kmx.byteLength ?? 0).toBeGreaterThan(0);
    expect(run.bundle?.artifacts.js?.byteLength ?? 0).toBeGreaterThan(0);
  });

  it("reports every gate", () => {
    expect(run.gates.map((g) => g.gate)).toEqual(
      expect.arrayContaining(["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G8-start"]),
    );
  });

  it("leaves a decision record", () => {
    expect(run.record?.entries.length ?? 0).toBeGreaterThan(0);
  });
});
