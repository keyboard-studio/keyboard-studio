/**
 * Unit tests for applyTouchAssignmentsToRawJson.
 *
 * Tests are grouped into:
 *   1. Real fixture: sil_cameroon_qwerty (tablet-only, 8 layers)
 *      - structural fidelity: only the "tablet" platform key, all 8 layer ids,
 *        top-level fields preserved
 *      - longpress assignment lands on the correct key, others untouched
 *      - defaultHint:"dot" added when platform had none
 *      - spurious-warning guard: warn only when key missing from ALL platforms
 *   2. Synthetic phone-only and phone+tablet objects
 *   3. Mechanism semantics: flick, multitap, touch_inherited, unknown patternId
 *   4. Deduplication
 *   5. No mutation of the input string
 *   6. Defensive guards — malformed-but-parseable JSON (P0-1)
 *   7. Id-only sk deduplication — shared predicate (P1-2)
 *   8. isTouchSubKeyDuplicate unit tests
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyTouchAssignmentsToRawJson } from "./applyTouchAssignmentsToRawJson.js";
import { isTouchSubKeyDuplicate } from "./touch-mechanism-shared.js";
import { charToUnicodeKeyId } from "../codec/touch-ids.js";
import type { TouchAssignment } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Path to the real fixture keyboard
// ---------------------------------------------------------------------------

// Resolve relative to this test file's location, mirroring the pattern in
// integration.test.ts (the sibling keyboards checkout lives at ../../../../keyboards
// from packages/engine/src/<subdir>, i.e. 5 levels up from the test file).
const KEYBOARDS_ROOT = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards",
);

const CAMEROON_TOUCH_LAYOUT = path.join(
  KEYBOARDS_ROOT,
  "release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.keyman-touch-layout",
);

const fixtureExists = fs.existsSync(CAMEROON_TOUCH_LAYOUT);

// ---------------------------------------------------------------------------
// Helpers: build TouchAssignment objects
// ---------------------------------------------------------------------------

function longpress(hostKey: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "longpress_alternates", slotValues: { hostKey, char } }],
    source: "user",
  };
}

function flickAssignment(hostKey: string, direction: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "flick_gestures", slotValues: { hostKey, direction, char } }],
    source: "user",
  };
}

function multitap(hostKey: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "multitap", slotValues: { hostKey, char } }],
    source: "user",
  };
}

function inherited(char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "touch_inherited" }],
    source: "user",
  };
}

// ---------------------------------------------------------------------------
// Synthetic fixture helpers
// ---------------------------------------------------------------------------

/** Build a minimal raw touch layout JSON string with a phone-only platform. */
function makePhoneOnlyJson(
  defaultKeys: Array<{ id: string; text?: string; sk?: unknown[]; [k: string]: unknown }>,
): string {
  return JSON.stringify({
    phone: {
      layer: [
        { id: "default", row: [{ id: 1, key: defaultKeys }] },
        { id: "shift", row: [{ id: 1, key: [{ id: "K_SHIFT", text: "Shift" }] }] },
      ],
    },
  });
}

