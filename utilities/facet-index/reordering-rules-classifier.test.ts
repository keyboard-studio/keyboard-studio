/**
 * Reordering-rules classifier unit tests (spec 041 US1, T017).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyReorderingRules } from "./reordering-rules-classifier.js";
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
const ir = (body: string) => parse(HEADER + body, "reorder-test").ir;

describe("classifyReorderingRules", () => {
  it("no reorder shape → none, consistency 1", () => {
    const cat = classifyReorderingRules(ir("+ [K_A] > U+0061\n"), DEF)!;
    expect(cat.value).toBe("none");
    expect(cat.consistency).toBe(1);
  });

  it("a dedicated group(reorder) → group-reorder-swap", () => {
    const body = "+ [K_A] > U+0915\n\ngroup(reorder)\n\nU+0915 U+093F > U+093F U+0915\n";
    const cat = classifyReorderingRules(ir(body), DEF)!;
    expect(cat.value).toBe("group-reorder-swap");
  });
});
