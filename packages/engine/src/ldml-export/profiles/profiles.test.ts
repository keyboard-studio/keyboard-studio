// H7: the profile tables, the contract markdown and the pinned Keyman schema agree (spec 108).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Schemas } from "@keymanapp/common-types";
import { describe, expect, it } from "vitest";
import { PROFILE_46_ROWS } from "./profile46.js";
import { PROFILE_49_DELTAS } from "./profile49.js";
import { buildProfile, listLdmlProfiles, resolveLdmlProfile } from "./resolve.js";
import { PROFILE_46_META } from "./profile46.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACTS = resolve(HERE, "../../../../../specs/108-ldml-export/contracts");

function readContract(name: string): string[] {
  return readFileSync(resolve(CONTRACTS, name), "utf8").split(/\r?\n/);
}

/** Row ids from the first column of the main mapping tables ("| 3.15a | ..."). */
function rowIdsOf46(lines: string[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    const m = /^\| (\d+\.\d+[a-z]?) \|/.exec(line);
    if (m?.[1] !== undefined) ids.push(m[1]);
  }
  return ids;
}

/** The "Code table" section: code -> row ids listed in its last column. */
function codeTable(lines: string[]): Map<string, string> {
  const start = lines.findIndex((l) => l.startsWith("## Code table"));
  const out = new Map<string, string>();
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("**Gap keys") || line.startsWith("## ")) break;
    const m = /^\| `(KM_LINT_[A-Z0-9_]+)` \|.*\| ([^|]*) \|$/.exec(line);
    if (m?.[1] !== undefined && m[2] !== undefined) out.set(m[1], m[2]);
  }
  return out;
}

/** Row ids in the "Row deltas" table of the 49 contract. */
function rowIdsOf49(lines: string[]): string[] {
  const start = lines.findIndex((l) => l.startsWith("## Row deltas"));
  const ids: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("## ")) break;
    const m = /^\| (\d+\.\d+[a-z]?) /.exec(line);
    if (m?.[1] !== undefined) ids.push(m[1]);
  }
  return ids;
}

