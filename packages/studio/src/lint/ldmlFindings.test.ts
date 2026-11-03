// buildLdmlFindings (spec 108 FR-010 to FR-019): severity, location, message ids, never error,
// and which classified items produce a finding at all.

import { describe, it, expect } from "vitest";
import type { CompatibilityItem, LdmlClassification, LdmlCode } from "@keyboard-studio/engine";
import { buildLdmlFindings, isLdmlLintCode, ldmlCodeTitle } from "./ldmlFindings.ts";
import { LDML_CODE_COPY, LDML_CODE_PARAMS, LDML_CODE_SLUG } from "./ldmlMessages.ts";

const ALL_CODES = Object.keys(LDML_CODE_COPY) as LdmlCode[];

function item(over: Partial<CompatibilityItem> & { code: LdmlCode | null }): CompatibilityItem {
  const code = over.code;
  return {
    siteKey: `${code ?? ""}|1.1|group:main#0`,
    rowId: "1.1",
    status: code === null ? "M" : "A",
    severity: code === null ? null : "warning",
    nodeKey: "group:main#0",
    line: 12,
    owner: "group main",
    construct: "test construct",
    consequence: "test",
    params: {},
    side: "hardware",
    ...over,
  };
}

function classification(items: CompatibilityItem[]): LdmlClassification {
  return {
    profileId: "46",
    items,
    counts: { M: 0, A: 0, N: 0, K: 0 },
    baseLayout: { id: "us", label: "US", source: "en-US" },
    ansiOnly: false,
    touchPresent: false,
  };
}

describe("buildLdmlFindings", () => {
  it("follows the item severity: a rule is a warning, anything else a hint", () => {
    const out = buildLdmlFindings(
      classification([
        item({ code: "KM_LINT_LDML_OPTION_STATE", severity: "warning" }),
        item({ code: "KM_LINT_LDML_TOUCH_PRESENTATION", severity: "hint", siteKey: "b" }),
        item({ code: "KM_LINT_LDML_KEYMAN_GAP", severity: "hint", siteKey: "c" }),
      ]),
      undefined,
      "kb",
    );
    expect(out.map((f) => f.severity)).toEqual(["warning", "hint", "hint"]);
    expect(out.every((f) => f.layer === "C")).toBe(true);
  });

  it("sets location exactly when the item has a line", () => {
    const out = buildLdmlFindings(
      classification([
        item({ code: "KM_LINT_LDML_CALL", line: 7 }),
        item({ code: "KM_LINT_LDML_CALL", line: null, siteKey: "nolines" }),
      ]),
      undefined,
      "my_kb",
    );
    expect(out[0]?.location).toEqual({ file: "source/my_kb.kmn", line: 7 });
    expect(out[1]).not.toHaveProperty("location");
  });

  it("names the owner in the message when there is no line (FR-017)", () => {
    const [f] = buildLdmlFindings(
      classification([item({ code: "KM_LINT_LDML_CALL", line: null, owner: "group digits" })]),
      undefined,
      "kb",
    );
    expect(f?.message).toContain("group digits");
    const [withLine] = buildLdmlFindings(
      classification([item({ code: "KM_LINT_LDML_CALL", line: 3, owner: "group digits" })]),
      undefined,
      "kb",
    );
    expect(withLine?.message).not.toContain("group digits");
  });

  it("fills message placeholders from the item params, and renders a missing one empty", () => {
    const [full] = buildLdmlFindings(
      classification([item({ code: "KM_LINT_LDML_FORM_KEY_MISSING", params: { vkey: "K_OE2", form: "ANSI" } })]),
      undefined,
      "kb",
    );
    expect(full?.message).toContain("K_OE2");
    expect(full?.message).toContain("ANSI");
    const [partial] = buildLdmlFindings(
      classification([item({ code: "KM_LINT_LDML_FORM_KEY_MISSING", params: { vkey: "K_OE2" } })]),
      undefined,
      "kb",
    );
    expect(partial?.message).not.toMatch(/[{}]/);
  });

  it("every declared placeholder appears in its message, and no message has an undeclared one", () => {
    for (const code of ALL_CODES) {
      const declared = new Set(LDML_CODE_PARAMS[code] ?? []);
      const used = new Set([...(LDML_CODE_COPY[code].message.message ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
      expect([...used].sort(), code).toEqual([...declared].sort());
    }
  });

  it("produces nothing for an M item without a code, and a hint for an M item with one", () => {
    const out = buildLdmlFindings(
      classification([
        item({ code: null, status: "M", severity: null }),
        item({ code: "KM_LINT_LDML_BEEP", status: "M", severity: "hint", siteKey: "beep" }),
      ]),
      undefined,
      "kb",
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("KM_LINT_LDML_BEEP");
    expect(out[0]?.severity).toBe("hint");
  });

  it.each(ALL_CODES)("%s uses lint.ldml.<codeSlug>.* ids and is never an error", (code) => {
    const slug = LDML_CODE_SLUG[code];
    const copy = LDML_CODE_COPY[code];
    expect(copy.title.id).toBe(`lint.ldml.${slug}.title`);
    expect(copy.message.id).toBe(`lint.ldml.${slug}.message`);
    expect(copy.hint.id).toBe(`lint.ldml.${slug}.hint`);
    expect(isLdmlLintCode(code)).toBe(true);

    for (const severity of ["warning", "hint"] as const) {
      const [f] = buildLdmlFindings(classification([item({ code, severity })]), undefined, "kb");
      expect(f?.severity).not.toBe("error");
      expect(f?.code).toBe(code);
      expect(f?.message).not.toBe("");
      expect(f?.hint).not.toBe("");
    }
    expect(ldmlCodeTitle(code)).not.toBe(code);
  });

  it("derives every slug from its code in lower camel case", () => {
    for (const code of ALL_CODES) {
      const expected = code
        .replace("KM_LINT_LDML_", "")
        .toLowerCase()
        .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      expect(LDML_CODE_SLUG[code]).toBe(expected);
    }
  });
});
