/**
 * firedRuleTracker unit tests (spec 082, Track A FR-002).
 *
 * Pure string-level tests over hand-written kmc-shaped output (fast — no
 * compiler involved): marker enumeration per group, `// Line N` capture,
 * `nomatch` (`r=1`) markers, nested `if()` rule branches, and the null
 * fallback for non-kmc-shaped scripts. End-to-end firing is covered by
 * simulate.firedRule.test.ts.
 */

import { describe, it, expect } from "vitest";
import vm from "node:vm";
import {
  instrumentFiredRuleTracking,
  FIRED_RULE_HOOK_NAME,
} from "./firedRuleTracker.js";

// Hand-written kmc-kmn-shaped output: mirrors the real emitter's idioms
// (group functions, `r=m=1; // Line N` markers, nested if() branches,
// `use()` delegation, `nomatch` as `r=1;`, object literals with braces).
const KMC_SHAPED = `if(typeof keyman === 'undefined') {
} else {
KeymanWeb.KR(new Keyboard_probe());
}
function Keyboard_probe()
{
  var modCodes = keyman.osk.modifierCodes;
  this.s_opt_7=KeymanWeb.KLOAD(this.KI,"opt","0");
  this.gs=function(t,e) {
    return this.g_main_0(t,e);
  };
  this.g_main_0=function(t,e) {
    var k=KeymanWeb,r=0,m=0;
    if(k.KKM(e, modCodes.VIRTUAL_KEY /* 0x4000 */, keyCodes.K_A /* 0x41 */)) {
      if(1){
        r=m=1;   // Line 10
        k.KDC(0,t);
        k.KO(-1,t,"a");
      }
    }
    else if(k.KKM(e, modCodes.VIRTUAL_KEY /* 0x4000 */, keyCodes.K_B /* 0x42 */)) {
      if(this.s_opt_7==="1"){
        r=m=1;   // Line 11
        k.KDC(0,t);
        k.KO(-1,t,"b1");
      }
      else if(1){
        r=m=1;   // Line 12
        k.KDC(0,t);
        k.KO(-1,t,"b0");
      }
    }
    else if(k.KKM(e, modCodes.VIRTUAL_KEY /* 0x4000 */, keyCodes.K_C /* 0x43 */)) {
      if(k.KFCM(1,t,[{t:'a',a:this.s_vow_9}])){
        r=m=1;   // Line 13
        k.KDC(1,t);
        k.KO(-1,t,"X");
      }
    }
    else if(k.KKM(e, modCodes.VIRTUAL_KEY /* 0x4000 */, keyCodes.K_D /* 0x44 */)) {
      if(1){
        r=m=1;   // Line 14
        k.KDC(0,t);
        r=this.g_second_1(t,e);
        m=2;
      }
    }
    if(!m&&k.KIK(e)) {
      r=1;
      k.KDC(-1,t);
    }
    return r;
  };
  this.g_second_1=function(t,e) {
    var k=KeymanWeb,r=0,m=0;
    if(k.KKM(e, modCodes.VIRTUAL_KEY /* 0x4000 */, keyCodes.K_D /* 0x44 */)) {
      if(1){
        r=m=1;   // Line 20
        k.KDC(0,t);
        k.KO(-1,t,"D2");
      }
    }
    return r;
  };
}
`;

describe("instrumentFiredRuleTracking()", () => {
  it("enumerates one rule per marker, in source order, per group", () => {
    const result = instrumentFiredRuleTracking(KMC_SHAPED);
    expect(result).not.toBeNull();
    expect(result!.hookName).toBe(FIRED_RULE_HOOK_NAME);
    expect(result!.groups).toEqual([
      { name: "main", ruleSrcLines: [10, 11, 12, 13, 14, null] },
      { name: "second", ruleSrcLines: [20] },
    ]);
  });

  it("counts both branches of a nested if() rule chain as separate rules", () => {
    const result = instrumentFiredRuleTracking(KMC_SHAPED);
    const main = result!.groups[0]!;
    // Lines 11 and 12 are the two KMN rules sharing the K_B key branch.
    expect(main.ruleSrcLines[1]).toBe(11);
    expect(main.ruleSrcLines[2]).toBe(12);
  });

  it("counts the nomatch `r=1` marker as a rule with null srcLine", () => {
    const result = instrumentFiredRuleTracking(KMC_SHAPED);
    const main = result!.groups[0]!;
    // The nomatch rule is the 6th marker in main (index 5), with no // Line comment.
    expect(main.ruleSrcLines[5]).toBeNull();
  });

  it("injects the hook call immediately after each marker", () => {
    const result = instrumentFiredRuleTracking(KMC_SHAPED);
    const script = result!.script;
    expect(script).toContain(`r=m=1;${FIRED_RULE_HOOK_NAME}("main",0,10);`);
    expect(script).toContain(`r=m=1;${FIRED_RULE_HOOK_NAME}("main",3,13);`);
    expect(script).toContain(`r=1;${FIRED_RULE_HOOK_NAME}("main",5,null);`);
    expect(script).toContain(`r=m=1;${FIRED_RULE_HOOK_NAME}("second",0,20);`);
    // The use() delegation line still follows the outer rule's marker.
    expect(script).toContain(`r=this.g_second_1(t,e);`);
  });

  it("produces syntactically valid JavaScript", () => {
    const result = instrumentFiredRuleTracking(KMC_SHAPED);
    expect(() => new vm.Script(result!.script)).not.toThrow();
  });

  it("returns null for a script with no group functions", () => {
    expect(instrumentFiredRuleTracking(`KeymanWeb.KR({});`)).toBeNull();
    expect(instrumentFiredRuleTracking(``)).toBeNull();
  });

  it("returns null when groups contain no rule markers", () => {
    const noMarkers = `function K() { this.g_main_0=function(t,e) { var k=KeymanWeb,r=0,m=0; return r; }; }`;
    expect(instrumentFiredRuleTracking(noMarkers)).toBeNull();
  });

  it("ignores braces inside strings, comments, and object literals", () => {
    // The snippet above already exercises `[{t:'a',...}]` and `/* 0x4000 */`;
    // this pins that the second group was still found after them.
    const result = instrumentFiredRuleTracking(KMC_SHAPED);
    expect(result!.groups.map((g) => g.name)).toEqual(["main", "second"]);
  });
});
