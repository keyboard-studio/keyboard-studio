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
import {
  applyTouchAssignmentsToRawJson,
  isBlankPlaceholder,
} from "./applyTouchAssignmentsToRawJson.js";
import { isTouchSubKeyDuplicate } from "./touch-mechanism-shared.js";
import { charToUnicodeKeyId } from "../shared/touch-ids.js";
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

function keyReplace(hostKey: string, char: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [{ patternId: "touch_key_replace", slotValues: { hostKey, char } }],
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

describe("applyTouchAssignmentsToRawJson — touch_key_replace (Case B)", () => {
  it("sets the raw key's id to the U_ id and text to the char, and drops stale output", () => {
    const json = makePhoneOnlyJson([{ id: "K_X", text: "x", output: "x" }]);
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [keyReplace("K_X", "ñ")]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const allKeys = defLayer.row.flatMap((r) => r.key);
    const replaced = allKeys.find((k) => k["id"] === "U_00F1")!;
    expect(replaced).toBeDefined();
    expect(replaced["text"]).toBe("ñ");
    expect(replaced["output"]).toBeUndefined();
    // Old K_X id is gone — the same object was mutated in place.
    expect(allKeys.find((k) => k["id"] === "K_X")).toBeUndefined();
  });

  it("preserves geometry and other raw key properties untouched", () => {
    const json = makePhoneOnlyJson([
      { id: "K_X", text: "x", sp: 1, pad: 5, width: 110, nextlayer: "shift" },
    ]);
    const { json: out } = applyTouchAssignmentsToRawJson(json, [keyReplace("K_X", "ñ")]);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const replaced = defLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "U_00F1")!;
    expect(replaced["sp"]).toBe(1);
    expect(replaced["pad"]).toBe(5);
    expect(replaced["width"]).toBe(110);
    expect(replaced["nextlayer"]).toBe("shift");
  });

  it("warns when the host key is absent from every platform's default layer", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { warnings } = applyTouchAssignmentsToRawJson(json, [keyReplace("K_MISSING", "ñ")]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/K_MISSING/);
  });

  it("applies to every matched platform when both tablet and phone have the host key", () => {
    const json = makeTabletPhoneJson(
      [{ id: "K_X", text: "x" }],
      [{ id: "K_X", text: "x" }],
    );
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [keyReplace("K_X", "ñ")]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      tablet: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
    };
    const tabletDef = parsed.tablet.layer.find((l) => l.id === "default")!;
    expect(tabletDef.row.flatMap((r) => r.key).find((k) => k["id"] === "U_00F1")).toBeDefined();
    const phoneDef = parsed.phone.layer.find((l) => l.id === "default")!;
    expect(phoneDef.row.flatMap((r) => r.key).find((k) => k["id"] === "U_00F1")).toBeDefined();
  });
});

