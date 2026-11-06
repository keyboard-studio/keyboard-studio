// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import * as caps from "@keyboard-studio/engine/caps";
import {
  checkTouchCapsLayer,
  checkTouchModifierKeys,
  checkTouchSymbolsLayer,
} from "@keymanapp/keyboard-lint";

import {
  TOUCH_CAPS_LAYER,
  TOUCH_MODIFIER_KEYS,
  TOUCH_SYMBOLS_LAYER,
} from "./touchUpgradePairs.ts";
import { offerUpgrades, upgradePairFor } from "./upgradePairs.ts";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../engine/src/caps/__fixtures__");
const TOUCH = "source/basic_kbdus.keyman-touch-layout";
const touchText = readFileSync(`${FIXTURES}/upstream_basic_kbdus/basic_kbdus.keyman-touch-layout`, "utf8");

function inputFor(files: Record<string, string>) {
  return {
    file: "source/basic_kbdus.kmn",
    kmnText: "",
    keyboardId: "basic_kbdus",
    bcp47: "en",
    caps,
    readText: (p: string) => files[p],
    paths: Object.keys(files),
  };
}

const run = (check: typeof checkTouchCapsLayer | typeof checkTouchSymbolsLayer | typeof checkTouchModifierKeys, text: string) =>
  check(parseTouchLayoutString(text), TOUCH).findings.length;

describe("touch upgrade pairs", () => {
  it("registers 18.16, 18.17 and 18.18", () => {
    for (const rule of [TOUCH_CAPS_LAYER, TOUCH_MODIFIER_KEYS, TOUCH_SYMBOLS_LAYER]) {
      expect(upgradePairFor(rule), rule).toBeDefined();
    }
  });

  it("offers nothing when the working copy has no touch layout", async () => {
    const offers = await offerUpgrades(
      [TOUCH_CAPS_LAYER, TOUCH_MODIFIER_KEYS, TOUCH_SYMBOLS_LAYER],
      inputFor({ "source/basic_kbdus.kmn": "" }),
    );
    expect(offers).toEqual([]);
  });

  it("ignores a touch layout under tests/", async () => {
    const offers = await offerUpgrades([TOUCH_CAPS_LAYER], inputFor({ "tests/x.keyman-touch-layout": touchText }));
    expect(offers).toEqual([]);
  });

  it("18.16: offers the full caps layers on upstream basic_kbdus with before/after, applying nothing", async () => {
    expect(run(checkTouchCapsLayer, touchText)).toBeGreaterThan(0);
    const [offer] = await offerUpgrades([TOUCH_CAPS_LAYER], inputFor({ [TOUCH]: touchText }));
    expect(offer).toBeDefined();
    expect(offer!.file).toBe(TOUCH);
    expect(offer!.fix.kind).toBe("upgrade");
    expect(offer!.fix.status).toBe("pending");
    expect(offer!.fix.preview).toEqual([{ file: TOUCH, before: touchText, after: offer!.afterText }]);
    // The fixer's output is exactly what the check accepts.
    expect(run(checkTouchCapsLayer, offer!.afterText)).toBe(0);
  });

  it("18.16: no offer once the layout is complete", async () => {
    const [first] = await offerUpgrades([TOUCH_CAPS_LAYER], inputFor({ [TOUCH]: touchText }));
    const again = await offerUpgrades([TOUCH_CAPS_LAYER], inputFor({ [TOUCH]: first!.afterText }));
    expect(again).toEqual([]);
  });

  it("18.18: offers the symbols layer on upstream basic_kbdus; the result passes the check", async () => {
    expect(run(checkTouchSymbolsLayer, touchText)).toBeGreaterThan(0);
    const [offer] = await offerUpgrades([TOUCH_SYMBOLS_LAYER], inputFor({ [TOUCH]: touchText }));
    expect(offer).toBeDefined();
    expect(run(checkTouchSymbolsLayer, offer!.afterText)).toBe(0);
    expect(offer!.afterText).toContain('"K_SYMBOLS"');
  });

  it("18.17: offers consistent Ctrl/RAlt keys; the result passes the check", async () => {
    const legacy = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_LCONTROL", text: "*Alt*", sp: "1", nextlayer: "rightalt" }] }] },
          { id: "rightalt", row: [{ id: 1, key: [{ id: "K_LCONTROL", text: "default", sp: "1", nextlayer: "default" }] }] },
        ],
      },
    });
    expect(run(checkTouchModifierKeys, legacy)).toBeGreaterThan(0);
    const [offer] = await offerUpgrades([TOUCH_MODIFIER_KEYS], inputFor({ [TOUCH]: legacy }));
    expect(offer).toBeDefined();
    expect(run(checkTouchModifierKeys, offer!.afterText)).toBe(0);
  });

  it("18.17: no offer for upstream basic_kbdus (no legacy modifier keys)", async () => {
    expect(await offerUpgrades([TOUCH_MODIFIER_KEYS], inputFor({ [TOUCH]: touchText }))).toEqual([]);
  });

  it("all three upgrades together leave a layout every touch check accepts", async () => {
    let text = touchText;
    for (const rule of [TOUCH_CAPS_LAYER, TOUCH_MODIFIER_KEYS, TOUCH_SYMBOLS_LAYER]) {
      const [offer] = await offerUpgrades([rule], inputFor({ [TOUCH]: text }));
      if (offer) text = offer.afterText;
    }
    expect(run(checkTouchCapsLayer, text)).toBe(0);
    expect(run(checkTouchModifierKeys, text)).toBe(0);
    expect(run(checkTouchSymbolsLayer, text)).toBe(0);
  });

  it("skipping one upgrade leaves the others' text independent", async () => {
    const [symbols] = await offerUpgrades([TOUCH_SYMBOLS_LAYER], inputFor({ [TOUCH]: touchText }));
    const [capsOnly] = await offerUpgrades([TOUCH_CAPS_LAYER], inputFor({ [TOUCH]: touchText }));
    expect(symbols!.afterText).not.toBe(capsOnly!.afterText);
    expect(run(checkTouchCapsLayer, symbols!.afterText)).toBeGreaterThan(0);
  });
});
