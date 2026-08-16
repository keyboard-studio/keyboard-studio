// resolveOutputKeyboardId — the single output-id resolution (spec 063 D4).
//
// The defect these lock down was a DIVERGENCE, not a wrong value: the download
// button's accessible name and the emitted zip filename each resolved the
// keyboard id their own way, so they disagreed the moment the author named the
// keyboard. Asserting the resolution rule here is what lets both call sites
// share it; the paired assertion that OutputScreen's aria-label actually
// announces the emitted id lives in OutputScreen.pickerScope.test.tsx.

import { describe, it, expect } from "vitest";
import { resolveOutputKeyboardId } from "./outputKeyboardId.ts";

describe("resolveOutputKeyboardId", () => {
  it("prefers the author's chosen id over the base's", () => {
    expect(resolveOutputKeyboardId({ keyboardId: "dagbanli" }, { id: "basic_kbdus" })).toBe(
      "dagbanli",
    );
  });

  it("falls back to the base id before the author has named the keyboard", () => {
    // Track 1 resets `identity` to null at instantiation and only gains
    // keyboardId at the project_name step — this is the pre-naming state, and
    // the base id is genuinely what output emits then (see output.identity.warn).
    expect(resolveOutputKeyboardId(null, { id: "basic_kbdus" })).toBe("basic_kbdus");
  });

  it("falls back to the base id when identity exists but carries no keyboardId", () => {
    // A Track 2 import can set displayName/bcp47 without ever setting keyboardId,
    // so a present-but-partial identity must not shadow the base id with "".
    expect(resolveOutputKeyboardId({}, { id: "basic_kbdus" })).toBe("basic_kbdus");
  });

  it("resolves to the empty string before instantiation", () => {
    // Cold arrival at #output: no working copy, so there is no id to announce
    // and no artifact to name one for.
    expect(resolveOutputKeyboardId(null, null)).toBe("");
  });

  it("still prefers a chosen id when there is no base to fall back to", () => {
    expect(resolveOutputKeyboardId({ keyboardId: "dagbanli" }, null)).toBe("dagbanli");
  });
});