describe("applyTouchAssignmentsToRawJson — multiple mechanisms per assignment", () => {
  it("applies every mechanism in a single assignment's mechanisms[] (longpress + multitap on the same host key)", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const combined: TouchAssignment = {
      scope: "individual",
      target: "a",
      modality: "touch",
      mechanisms: [
        { patternId: "longpress_alternates", slotValues: { hostKey: "K_A", char: "á" } },
        { patternId: "multitap", slotValues: { hostKey: "K_A", char: "â" } },
      ],
      source: "user",
    };
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [combined]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      phone: {
        layer: Array<{
          id: string;
          row: Array<{ key: Array<{ id: string; sk?: Array<{ id: string; text?: string }>; multitap?: Array<{ id: string; text?: string }> }> }>;
        }>;
      };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
    expect(ka.sk![0]!.text).toBe("á");
    expect(ka.multitap).toHaveLength(1);
    expect(ka.multitap![0]!.text).toBe("â");
  });

  it("applies mechanisms targeting two different host keys within one assignment", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }, { id: "K_B", text: "b" }]);
    const combined: TouchAssignment = {
      scope: "individual",
      target: "x",
      modality: "touch",
      mechanisms: [
        { patternId: "longpress_alternates", slotValues: { hostKey: "K_A", char: "á" } },
        { patternId: "multitap", slotValues: { hostKey: "K_B", char: "β" } },
      ],
      source: "user",
    };
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [combined]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      phone: {
        layer: Array<{
          id: string;
          row: Array<{ key: Array<{ id: string; sk?: Array<{ text?: string }>; multitap?: Array<{ text?: string }> }> }>;
        }>;
      };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row[0]!.key.find((k) => k.id === "K_A")!;
    const kb = defLayer.row[0]!.key.find((k) => k.id === "K_B")!;
    expect(ka.sk?.[0]?.text).toBe("á");
    expect(kb.multitap?.[0]?.text).toBe("β");
  });

  // Mirrors the Case A order-commutative pair in applyTouchAssignments.test.ts:
  // touch_key_replace rewrites the raw key's id/text in place; a same-host-key
  // longpress must still land (the key index is built from the ORIGINAL host
  // key id, so it is unaffected by the id rewrite). Order-commutative — same
  // result whichever mechanism runs first.
  it("touch_key_replace + longpress_alternates on the same host key: both apply, order-commutative (replace-then-longpress)", () => {
    const json = makePhoneOnlyJson([{ id: "K_X", text: "x" }]);
    const combined: TouchAssignment = {
      scope: "individual",
      target: "ñ",
      modality: "touch",
      mechanisms: [
        { patternId: "touch_key_replace", slotValues: { hostKey: "K_X", char: "ñ" } },
        { patternId: "longpress_alternates", slotValues: { hostKey: "K_X", char: "ń" } },
      ],
      source: "user",
    };
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [combined]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; text?: string; sk?: Array<{ id: string; text?: string }> }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const replaced = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "U_00F1")!;
    expect(replaced).toBeDefined();
    expect(replaced.text).toBe("ñ");
    expect(replaced.sk).toHaveLength(1);
    expect(replaced.sk![0]!.text).toBe("ń");
  });

  it("touch_key_replace + longpress_alternates on the same host key: both apply, order-commutative (longpress-then-replace)", () => {
    const json = makePhoneOnlyJson([{ id: "K_X", text: "x" }]);
    const combined: TouchAssignment = {
      scope: "individual",
      target: "ñ",
      modality: "touch",
      mechanisms: [
        { patternId: "longpress_alternates", slotValues: { hostKey: "K_X", char: "ń" } },
        { patternId: "touch_key_replace", slotValues: { hostKey: "K_X", char: "ñ" } },
      ],
      source: "user",
    };
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [combined]);
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as {
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; text?: string; sk?: Array<{ id: string; text?: string }> }> }> }> };
    };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const replaced = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "U_00F1")!;
    expect(replaced).toBeDefined();
    expect(replaced.text).toBe("ñ");
    expect(replaced.sk).toHaveLength(1);
    expect(replaced.sk![0]!.text).toBe("ń");
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

  // Case-B mirror of the Case-A "one warning per mechanism" test: the
  // per-mechanism unknown-patternId warning must fire once PER mechanism, not
  // once per assignment — locks in that the raw-JSON applier iterates
  // assignment.mechanisms individually (same loop restructure as the IR path).
  it("emits one warning PER unrecognized patternId when an assignment carries two unknown mechanisms", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const bad: TouchAssignment = {
      scope: "individual",
      target: "x",
      modality: "touch",
      mechanisms: [
        { patternId: "totally_unknown_pattern_one", slotValues: { hostKey: "K_A", char: "x" } },
        { patternId: "totally_unknown_pattern_two", slotValues: { hostKey: "K_A", char: "x" } },
      ],
    };
    const { json: out, warnings } = applyTouchAssignmentsToRawJson(json, [bad]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("unknown patternId");
    expect(warnings[1]).toContain("unknown patternId");
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

// ---------------------------------------------------------------------------
// Layer targeting — the optional `layer` slot value (faithful-edit path)
//
// Absent `layer` === "default"; every case above exercises the absent form, so
// this block covers the explicit form, a non-default target, and the misses.
// ---------------------------------------------------------------------------

function longpressOnLayer(hostKey: string, char: string, layer: string): TouchAssignment {
  return {
    scope: "individual",
    target: char,
    modality: "touch",
    mechanisms: [
      { patternId: "longpress_alternates", slotValues: { hostKey, char, layer } },
    ],
    source: "user",
  };
}

/** Phone-only raw layout whose shift layer carries the same key ids as default
 *  (what scaffoldTouchLayout emits), plus an extra default-only key. */
function makePhoneWithShiftJson(): string {
  return JSON.stringify({
    phone: {
      layer: [
        {
          id: "default",
          row: [{ id: 1, key: [{ id: "K_A", text: "a" }, { id: "K_S", text: "s" }] }],
        },
        { id: "shift", row: [{ id: 1, key: [{ id: "K_A", text: "A" }] }] },
      ],
    },
  });
}

/** Pull a key object out of a named phone layer of a result JSON string. */
function phoneKeyOnLayer(
  json: string,
  layerId: string,
  keyId: string,
): Record<string, unknown> | undefined {
  const parsed = JSON.parse(json) as {
    phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
  };
  const layer = parsed.phone.layer.find((l) => l.id === layerId);
  return layer?.row.flatMap((r) => r.key).find((k) => k["id"] === keyId);
}

/** Pull a key object out of a named layer of an arbitrary named platform
 *  (generalizes {@link phoneKeyOnLayer} to any platform name, e.g. "tablet"). */
function phoneOrTabletKeyOnLayer(
  json: string,
  platformName: string,
  layerId: string,
  keyId: string,
): Record<string, unknown> | undefined {
  const parsed = JSON.parse(json) as Record<
    string,
    { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> }
  >;
  const layer = parsed[platformName]?.layer.find((l) => l.id === layerId);
  return layer?.row.flatMap((r) => r.key).find((k) => k["id"] === keyId);
}

// ---------------------------------------------------------------------------
// Positional fallback into a blank placeholder — layout-agnostic
//
// Deliberately uses an invented layer name ("fn", not any real Keyman
// modifier name like "rightalt") and an invented blank sentinel id, to prove
// the fallback is driven purely by ARRAY POSITION parity with the "default"
// layer, never by a hardcoded layer name or sentinel id.
// ---------------------------------------------------------------------------

/** A generic phone layout: "default" + an arbitrary modifier layer ("fn")
 *  whose row/key arrays are positionally aligned with "default", per the
 *  real Keyman `.keyman-touch-layout` invariant (same shape across sibling
 *  layers). "fn" carries blanks at various positions using DIFFERENT blank
 *  encodings, to prove the predicate generalizes:
 *    - index 0: the well-known "T_BLANK" sentinel.
 *    - index 1: a layout that uses its own sentinel id + spacer sp (no
 *      "T_BLANK" anywhere) — still recognized as blank.
 *    - index 2: a real, already-populated key with a DIFFERENT id — must
 *      never be clobbered. */
function makeGenericModifierLayerJson(): string {
  return JSON.stringify({
    tablet: {
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "K_A", text: "a" },
                { id: "K_S", text: "s" },
                { id: "K_D", text: "d" },
              ],
            },
          ],
        },
        {
          id: "fn",
          row: [
            {
              id: 1,
              key: [
                { id: "T_BLANK", text: "", sp: 10 },
                // sp:9 (blank) — a canonical non-interactive class per
                // isSpacerKeyClass, deliberately NOT "T_BLANK", to prove the
                // predicate generalizes beyond the well-known sentinel id.
                // (Was sp:8 before spec 063 FR-012 corrected the class set from
                // `{8,10}` to `{9,10}`; sp:8 is deadkey-STYLED and interactive,
                // so it is no longer a promotable free slot — see the
                // isBlankPlaceholder canary below. The fixture's intent is
                // unchanged: an author-invented sentinel id, not T_BLANK.)
                { id: "T_OTHER_SENTINEL", text: " ", sp: 9 },
                { id: "K_ZZZ", text: "z" },
              ],
            },
          ],
        },
      ],
    },
  });
}

