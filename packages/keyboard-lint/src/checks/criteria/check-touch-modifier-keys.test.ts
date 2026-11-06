import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { checkTouchModifierKeys } from "./check-touch-modifier-keys.js";

const PATH = "source/demo.keyman-touch-layout";
const FORK = new URL(
  "../../../../../../keyboards/release/basic/basic_kbdwol/source/basic_kbdwol.keyman-touch-layout",
  import.meta.url,
);

type Key = Record<string, unknown>;
function layout(layers: Record<string, Key[]>) {
  return parseTouchLayoutString(
    JSON.stringify({
      tablet: { layer: Object.entries(layers).map(([id, key]) => ({ id, row: [{ id: 1, key }] })) },
    }),
  );
}
const messages = (r: ReturnType<typeof checkTouchModifierKeys>) => r.findings.map((f) => f.message).join("\n");

describe("checkTouchModifierKeys (18.17)", () => {
  it("passes with a reason when there is no touch layout", () => {
    const r = checkTouchModifierKeys(undefined, PATH);
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/no touch layout/i);
  });

  it("passes a layout without Ctrl or RAlt keys", () => {
    const r = checkTouchModifierKeys(layout({ default: [{ id: "K_Q", text: "q" }] }), PATH);
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/nothing to check/i);
  });

  it("passes the canonical RAlt and Ctrl keys", () => {
    const r = checkTouchModifierKeys(
      layout({
        default: [
          { id: "K_RALT", text: "*RAlt*", sp: 1, nextlayer: "rightalt" },
          { id: "K_LCONTROL", text: "*Ctrl*", sp: 1, nextlayer: "ctrl" },
        ],
        rightalt: [{ id: "K_RALT", text: "*RAlt*", sp: 2, nextlayer: "default" }],
        ctrl: [{ id: "K_LCONTROL", text: "*Ctrl*", sp: 2, nextlayer: "default" }],
      }),
      PATH,
    );
    expect(r.findings).toEqual([]);
  });

  it("flags legacy spellings, wrong ids and a missing active style", () => {
    const r = checkTouchModifierKeys(
      layout({
        default: [
          { id: "K_LCONTROL", text: "*Alt*", sp: 1, nextlayer: "rightalt" },
          { id: "K_LCONTROL", text: "ctrl", sp: 1, nextlayer: "ctrl" },
        ],
        rightalt: [{ id: "K_LCONTROL", text: "default", sp: 1, nextlayer: "default" }],
      }),
      PATH,
    );
    expect(r.code).toBe("KM_LINT_TOUCH_MODIFIER_KEYS");
    const msg = messages(r);
    expect(msg).toContain('layer "default"');
    expect(msg).toContain('K_LCONTROL "*Alt*" (id, text)');
    expect(msg).toContain('K_LCONTROL "ctrl" (text)');
    expect(msg).toContain('layer "rightalt"');
    expect(msg).toContain('K_LCONTROL "default" (id, text, sp)');
  });

  it("flags a RAlt key on shift that ignores rightalt-shift", () => {
    const r = checkTouchModifierKeys(
      layout({
        shift: [{ id: "K_LCONTROL", text: "rightalt", sp: 1, nextlayer: "rightalt" }],
        "rightalt-shift": [{ id: "K_Q", text: "Q" }],
      }),
      PATH,
    );
    expect(messages(r)).toContain("nextlayer");
  });

  it("ignores blank keys and unrelated keys", () => {
    const r = checkTouchModifierKeys(
      layout({ default: [{ id: "K_LCONTROL", text: "", sp: 9 }, { id: "K_SHIFT", text: "*Shift*", sp: 1 }] }),
      PATH,
    );
    expect(r.findings).toEqual([]);
  });

  it.skipIf(!existsSync(FORK))("passes the fork basic_kbdwol layout", () => {
    expect(checkTouchModifierKeys(parseTouchLayoutString(readFileSync(FORK, "utf8")), PATH).findings).toEqual([]);
  });
});
