// Copy output is unchanged by the mid-group insert anchors added for Open
// (spec 111 FR-030). Copy reaches the splice two ways: `carveViaSplice`
// (delete-only edits, calls spliceKmn directly) and, for the same carve
// expressed as an IR diff, `projectKmnText` -> `diffIrToKmnEdits`. Neither can
// produce an insert for a carve (no node is new), so the new anchors are never
// used on Copy and the output is exactly the old delete-only result.

import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { carveViaSplice } from "./carveViaSplice.js";
import { diffIrToKmnEdits, projectKmnText } from "./spliceKmn.js";

const KMN = [
  "c corpus-like keyboard",
  "store(&NAME) 'Tiny'",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "c vowels",
  "+ [K_A] > 'a'   c keep spacing",
  "+ [K_B] > 'b'",
  "",
  "+ [K_C] > 'c'",
  "+ [K_D] > 'd'",
  "",
].join("\n");

describe("Copy carve through both splice callers", () => {
  const startIr = () => parse(KMN, "tiny").ir;
  const ids = (vkeys: string[]) =>
    startIr().groups.flatMap((g) => g.rules)
      .filter((r) => r.context.some((c) => c.kind === "vkey" && vkeys.includes(c.name)))
      .map((r) => r.nodeId);

  // What the old (insert-at-group-end) code produced: a delete-only splice.
  const expected = KMN.replace("+ [K_B] > 'b'\n", "").replace("+ [K_C] > 'c'\n", "");

  it("carveViaSplice output is the delete-only text, byte for byte", () => {
    const r = carveViaSplice(KMN, startIr(), new Set(ids(["K_B", "K_C"])));
    expect(r).toEqual({ ok: true, text: expected });
  });

  it("the same carve as an IR diff makes no insert edit and projects to the same text", () => {
    const start = startIr();
    const drop = new Set(ids(["K_B", "K_C"]));
    const next = structuredClone(start);
    for (const g of next.groups) g.rules = g.rules.filter((r) => !drop.has(r.nodeId));
    expect(diffIrToKmnEdits(start, next).filter((e) => e.kind === "insert")).toEqual([]);
    expect(projectKmnText(KMN, start, next)).toEqual({ ok: true, text: expected });
  });
});