function longpressOnFnLayer(hostKey: string, char: string): TouchAssignment {
  return longpressOnLayer(hostKey, char, "fn");
}

describe("applyTouchAssignmentsToRawJson — positional fallback into blank placeholder (layout-agnostic)", () => {
  it("promotes a T_BLANK slot by position on an arbitrary non-default layer", () => {
    const raw = makeGenericModifierLayerJson();
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnFnLayer("K_A", "á"),
    ]);
    expect(warnings).toHaveLength(0);

    const key = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_A")!;
    expect(key["id"]).toBe("K_A");
    expect(key["sk"]).toEqual([{ id: "U_00E1", text: "á" }]);
    // The spacer must be cleared so the slot renders/behaves as a real key.
    expect(key["sp"]).toBeUndefined();

    // The default layer's K_A is untouched.
    const defaultKey = phoneOrTabletKeyOnLayer(json, "tablet", "default", "K_A")!;
    expect(defaultKey["sk"]).toBeUndefined();
  });

  it("promotes a differently-sentineled blank (no 'T_BLANK' id anywhere, just empty text + sp) by position", () => {
    const raw = makeGenericModifierLayerJson();
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnFnLayer("K_S", "ś"),
    ]);
    expect(warnings).toHaveLength(0);

    const key = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_S")!;
    expect(key["id"]).toBe("K_S");
    expect(key["sk"]).toEqual([{ id: "U_015B", text: "ś" }]);
    expect(key["sp"]).toBeUndefined();
  });

  it("does NOT clobber a real, already-populated key at that position with a different id", () => {
    const raw = makeGenericModifierLayerJson();
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnFnLayer("K_D", "đ"),
    ]);
    // K_D's position on "fn" holds a real key ("K_ZZZ") — not a blank, so no
    // platform matches and the assignment is skipped with a warning, exactly
    // as the pre-existing id-only-miss behavior.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('host key "K_D" not found in any platform\'s "fn" layer');

    const untouched = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_ZZZ")!;
    expect(untouched["id"]).toBe("K_ZZZ");
    expect(untouched["text"]).toBe("z");
    expect(untouched["sk"]).toBeUndefined();
  });

  it("a genuinely absent position (target layer shorter than default) still warns, not fallback-promoted", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [
          {
            id: "default",
            row: [{ id: 1, key: [{ id: "K_A", text: "a" }, { id: "K_S", text: "s" }] }],
          },
          {
            id: "fn",
            row: [{ id: 1, key: [{ id: "T_BLANK", text: "", sp: 10 }] }], // only 1 key, not 2
          },
        ],
      },
    });
    const { warnings } = applyTouchAssignmentsToRawJson(raw, [longpressOnFnLayer("K_S", "ś")]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('host key "K_S" not found in any platform\'s "fn" layer');
  });

  it("a second assignment targeting the same promoted host key on the same layer applies via the now-set id (no re-promotion needed)", () => {
    const raw = makeGenericModifierLayerJson();
    const combined: TouchAssignment = {
      scope: "individual",
      target: "a",
      modality: "touch",
      mechanisms: [
        { patternId: "longpress_alternates", slotValues: { hostKey: "K_A", char: "á", layer: "fn" } },
        { patternId: "multitap", slotValues: { hostKey: "K_A", char: "â", layer: "fn" } },
      ],
      source: "user",
    };
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [combined]);
    expect(warnings).toHaveLength(0);

    const key = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_A")!;
    expect(key["sk"]).toEqual([{ id: "U_00E1", text: "á" }]);
    expect(key["multitap"]).toEqual([{ id: "U_00E2", text: "â" }]);
  });
});

