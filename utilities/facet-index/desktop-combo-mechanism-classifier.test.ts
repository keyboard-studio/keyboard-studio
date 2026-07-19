/**
 * Desktop combo-mechanism classifier unit tests (spec 041 US1, T012).
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyDesktopComboMechanism } from "./desktop-combo-mechanism-classifier.js";
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
const ir = (body: string) => parse(HEADER + body, "combo-test").ir;

describe("classifyDesktopComboMechanism", () => {
  it("plain keys → direct-key dominant, distribution present", () => {
    const cat = classifyDesktopComboMechanism(ir("+ [K_A] > U+0061\n+ [K_S] > U+0073\n"), DEF)!;
    expect(cat.value).toBe("direct-key");
    expect(cat.distribution!["direct-key"]).toBeCloseTo(1, 6);
  });

  it("RALT chord → modifier-key", () => {
    const cat = classifyDesktopComboMechanism(ir("+ [RALT K_A] > U+00E4\n"), DEF)!;
    expect(cat.value).toBe("modifier-key");
  });

  it("context-match rule → context-match", () => {
    const cat = classifyDesktopComboMechanism(ir("U+0061 + [K_B] > U+00E1\n"), DEF)!;
    expect(cat.value).toBe("context-match");
  });

  it("no keystroke rules → null", () => {
    expect(classifyDesktopComboMechanism(ir(""), DEF)).toBeNull();
  });

  it("distribution keys are all within the mechanism value set", () => {
    const cat = classifyDesktopComboMechanism(ir("+ [RALT K_A] > U+00E4\n+ [K_S] > U+0073\n"), DEF)!;
    const allowed = new Set(["direct-key", "modifier-key", "deadkey", "context-match", "os-compose"]);
    for (const k of Object.keys(cat.distribution!)) expect(allowed.has(k)).toBe(true);
    const sum = Object.values(cat.distribution!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});
