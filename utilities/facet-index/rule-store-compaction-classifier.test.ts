/**
 * Rule/store-compaction classifier unit tests (spec 041 US1, T018).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyRuleStoreCompaction } from "./rule-store-compaction-classifier.js";
import type { FacetDefinition } from "./types.js";

const DEF = {} as FacetDefinition;
const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;
const ir = (body: string) => parse(HEADER + body, "compaction-test").ir;

describe("classifyRuleStoreCompaction", () => {
  it("inline char output → inline-rules", () => {
    const cat = classifyRuleStoreCompaction(ir("+ [K_A] > U+0061\n+ [K_S] > U+0073\n"), DEF)!;
    expect(cat.value).toBe("inline-rules");
    expect(cat.consistency).toBe(1);
  });

  it("any()/index() store references → consolidated-stores", () => {
    const body = "store(keys) 'abc'\nstore(out) 'xyz'\n+ any(keys) > index(out,1)\n";
    const cat = classifyRuleStoreCompaction(ir(body), DEF)!;
    expect(cat.value).toBe("consolidated-stores");
  });

  it("both shapes → mixed", () => {
    const body = "store(keys) 'abc'\nstore(out) 'xyz'\n+ any(keys) > index(out,1)\n+ [K_Z] > U+007A\n";
    const cat = classifyRuleStoreCompaction(ir(body), DEF)!;
    expect(cat.value).toBe("mixed");
  });

  it("no output-bearing rules → null", () => {
    expect(classifyRuleStoreCompaction(ir(""), DEF)).toBeNull();
  });
});