// ---------------------------------------------------------------------------
// Positional fallback into blank placeholder — real fixture regression
// (sil_cameroon_qwerty "rightalt" layer, the originally reported bug)
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — positional fallback: real fixture (sil_cameroon_qwerty)", () => {
  it.skipIf(!fixtureExists)(
    "a longpress on K_S targeting the 'rightalt' layer promotes rightalt's T_BLANK slot at K_S's default-layer position",
    () => {
      const rawJson = fs.readFileSync(CAMEROON_TOUCH_LAYOUT, "utf-8");
      const { json, warnings } = applyTouchAssignmentsToRawJson(rawJson, [
        longpressOnLayer("K_S", "ś", "rightalt"),
      ]);
      expect(warnings).toHaveLength(0);

      const parsed = JSON.parse(json) as {
        tablet: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
      };
      const rightaltLayer = parsed.tablet.layer.find((l) => l.id === "rightalt")!;
      const promoted = rightaltLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "K_S")!;
      expect(promoted).toBeDefined();
      expect(promoted["sp"]).toBeUndefined();
      expect(promoted["sk"]).toEqual([{ id: "U_015B", text: "ś" }]);

      // The default layer's K_S is untouched by this rightalt-targeted edit.
      const defaultLayer = parsed.tablet.layer.find((l) => l.id === "default")!;
      const defaultKS = defaultLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "K_S")!;
      expect(defaultKS["sk"]).toBeUndefined();
    },
  );
});