/** Build a minimal raw touch layout JSON string with both tablet and phone platforms. */
function makeTabletPhoneJson(
  tabletDefaultKeys: Array<{ id: string; text?: string }>,
  phoneDefaultKeys: Array<{ id: string; text?: string }>,
): string {
  return JSON.stringify({
    tablet: {
      layer: [{ id: "default", row: [{ id: 1, key: tabletDefaultKeys }] }],
    },
    phone: {
      layer: [{ id: "default", row: [{ id: 1, key: phoneDefaultKeys }] }],
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Real fixture: sil_cameroon_qwerty
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — real fixture: sil_cameroon_qwerty", () => {
  // Read the fixture once for all tests in this group.
  const rawJson = fixtureExists ? fs.readFileSync(CAMEROON_TOUCH_LAYOUT, "utf-8") : "";

  it.skipIf(!fixtureExists)("result JSON parses and has ONLY the 'tablet' platform (no 'phone' synthesized)", () => {
    const { json, warnings } = applyTouchAssignmentsToRawJson(rawJson, []);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys).toEqual(["tablet"]);
    expect(parsed["phone"]).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it.skipIf(!fixtureExists)("tablet platform has displayUnderlying=false and font='Andika Afr' preserved", () => {
    const { json } = applyTouchAssignmentsToRawJson(rawJson, []);
    const parsed = JSON.parse(json) as { tablet: { displayUnderlying: boolean; font: string } };
    expect(parsed.tablet.displayUnderlying).toBe(false);
    expect(parsed.tablet.font).toBe("Andika Afr");
  });

  it.skipIf(!fixtureExists)("all 8 layer ids are preserved verbatim", () => {
    const { json } = applyTouchAssignmentsToRawJson(rawJson, []);
    const parsed = JSON.parse(json) as { tablet: { layer: Array<{ id: string }> } };
    const layerIds = parsed.tablet.layer.map((l) => l.id);
    expect(layerIds).toEqual([
      "default",
      "shift",
      "symbol",
      "rightalt",
      "rightalt-shift",
      "caps",
      "rightalt-caps",
      "symbol-caps",
    ]);
  });

  it.skipIf(!fixtureExists)(
    "longpress assignment adds sk[] to the target key and does not alter other keys",
    () => {
      // K_Q is present in the tablet default layer (row 2, first key after pad).
      // It has no sk[] in the source fixture.
      const { json, warnings } = applyTouchAssignmentsToRawJson(rawJson, [
        longpress("K_Q", "q́"), // q + combining acute → "q́"
      ]);
      expect(warnings).toHaveLength(0);

      const parsed = JSON.parse(json) as {
        tablet: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
      };
      const defLayer = parsed.tablet.layer.find((l) => l.id === "default")!;
      const allKeys = defLayer.row.flatMap((r) => r.key);

      // Find K_Q.
      const kq = allKeys.find((k) => k.id === "K_Q")!;
      expect(kq).toBeDefined();
      expect(Array.isArray(kq.sk)).toBe(true);
      expect((kq.sk as unknown[]).length).toBe(1);

      // Every other key that had no sk[] should still have none.
      const kbksp = allKeys.find((k) => k.id === "K_BKSP")!;
      expect(kbksp.sk).toBeUndefined();
    },
  );

  it.skipIf(!fixtureExists)(
    "tablet platform gains defaultHint:'dot' because it had no defaultHint and gained sk[] entries",
    () => {
      const { json } = applyTouchAssignmentsToRawJson(rawJson, [
        longpress("K_Q", "q́"), // any char will do
      ]);
      const parsed = JSON.parse(json) as { tablet: { defaultHint?: string } };
      expect(parsed.tablet.defaultHint).toBe("dot");
    },
  );

  it.skipIf(!fixtureExists)(
    "existing sk[] on K_W (already has 'ẅ') is left untouched when K_W is not the host key",
    () => {
      const { json } = applyTouchAssignmentsToRawJson(rawJson, [
        longpress("K_Q", "x"), // only K_Q is targeted
      ]);
      const parsed = JSON.parse(json) as {
        tablet: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: Array<{ text?: string }> }> }> }> };
      };
      const defLayer = parsed.tablet.layer.find((l) => l.id === "default")!;
      const allKeys = defLayer.row.flatMap((r) => r.key);
      const kw = allKeys.find((k) => k.id === "K_W")!;
      // K_W has one pre-existing sk entry: { text: "ẅ", id: "U_1E85" }
      expect(kw.sk).toBeDefined();
      expect(kw.sk!.length).toBe(1);
      expect(kw.sk![0]!.text).toBe("ẅ");
    },
  );

  it.skipIf(!fixtureExists)(
    "an assignment whose hostKey is in no platform's default layer produces exactly one warning",
    () => {
      const { json, warnings } = applyTouchAssignmentsToRawJson(rawJson, [
        longpress("K_NONEXISTENT_9999", "x"),
      ]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/host key "K_NONEXISTENT_9999" not found/);
      // JSON is still valid
      expect(() => JSON.parse(json)).not.toThrow();
    },
  );

  it.skipIf(!fixtureExists)(
    "no defaultHint is added when no assignments produce new sk[] entries",
    () => {
      // An empty assignment list — no sk[] entries are added.
      const { json } = applyTouchAssignmentsToRawJson(rawJson, []);
      const parsed = JSON.parse(json) as { tablet: { defaultHint?: string } };
      // The source fixture has no defaultHint — it must remain absent.
      expect(parsed.tablet.defaultHint).toBeUndefined();
    },
  );

  it.skipIf(!fixtureExists)(
    "defaultHint is left untouched when the platform already has one",
    () => {
      // Inject a defaultHint into a copy of the fixture to simulate a platform
      // that already has one, then verify we do not overwrite it.
      const withHint = JSON.parse(rawJson) as { tablet: { defaultHint?: string } };
      withHint.tablet.defaultHint = "circle";
      const { json } = applyTouchAssignmentsToRawJson(JSON.stringify(withHint), [
        longpress("K_Q", "x"),
      ]);
      const parsed = JSON.parse(json) as { tablet: { defaultHint?: string } };
      expect(parsed.tablet.defaultHint).toBe("circle");
    },
  );
});

