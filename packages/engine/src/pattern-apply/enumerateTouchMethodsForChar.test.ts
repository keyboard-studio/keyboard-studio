/**
 * Unit tests for enumerateTouchMethodsForChar.
 *
 * Coverage:
 *   1. Main key (U_ id) — deletable, structured fields.
 *   2. Main key with `output` — deletable.
 *   3. Main key, K_-id + `text` only, no `output`, no `nextlayer` — deletable
 *      (fix: a plain letter key is genuinely deletable; the WRITE side
 *      neutralizes its id unconditionally so the underlying `.kmn` rule can't
 *      leak through).
 *   3b. Main key, K_-id with no `text`/`output` and a non-`U_` id — `host` is
 *       `undefined`, not the raw id (fix: raw-identifier leak).
 *   4. Main key with `nextlayer` — NOT deletable (layer-switch guard).
 *   5. Longpress (sk[]) — always deletable, references the host key.
 *   6. Multitap — always deletable.
 *   7. Flick — always deletable, `direction` field set.
 *   8. NFC/NFD canonical matching.
 *   9. No match anywhere — empty result.
 *   10. Multiple platforms/layers — every producing method is listed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { enumerateTouchMethodsForChar } from "./enumerateTouchMethodsForChar.js";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { buildTouchKeyRuleIndex, parseTouchLayoutString } from "@keyboard-studio/contracts";
import { touchKey } from "@keyboard-studio/contracts/fixtures";
import { parse } from "../codec/parse.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeLayout(
  phoneDefaultKeys: TouchKeyIR[],
  options: { tabletPlatform?: TouchKeyIR[]; extraPhoneLayer?: { id: string; keys: TouchKeyIR[] } } = {},
): TouchLayoutIR {
  const phoneLayers: TouchLayoutIR["platforms"][number]["layers"] = [
    { id: "default", rows: [{ keys: phoneDefaultKeys }] },
  ];
  if (options.extraPhoneLayer) {
    phoneLayers.push({ id: options.extraPhoneLayer.id, rows: [{ keys: options.extraPhoneLayer.keys }] });
  }

  const platforms: TouchLayoutIR["platforms"] = [{ id: "phone", layers: phoneLayers }];

  if (options.tabletPlatform) {
    platforms.push({
      id: "tablet",
      layers: [{ id: "default", rows: [{ keys: options.tabletPlatform }] }],
    });
  }

  return { platforms, nodeIds: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("enumerateTouchMethodsForChar", () => {
  it("finds a U_-id main key and marks it deletable with structured fields", () => {
    const layout = makeLayout([touchKey({ id: "U_0061", text: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toEqual([
      {
        id: "phone:default:U_0061",
        kind: "tap",
        host: "a",
        producedChar: "a",
        platform: "phone",
        layer: "default",
        deletable: true,
      },
    ]);
  });

  it("finds a main key whose char comes from `output` and marks it deletable", () => {
    const layout = makeLayout([touchKey({ id: "K_X", text: "a", output: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result[0]).toMatchObject({ id: "phone:default:K_X", kind: "tap", deletable: true });
  });

  it("marks a K_-id, text-only main key (plain letter key) as deletable (fix: was falsely non-deletable)", () => {
    const layout = makeLayout([touchKey({ id: "K_A", text: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("phone:default:K_A");
    expect(result[0]!.deletable).toBe(true);
    expect(result[0]!.reasonCode).toBeUndefined();
  });

  it("omits `host` (rather than leaking the raw id) for a host key with no text/output and a non-U_ id", () => {
    const layout = makeLayout([
      touchKey({ id: "K_A", sk: [touchKey({ id: "U_00E1", text: "á" })] }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toHaveLength(1);
    expect(result[0]!.host).toBeUndefined();
    expect(Object.hasOwn(result[0]!, "host")).toBe(false);
  });

  it("marks a main key with `nextlayer` as NOT deletable (layer-switch guard)", () => {
    const layout = makeLayout([touchKey({ id: "K_A", text: "a", nextlayer: "shift" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toHaveLength(1);
    expect(result[0]!.deletable).toBe(false);
    expect(result[0]!.reasonCode).toBe("layer-switch");
  });

  it("finds a longpress (sk[]) entry and sets host to the host key's display", () => {
    const layout = makeLayout([
      touchKey({
        id: "U_0061",
        text: "a",
        sk: [touchKey({ id: "U_00E1", text: "á" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toEqual([
      {
        id: "phone:default:U_0061:sk:U_00E1",
        kind: "longpress",
        host: "a",
        producedChar: "á",
        platform: "phone",
        layer: "default",
        deletable: true,
      },
    ]);
  });

  it("surfaces the sk sub-entry's own layerAnnotation when present (placement-priors v2)", () => {
    const layout = makeLayout([
      touchKey({
        id: "U_0065",
        text: "e",
        sk: [touchKey({ id: "U_025B", text: "ɛ", layerAnnotation: "rightalt" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "ɛ");

    expect(result).toEqual([
      {
        id: "phone:default:U_0065:sk:U_025B",
        kind: "longpress",
        host: "e",
        producedChar: "ɛ",
        platform: "phone",
        layer: "default",
        skLayerAnnotation: "rightalt",
        deletable: true,
      },
    ]);
  });

  it("omits skLayerAnnotation when the sk sub-entry carries no layer annotation", () => {
    const layout = makeLayout([
      touchKey({
        id: "U_0061",
        text: "a",
        sk: [touchKey({ id: "U_00E1", text: "á" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result[0]).not.toHaveProperty("skLayerAnnotation");
  });

  it("finds a multitap entry", () => {
    const layout = makeLayout([
      touchKey({
        id: "U_0065",
        text: "e",
        multitap: [touchKey({ id: "U_00E9", text: "é" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "é");

    expect(result).toEqual([
      {
        id: "phone:default:U_0065:multitap:U_00E9",
        kind: "multitap",
        host: "e",
        producedChar: "é",
        platform: "phone",
        layer: "default",
        deletable: true,
      },
    ]);
  });

  it("finds a flick entry and sets the `direction` field", () => {
    const layout = makeLayout([
      touchKey({
        id: "U_006E",
        text: "n",
        flick: { ne: touchKey({ id: "U_00F1", text: "ñ" }) },
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "ñ");

    expect(result).toEqual([
      {
        id: "phone:default:U_006E:flick:ne",
        kind: "flick",
        host: "n",
        producedChar: "ñ",
        platform: "phone",
        layer: "default",
        direction: "ne",
        deletable: true,
      },
    ]);
  });

  it("matches canonically — an NFD-stored key text matches an NFC query char", () => {
    const nfdA = "á"; // "á" as base + combining acute
    const layout = makeLayout([touchKey({ id: "U_00E1", text: nfdA })]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("phone:default:U_00E1");
    expect(result[0]!.deletable).toBe(true);
  });

  it("skips a main key whose id is K_BKSP even if it happens to match (defensive backspace filter)", () => {
    const layout = makeLayout([touchKey({ id: "K_BKSP", text: "a" })]);

    expect(enumerateTouchMethodsForChar(layout, "a")).toEqual([]);
  });

  it("skips a longpress/multitap/flick sub-entry whose id is K_BKSP (defensive backspace filter)", () => {
    const layout = makeLayout([
      touchKey({
        id: "U_0061",
        text: "a",
        sk: [touchKey({ id: "K_BKSP", text: "b" })],
        multitap: [touchKey({ id: "K_BKSP", text: "c" })],
        flick: { ne: touchKey({ id: "K_BKSP", text: "d" }) },
      }),
    ]);

    expect(enumerateTouchMethodsForChar(layout, "b")).toEqual([]);
    expect(enumerateTouchMethodsForChar(layout, "c")).toEqual([]);
    expect(enumerateTouchMethodsForChar(layout, "d")).toEqual([]);
  });

  it("returns an empty list when nothing produces the character", () => {
    const layout = makeLayout([touchKey({ id: "U_0061", text: "a" })]);

    expect(enumerateTouchMethodsForChar(layout, "z")).toEqual([]);
  });

  it("lists every producing method across multiple platforms/layers", () => {
    const layout = makeLayout(
      [touchKey({ id: "U_0061", text: "a" })],
      {
        tabletPlatform: [touchKey({ id: "U_0061", text: "a" })],
        extraPhoneLayer: { id: "shift", keys: [touchKey({ id: "U_0061", text: "a" })] },
      },
    );

    const result = enumerateTouchMethodsForChar(layout, "a");
    const ids = result.map((r) => r.id).sort();

    expect(ids).toEqual([
      "phone:default:U_0061",
      "phone:shift:U_0061",
      "tablet:default:U_0061",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Spec 104 T008 — resolver-backed enumeration (audit gap 1)
// ---------------------------------------------------------------------------

describe("enumerateTouchMethodsForChar — resolver mode (spec 104 T008)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtureDir = resolve(here, "__fixtures__/touch-id/sil_cameroon_qwerty");
  const kmn = readFileSync(resolve(fixtureDir, "sil_cameroon_qwerty.kmn"), "utf8");
  const layoutJson = readFileSync(
    resolve(fixtureDir, "sil_cameroon_qwerty.keyman-touch-layout"),
    "utf8",
  );
  const ir = parse(kmn, "sil_cameroon_qwerty").ir;
  const layout = parseTouchLayoutString(layoutJson);
  const production = { ir, ruleIndex: buildTouchKeyRuleIndex(ir) };

  it("enumerates a ruled T_ method on the same address scheme as K_/U_ methods", () => {
    const result = enumerateTouchMethodsForChar(layout, "̀", { production });
    const ids = result.map((r) => r.id).sort();
    // T_0300 occurs on default + shift, but only the default-layer key has a
    // producing rule in that state (T_ has no fallback) — one method.
    expect(ids).toEqual(["tablet:default:T_0300"]);
    expect(result[0]).toMatchObject({ kind: "tap", producedChar: "̀", deletable: true });
  });

  it("without production inputs the same T_ method is invisible (the gap-1 blindness)", () => {
    expect(enumerateTouchMethodsForChar(layout, "̀")).toEqual([]);
  });

  it("enumerates the bare-rule T_ punctuation producer (T_002E, '.')", () => {
    const result = enumerateTouchMethodsForChar(layout, ".", { production });
    expect(result.map((r) => r.id)).toEqual(["tablet:default:T_002E"]);
  });

  it("a ruled T_ method hosted as a longpress sub-key is enumerated as longpress", () => {
    const hosted = makeLayout([
      touchKey({
        id: "K_A",
        text: "a",
        sk: [touchKey({ id: "T_0300", text: "◌̀" })],
      }),
    ]);
    const result = enumerateTouchMethodsForChar(hosted, "̀", { production });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "longpress", deletable: true });
    expect(result[0]!.id).toContain("T_0300");
  });
});

// ---------------------------------------------------------------------------
// Emulation-class keys (T021 arm3): context rules on function keys are
// text-rewriting triggers, not typing methods; a bare rule on one is its
// own production. Corpus shapes: hakka/taigi `phonetic + [K_TAB] >
// conversion`; ibono/obolo `+ [ALT K_ENTER] > U+000A`.
// ---------------------------------------------------------------------------

describe("enumerateTouchMethodsForChar — emulation-class keys (spec 104, T021 arm3)", () => {
  const emuKmn = [
    "store(&TARGETS) 'any'",
    "begin Unicode > use(main)",
    "group(main) using keys",
    '"x" + [K_TAB] > "y"',
    "+ [ALT K_ENTER] > U+000A",
    "",
  ].join("\n");
  const emuIr = parse(emuKmn, "emulation-fixture").ir;
  const emuProduction = { ir: emuIr, ruleIndex: buildTouchKeyRuleIndex(emuIr) };
  const emuLayout = makeLayout([touchKey({ id: "K_TAB", text: "*Tab*" })], {
    extraPhoneLayer: { id: "alt", keys: [touchKey({ id: "K_ENTER", text: "*Enter*" })] },
  });

  it("does not enumerate K_TAB for the output of its context conversion rule", () => {
    expect(enumerateTouchMethodsForChar(emuLayout, "y", { production: emuProduction })).toEqual([]);
  });

  it("enumerates K_ENTER for its bare-rule production (alt-layer newline)", () => {
    const result = enumerateTouchMethodsForChar(emuLayout, "\n", { production: emuProduction });
    expect(result.map((r) => r.id)).toEqual(["phone:alt:K_ENTER"]);
  });
});
