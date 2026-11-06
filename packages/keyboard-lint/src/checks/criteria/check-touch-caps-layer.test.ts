import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { checkTouchCapsLayer } from "./check-touch-caps-layer.js";

const PATH = "source/demo.keyman-touch-layout";
const engineFx = (p: string) =>
  readFileSync(
    new URL(`../../../../engine/src/caps/__fixtures__/${p}`, import.meta.url),
    "utf8",
  );
const WOL = new URL(
  "../../../../../../keyboards/release/basic/basic_kbdwol/source/basic_kbdwol.keyman-touch-layout",
  import.meta.url,
);

const MESSAGES = (r: ReturnType<typeof checkTouchCapsLayer>) =>
  r.findings.map((f) => f.message).join("\n");

describe("checkTouchCapsLayer (18.16)", () => {
  it("fails the upstream basic_kbdus layout: no caps layer", () => {
    const ir = parseTouchLayoutString(
      engineFx("upstream_basic_kbdus/basic_kbdus.keyman-touch-layout"),
    );
    const r = checkTouchCapsLayer(ir, PATH);
    expect(r.code).toBe("KM_LINT_TOUCH_CAPS_LAYER");
    expect(r.findings.length).toBeGreaterThan(0);
    expect(MESSAGES(r)).toContain("no caps layer");
  });

  it.skipIf(!existsSync(WOL))("passes the fork basic_kbdwol layout pattern", () => {
    const ir = parseTouchLayoutString(readFileSync(WOL, "utf8"));
    const r = checkTouchCapsLayer(ir, PATH);
    expect(r.findings).toEqual([]);
  });

  it("caps_missing_letters lists the two letters and the switching key", () => {
    const ir = parseTouchLayoutString(
      engineFx("touch/caps_missing_letters.keyman-touch-layout"),
    );
    const msg = MESSAGES(checkTouchCapsLayer(ir, PATH));
    expect(msg).toMatch(/caps layer lacks:.*Q \(K_Q\)/);
    expect(msg).toContain("W (K_W)");
    expect(msg).toMatch(/switch layer after typing:.*K_E/);
  });

  it("caps_no_doubletap reports the missing double-tap", () => {
    const ir = parseTouchLayoutString(
      engineFx("touch/caps_no_doubletap.keyman-touch-layout"),
    );
    const msg = MESSAGES(checkTouchCapsLayer(ir, PATH));
    expect(msg).toContain("Shift on default has no double-tap to caps");
    expect(msg).not.toContain("no caps layer");
  });

  it("passes with a reason when there is no touch layout", () => {
    const r = checkTouchCapsLayer(undefined, PATH);
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/no touch layout/i);
  });

  it("passes with a reason for a mnemonic keyboard", () => {
    const ir = parseTouchLayoutString(
      engineFx("upstream_basic_kbdus/basic_kbdus.keyman-touch-layout"),
    );
    const r = checkTouchCapsLayer(ir, PATH, { mnemonic: true });
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/mnemonic/i);
  });

  it("passes with a reason when the default layer has no cased letters", () => {
    const ir = parseTouchLayoutString(
      JSON.stringify({
        tablet: {
          layer: [
            {
              id: "default",
              row: [{ id: 1, key: [{ id: "K_1", text: "1" }, { id: "K_2", text: "2" }] }],
            },
          ],
        },
      }),
    );
    const r = checkTouchCapsLayer(ir, PATH);
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/no cased letters/i);
  });
});