describe("applyTouchAssignmentsToRawJson — layer targeting", () => {
  it('layer: "default" produces exactly the same JSON as an absent layer', () => {
    const raw = makePhoneWithShiftJson();

    const withAbsent = applyTouchAssignmentsToRawJson(raw, [longpress("K_A", "á")]);
    const withExplicit = applyTouchAssignmentsToRawJson(raw, [
      longpressOnLayer("K_A", "á", "default"),
    ]);

    expect(withExplicit.warnings).toEqual(withAbsent.warnings);
    expect(withExplicit.json).toBe(withAbsent.json);
  });

  it('layer: "shift" splices onto the shift-layer key and leaves the default key alone', () => {
    const { json, warnings } = applyTouchAssignmentsToRawJson(makePhoneWithShiftJson(), [
      longpressOnLayer("K_A", "Á", "shift"),
    ]);

    expect(warnings).toHaveLength(0);

    const shiftKeyA = phoneKeyOnLayer(json, "shift", "K_A")!;
    expect(shiftKeyA["sk"]).toEqual([{ id: "U_00C1", text: "Á" }]);

    const defaultKeyA = phoneKeyOnLayer(json, "default", "K_A")!;
    expect(defaultKeyA["sk"]).toBeUndefined();
  });

  it("an unknown layer warns naming that layer, skips, and never falls back to default", () => {
    const { json, warnings } = applyTouchAssignmentsToRawJson(makePhoneWithShiftJson(), [
      longpressOnLayer("K_A", "Á", "caps"),
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('host key "K_A" not found in any platform\'s "caps" layer');
    expect(phoneKeyOnLayer(json, "default", "K_A")!["sk"]).toBeUndefined();
    expect(phoneKeyOnLayer(json, "shift", "K_A")!["sk"]).toBeUndefined();
  });

  it("a host key present on another layer but absent from the target layer warns and skips", () => {
    // K_S exists on default only; targeting shift must not silently use default.
    const { json, warnings } = applyTouchAssignmentsToRawJson(makePhoneWithShiftJson(), [
      longpressOnLayer("K_S", "Ś", "shift"),
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('host key "K_S" not found in any platform\'s "shift" layer');
    expect(phoneKeyOnLayer(json, "default", "K_S")!["sk"]).toBeUndefined();
  });

  it("preserves unknown fields and key order when splicing onto a non-default layer", () => {
    const raw = JSON.stringify({
      _comment: "hand-authored",
      phone: {
        displayUnderlying: false,
        font: "Andika Afr",
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] },
          {
            id: "shift",
            row: [
              {
                id: 1,
                key: [
                  { id: "K_A", text: "A", width: "150", futureField: 7 },
                  { id: "K_B", text: "B" },
                ],
              },
            ],
          },
        ],
      },
    });

    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnLayer("K_A", "Á", "shift"),
    ]);

    expect(warnings).toHaveLength(0);

    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["_comment", "phone"]);
    expect(parsed["_comment"]).toBe("hand-authored");

    const shiftKeyA = phoneKeyOnLayer(json, "shift", "K_A")!;
    // Unknown/verbatim fields survive, and the spliced sk[] is appended last.
    expect(Object.keys(shiftKeyA)).toEqual(["id", "text", "width", "futureField", "sk"]);
    expect(shiftKeyA["futureField"]).toBe(7);
    expect(shiftKeyA["width"]).toBe("150");

    // Key order within the row is unchanged.
    const shiftLayer = (
      (parsed["phone"] as { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string }> }> }> })
        .layer
    ).find((l) => l.id === "shift")!;
    expect(shiftLayer.row[0]!.key.map((k) => k.id)).toEqual(["K_A", "K_B"]);
  });

  it('defaultHint "dot" promotion still fires for a platform that gained an sk[] on a non-default layer', () => {
    const { json } = applyTouchAssignmentsToRawJson(makePhoneWithShiftJson(), [
      longpressOnLayer("K_A", "Á", "shift"),
    ]);

    const parsed = JSON.parse(json) as { phone: { defaultHint?: string } };
    expect(parsed.phone.defaultHint).toBe("dot");
  });
});

