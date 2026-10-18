/**
 * Tests for the spec 104 carve operation (T009, contracts §4, FR-019 /
 * FR-020, SC-001 / quickstart QS-1).
 *
 * Fixtures: the T001 idiom fixtures (pattern-apply/__fixtures__/touch-id/):
 *   - sil_cameroon_qwerty — guarded T_ marks (bare + guard rules) and a
 *     bare-rule T_ punctuation producer;
 *   - hindi_flick — a ruled U_ key (the FR-020 fail-open trap) plus an
 *     unruled U_ decode control;
 *   - fv_southern_carrier — a store-grouped T_ fan (the §4 separation
 *     case: one fan character carved out of a shared any()/index() rule
 *     whose key store holds vkeys, not chars).
 * The refusal case is a synthetic .kmn whose single rule's literal output
 * mixes the carved character with a kept one — indivisible by construction.
 *
 * QS-1 runs the full acceptance shape: carve U+0300 from Cameroon, project
 * through spec 076's pipeline, recompile, and tap-simulate — zero
 * producing occurrences, zero live T_0300 rules, geometry preserved, and
 * every other character's production unchanged.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { KeyboardIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  buildTouchKeyRuleIndex,
  parseTouchLayoutString,
  resolveTouchProduction,
  touchKeyStateFromLayerId,
} from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { emitTouchLayout } from "../codec/parse-touch.js";
import { compile } from "../compiler/index.js";
import { TouchTapSession } from "../simulator/tapSimulation.js";
import { applyTouchCharCarve, carveTouchCharacter } from "./carveTouchProducers.js";
import { makeSlotId } from "./slotId.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "__fixtures__/touch-id");

function loadFixture(name: string): { ir: KeyboardIR; layout: TouchLayoutIR; kmn: string; layoutJson: string } {
  const dir = resolve(fixtureRoot, name);
  const kmn = readFileSync(resolve(dir, `${name}.kmn`), "utf8");
  const layoutJson = readFileSync(resolve(dir, `${name}.keyman-touch-layout`), "utf8");
  return { ir: parse(kmn, name).ir, layout: parseTouchLayoutString(layoutJson), kmn, layoutJson };
}

function ruleIdsForKey(ir: KeyboardIR, keyId: string): string[] {
  const ids: string[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.context.some((el) => el.kind === "vkey" && el.name === keyId)) ids.push(rule.nodeId);
    }
  }
  return ids;
}

function allKeyIds(layout: TouchLayoutIR): string[] {
  const ids: string[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) ids.push(`${layer.id}:${key.id}`);
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Cameroon — guarded T_ marks (contracts §4, US4 scenario 1)
// ---------------------------------------------------------------------------

describe("carveTouchCharacter — sil_cameroon_qwerty", () => {
  const { ir, layout } = loadFixture("sil_cameroon_qwerty");

  it("carving U+0300 neutralises T_0300 on every layer and suppresses bare + guard rules in one operation", () => {
    const result = carveTouchCharacter(ir, layout, "̀");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Occurrences: default + shift (the shift key produces nothing in its
    // state — it is neutralised as the same carved identity, US4 sc. 3).
    expect(result.neutralisedOccurrences).toBe(2);
    expect(allKeyIds(result.layout)).not.toContain("default:T_0300");
    expect(allKeyIds(result.layout)).not.toContain("shift:T_0300");

    // Geometry preserved: same number of keys per row; the neutralised
    // keys are T_BLANK / sp 10.
    const before = layout.platforms[0]!.layers[0]!.rows.map((r) => r.keys.length);
    const after = result.layout.platforms[0]!.layers[0]!.rows.map((r) => r.keys.length);
    expect(after).toEqual(before);
    const blanked = result.layout.platforms[0]!.layers[0]!.rows[0]!.keys[0]!;
    expect(blanked.id).toBe("T_BLANK");
    expect(blanked.sp).toBe(10);
    expect(blanked.text).toBeUndefined();

    // Suppression: exactly the T_0300 binding set — bare producer + the
    // diablock guard form.
    const t0300Rules = ruleIdsForKey(ir, "T_0300");
    expect(t0300Rules).toHaveLength(2);
    expect(new Set(result.suppressedRuleNodeIds)).toEqual(new Set(t0300Rules));
    expect(result.storeSlotIds.size).toBe(0);

    // Untouched producers keep their ids.
    expect(allKeyIds(result.layout)).toContain("default:T_030D");
    expect(allKeyIds(result.layout)).toContain("default:T_002E");
  });

  it("carving U+002E ('.') suppresses only the bare T_002E rule", () => {
    const result = carveTouchCharacter(ir, layout, ".");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.neutralisedOccurrences).toBe(1);
    expect(new Set(result.suppressedRuleNodeIds)).toEqual(new Set(ruleIdsForKey(ir, "T_002E")));
    expect(allKeyIds(result.layout)).toContain("default:T_0300");
  });

  it("carving U+030D suppresses all four forms (bare, SHIFT bare, guard, SHIFT guard)", () => {
    const result = carveTouchCharacter(ir, layout, "̍");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ruleIdsForKey(ir, "T_030D")).toHaveLength(4);
    expect(new Set(result.suppressedRuleNodeIds)).toEqual(new Set(ruleIdsForKey(ir, "T_030D")));
    expect(result.neutralisedOccurrences).toBe(2);
  });

  it("carving a character no touch key produces is a no-op success", () => {
    const result = carveTouchCharacter(ir, layout, "€");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.neutralisedOccurrences).toBe(0);
    expect(result.layout).toBe(layout);
    expect(result.suppressedRuleNodeIds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hindi_flick — the ruled U_ fail-open trap (FR-020)
// ---------------------------------------------------------------------------

describe("carveTouchCharacter — hindi_flick (FR-020)", () => {
  const { ir, layout } = loadFixture("hindi_flick");

  it("carving the ruled U_ key's character neutralises the key AND suppresses its rules together", () => {
    const result = applyTouchCharCarve(ir, layout, "ा");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(allKeyIds(result.layout)).not.toContain("default:U_0905");
    // Every rule naming [U_0905] — main producer, checkMatra beep rule,
    // and the use() catch rule — is suppressed in the same operation.
    const u0905Rules = ruleIdsForKey(ir, "U_0905");
    expect(u0905Rules.length).toBeGreaterThanOrEqual(3);
    expect(new Set(result.suppressedRuleNodeIds)).toEqual(new Set(u0905Rules));
    // The carved IR contains no live [U_0905] rule at all: nothing left
    // to revive the character, and the key itself is T_BLANK, so the U_
    // decode cannot revive it either (the fail-open trap is closed).
    expect(ruleIdsForKey(result.ir, "U_0905")).toEqual([]);
    // The unruled U_0906 control key is untouched.
    expect(allKeyIds(result.layout)).toContain("default:U_0906");
  });

  it("carving the DECODE character keeps a rule that serves a kept character (§4 exception)", () => {
    // 'अ' reaches U_0905 only via its U_ decode fall-through; the key's
    // rules produce 'ा', a kept character, so they are preserved.
    const result = carveTouchCharacter(ir, layout, "अ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(allKeyIds(result.layout)).not.toContain("default:U_0905");
    expect(result.suppressedRuleNodeIds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fv_southern_carrier — shared store fan: separation (contracts §4)
// ---------------------------------------------------------------------------
//
// The fan rule `+ any(fanHkeys) > index(fanH,1)` has NO vkey element — the
// struck key arrives through the any() store — and its key store holds
// VKEY items, not chars. Two foundations meet here: the spec 063 rule-join
// expands the key-position any() into per-key bindings (so the resolver
// sees fan production at all), and carve expresses the separation as the
// OUTPUT-store slot alone — the slot machinery's coordinated splice drops
// the parallel key-store position with it (a directly requested vkey slot
// would be refused by applyStoreSlotRemovals' char check and the pair
// would drop nothing).

describe("carveTouchCharacter — fv_southern_carrier fan separation (§4)", () => {
  const { ir, layout } = loadFixture("fv_southern_carrier");

  it("carving ᐱ (T_HI's aligned output) neutralises T_HI and separates the fan stores — the rule survives", () => {
    const result = applyTouchCharCarve(ir, layout, "ᐱ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The carved occurrence is neutralised; the rest of the fan is intact.
    expect(result.neutralisedOccurrences).toBe(1);
    expect(allKeyIds(result.layout)).not.toContain("h-fan:T_HI");
    expect(allKeyIds(result.layout)).toContain("default:T_H");
    expect(allKeyIds(result.layout)).toContain("h-fan:T_HU");
    const hFan = result.layout.platforms[0]!.layers.find((l) => l.id === "h-fan")!;
    const blanked = hFan.rows[0]!.keys[0]!;
    expect(blanked.id).toBe("T_BLANK");
    expect(blanked.sp).toBe(10);

    // The fan rule is PRESERVED, not suppressed: no rule is deleted, and
    // the separation is expressed as exactly one requested slot — fanH#1,
    // the output-store position holding ᐱ. (The parallel fanHkeys slot is
    // dropped by the slot machinery's coordinated splice, not requested.)
    expect(result.suppressedRuleNodeIds.size).toBe(0);
    const fanH = ir.stores.find((s) => s.name === "fanH")!;
    expect([...result.storeSlotIds]).toEqual([makeSlotId(fanH.nodeId, 1)]);
    const ruleCount = (kx: KeyboardIR) => kx.groups.reduce((n, g) => n + g.rules.length, 0);
    expect(ruleCount(result.ir)).toBe(ruleCount(ir));

    // Both stores spliced at position 1, alignment preserved: T_HU sits
    // at index 1 in fanHkeys and its output ᐲ at index 1 in fanH.
    const carvedKeys = result.ir.stores.find((s) => s.name === "fanHkeys")!;
    expect(carvedKeys.items).toEqual([
      { kind: "vkey", name: "T_H" },
      { kind: "vkey", name: "T_HU" },
    ]);
    const carvedFan = result.ir.stores.find((s) => s.name === "fanH")!;
    expect(carvedFan.items).toEqual([
      { kind: "char", value: "ᐸ" },
      { kind: "char", value: "ᐲ" },
    ]);
    expect(result.warnings).toEqual([]);

    // IR-level production: the surviving fan keys still resolve to their
    // syllables through the carved IR; no key resolves to ᐱ any more.
    const ruleIndex = buildTouchKeyRuleIndex(result.ir);
    const producedTexts = (layerId: string, keyId: string): string[] => {
      const layer = result.layout.platforms[0]!.layers.find((l) => l.id === layerId)!;
      const key = layer.rows.flatMap((r) => r.keys).find((k) => k.id === keyId)!;
      const record = resolveTouchProduction(
        { ir: result.ir, ruleIndex },
        key,
        touchKeyStateFromLayerId(layerId),
      );
      return record.productions.flatMap((p) => (p.output.kind === "text" ? [p.output.text] : []));
    };
    expect(producedTexts("default", "T_H")).toContain("ᐸ");
    expect(producedTexts("h-fan", "T_HU")).toContain("ᐲ");
  });

  it("tap simulation: T_H and T_HU still produce ᐸ / ᐲ after the carve; nothing produces ᐱ", async () => {
    const carved = applyTouchCharCarve(ir, layout, "ᐱ");
    expect(carved.ok).toBe(true);
    if (!carved.ok) return;
    const vfs = createVirtualFS([
      { path: "source/fv_southern_carrier.kmn", content: emit(carved.ir), isBinary: false },
      {
        path: "source/fv_southern_carrier.keyman-touch-layout",
        content: emitTouchLayout(carved.layout),
        isBinary: false,
      },
    ]);
    const compiled = await compile(vfs, "fv_southern_carrier");
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const session = TouchTapSession.fromCompiled(compiled);
    expect(session.tap("default", "T_H").buffer).toBe("ᐸ");
    expect(session.tap("h-fan", "T_HU").buffer).toBe("ᐲ");
    for (const entry of session.table()) {
      expect(entry.output).not.toBe("ᐱ");
    }
    // The blanked key is inert even though its store slot is gone.
    expect(session.tap("h-fan", "T_BLANK").buffer).toBe("");
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Separation through a vkey-keyed store-index rule (contracts §4)
// ---------------------------------------------------------------------------

describe("carveTouchCharacter — separation via store slots", () => {
  it("carving one context-selected output separates through the output store — the rule survives", () => {
    // One key, one rule: the output is selected from a store by the
    // preceding context character ('a' → ᐸ, 'b' → ᐱ). Carving ᐱ must
    // not kill ᐸ's production: separation removes the ᐱ slot.
    const kmn = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'Separation Fixture'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "store(ctxs) 'ab'",
      'store(outs) "ᐸᐱ"',
      "any(ctxs) + [T_X] > index(outs,1)",
      "",
    ].join("\n");
    const ir = parse(kmn, "separation_fixture").ir;
    const layout = parseTouchLayoutString(
      JSON.stringify({
        tablet: {
          layer: [{ id: "default", row: [{ id: 1, key: [{ id: "T_X", text: "x" }] }] }],
        },
      }),
    );

    const result = applyTouchCharCarve(ir, layout, "ᐱ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suppressedRuleNodeIds.size).toBe(0);
    const outs = ir.stores.find((s) => s.name === "outs")!;
    expect([...result.storeSlotIds]).toEqual([makeSlotId(outs.nodeId, 1)]);
    // The pipeline's coordinated drop splices the pair set (outs + its
    // index partner ctxs) at the same position: 'b' and ᐱ leave together,
    // 'a' → ᐸ alignment is untouched.
    const carvedOuts = result.ir.stores.find((s) => s.name === "outs")!;
    expect(carvedOuts.items).toEqual([{ kind: "char", value: "ᐸ" }]);
    const carvedCtxs = result.ir.stores.find((s) => s.name === "ctxs")!;
    expect(carvedCtxs.items).toEqual([{ kind: "char", value: "a" }]);
  });
});

// ---------------------------------------------------------------------------
// Refusal — an indivisible literal output (contracts §4 / FR-008)
// ---------------------------------------------------------------------------

describe("carveTouchCharacter — refusal", () => {
  it("refuses with the binding named when one rule's literal output mixes carved + kept", () => {
    const kmn = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'Refusal Fixture'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [T_X] > 'a' U+0300",
      "",
    ].join("\n");
    const ir = parse(kmn, "refusal_fixture").ir;
    const layout = parseTouchLayoutString(
      JSON.stringify({
        tablet: {
          layer: [
            { id: "default", row: [{ id: 1, key: [{ id: "T_X", text: "x" }] }] },
          ],
        },
      }),
    );

    const result = carveTouchCharacter(ir, layout, "̀");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.keyId).toBe("T_X");
    expect(result.refusal.ruleNodeId).toBe(ruleIdsForKey(ir, "T_X")[0]);
    expect(result.refusal.binding).toContain("also serves a");
    expect(result.refusal.reason).toContain("literal output");
  });
});

// ---------------------------------------------------------------------------
// QS-1 / SC-001 — carve U+0300 from Cameroon, recompile, tap-simulate
// ---------------------------------------------------------------------------

describe("carveTouchCharacter — QS-1 tap simulation (SC-001)", () => {
  const { ir, layout } = loadFixture("sil_cameroon_qwerty");
  let before: TouchTapSession;
  let after: TouchTapSession;

  beforeAll(async () => {
    const { kmn, layoutJson } = loadFixture("sil_cameroon_qwerty");
    const baseVfs = createVirtualFS([
      { path: "source/sil_cameroon_qwerty.kmn", content: kmn, isBinary: false },
      {
        path: "source/sil_cameroon_qwerty.keyman-touch-layout",
        content: layoutJson,
        isBinary: false,
      },
    ]);
    before = TouchTapSession.fromCompiled(await compile(baseVfs, "sil_cameroon_qwerty"));

    const carved = applyTouchCharCarve(ir, layout, "̀");
    expect(carved.ok).toBe(true);
    if (!carved.ok) throw new Error("carve refused unexpectedly");
    const carvedVfs = createVirtualFS([
      { path: "source/sil_cameroon_qwerty.kmn", content: emit(carved.ir), isBinary: false },
      {
        path: "source/sil_cameroon_qwerty.keyman-touch-layout",
        content: emitTouchLayout(carved.layout),
        isBinary: false,
      },
    ]);
    const compiled = await compile(carvedVfs, "sil_cameroon_qwerty");
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    after = TouchTapSession.fromCompiled(compiled);
  }, 60_000);

  it("no key on any layer produces U+0300 after the carve, in any context", () => {
    for (const entry of after.table()) {
      expect(entry.output).not.toBe("̀");
    }
    // Context probes: the guard is gone with the key — a blank key after a
    // letter produces nothing either.
    expect(after.tap("default", "T_BLANK").buffer).toBe("");
    expect(after.tap("default", "T_BLANK", "a").buffer).toBe("a");
  });

  it("every other character's production is unchanged", () => {
    const beforeTable = new Map(
      before.table().map((e) => [`${e.layerId}:${e.keyId}`, e.output]),
    );
    for (const entry of after.table()) {
      if (entry.keyId === "T_BLANK") continue; // the carved key's new identity
      expect(entry.output, `${entry.layerId}:${entry.keyId}`).toBe(
        beforeTable.get(`${entry.layerId}:${entry.keyId}`),
      );
    }
    // The surviving guarded mark still guards.
    expect(after.tap("default", "T_030D", "a").buffer).toBe("a̍");
    expect(after.tap("default", "T_030D", " ").buffer).toBe(" ");
    // The fallback-riding K_ key is intact.
    expect(after.tap("default", "K_1").buffer).toBe("1");
  });
});