describe("checkTouchCapsLayer (18.16) full Capsifesto requirements", () => {
  type Key = Record<string, unknown>;
  const k = (id: string, text: string, extra: Key = {}): Key => ({ id, text, ...extra });
  /** A small complete layout: default, shift, caps, rightalt, rightalt-shift, rightalt-caps. */
  function layout(edit: (layers: Record<string, Key[]>) => void = () => undefined) {
    const layers: Record<string, Key[]> = {
      default: [k("K_Q", "q"), k("K_SHIFT", "*Shift*", { sp: 1, nextlayer: "shift", multitap: [{ id: "T_CAPS", text: "*ShiftLock*", nextlayer: "caps" }] }), k("K_SPACE", "")],
      shift: [k("K_Q", "Q", { nextlayer: "default" }), k("K_SHIFT", "*Shifted*", { sp: 2, nextlayer: "default" }), k("K_SPACE", "", { nextlayer: "default" })],
      caps: [k("K_Q", "Q"), k("K_SHIFT", "*ShiftedLock*", { sp: 2, nextlayer: "default" }), k("K_SPACE", "")],
      rightalt: [k("K_Q", "ä", { nextlayer: "default" }), k("K_SHIFT", "*Shift*", { sp: 1, nextlayer: "rightalt-shift", multitap: [{ id: "T_CAPS", text: "*ShiftLock*", nextlayer: "rightalt-caps" }] }), k("K_SPACE", "", { nextlayer: "default" })],
      "rightalt-shift": [k("K_Q", "Ä", { nextlayer: "default" }), k("K_SHIFT", "*Shifted*", { sp: 2, nextlayer: "rightalt" }), k("K_SPACE", "", { nextlayer: "default" })],
      "rightalt-caps": [k("K_Q", "Ä"), k("K_SHIFT", "*ShiftedLock*", { sp: 2, nextlayer: "rightalt" }), k("K_SPACE", "")],
    };
    edit(layers);
    return parseTouchLayoutString(
      JSON.stringify({
        tablet: { layer: Object.entries(layers).map(([id, keys]) => ({ id, row: [{ id: 1, key: keys }] })) },
      }),
    );
  }

  it("passes the complete layout", () => {
    expect(checkTouchCapsLayer(layout(), PATH).findings).toEqual([]);
  });

  it("reports a missing rightalt-caps and ctrl-caps", () => {
    const ir = layout((l) => {
      delete l["rightalt-caps"];
      l["shift-ctrl"] = [k("K_Q", "Q", { nextlayer: "default" })];
    });
    const msg = MESSAGES(checkTouchCapsLayer(ir, PATH));
    expect(msg).toContain("no rightalt-caps layer although rightalt-shift exists");
    expect(msg).toContain("no ctrl-caps layer although shift-ctrl exists");
  });

  it("reports a missing double-tap on rightalt", () => {
    const ir = layout((l) => {
      for (const key of l["rightalt"]!) delete key["multitap"];
    });
    expect(MESSAGES(checkTouchCapsLayer(ir, PATH))).toContain("Shift on rightalt has no double-tap to rightalt-caps");
  });

  it("reports character keys that stay on a non-default layer", () => {
    const ir = layout((l) => {
      delete l["shift"]![0]!["nextlayer"];
    });
    expect(MESSAGES(checkTouchCapsLayer(ir, PATH))).toMatch(/shift character keys stay on the layer.*K_Q/);
  });

  it("does not hold special keys to one-shot", () => {
    const ir = layout((l) => {
      l["rightalt"]!.push(k("K_LOPT", "*Menu*", { sp: 1 }));
    });
    expect(checkTouchCapsLayer(ir, PATH).findings).toEqual([]);
  });

  it("reports Shift labels and targets on shift and caps layers", () => {
    const ir = layout((l) => {
      l["shift"]![1] = k("K_SHIFT", "*Shift*", { sp: 2, nextlayer: "default" });
      l["rightalt-caps"]![1] = k("K_SHIFT", "*ShiftedLock*", { sp: 2, nextlayer: "default" });
    });
    const msg = MESSAGES(checkTouchCapsLayer(ir, PATH));
    expect(msg).toContain("Shift on shift is not *Shifted* returning to default");
    expect(msg).toContain("Shift on rightalt-caps is not *ShiftedLock* returning to rightalt");
  });

  it("reports rightalt-caps character keys that switch layer", () => {
    const ir = layout((l) => {
      l["rightalt-caps"]![0]!["nextlayer"] = "default";
    });
    expect(MESSAGES(checkTouchCapsLayer(ir, PATH))).toContain("rightalt-caps keys switch layer after typing: K_Q");
  });
});