function findKey(node: unknown, key: string): unknown {
  if (node === null || typeof node !== "object") return undefined;
  const rec = node as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const hit = findKey(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

describe("LDML profiles (H7)", () => {
  const lines46 = readContract("ldml-mapping.md");
  const lines49 = readContract("ldml-mapping-49.md");
  const p46 = resolveLdmlProfile("46");
  const p49 = resolveLdmlProfile("49");

  describe("(a) tables equal the contract markdown, both ways", () => {
    it("profile 46 row ids", () => {
      const doc = rowIdsOf46(lines46);
      expect(new Set(doc).size).toBe(doc.length);
      expect([...p46.rows.keys()].sort()).toEqual([...doc].sort());
    });

    it("profile 46 codes against the code table", () => {
      const table = codeTable(lines46);
      const used = new Set<string>();
      for (const r of p46.rows.values()) if (r.code !== undefined) used.add(r.code);
      expect([...used].sort()).toEqual([...table.keys()].sort());
    });

    it("every plain row id in the code table carries that code", () => {
      for (const [code, rowsCell] of codeTable(lines46)) {
        for (const id of rowsCell.replace(/\([^)]*\)/g, "").match(/\d+\.\d+[a-z]?/g) ?? []) {
          // 6.1 is shared by several codes (its reason selects the code), so it is checked by set above.
          if (id === "6.1") continue;
          expect(p46.rows.get(id)?.code, `row ${id}`).toBe(code);
        }
      }
    });

    it("profile 49 deltas name exactly the rows of the 49 contract", () => {
      expect(PROFILE_49_DELTAS.map((d) => d.id).sort()).toEqual(rowIdsOf49(lines49).sort());
    });

    it("profile 49 equals 46 except for its delta rows", () => {
      const deltaIds = new Set(PROFILE_49_DELTAS.map((d) => d.id));
      expect([...p49.rows.keys()]).toEqual([...p46.rows.keys()]);
      for (const [id, r] of p46.rows) if (!deltaIds.has(id)) expect(p49.rows.get(id)).toEqual(r);
      expect(p49.rows.get("4.10")?.status).toBe("M");
      expect(p49.rows.get("4.10")?.code).toBeUndefined();
    });
  });

  describe("(b) FR-065: keymanCompilable equals the pinned schema's conformsTo enum", () => {
    it("holds for every profile", () => {
      const conformsTo = findKey(Schemas.default.ldmlKeyboard3, "conformsTo") as { enum: string[] } | undefined;
      expect(Array.isArray(conformsTo?.enum)).toBe(true);
      for (const p of listLdmlProfiles()) {
        expect(conformsTo?.enum.includes(p.id), `profile ${p.id}`).toBe(p.keymanCompilable);
      }
    });
  });

  describe("(c) default profile", () => {
    it("exactly one default, the newest compilable profile", () => {
      const all = listLdmlProfiles();
      const defaults = all.filter((p) => p.isDefault);
      expect(defaults).toHaveLength(1);
      const newestCompilable = all.filter((p) => p.keymanCompilable)[0];
      expect(defaults[0]?.id).toBe(newestCompilable?.id);
    });

    it("lists newest first", () => {
      const ids = listLdmlProfiles().map((p) => Number(p.id));
      expect(ids).toEqual([...ids].sort((a, b) => b - a));
    });
  });

  describe("(d) lift and Keyman codes", () => {
    it("every K row has a lift and expects no Keyman message", () => {
      const k = [...p46.rows.values()].filter((r) => r.status === "K");
      expect(k.map((r) => r.id)).toEqual(["4.10", "4.17", "5.15"]);
      for (const r of k) expect(r.lift, `row ${r.id}`).toBeTruthy();
      expect(p46.rows.get("4.10")?.keymanCodes).toEqual([]);
      expect(p46.rows.get("5.15")?.keymanCodes).toEqual([]);
    });

    it("rows named in the Version deltas table carry a lift", () => {
      for (const id of ["2.26", "3.7", "3.8", "3.9", "3.18", "4.10", "4.17", "5.13", "5.15"]) {
        expect(p46.rows.get(id)?.lift, `row ${id}`).toBeTruthy();
      }
    });
  });

  describe("profile fields and resolution", () => {
    it("states the fields the tasks name", () => {
      expect(p46).toMatchObject({
        id: "46",
        namespace: "https://schemas.unicode.org/cldr/46/keyboard3",
        tr35Revision: "CLDR 49, tr35-79 (2026-10-21)",
        keymanRelease: "19.0.240-alpha",
        keymanCompilable: true,
        isDefault: true,
        writeAttribution: false,
        deltas: [],
      });
      expect(p49).toMatchObject({
        id: "49",
        namespace: "https://schemas.unicode.org/cldr/49/keyboard3",
        keymanRelease: null,
        keymanCompilable: false,
        isDefault: false,
        writeAttribution: true,
      });
    });

    it("throws on an unknown id", () => {
      expect(() => resolveLdmlProfile("47")).toThrow(/Unknown LDML profile/);
    });

    it("throws on a delta naming a missing row", () => {
      expect(() => buildProfile(PROFILE_46_ROWS, PROFILE_46_META, [{ id: "9.99", status: "M" }])).toThrow(
        /missing row 9\.99/,
      );
    });

    it("returns deep-frozen profiles", () => {
      const row = p46.rows.get("4.10");
      expect(Object.isFrozen(p46)).toBe(true);
      expect(Object.isFrozen(p46.rows)).toBe(true);
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row?.keymanCodes)).toBe(true);
      expect(() => (p46.rows as Map<string, unknown>).set("x", {})).toThrow();
      expect(() => {
        (row as { form: string }).form = "changed";
      }).toThrow();
    });

    it("resolving 49 does not alter 46", () => {
      expect(p46.rows.get("4.10")?.status).toBe("K");
    });
  });
});