// ---------------------------------------------------------------------------
// isBlankPlaceholder — canonical spacer-class predicate (P0 fix)
// ---------------------------------------------------------------------------

describe("isBlankPlaceholder", () => {
  it("returns true for the T_BLANK sentinel regardless of sp/text", () => {
    expect(isBlankPlaceholder({ id: "T_BLANK", text: "" })).toBe(true);
  });

  it("returns true for sp:10 (canonical padding spacer class) with empty text", () => {
    expect(isBlankPlaceholder({ id: "T_ANYTHING", text: "", sp: 10 })).toBe(true);
  });

  it("returns true for sp:9 (blank class) with whitespace-only text", () => {
    expect(isBlankPlaceholder({ id: "T_ANYTHING", text: "  ", sp: 9 })).toBe(true);
  });

  // -------------------------------------------------------------------------
  // THE PLACEMENT-PROMOTION CANARY (spec 063 FR-012 / T019).
  //
  // `isBlankPlaceholder` is `isEmptyText(text) && isSpacerKeyClass(sp)`, so
  // correcting `isSpacerKeyClass` from `{8, 10}` to `{9, 10}` moved WHICH SLOTS
  // READ AS FREE for the positional-fallback promotion path — in both
  // directions. That is a behaviour change in an assignment writer, not a
  // cosmetic fix, so it is pinned here explicitly rather than absorbed silently.
  //
  //   - STRICTER about sp:8: a deadkey-styled key with empty text is no longer a
  //     free slot, so the fallback will not overwrite it. This is the important
  //     half — sp:8 keys are interactive, and promoting one silently replaced a
  //     real key the author had placed.
  //   - LOOSER about sp:9: a blank key with empty text is now a free slot, which
  //     is exactly what the blank class means and what an author expects the
  //     fallback to fill.
  // -------------------------------------------------------------------------

  it("CANARY: returns FALSE for sp:8 (deadkey-styled) with empty text — no longer a free slot", () => {
    expect(isBlankPlaceholder({ id: "T_ANYTHING", text: "", sp: 8 })).toBe(false);
    expect(isBlankPlaceholder({ id: "T_ANYTHING", text: "  ", sp: 8 })).toBe(false);
  });

  it("CANARY: returns TRUE for sp:9 (blank) with empty text — now a free slot", () => {
    expect(isBlankPlaceholder({ id: "T_ANYTHING", text: "", sp: 9 })).toBe(true);
  });

  it("returns false for sp:0 (normal key class) even with empty text — the spacebar shape", () => {
    expect(isBlankPlaceholder({ id: "K_SPACE", text: " ", sp: 0 })).toBe(false);
  });

  it("returns false for sp:1 (special key class) even with empty text", () => {
    expect(isBlankPlaceholder({ id: "K_SOMETHING", text: "", sp: 1 })).toBe(false);
  });

  it("returns false for sp:2 (shift key class) even with empty text", () => {
    expect(isBlankPlaceholder({ id: "K_SOMETHING", text: "", sp: 2 })).toBe(false);
  });

  it("returns false for a real key with real text and no sp", () => {
    expect(isBlankPlaceholder({ id: "K_A", text: "a" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Positional fallback never promotes a REAL key — only canonical spacer
// classes (P0 fix regression: "any defined sp" used to be treated as blank)
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — real (non-blank) keys are never promoted", () => {
  it("a real key with sp:0 and whitespace text (spacebar-shaped) at the aligned position is NOT promoted", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_SPACE", text: " " }] }] },
          { id: "fn", row: [{ id: 1, key: [{ id: "K_OTHER", text: " ", sp: 0 }] }] },
        ],
      },
    });
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnLayer("K_SPACE", "x", "fn"),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('host key "K_SPACE" not found');
    // The real key at that position must be untouched — not clobbered.
    const untouched = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_OTHER")!;
    expect(untouched["id"]).toBe("K_OTHER");
    expect(untouched["sp"]).toBe(0);
    expect(untouched["sk"]).toBeUndefined();
  });

  it("a real key with sp:1 (special class) at the aligned position is NOT promoted", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] },
          { id: "fn", row: [{ id: 1, key: [{ id: "K_SYMBOLS", text: "*Symbol*", sp: 1 }] }] },
        ],
      },
    });
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnLayer("K_A", "á", "fn"),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('host key "K_A" not found');
    const untouched = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_SYMBOLS")!;
    expect(untouched["sp"]).toBe(1);
    expect(untouched["sk"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Out-of-bounds edges — defensive, never crash (Q3 / regression floor)
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — positional fallback out-of-bounds edges", () => {
  it("the target layer has fewer ROWS than default — warns, no crash", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [
          {
            id: "default",
            row: [
              { id: 1, key: [{ id: "K_A", text: "a" }] },
              { id: 2, key: [{ id: "K_B", text: "b" }] },
            ],
          },
          {
            id: "fn",
            // Only 1 row — "default" has 2. The position resolved for K_B
            // (row index 1) does not exist on "fn" at all.
            row: [{ id: 1, key: [{ id: "T_BLANK", text: "", sp: 10 }] }],
          },
        ],
      },
    });
    let result: ReturnType<typeof applyTouchAssignmentsToRawJson> | undefined;
    expect(() => {
      result = applyTouchAssignmentsToRawJson(raw, [longpressOnLayer("K_B", "b́", "fn")]);
    }).not.toThrow();
    expect(result!.warnings).toHaveLength(1);
    expect(result!.warnings[0]).toContain('host key "K_B" not found');
  });

  it("a platform has the target layer but NO 'default' layer at all — warns, no crash", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [{ id: "fn", row: [{ id: 1, key: [{ id: "T_BLANK", text: "", sp: 10 }] }] }],
      },
    });
    let result: ReturnType<typeof applyTouchAssignmentsToRawJson> | undefined;
    expect(() => {
      result = applyTouchAssignmentsToRawJson(raw, [longpressOnLayer("K_A", "á", "fn")]);
    }).not.toThrow();
    expect(result!.warnings).toHaveLength(1);
    expect(result!.warnings[0]).toContain('host key "K_A" not found');
  });
});