// ---------------------------------------------------------------------------
// 2. Synthetic: phone-only and phone+tablet
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — synthetic phone-only object", () => {
  it("assignment applies to the phone platform", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }, { id: "K_B", text: "b" }]);
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á")]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: Array<{ id: string; text?: string }> }> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
    expect(ka.sk![0]!.id).toBe("U_00E1");
    expect(ka.sk![0]!.text).toBe("á");
  });

  it("phone platform gains defaultHint:'dot' when it had none and gained new sk[]", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out } = applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á")]);
    const parsed = JSON.parse(out) as { phone: { defaultHint?: string } };
    expect(parsed.phone.defaultHint).toBe("dot");
  });
});

describe("applyTouchAssignmentsToRawJson — synthetic phone+tablet object", () => {
  it("assignment applies to both platforms when both have the host key in default layer", () => {
    const json = makeTabletPhoneJson(
      [{ id: "K_A", text: "a" }, { id: "K_B", text: "b" }],
      [{ id: "K_A", text: "a" }, { id: "K_C", text: "c" }],
    );
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á")]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      tablet: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const tabletDef = parsed.tablet.layer.find((l) => l.id === "default")!;
    const tabletKa = tabletDef.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(tabletKa.sk).toHaveLength(1);

    const phoneDef = parsed.phone.layer.find((l) => l.id === "default")!;
    const phoneKa = phoneDef.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(phoneKa.sk).toHaveLength(1);
  });

  it("no warning when host key is present in at least one platform but absent in the other", () => {
    // K_B exists only in tablet, not in phone.
    const json = makeTabletPhoneJson(
      [{ id: "K_A", text: "a" }, { id: "K_B", text: "b" }],
      [{ id: "K_A", text: "a" }, { id: "K_C", text: "c" }],
    );
    const { warnings } = applyTouchAssignmentsToRawJson(json, [longpress("K_B", "b́")]);
    // K_B found in tablet's default layer → no warning (per locked decision 4).
    expect(warnings).toHaveLength(0);
  });

  it("one warning when host key is absent in ALL platforms", () => {
    const json = makeTabletPhoneJson(
      [{ id: "K_A", text: "a" }],
      [{ id: "K_A", text: "a" }],
    );
    const { warnings } = applyTouchAssignmentsToRawJson(json, [longpress("K_MISSING", "x")]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/K_MISSING/);
  });
});

