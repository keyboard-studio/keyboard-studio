import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { checkDeprecatedHeaders } from "./check-deprecated-headers.js";

const MODERN_KMN = `store(&NAME) 'Demo'
store(&VERSION) '10.0'
begin Unicode > use(main)
group(main) using keys
store(used) 'a'
+ any(used) > 'b'
`;

function irWithStores(
  stores: Array<{ name: string; isSystem: boolean }>,
  ruleRefs: string[],
): KeyboardIR {
  return makeTestIR({
    header: { keyboardId: "demo" },
    stores: stores.map((s, i) => ({
      nodeId: `s${i}`,
      name: s.name,
      items: [],
      isSystem: s.isSystem,
    })),
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: ruleRefs.map((r) => ({
              kind: "any" as const,
              storeRef: r,
            })),
            output: [{ kind: "char", value: "x" }],
          },
        ],
      },
    ],
  });
}

describe("checkDeprecatedHeaders (7.27)", () => {
  it("passes modern headers and fully-used stores", () => {
    const ir = irWithStores(
      [
        { name: "&NAME", isSystem: true },
        { name: "used", isSystem: false },
      ],
      ["used"],
    );
    const { findings } = checkDeprecatedHeaders(MODERN_KMN, ir, "demo");
    expect(findings).toEqual([]);
  });

  it("flags a bare VERSION header", () => {
    const { findings } = checkDeprecatedHeaders(
      "VERSION 10.0\nstore(&NAME) 'Demo'\nbegin Unicode > use(main)\n",
      undefined,
      "demo",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe(
      "KM_LINT_DEPRECATED_HEADER_OR_UNUSED_STORE",
    );
    expect(findings[0]!.message).toContain("VERSION");
  });

  it("flags deprecated system stores", () => {
    const { findings } = checkDeprecatedHeaders(
      "store(&NAME) 'Demo'\nstore(&ETHNOLOGUECODE) 'eng'\nbegin Unicode > use(main)\n",
      undefined,
      "demo",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("&ETHNOLOGUECODE");
  });

  it("does not flag headers after begin, or store() lines", () => {
    const { findings } = checkDeprecatedHeaders(
      "store(&NAME) 'Demo'\nbegin Unicode > use(main)\ngroup(main) using keys\nc VERSION in a comment\n",
      undefined,
      "demo",
    );
    expect(findings).toEqual([]);
  });

  it("flags an unused non-system store", () => {
    const ir = irWithStores(
      [
        { name: "used", isSystem: false },
        { name: "dead", isSystem: false },
      ],
      ["used"],
    );
    const { findings } = checkDeprecatedHeaders(MODERN_KMN, ir, "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("dead");
    expect(findings[0]!.message).not.toContain("used)");
  });

  it("does not flag system stores as unused", () => {
    const ir = irWithStores([{ name: "&NAME", isSystem: true }], []);
    const { findings } = checkDeprecatedHeaders(MODERN_KMN, ir, "demo");
    expect(findings).toEqual([]);
  });

  // Spec 116: set / save / reset / call and a store body's outs() are typed, so a store
  // they name counts as referenced from the IR alone (no kmn text fallback needed).
  it.each([
    ["set", { kind: "set", storeRef: "opt", value: [{ kind: "char", value: "1" }] }],
    ["save", { kind: "save", storeRef: "opt" }],
    ["reset", { kind: "reset", storeRef: "opt" }],
    ["call", { kind: "call", storeRef: "opt" }],
  ] as const)("a store used only by a typed %s is referenced", (_name, el) => {
    const ir = irWithStores([{ name: "opt", isSystem: false }], []);
    ir.groups[0]!.rules[0]!.output = [el];
    expect(checkDeprecatedHeaders(undefined, ir, "demo").findings).toEqual([]);
  });

  it("a store named only inside a set() value, or by another store's outs(), is referenced", () => {
    const ir = irWithStores(
      [
        { name: "opt", isSystem: false },
        { name: "pool", isSystem: false },
        { name: "all", isSystem: false },
        { name: "base", isSystem: false },
      ],
      [],
    );
    ir.groups[0]!.rules[0]!.output = [
      { kind: "set", storeRef: "opt", value: [{ kind: "outs", storeRef: "pool" }] },
      { kind: "call", storeRef: "all" },
    ];
    ir.stores.find((s) => s.name === "all")!.items = [{ kind: "outs", storeRef: "base" }];
    expect(checkDeprecatedHeaders(undefined, ir, "demo").findings).toEqual([]);
  });
});
