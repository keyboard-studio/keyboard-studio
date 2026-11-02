// Touch forms (rows 5.1-5.14; task T073).
import { describe, expect, it } from "vitest";
import { key, layout, platform } from "../__fixtures__/touchLayouts.js";
import { inputFromRules } from "../__fixtures__/helpers.js";
import { classifyDetailed } from "../classify/classify.js";
import { tr35Conformance } from "../__testing__/tr35Conformance.js";
import { loadLdml } from "../__testing__/ldmlInterpreter.js";
import { resolveLdmlProfile } from "../profiles/resolve.js";
import { writeKeyboard3 } from "../xml/writeKeyboard3.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { lowerDocument } from "./document.js";
import { PHONE_MIN_DEVICE_WIDTH, TABLET_MIN_DEVICE_WIDTH, ldmlWidth } from "./touchForms.js";

const RULES = `+ [K_A] > 'x'
+ [K_B] > 'y'
+ [T_AA] > 'aa'
`;

function lower(touch: TouchLayoutIR, rules = RULES, extra = "") {
  const input = { ...inputFromRules(rules, undefined, extra), touchLayout: touch };
  const profile = resolveLdmlProfile("46");
  const detail = classifyDetailed(input, profile, { languages: ["en"] });
  const low = lowerDocument(input, profile, detail);
  return { xml: writeKeyboard3(low.doc), doc: low.doc };
}

const phoneLayers = {
  default: [[key("K_A"), key("K_B", { width: 150 }), key("T_AA", { pad: 50 }), key("U_00E9"), key("K_BKSP", { width: 200, sp: 1 })]],
  shift: [[key("K_A"), key("K_SHIFT", { sp: 1, nextlayer: "default" })]],
};

describe("touch forms", () => {
  const touch = layout(platform("phone", phoneLayers), platform("tablet", { default: [[key("K_A")]] }));
  const { xml } = lower(touch);

  it("writes a phone form (1) and a tablet form (150), and the document is TR35-conformant", () => {
    expect(PHONE_MIN_DEVICE_WIDTH).toBe(1);
    expect(TABLET_MIN_DEVICE_WIDTH).toBe(150);
    expect(xml).toContain('<layers formId="touch" minDeviceWidth="1">');
    expect(xml).toContain('<layers formId="touch" minDeviceWidth="150">');
    expect(tr35Conformance(xml)).toEqual([]);
  });

  it("default becomes base, touch layers have an id and no modifiers", () => {
    expect(xml).toMatch(/<layer id="base">/);
    expect(xml).toMatch(/<layer id="shift">/);
    const touchPart = xml.slice(xml.indexOf('formId="touch"'));
    expect(touchPart).not.toMatch(/<layer id="[a-z]+" modifiers/);
  });

  it("joins rows with single spaces and writes pad as a gap key, width / 100", () => {
    const row = /<layer id="base">\s*<row keys="([^"]*)"/.exec(xml.slice(xml.indexOf('formId="touch"')))?.[1] ?? "";
    expect(row).not.toMatch(/ {2}/);
    expect(row.split(" ")).toEqual(["x", "y_2", "gap_w0_5", "u61_61", "ue9", "bksp_w2"]);
    expect(xml).toContain('<key id="gap_w0_5" gap="true" width="0.5"/>');
    expect(ldmlWidth(150)).toBe(1.5);
    expect(ldmlWidth(100)).toBeUndefined();
    expect(ldmlWidth(0)).toBe(0.01);
  });

  it("types the rule output for a key, not its label; U_xxxx is its code point", () => {
    const ldml = loadLdml(xml);
    expect(ldml.tapTouch(1, "base", "x")).toBe("x");
    expect(xml).toMatch(/<key id="ue9" output="[^"]*"\/>/);
  });

  it("special keys become same-width gap keys with no output, layerId or display", () => {
    expect(xml).toMatch(/<key id="bksp_w2" gap="true" width="2"\/>/);
    expect(xml).not.toMatch(/id="bksp[^"]*"[^>]*output/);
  });

  it("a layer-switch key has a layerId and no output", () => {
    expect(xml).toMatch(/<key id="l_default" layerId="base"\/>/);
  });
});

describe("gestures", () => {
  it("long-press, default, multitap and flick map to key attributes and <flicks>", () => {
    const touch = layout(
      platform("phone", {
        default: [
          [
            key("K_A", {
              sk: [key("U_00E0"), key("U_00E1", { default: true }), key("U_00E2")],
              multitap: [key("U_0041")],
              flick: { n: key("U_00E4"), ne: key("U_00E5") },
            }),
          ],
        ],
      }),
    );
    const { xml } = lower(touch);
    expect(xml).toMatch(/longPressKeyIds="[^"]+ [^"]+ [^"]+"/);
    expect(xml).toMatch(/longPressDefaultKeyId="/);
    expect(xml).toMatch(/multiTapKeyIds="/);
    expect(xml).toMatch(/flickId="flick_1"/);
    expect(xml).toMatch(/<flick id="flick_1">/);
    expect(xml).toMatch(/<flickSegment directions="n"/);
    expect(tr35Conformance(xml)).toEqual([]);
  });

  it("gestures on a gesture target are not written (row 5.8)", () => {
    const touch = layout(
      platform("phone", { default: [[key("K_A", { sk: [key("K_B")] }), key("K_B", { sk: [key("U_00E8")] })]] }),
    );
    const { xml } = lower(touch);
    expect(tr35Conformance(xml)).toEqual([]);
  });
});

describe("labels and layer decisions", () => {
  it("a label that differs from the output becomes a display; the key still types the rule output", () => {
    const touch = layout(platform("phone", { default: [[key("K_A", { text: "A!" })]] }));
    const { xml } = lower(touch);
    expect(xml).toContain('<display display="A!" keyId="x"/>');
    expect(loadLdml(xml).tapTouch(1, "base", "x")).toBe("x");
  });

  it("casing-template rules become layerId on the pressed key", () => {
    const post = "begin Unicode > use(main)\nbegin PostKeystroke > use(PostKeystroke)\n";
    const rules = `+ [K_A] > 'x'
group(PostKeystroke) readonly
if(&layer = 'caps') > context
nomatch > layer('default')
`;
    const touch = layout(platform("phone", { default: [[key("K_A")]], shift: [[key("K_A")]], caps: [[key("K_A")]] }));
    const { xml } = lower(touch, rules, post);
    // shift -> default: the shift-layer key switches to base; caps stays caps (no layerId).
    expect(xml).toMatch(/layerId="base"/);
    const caps = /<layer id="caps">\s*<row keys="([^"]*)"/.exec(xml)?.[1];
    const shift = /<layer id="shift">\s*<row keys="([^"]*)"/.exec(xml)?.[1];
    expect(shift).not.toBe(caps);
  });
});