// ---------------------------------------------------------------------------
// 3. Mechanism semantics
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — flick", () => {
  it("sets flick[direction] with U_ id and text (no output field)", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [
      flickAssignment("K_A", "n", "à"),
    ]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; flick?: Record<string, { id: string; text?: string; output?: string }> }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.flick?.["n"]?.id).toBe("U_00E0");
    expect(ka.flick?.["n"]?.text).toBe("à");
    expect(ka.flick?.["n"]?.output).toBeUndefined();
  });

  it("last-wins per direction (two flicks to the same direction)", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out } = applyTouchAssignmentsToRawJson(json, [
      flickAssignment("K_A", "n", "à"),
      flickAssignment("K_A", "n", "ä"),
    ]);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; flick?: Record<string, { id: string; text?: string }> }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.flick?.["n"]?.id).toBe("U_00E4");
    expect(ka.flick?.["n"]?.text).toBe("ä");
  });
});

describe("applyTouchAssignmentsToRawJson — multitap", () => {
  it("adds to multitap[] with U_ id and text (no output field)", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [
      multitap("K_A", "â"),
    ]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; multitap?: Array<{ id: string; text?: string; output?: string }> }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(Array.isArray(ka.multitap)).toBe(true);
    expect(ka.multitap![0]!.id).toBe("U_00E2");
    expect(ka.multitap![0]!.text).toBe("â");
    expect(ka.multitap![0]!.output).toBeUndefined();
  });
});

describe("applyTouchAssignmentsToRawJson — touch_inherited", () => {
  it("is a no-op — JSON output equals re-stringified input, no warnings", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [inherited("a")]);
    expect(warnings).toHaveLength(0);
    // Both are valid JSON representing the same structure.
    expect(JSON.parse(out)).toEqual(JSON.parse(json));
  });
});

describe("applyTouchAssignmentsToRawJson — unknown patternId", () => {
  it("emits exactly one warning and does not modify the layout", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const bad: TouchAssignment = {
      scope: "individual",
      target: "x",
      modality: "touch",
      mechanisms: [{ patternId: "totally_unknown_pattern", slotValues: { hostKey: "K_A", char: "x" } }],
    };
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [bad]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("unknown patternId");
    expect(JSON.parse(out)).toEqual(JSON.parse(json));
  });
});

