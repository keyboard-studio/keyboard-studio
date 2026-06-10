import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";

const MINIMAL_KMN = `c keyboard header
store(&VERSION) '10.0'
store(&NAME) 'Test Keyboard'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2024 SIL'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys

c This comment precedes the space rule
+ [K_SPACE] > U+0020
+ [K_A] > U+0061
+ [SHIFT K_A] > U+0041
`;

describe("parse", () => {
  it("produces a KeyboardIR with correct origin", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.origin).toBe("imported");
  });

  it("extracts header fields", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.header.keyboardId).toBe("test");
    expect(ir.header.name).toBe("Test Keyboard");
    expect(ir.header.version).toBe("1.0");
    expect(ir.header.copyright).toBe("(c) 2024 SIL");
    expect(ir.header.targets).toEqual(["any"]);
  });

  it("creates one group named 'main' with usingKeys", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.groups.length).toBe(1);
    expect(ir.groups[0]?.name).toBe("main");
    expect(ir.groups[0]?.usingKeys).toBe(true);
  });

  it("creates 3 rules", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.groups[0]?.rules.length).toBe(3);
  });

  it("first rule has vkey context [K_SPACE] and char output U+0020", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const rule = ir.groups[0]?.rules[0];
    expect(rule?.context[0]).toMatchObject({ kind: "vkey", name: "K_SPACE", modifiers: [] });
    expect(rule?.output[0]).toMatchObject({ kind: "char", value: " " });
  });

  it("third rule has [SHIFT K_A] context with SHIFT modifier", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const rule = ir.groups[0]?.rules[2];
    expect(rule?.context[0]).toMatchObject({
      kind: "vkey",
      name: "K_A",
      modifiers: ["SHIFT"],
    });
  });

  it("attaches leading comment to first rule", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const spaceRule = ir.groups[0]?.rules[0];
    const leading = ir.comments.filter(
      c => c.anchor === "leading" && c.anchorRef?.nodeId === spaceRule?.nodeId
    );
    expect(leading.length).toBeGreaterThan(0);
    expect(leading[0]?.text).toContain("This comment precedes");
  });

  it("populates stores array with system stores", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    const sys = ir.stores.filter(s => s.isSystem);
    const names = sys.map(s => s.name);
    expect(names).toContain("VERSION");
    expect(names).toContain("NAME");
  });

  it("raw fragments array is empty for clean kmn", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.raw.length).toBe(0);
  });

  it("recognizedPatterns starts empty", () => {
    const { ir } = parse(MINIMAL_KMN, "test");
    expect(ir.recognizedPatterns).toEqual([]);
  });

  it("throws on completely malformed begin", () => {
    const bad = "begin GARBAGE\n";
    expect(() => parse(bad, "bad")).toThrow();
  });
});
