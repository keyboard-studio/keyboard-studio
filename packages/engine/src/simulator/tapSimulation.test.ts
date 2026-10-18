/**
 * Tap-simulation harness tests — spec 104, T002.
 *
 * Pins research.md §1's upstream semantics verdicts against the T001
 * idiom fixtures (pattern-apply/__fixtures__/touch-id/), using the same
 * method the verdicts were established with: compile with kmc, drive
 * ActiveLayout → JSKeyboardProcessor (see tapSimulation.ts).
 *
 * The verdicts under test:
 *  - a ruled T_ key produces exactly what its rules say (incl. guards);
 *  - a rule-free T_ key is SILENT — T_ has no fallback of any kind;
 *  - an unruled U_ key decodes its id; a ruled U_ key follows its rule;
 *  - an unmatched K_ key falls back to the US base char at state 0 and
 *    SHIFT, and produces nothing in other modifier states (RALT).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { CompileResult } from "@keyboard-studio/contracts";
import { compile } from "../compiler/index.js";
import { TouchTapSession } from "./tapSimulation.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../pattern-apply/__fixtures__/touch-id");

async function compileFixture(name: string): Promise<CompileResult> {
  const dir = resolve(fixtureRoot, name);
  const kmn = readFileSync(resolve(dir, `${name}.kmn`), "utf8");
  const layout = readFileSync(resolve(dir, `${name}.keyman-touch-layout`), "utf8");
  const vfs = createVirtualFS([
    { path: `source/${name}.kmn`, content: kmn, isBinary: false },
    { path: `source/${name}.keyman-touch-layout`, content: layout, isBinary: false },
  ]);
  const compiled = await compile(vfs, name);
  expect(
    compiled.success,
    `fixture ${name} must compile: ${JSON.stringify(compiled.diagnostics)}`,
  ).toBe(true);
  return compiled;
}

describe("tapSimulation — sil_cameroon_qwerty (guarded T_)", () => {
  let session: TouchTapSession;
  beforeAll(async () => {
    session = TouchTapSession.fromCompiled(await compileFixture("sil_cameroon_qwerty"));
  }, 60_000);

  it("a ruled T_ key produces its rule's output", () => {
    expect(session.tap("default", "T_0300").buffer).toBe("̀");
    expect(session.tap("default", "T_002E").buffer).toBe(".");
  });

  it("the diablock guard swallows the mark after space/digit, passes it after a letter", () => {
    expect(session.tap("default", "T_0300", "a").buffer).toBe("à");
    expect(session.tap("default", "T_0300", " ").buffer).toBe(" ");
    expect(session.tap("default", "T_0300", "5").buffer).toBe("5");
  });

  it("SHIFT forms exist only where the source rules them (T_030D yes, T_0300 no)", () => {
    expect(session.tap("shift", "T_030D").buffer).toBe("̍");
    expect(session.tap("shift", "T_030D", " ").buffer).toBe(" ");
    // No [SHIFT T_0300] rule in the source and T_ has no fallback: silent.
    expect(session.tap("shift", "T_0300").buffer).toBe("");
  });

  it("an unmatched K_ key falls back at state 0 / SHIFT and is silent under RALT", () => {
    expect(session.tap("default", "K_1").buffer).toBe("1");
    expect(session.tap("shift", "K_1").buffer).toBe("!");
    expect(session.tap("rightalt", "K_1").buffer).toBe("");
    expect(session.tap("rightalt", "K_A").buffer).toBe("");
  });

  it("the table covers every key in every layer with the same verdicts", () => {
    const table = session.table();
    const byKey = new Map(table.map((e) => [`${e.layerId}:${e.keyId}`, e.output]));
    expect(byKey.get("default:T_0300")).toBe("̀");
    expect(byKey.get("default:K_1")).toBe("1");
    expect(byKey.get("shift:K_1")).toBe("!");
    expect(byKey.get("rightalt:K_1")).toBe("");
    // 3 layers: default 5 keys, shift 4 keys, rightalt 2 keys.
    expect(table).toHaveLength(11);
  });
});

describe("tapSimulation — basic_kbdus (dead rule-free T_)", () => {
  let session: TouchTapSession;
  beforeAll(async () => {
    session = TouchTapSession.fromCompiled(await compileFixture("basic_kbdus"));
  }, 60_000);

  it("rule-free T_<HEX> keys are silent despite keycap text and nextlayer", () => {
    expect(session.tap("symbol", "T_0031").buffer).toBe("");
    expect(session.tap("symbol", "T_0021").buffer).toBe("");
    expect(session.tap("symbol", "T_003F").buffer).toBe("");
    const ref = session.keysOn("symbol").find((k) => k.keyId === "T_0031");
    expect(ref?.text).toBe("1");
    expect(ref?.nextLayer).toBe("default");
  });

  it("the same keyboard's ruled K_ and fallback K_ keys still produce", () => {
    expect(session.tap("default", "K_0").buffer).toBe("0");
    expect(session.tap("default", "K_A").buffer).toBe("a");
  });
});

describe("tapSimulation — hindi_flick (ruled U_)", () => {
  let session: TouchTapSession;
  beforeAll(async () => {
    session = TouchTapSession.fromCompiled(await compileFixture("hindi_flick"));
  }, 60_000);

  it("a ruled U_ key follows its rule, not the U_ decode", () => {
    // + [U_0905] > 'ा' (U+093E); the decode of the id would be अ (U+0905).
    expect(session.tap("default", "U_0905").buffer).toBe("ा");
  });

  it("an unruled U_ key decodes its id", () => {
    expect(session.tap("default", "U_0906").buffer).toBe("आ");
  });

  it("the rule's use() group governs: a second matra after one beeps and adds nothing", () => {
    const outcome = session.tap("default", "U_0905", "ा");
    expect(outcome.beep).toBe(true);
    expect(outcome.buffer).toBe("ा");
  });
});

describe("tapSimulation — gff_mesobe_fidelat (T_ producer + switch + host)", () => {
  let session: TouchTapSession;
  beforeAll(async () => {
    session = TouchTapSession.fromCompiled(await compileFixture("gff_mesobe_fidelat"));
  }, 60_000);

  it("one key carries all three roles: it produces, switches layer, hosts subkeys", () => {
    const ref = session.keysOn("default").find((k) => k.keyId === "T_1280");
    expect(ref?.nextLayer).toBe("fidel-1280");
    expect(session.tap("default", "T_1280").buffer).toBe("ኀ");
    const subkeys = session.keysOn("default").filter((k) => k.hostKeyId === "T_1280");
    expect(subkeys.map((k) => k.keyId)).toEqual(["U_1281", "U_1282"]);
  });

  it("the U_ subkey family decodes, on the host layer and on the switched layer", () => {
    expect(session.tapSubkey("default", "T_1280", "U_1281").buffer).toBe("ኁ");
    expect(session.tap("fidel-1280", "U_1282").buffer).toBe("ኂ");
  });
});

describe("tapSimulation — fv_southern_carrier (store-grouped T_ fan)", () => {
  let session: TouchTapSession;
  beforeAll(async () => {
    session = TouchTapSession.fromCompiled(await compileFixture("fv_southern_carrier"));
  }, 60_000);

  it("fan outputs come from the store via index(), and the base key navigates", () => {
    const ref = session.keysOn("default").find((k) => k.keyId === "T_H");
    expect(ref?.nextLayer).toBe("h-fan");
    expect(session.tap("default", "T_H").buffer).toBe("ᐸ");
    expect(session.tap("h-fan", "T_HI").buffer).toBe("ᐱ");
    expect(session.tap("h-fan", "T_HU").buffer).toBe("ᐲ");
  });
});