// ---------------------------------------------------------------------------
// 4. Deduplication
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — deduplication", () => {
  it("applying the same longpress twice yields exactly one sk entry", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out } = applyTouchAssignmentsToRawJson(json, [
      longpress("K_A", "á"),
      longpress("K_A", "á"),
    ]);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
  });

  it("existing sk entry (text match) is not duplicated", () => {
    // Key already has an sk entry with text "á".
    const json = makePhoneOnlyJson([
      { id: "K_A", text: "a", sk: [{ id: "U_00E1", text: "á" }] },
    ]);
    const { json: out } = applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á")]);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. No mutation of the input string
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — no mutation of input", () => {
  it("the input rawJson string is unchanged after the call", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const snapshot = JSON.parse(json) as object;
    applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á"), flickAssignment("K_A", "n", "à")]);
    // The parsed snapshot of the original should still equal the original structure.
    expect(JSON.parse(json)).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// 6. Defensive guards — malformed-but-parseable JSON (P0-1)
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — defensive array guards", () => {
  it("does NOT throw when the top level contains a non-platform string value", () => {
    // A top-level "_comment" key is a common pattern in hand-authored JSON files.
    const json = JSON.stringify({
      _comment: "This is a Keyman touch layout",
      phone: {
        layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
      },
    });
    // Must not throw — non-platform entry is silently skipped.
    let result: ReturnType<typeof applyTouchAssignmentsToRawJson> | undefined;
    expect(() => {
      result = applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á")]);
    }).not.toThrow();
    // The valid phone platform was still processed.
    expect(result).toBeDefined();
    const parsed = JSON.parse(result!.json) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
  });

  it("does NOT throw when a platform has no 'layer' array — valid platforms still processed", () => {
    // "broken" platform has no layer field; "phone" is normal.
    const json = JSON.stringify({
      broken: { displayUnderlying: false },
      phone: {
        layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
      },
    });
    let result: ReturnType<typeof applyTouchAssignmentsToRawJson> | undefined;
    expect(() => {
      result = applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á")]);
    }).not.toThrow();
    expect(result).toBeDefined();
    // The "broken" platform contributes no keyMap entries, so K_A is found only
    // in "phone". Expect no warnings (found in at least one platform).
    expect(result!.warnings).toHaveLength(0);
    const parsed = JSON.parse(result!.json) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
  });

  it("does NOT throw when a layer's row array is missing — that layer is skipped", () => {
    const json = JSON.stringify({
      phone: {
        layer: [
          { id: "default" }, // no 'row' field
        ],
      },
    });
    let result: ReturnType<typeof applyTouchAssignmentsToRawJson> | undefined;
    expect(() => {
      result = applyTouchAssignmentsToRawJson(json, [longpress("K_A", "á")]);
    }).not.toThrow();
    expect(result).toBeDefined();
    // K_A not found in any platform's default layer → one warning, no crash.
    expect(result!.warnings).toHaveLength(1);
    expect(result!.warnings[0]).toMatch(/K_A/);
  });
});

// ---------------------------------------------------------------------------
// 7. Id-only sk deduplication — shared predicate (P1-2)
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — id-only sk deduplication", () => {
  it("does NOT append a duplicate when an existing sk entry is id-only (no text/output)", () => {
    // Real shipped layouts may have { id: "U_00E1" } with no text or output.
    // The previous text/output-only dedupe missed these, causing a duplicate append.
    const char = "á";
    const uId = charToUnicodeKeyId(char); // "U_00E1"
    const json = makePhoneOnlyJson([
      { id: "K_A", text: "a", sk: [{ id: uId }] }, // id-only entry, no text
    ]);
    const { json: out } = applyTouchAssignmentsToRawJson(json, [longpress("K_A", char)]);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    // Still exactly 1 entry — the id-only match prevented a duplicate.
    expect(ka.sk).toHaveLength(1);
  });

  it("does NOT append a duplicate multitap when existing entry is id-only", () => {
    const char = "â";
    const uId = charToUnicodeKeyId(char); // "U_00E2"
    const json = makePhoneOnlyJson([
      { id: "K_A", text: "a", multitap: [{ id: uId }] },
    ]);
    const { json: out } = applyTouchAssignmentsToRawJson(json, [multitap("K_A", char)]);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; multitap?: unknown[] }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.multitap).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 8. isTouchSubKeyDuplicate unit tests
// ---------------------------------------------------------------------------

describe("isTouchSubKeyDuplicate", () => {
  const char = "á";
  const uId = charToUnicodeKeyId(char); // "U_00E1"

  it("returns true when existing.text matches char", () => {
    expect(isTouchSubKeyDuplicate({ id: "U_00E1", text: char }, char)).toBe(true);
  });

  it("returns true when existing.output matches char (backward-compat)", () => {
    expect(isTouchSubKeyDuplicate({ id: "U_0000", output: char }, char)).toBe(true);
  });

  it("returns true when existing.id matches U_<HEX> for char (id-only entry)", () => {
    expect(isTouchSubKeyDuplicate({ id: uId }, char)).toBe(true);
  });

  it("returns false when neither text/output nor id match", () => {
    expect(isTouchSubKeyDuplicate({ id: "U_0000", text: "x" }, char)).toBe(false);
  });

  it("returns false for an empty existing object", () => {
    expect(isTouchSubKeyDuplicate({}, char)).toBe(false);
  });
});
