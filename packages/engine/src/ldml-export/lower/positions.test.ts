import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import {
  FORM_ONLY_KEYS,
  FORM_ROWS,
  LDML_FORMS,
  SPACE_KEY_ID,
  isFrameKey,
  vkeyPosition,
  type LdmlForm,
} from "./positions.js";

function loadImplied(): Map<string, string[][]> {
  const entry = createRequire(import.meta.url).resolve("@keymanapp/developer-utils");
  let dir = dirname(entry);
  while (!dir.endsWith("developer-utils") && dirname(dir) !== dir) dir = dirname(dir);
  const xml = readFileSync(
    join(dir, "build", "src", "types", "import", "46", "scanCodes-implied.xml"),
    "utf8",
  ).replace(/<!--[\s\S]*?-->/g, "");
  const forms = new Map<string, string[][]>();
  for (const m of xml.matchAll(/<form id="([^"]+)">([\s\S]*?)<\/form>/g)) {
    const rows = [...(m[2] ?? "").matchAll(/codes="([^"]*)"/g)].map((r) =>
      (r[1] ?? "").trim().split(/\s+/).map((s) => s.toUpperCase()),
    );
    forms.set(m[1] ?? "", rows);
  }
  return forms;
}

describe("hardware position tables", () => {
  const implied = loadImplied();

  it.each(LDML_FORMS)("form %s matches scanCodes-implied.xml", (form) => {
    const expected = implied.get(form);
    expect(expected).toBeDefined();
    const actual = FORM_ROWS[form].map((row) => row.map((cell) => cell.scan));
    expect(actual.length).toBe(expected?.length);
    expect(actual.map((r) => r.length)).toEqual(expected?.map((r) => r.length));
    expect(actual).toEqual(expected);
  });

  it("gives every vkey a unique position within a form", () => {
    for (const form of LDML_FORMS) {
      const names = FORM_ROWS[form].flat().map((c) => c.vkey);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("reports row and column, zero-based", () => {
    expect(vkeyPosition("us", "K_BKQUOTE")).toEqual({ row: 0, column: 0 });
    expect(vkeyPosition("us", "K_BKSLASH")).toEqual({ row: 1, column: 12 });
    expect(vkeyPosition("iso", "K_BKSLASH")).toEqual({ row: 2, column: 11 });
    expect(vkeyPosition("us", "K_SPACE")).toEqual({ row: 4, column: 0 });
    expect(SPACE_KEY_ID).toBe("space");
  });

  it("places form-only keys only on their forms", () => {
    for (const [vkey, forms] of Object.entries(FORM_ONLY_KEYS)) {
      for (const form of LDML_FORMS as readonly LdmlForm[]) {
        expect(vkeyPosition(form, vkey) !== undefined).toBe(forms.includes(form));
      }
    }
    expect(vkeyPosition("us", "K_oE2")).toBeUndefined();
  });

  it("recognises frame keys and not layout keys", () => {
    for (const k of ["K_F1", "K_F24", "K_NPSTAR", "K_LEFT", "K_HOME", "K_PGDN", "K_INS", "K_DEL", "K_ENTER", "K_TAB", "K_ESC"]) {
      expect(isFrameKey(k)).toBe(true);
    }
    for (const k of ["K_A", "K_SPACE", "K_oE2", "K_F25", "K_BKQUOTE"]) {
      expect(isFrameKey(k)).toBe(false);
    }
  });
});
