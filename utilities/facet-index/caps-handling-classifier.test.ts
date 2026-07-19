/**
 * Caps-handling classifier unit tests (spec 041 US1, T011). Real IRs via codec.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyCapsHandling } from "./caps-handling-classifier.js";
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
const ir = (body: string) => parse(HEADER + body, "caps-test").ir;

describe("classifyCapsHandling", () => {
  it("caseless script → notApplicable, no forced value (FR-013, AS-4)", () => {
    const cat = classifyCapsHandling(ir("+ [K_A] > U+0627\n"), DEF)!; // Arabic
    expect(cat.notApplicable).toBe(true);
    expect(cat.value).toBeUndefined();
    expect(cat.provenanceTier).toBe("content-derived");
  });

  it("cased script, no caps rules → no-caps-rules, consistency 1", () => {
    const cat = classifyCapsHandling(ir("+ [K_A] > U+0061\n+ [K_S] > U+0073\n"), DEF)!;
    expect(cat.value).toBe("no-caps-rules");
    expect(cat.consistency).toBe(1);
    expect(cat.causeTagCounts).toBeUndefined();
  });

  it("explicit CAPS/NCAPS rules → per-rule-duplication", () => {
    const body = "+ [K_A] > U+0061\n+ [NCAPS K_A] > U+0061\n+ [CAPS K_A] > U+0041\n";
    const cat = classifyCapsHandling(ir(body), DEF)!;
    expect(cat.value).toBe("per-rule-duplication");
  });

  it("any()+index() fold → any-index-fold", () => {
    const body = "store(lower) 'abc'\nstore(upper) 'ABC'\n+ any(lower) > index(upper,1)\n";
    const cat = classifyCapsHandling(ir(body), DEF)!;
    expect(cat.value).toBe("any-index-fold");
  });

  it("both mechanisms → mixed", () => {
    const body =
      "store(lower) 'abc'\nstore(upper) 'ABC'\n+ any(lower) > index(upper,1)\n+ [CAPS K_Z] > U+005A\n";
    const cat = classifyCapsHandling(ir(body), DEF)!;
    expect(cat.value).toBe("mixed");
  });
});
