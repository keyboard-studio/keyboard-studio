import { describe, expect, it } from "vitest";
import {
  CAPABILITY_FORMATS,
  FORMAT_CAPABILITY_TABLE,
  IR_KIND_PATHS,
  NON_KMN_FRAGMENT_POLICY,
  UNHOMED_CONSTRUCTS,
} from "./format-capability";

describe("format-capability table (spec 116 FR-027 to FR-029b)", () => {
  it("has exactly one row per IR kind path (FR-028 completeness)", () => {
    const constructs = FORMAT_CAPABILITY_TABLE.map((r) => r.construct);
    expect(new Set(constructs).size).toBe(constructs.length);
    expect([...constructs].sort()).toEqual([...IR_KIND_PATHS].sort());
  });

  it("maps every construct on KMN export, citing the emitter (FR-028 KMN fidelity)", () => {
    for (const row of FORMAT_CAPABILITY_TABLE) {
      expect(row.export.kmn?.status, row.construct).toBe("mapped");
      expect(row.export.kmn?.ref, row.construct).toMatch(/codec\/emit\.ts#\w+$/);
    }
  });

  it("has an import and an export cell with a note for every format", () => {
    for (const row of FORMAT_CAPABILITY_TABLE) {
      for (const f of CAPABILITY_FORMATS) {
        for (const c of [row.import[f], row.export[f]]) {
          expect(c, `${row.construct} ${f}`).toBeDefined();
          expect(c?.note.trim(), `${row.construct} ${f}`).not.toBe("");
          if (c && c.status !== "n/a" && f !== "kmn" && f !== "ldml") {
            expect(c.ref, `${row.construct} ${f} needs a ref`).toBeTruthy();
          }
        }
      }
    }
  });

  it("treats legacy CLDR as input only", () => {
    for (const row of FORMAT_CAPABILITY_TABLE) {
      expect(row.export["cldr-legacy"]?.status, row.construct).toBe("n/a");
    }
  });

  it("never lets a non-KMN format import into RawKmnFragment (FR-029b)", () => {
    const row = FORMAT_CAPABILITY_TABLE.find((r) => r.construct === "RawKmnFragment");
    expect(row).toBeDefined();
    for (const f of CAPABILITY_FORMATS.filter((x) => x !== "kmn")) {
      expect(row?.import[f]).toEqual({ status: "n/a", note: NON_KMN_FRAGMENT_POLICY });
    }
  });

  it("lists the FR-029a constructs with no IR home, none of them KMN", () => {
    const names = UNHOMED_CONSTRUCTS.map((u) => u.construct).join("\n");
    for (const needle of ["<reorder>", "marker", "<transform>", "<actions>", "<terminators>", "levels beyond 4", "XKB groups", "SGCAPS", "LIGATURE"]) {
      expect(names).toContain(needle);
    }
    for (const u of UNHOMED_CONSTRUCTS) {
      expect(u.format).not.toBe("kmn");
      expect(u.note.trim()).not.toBe("");
    }
  });
});
