import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCases, loadPrSet, resolveRow } from "./loadCases.ts";

const row = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  profile: 1,
  lang: "bafut",
  base: "sil_cameroon_qwerty",
  english: "Bafut",
  autonym: "Bafut",
  code: "bfd",
  inputOrder: "postfix",
  outputForm: "base-plus-mark",
  backspace: "whole",
  backspaceOnDiagonal: false,
  sampleText: "x",
  ...extra,
});

function fixture(rows: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ha-cases-"));
  const p = join(dir, "cases.json");
  writeFileSync(p, JSON.stringify(rows));
  return p;
}

const deps = { groupOf: (b: string) => (b === "sil_cameroon_qwerty" ? "sil" : undefined) };

describe("loadCases", () => {
  it("loads harness-shape rows, mapping overwrite fields and defaults", () => {
    const path = fixture([
      row("a", { overwriteChar: "ŋ", overwriteKey: "K_X" }),
      row("b", { group: "g", track: "adapt", script: "Latn" }),
      row("c"),
    ]);
    const cases = loadCases(path, deps);
    expect(cases.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(cases[0]?.overrides).toEqual([{ kind: "overwrite", char: "ŋ", key: "K_X" }]);
    expect(cases[0]?.track).toBe("copy");
    expect(cases[0]?.group).toBe("sil");
    expect(cases[1]).toMatchObject({ group: "g", track: "adapt", script: "Latn", overrides: [] });
  });

  it("rejects an unknown field naming the field and case id", () => {
    expect(() => resolveRow(row("bad", { surprise: 1 }), deps)).toThrow(/bad.*surprise/);
  });

  it("fails when no group is given and the keyboard is not in the corpus", () => {
    expect(() => resolveRow(row("x", { base: "nope" }), deps)).toThrow(/not in the corpus/);
  });
});

describe("loadPrSet", () => {
  it("resolves the committed PR set against the canonical file", () => {
    const set = loadPrSet(undefined, undefined, { groupOf: () => "g" });
    expect(set.length).toBeGreaterThan(0);
    for (const { entry, case: c } of set) {
      expect(entry.caseId === undefined).toBe(entry.case !== undefined);
      expect(c.group.length).toBeGreaterThan(0);
    }
  });

  it("fails on an unknown caseId and on both or neither of caseId/case", () => {
    const canonical = fixture([row("known", { group: "g" })]);
    const mk = (e: unknown): string => fixture([e]);
    const base = { shape: ["simple"], reason: "r" };
    expect(() => loadPrSet(mk({ ...base, caseId: "nope" }), canonical)).toThrow(/unknown caseId/);
    expect(() =>
      loadPrSet(mk({ ...base, caseId: "known", case: row("k2", { group: "g" }) }), canonical),
    ).toThrow(/exactly one/);
    expect(() => loadPrSet(mk(base), canonical)).toThrow(/exactly one/);
    expect(loadPrSet(mk({ ...base, caseId: "known" }), canonical)[0]?.case.id).toBe("known");
  });
});
