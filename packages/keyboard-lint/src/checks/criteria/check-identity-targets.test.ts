import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  checkDisplayNameUnderscore,
  checkIdContainsKeyboard,
} from "./check-identity.js";
import {
  checkTargetsAnyAlone,
  checkTargetsMobileWithoutTouch,
} from "./check-targets.js";

function ir(header: Parameters<typeof makeTestIR>[0]): KeyboardIR {
  return makeTestIR(header);
}

describe("checkIdContainsKeyboard (1.6)", () => {
  it("passes a clean id and display name", () => {
    const kb = ir({ header: { keyboardId: "ewondo", name: "Ewondo" } });
    expect(checkIdContainsKeyboard(kb).findings).toEqual([]);
  });

  it("flags an id containing the word keyboard", () => {
    const kb = ir({ header: { keyboardId: "ewo_keyboard", name: "Ewondo" } });
    const { findings } = checkIdContainsKeyboard(kb);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_ID_CONTAINS_KEYBOARD");
    expect(findings[0]!.message).toContain("ID");
  });

  it("flags a display name containing the word Keyboard", () => {
    const kb = ir({
      header: { keyboardId: "ewondo", name: "Ewondo Keyboard" },
    });
    const { findings } = checkIdContainsKeyboard(kb);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("Display name");
  });

  it("also judges a differing .kps display name", () => {
    const kb = ir({ header: { keyboardId: "ewondo", name: "Ewondo" } });
    expect(checkIdContainsKeyboard(kb, "Ewondo keyboard").findings).toHaveLength(1);
  });
});

describe("checkDisplayNameUnderscore (7.7a)", () => {
  it("passes a display name with spaces", () => {
    const kb = ir({ header: { keyboardId: "ewondo", name: "Ewondo QWERTY" } });
    expect(checkDisplayNameUnderscore(kb).findings).toEqual([]);
  });

  it("flags a literal underscore in the display name", () => {
    const kb = ir({ header: { keyboardId: "ewondo", name: "Ewondo_QWERTY" } });
    const { findings } = checkDisplayNameUnderscore(kb);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_DISPLAY_NAME_UNDERSCORE");
  });
});

describe("checkTargetsAnyAlone (7.2)", () => {
  it("passes `any` alone", () => {
    const kb = ir({ header: { keyboardId: "x", targets: ["any"] } });
    expect(checkTargetsAnyAlone(kb).findings).toEqual([]);
  });

  it("passes an explicit platform list without `any`", () => {
    const kb = ir({ header: { keyboardId: "x", targets: ["windows", "web"] } });
    expect(checkTargetsAnyAlone(kb).findings).toEqual([]);
  });

  it("flags `any` combined with individual platforms", () => {
    const kb = ir({ header: { keyboardId: "x", targets: ["any", "windows"] } });
    const { findings } = checkTargetsAnyAlone(kb);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_TARGETS_ANY_NOT_ALONE");
  });
});

describe("checkTargetsMobileWithoutTouch (7.3)", () => {
  it("flags mobile targets with no touch layout", () => {
    const kb = ir({ header: { keyboardId: "x", targets: ["mobile", "web"] } });
    const { findings } = checkTargetsMobileWithoutTouch(kb, false);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_TARGETS_MOBILE_WITHOUT_TOUCH");
  });

  it("passes mobile targets when a touch layout exists", () => {
    const kb = ir({ header: { keyboardId: "x", targets: ["mobile"] } });
    expect(checkTargetsMobileWithoutTouch(kb, true).findings).toEqual([]);
  });

  it("passes non-mobile targets regardless of touch layout", () => {
    const kb = ir({ header: { keyboardId: "x", targets: ["windows"] } });
    expect(checkTargetsMobileWithoutTouch(kb, false).findings).toEqual([]);
  });
});
