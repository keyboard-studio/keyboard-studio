import { describe, expect, it } from "vitest";

import { parse } from "../codec/index.js";
import { CONFIDENT_SCRIPT_SHARE, outputScriptProfile } from "./scriptProfile.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'T'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) 2026'
store(&KEYBOARDVERSION) '1.0'

begin Unicode > use(main)

group(main) using keys
`;
const ir = (body: string) => parse(HEADER + body, "script-profile-test").ir;

describe("outputScriptProfile", () => {
  it("one script -> dominant with share 1", () => {
    const p = outputScriptProfile(ir("+ [K_A] > U+0627\n+ [K_B] > U+0628\n"));
    expect(p.dominant).toBe("Arab");
    expect(p.dominantShare).toBe(1);
    expect(p.evidenceSize).toBe(2);
    expect(p.dominantShare).toBeGreaterThanOrEqual(CONFIDENT_SCRIPT_SHARE);
  });

  it("splits a mixed keyboard and ignores Common characters", () => {
    const p = outputScriptProfile(
      ir("+ [K_A] > U+0061\n+ [K_B] > U+0627\n+ [K_1] > U+0031\n"),
    );
    expect(p.distribution).toEqual({ Arab: 0.5, Latn: 0.5 });
    expect(p.evidenceSize).toBe(2);
  });

  it("apportions a shared character only to attested scripts", () => {
    // U+0660 ARABIC-INDIC DIGIT ZERO is shared (Arab/Thaa/Yezi): with Arabic
    // attested it counts for Arab alone.
    const p = outputScriptProfile(ir("+ [K_A] > U+0627\n+ [K_0] > U+0660\n"));
    expect(p.distribution).toEqual({ Arab: 1 });
    expect(p.evidenceSize).toBe(2);
  });

  it("no scripted output -> no dominant and no evidence", () => {
    const p = outputScriptProfile(ir("+ [K_1] > U+0031\n"));
    expect(p.dominant).toBeUndefined();
    expect(p.evidenceSize).toBe(0);
  });
});
