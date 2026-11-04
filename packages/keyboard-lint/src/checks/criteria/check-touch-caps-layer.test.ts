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