// ---------------------------------------------------------------------------
// Promotion semantics — nextlayer sample-from-siblings, base-text borrow,
// width/pad preservation (P1 fixes)
// ---------------------------------------------------------------------------

describe("applyTouchAssignmentsToRawJson — promoted key nextlayer (sample-from-siblings)", () => {
  it.skipIf(!fixtureExists)(
    "promoting K_Q onto rightalt copies nextlayer:'default' from the sibling K_W (real fixture, ~line 1209)",
    () => {
      const rawJson = fs.readFileSync(CAMEROON_TOUCH_LAYOUT, "utf-8");
      const { json, warnings } = applyTouchAssignmentsToRawJson(rawJson, [
        longpressOnLayer("K_Q", "ʠ", "rightalt"),
      ]);
      expect(warnings).toHaveLength(0);

      const promoted = phoneOrTabletKeyOnLayer(json, "tablet", "rightalt", "K_Q")!;
      expect(promoted["sp"]).toBeUndefined();
      expect(promoted["nextlayer"]).toBe("default");
    },
  );

  it(
    "promoted key OMITS nextlayer when the first live sibling omits it (persistent-layer case, " +
      "modeled on sil_cameroon_qwerty's 'caps' layer where K_Q/K_W carry none, ~lines 1820-1834)",
    () => {
      const raw = JSON.stringify({
        tablet: {
          layer: [
            { id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }, { id: "K_W", text: "w" }] }] },
            {
              id: "caps",
              row: [
                {
                  id: 1,
                  key: [
                    { id: "T_BLANK", text: "", sp: 10 },
                    { id: "K_W", text: "W" }, // live, no nextlayer — persistent layer
                  ],
                },
              ],
            },
          ],
        },
      });
      const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
        longpressOnLayer("K_Q", "Q́", "caps"),
      ]);
      expect(warnings).toHaveLength(0);

      const promoted = phoneOrTabletKeyOnLayer(json, "tablet", "caps", "K_Q")!;
      expect(promoted["nextlayer"]).toBeUndefined();
    },
  );

  it("falls back to nextlayer:'default' when the target layer has zero live keys to sample", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] },
          { id: "empty", row: [{ id: 1, key: [{ id: "T_BLANK", text: "", sp: 10 }] }] },
        ],
      },
    });
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnLayer("K_Q", "q́", "empty"),
    ]);
    expect(warnings).toHaveLength(0);

    const promoted = phoneOrTabletKeyOnLayer(json, "tablet", "empty", "K_Q")!;
    expect(promoted["nextlayer"]).toBe("default");
  });
});

