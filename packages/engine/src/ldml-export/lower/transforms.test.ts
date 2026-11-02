import { describe, expect, it } from "vitest";
import { lowerRules } from "../__fixtures__/helpers.js";
import { loadLdml, type LdmlKeystroke } from "../__testing__/ldmlInterpreter.js";
import { MAX_TRANSFORMS_PER_RULE } from "../classify/ruleElements.js";
import { escapeFrom, escapeOutput, escapeTo } from "./transforms.js";

const k = (vkey: string, modifiers: readonly string[] = []): LdmlKeystroke => ({ vkey, modifiers, caps: false });
const transformsOf = (xml: string): string[] => [...xml.matchAll(/<transform [^>]*\/>/g)].map((m) => m[0]);

describe("escaping by side (row 3.1, 3.2)", () => {
  it("escapes regex metacharacters in from only", () => {
    expect(escapeFrom("a.b(c)[d]{e}|*+?^$\\")).toBe("a\\.b\\(c\\)\\[d\\]\\{e\\}\\|\\*\\+\\?\\^\\$\\\\");
    expect(escapeTo("a.b(c)[d]{e}|*+?^")).toBe("a.b(c)[d]{e}|*+?^");
  });

  it("escapes only backslash and dollar in to", () => {
    expect(escapeTo("\\$x")).toBe("\\\\\\$x");
  });

  it("does not escape a hyphen in from (an escaped hyphen is an invalid regular expression)", () => {
    expect(escapeFrom("a-b")).toBe("a-b");
  });

  it("writes marks, controls, format characters, non-space whitespace and SMP characters as \\u{...}", () => {
    expect(escapeTo("é")).toBe("e\\u{301}");
    expect(escapeTo("‍")).toBe("\\u{200D}");
    expect(escapeTo(" ")).toBe("\\u{A0}");
    expect(escapeTo("\u{1F600}")).toBe("\\u{1F600}");
    expect(escapeFrom("\t")).toBe("\\u{9}");
    expect(escapeOutput("\u{10400}")).toBe("\\u{10400}");
  });

  it("uses NFD for literals and keeps a plain space", () => {
    expect(escapeTo("é ")).toBe("e\\u{301} ");
  });

  it("never emits the 4-digit \\uXXXX form", () => {
    for (const s of ["́", "​", " ", "\u{1F600}", "­"]) {
      expect(escapeTo(s)).not.toMatch(/\\u[0-9A-Fa-f]{4}(?![0-9A-Fa-f}])/);
      expect(escapeTo(s)).toMatch(/\\u\{/);
    }
  });

  it("escapes a backslash in a set item or key output as \\u{5C}, and a space in a set", () => {
    expect(escapeOutput("\\")).toBe("\\u{5C}");
    expect(escapeOutput("a b", true)).toBe("a\\u{20}b");
  });
});

describe("rendered transforms", () => {
  it("gives every group a KMN group comment and every transform a source line comment", () => {
    const { xml } = lowerRules("'a' + [K_E] > 'x'\n+ [K_BKQUOTE] > dk(g)\ndk(g) + [K_E] > 'y'\n'x' + [K_BKSP] > 'z'\n");
    expect(xml).toContain("<!-- KMN group: main -->");
    const lines = xml.split("\n");
    lines.forEach((l, i) => {
      if (l.trim().startsWith("<transform ")) expect(lines[i - 1]).toMatch(/<!-- (source\/t\.kmn:\d+|exporter: trigger catch-all for \S+)/);
    });
  });

  it("a deadkey's first transform carries the original name", () => {
    const { xml } = lowerRules("+ [K_BKQUOTE] > dk(grave)\ndk(grave) + [K_E] > 'e'\n");
    expect(xml).toMatch(/marker \S+ = deadkey grave/);
  });

  it("anchors a nul context with a leading ^", () => {
    const { xml } = lowerRules("nul + [K_A] > 'x'\n");
    expect(xml).toMatch(/from="\^\\m\{trigger[^}]+\}"/);
  });

  it("renders an index() over equal-length stores as one $[1:set] mapping (row 3.7)", () => {
    const { xml } = lowerRules("any(vowels) + [K_COMMA] > index(accented, 1)\n");
    expect(xml).toMatch(/from="\(\$\[vowels\]\),"/);
    expect(xml).toContain('to="$[1:accented]"');
    expect(xml).toMatch(/<set id="vowels"/);
    const ldml = loadLdml(xml);
    expect(ldml.type([k("K_E")]).length).toBeGreaterThan(0);
  });

  it("expands several index() references into literal transforms (row 3.8), each commented", () => {
    const { xml } = lowerRules("any(vowels) + [K_COMMA] > 'q' index(accented, 1)\n");
    const ts = transformsOf(xml);
    expect(ts).toHaveLength(5);
    expect(xml.match(/source\/t\.kmn:\d+/g)?.length).toBe(5);
    expect(ts.some((t) => t.includes('to="qe\\u{301}"') || t.includes('to="qé"'))).toBe(true);
  });

  it("renders context(n) as a capture and $n", () => {
    const { xml } = lowerRules("'a' 'b' + [K_E] > context(2) 'x'\n");
    expect(xml).toMatch(/from="a\(b\)\\m\{[^}]+\}" to="\$1x"/);
  });

  it("renders a negated class with single NFD code points (row 3.10)", () => {
    const { xml } = lowerRules("notany(out) + [K_E] > 'q'\n");
    expect(xml).toMatch(/from="\[\^xy\]\\m\{[^}]+\}"/);
  });

  it("an empty-to transform deletes (rows 3.15b and 3.16)", () => {
    const { xml } = lowerRules("'a' + [K_E] > nul\n'b' + [K_E] > beep\n");
    expect(xml).toMatch(/<transform from="a[^"]*"\/>/);
    expect(xml).toMatch(/<transform from="b[^"]*"\/>/);
  });

  it("orders more specific rules ahead of the more general (FR-022)", () => {
    const { xml } = lowerRules("'a' + [K_E] > 'long'\n'x' 'a' + [K_E] > 'longer'\n+ [K_E] > 'e'\n");
    const ts = transformsOf(xml);
    const iLonger = ts.findIndex((t) => t.includes('to="longer"'));
    const iLong = ts.findIndex((t) => t.includes('to="long"'));
    expect(iLonger).toBeGreaterThanOrEqual(0);
    expect(iLonger).toBeLessThan(iLong);
  });

  it("renders a backspace rule as a backspace transform (row 2.18)", () => {
    const { xml } = lowerRules("'x' + [K_BKSP] > 'y'\n");
    expect(xml).toContain('<transforms type="backspace">');
    expect(xml).toMatch(/<transform from="x" to="y"\/>/);
  });

  it("does not emit a rule the classifier made N", () => {
    const { xml, detail } = lowerRules("+ [K_F1] > 'x'\n");
    expect(detail.plans.every((p) => !p.lower)).toBe(true);
    expect(xml).not.toContain("<transforms");
  });

  it("drops a rule whose option guard is false at the default value", () => {
    const { xml } = lowerRules("if(opt = '1') 'a' + [K_E] > 'x'\n'a' + [K_E] > 'y'\n", undefined, "store(opt) '0'\n");
    expect(xml).toContain('to="y"');
    expect(xml).not.toContain('to="x"');
  });

  it("keeps the cap on a rule's expansion", () => {
    expect(MAX_TRANSFORMS_PER_RULE).toBe(1000);
  });
});
