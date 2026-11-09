// kmnCodeLint tests — parse-error mapping for the Code tab.

import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import { kmnErrorPosition, lintKmnCodeText, rawCtrlRuleKey } from "./kmnCodeLint.ts";
import { findRawCtrlRules } from "@keymanapp/keyboard-lint";

describe("kmnErrorPosition", () => {
  it("extracts line and column", () => {
    expect(kmnErrorPosition("Malformed rule at line 12:3: + [a]")).toEqual({
      line: 12,
      column: 3,
    });
  });

  it("extracts line-only positions", () => {
    expect(kmnErrorPosition("Malformed store declaration at line 5: foo")).toEqual({
      line: 5,
      column: 1,
    });
  });

  it("returns null when no position is present", () => {
    expect(kmnErrorPosition("Something went wrong")).toBeNull();
  });
});

describe("lintKmnCodeText", () => {
  const okParse = () => ({ ir: {}, opaqueFeatures: [] });

  it("passes when parse succeeds", () => {
    const result = lintKmnCodeText("store(&NAME) 'x'\n", okParse);
    expect(result.parsed).toBe(true);
    expect(result.markers).toHaveLength(0);
  });

  it("maps a positioned parse error to a marker", () => {
    const badParse = () => {
      throw new Error("Malformed rule at line 4:7: + [a]");
    };
    const result = lintKmnCodeText("bad", badParse);
    expect(result.parsed).toBe(false);
    expect(result.markers).toHaveLength(1);
    const m = result.markers[0]!;
    expect(m.severity).toBe("error");
    expect(m.code).toBe("KMN_SYNTAX");
    expect(m.startLineNumber).toBe(4);
    expect(m.startColumn).toBe(7);
  });

  it("maps a position-less error to a file-level marker", () => {
    const badParse = () => {
      throw new Error("Keyboard id mismatch");
    };
    const result = lintKmnCodeText("bad", badParse);
    expect(result.parsed).toBe(false);
    expect(result.markers[0]?.startLineNumber).toBe(1);
  });

  it("handles non-Error throws", () => {
    const badParse = () => {
      throw "string failure";
    };
    const result = lintKmnCodeText("bad", badParse);
    expect(result.parsed).toBe(false);
    expect(result.markers[0]?.message).toBe("string failure");
  });
});

describe("lintKmnCodeText — raw Ctrl block (issue #2359)", () => {
  const HEADER = `store(&VERSION) '10.0'\nstore(&NAME) 'Raw Ctrl Test'\n\n`;
  const kmnWith = (rules: string) =>
    `${HEADER}begin Unicode > use(main)\n\ngroup(main) using keys\n\n${rules}\n`;
  const parse = (text: string) => parseKmn(text, "raw-ctrl-test");

  it("refuses a newly typed raw-Ctrl rule: Apply is blocked", () => {
    const result = lintKmnCodeText(kmnWith(`+ [CTRL K_A] > 'é'`), parse, {
      keyboardId: "raw-ctrl-test",
      baselineRawCtrl: new Set(),
    });
    expect(result.parsed).toBe(false);
    expect(result.markers).toHaveLength(1);
    const m = result.markers[0]!;
    expect(m.code).toBe("KM_LINT_RAW_CTRL");
    expect(m.severity).toBe("error");
    expect(m.message).toContain("[CTRL K_A]");
  });

  it("warns, without blocking, on a raw-Ctrl rule already in the working copy", () => {
    const text = kmnWith(`+ [CTRL K_A] > 'é'`);
    const baseline = new Set(
      findRawCtrlRules(parse(text).ir, "raw-ctrl-test").map(rawCtrlRuleKey),
    );
    const result = lintKmnCodeText(text, parse, {
      keyboardId: "raw-ctrl-test",
      baselineRawCtrl: baseline,
    });
    expect(result.parsed).toBe(true);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]?.severity).toBe("warning");
  });

  it("still allows an edit that keeps the grandfathered rule and adds no raw Ctrl", () => {
    const text = kmnWith(`+ [CTRL K_A] > 'é'\n+ [SHIFT K_B] > 'b'`);
    const before = kmnWith(`+ [CTRL K_A] > 'é'`);
    const baseline = new Set(
      findRawCtrlRules(parse(before).ir, "raw-ctrl-test").map(rawCtrlRuleKey),
    );
    const result = lintKmnCodeText(text, parse, {
      keyboardId: "raw-ctrl-test",
      baselineRawCtrl: baseline,
    });
    expect(result.parsed).toBe(true);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]?.severity).toBe("warning");
  });

  it("blocks CTRL+SHIFT too (raw Ctrl, no Alt)", () => {
    const result = lintKmnCodeText(kmnWith(`+ [CTRL SHIFT K_A] > 'é'`), parse, {
      keyboardId: "raw-ctrl-test",
      baselineRawCtrl: new Set(),
    });
    expect(result.parsed).toBe(false);
    expect(result.markers[0]?.code).toBe("KM_LINT_RAW_CTRL");
  });

  it("blocks re-typing a grandfathered rule's output (new content on Ctrl)", () => {
    const before = kmnWith(`+ [CTRL K_A] > 'é'`);
    const baseline = new Set(
      findRawCtrlRules(parse(before).ir, "raw-ctrl-test").map(rawCtrlRuleKey),
    );
    const result = lintKmnCodeText(kmnWith(`+ [CTRL K_A] > 'è'`), parse, {
      keyboardId: "raw-ctrl-test",
      baselineRawCtrl: baseline,
    });
    expect(result.parsed).toBe(false);
  });

  it("allows CTRL+ALT (AltGr), sided LCTRL, and Ctrl+Space", () => {
    for (const rules of [
      `+ [CTRL ALT K_A] > 'é'`,
      `+ [LCTRL K_A] > 'é'`,
      `+ [CTRL K_SPACE] > ' '`,
    ]) {
      const result = lintKmnCodeText(kmnWith(rules), parse, {
        keyboardId: "raw-ctrl-test",
        baselineRawCtrl: new Set(),
      });
      expect(result.parsed).toBe(true);
      expect(result.markers).toHaveLength(0);
    }
  });

  it("exempts basic_* keyboards", () => {
    const result = lintKmnCodeText(kmnWith(`+ [CTRL K_A] > 'é'`), (t) =>
      parseKmn(t, "basic_kbdus"),
    {
      keyboardId: "basic_kbdus",
      baselineRawCtrl: new Set(),
    });
    expect(result.parsed).toBe(true);
    expect(result.markers).toHaveLength(0);
  });
});