describe("applyTouchAssignmentsToRawJson — promoted key base-text borrow", () => {
  it("a longpress-only promotion borrows the DEFAULT-layer key's base text when still empty after the mechanism", () => {
    const raw = makeGenericModifierLayerJson();
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnFnLayer("K_A", "á"),
    ]);
    expect(warnings).toHaveLength(0);

    const promoted = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_A")!;
    // "fn"'s T_BLANK at K_A's position had text:"" — borrowed from default's K_A ("a").
    expect(promoted["text"]).toBe("a");
  });

  it("touch_key_replace already sets text — the borrow is a no-op (text is not overwritten)", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_X", text: "x" }] }] },
          { id: "fn", row: [{ id: 1, key: [{ id: "T_BLANK", text: "", sp: 10 }] }] },
        ],
      },
    });
    const keyReplaceOnFn: TouchAssignment = {
      scope: "individual",
      target: "ñ",
      modality: "touch",
      mechanisms: [
        { patternId: "touch_key_replace", slotValues: { hostKey: "K_X", char: "ñ", layer: "fn" } },
      ],
      source: "user",
    };
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [keyReplaceOnFn]);
    expect(warnings).toHaveLength(0);

    const promoted = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "U_00F1")!;
    expect(promoted["text"]).toBe("ñ");
  });
});

describe("applyTouchAssignmentsToRawJson — promoted key preserves width/pad", () => {
  it("width/pad on the blank slot survive promotion; only sp is cleared", () => {
    const raw = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }] }] },
          {
            id: "fn",
            row: [{ id: 1, key: [{ id: "T_BLANK", text: "", sp: 10, width: 120, pad: 40 }] }],
          },
        ],
      },
    });
    const { json, warnings } = applyTouchAssignmentsToRawJson(raw, [
      longpressOnLayer("K_Q", "q́", "fn"),
    ]);
    expect(warnings).toHaveLength(0);

    const promoted = phoneOrTabletKeyOnLayer(json, "tablet", "fn", "K_Q")!;
    expect(promoted["sp"]).toBeUndefined();
    expect(promoted["width"]).toBe(120);
    expect(promoted["pad"]).toBe(40);
  });
});
