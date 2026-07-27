/**
 * Unit tests for applyDesktopModificationsToRawJson.
 *
 * Tests are grouped into:
 *   1. Unmodified fields preserved byte-for-byte (per-key layer, displayUnderlying,
 *      font/fontsize, string-form sp/width/pad)
 *   2. Removals — purge every producer form, every platform
 *   3. Removals — canonical (NFC) matching, including an NFD-stored occurrence
 *   4. Removals — primary-key removal yields an inert placeholder, geometry intact
 *   5. Placements — host-present (empty host / non-empty host) and host-absent fallback
 *   6. No "provenance" key anywhere in the output JSON
 *   7. No mutation of the input string
 */

import { describe, it, expect } from "vitest";
import { applyDesktopModificationsToRawJson } from "./applyDesktopModificationsToRawJson.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * A raw fixture carrying fields emitTouchLayout does NOT preserve, so a
 * parse->IR->re-emit implementation would fail these tests (R9's whole point):
 * per-key `layer`, `displayUnderlying`, `font`/`fontsize`, and string-form
 * `sp`/`width`/`pad`.
 */
function makeFixtureJson(): string {
  return JSON.stringify({
    phone: {
      displayUnderlying: true,
      font: "Andika",
      fontsize: "14pt",
      layer: [
        {
          id: "default",
          row: [
            {
              id: 1,
              key: [
                { id: "K_A", text: "a", layer: "default", sp: "0", width: "100", pad: "15" },
                { id: "K_B", text: "b", sp: "1", width: "90", pad: "10" },
              ],
            },
          ],
        },
        { id: "shift", row: [{ id: 1, key: [{ id: "K_A", text: "A" }] }] },
      ],
    },
  });
}

/** Build a minimal raw touch layout JSON string with a phone-only platform. */
function makePhoneOnlyJson(
  defaultKeys: Array<{ id: string; text?: string; output?: string; sk?: unknown[]; multitap?: unknown[]; flick?: Record<string, unknown>; [k: string]: unknown }>,
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
  tabletDefaultKeys: Array<{ id: string; text?: string; sk?: unknown[] }>,
  phoneDefaultKeys: Array<{ id: string; text?: string }>,
): string {
  return JSON.stringify({
    tablet: { layer: [{ id: "default", row: [{ id: 1, key: tabletDefaultKeys }] }] },
    phone: { layer: [{ id: "default", row: [{ id: 1, key: phoneDefaultKeys }] }] },
  });
}

// ---------------------------------------------------------------------------
// 1. Unmodified fields preserved byte-for-byte
// ---------------------------------------------------------------------------

describe("applyDesktopModificationsToRawJson — byte-preservation of unmodified fields", () => {
  it("preserves per-key layer, displayUnderlying, font/fontsize, and string-form sp/width/pad", () => {
    const json = makeFixtureJson();
    const { json: out, warnings } = applyDesktopModificationsToRawJson(json, {
      removals: [],
      placements: [],
    });
    expect(warnings).toHaveLength(0);

    const parsed = JSON.parse(out) as {
      phone: {
        displayUnderlying: boolean;
        font: string;
        fontsize: string;
        layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }>;
      };
    };
    expect(parsed.phone.displayUnderlying).toBe(true);
    expect(parsed.phone.font).toBe("Andika");
    expect(parsed.phone.fontsize).toBe("14pt");

    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "K_A")!;
    expect(ka["layer"]).toBe("default");
    expect(ka["sp"]).toBe("0");
    expect(ka["width"]).toBe("100");
    expect(ka["pad"]).toBe("15");

    const kb = defLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "K_B")!;
    expect(kb["sp"]).toBe("1");
    expect(kb["width"]).toBe("90");
    expect(kb["pad"]).toBe("10");

    // The shift layer (untouched) is preserved verbatim too.
    const shiftLayer = parsed.phone.layer.find((l) => l.id === "shift")!;
    expect(shiftLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "K_A")!["text"]).toBe("A");
  });

  it("input is byte-identical to output (as parsed structures) when mods is empty", () => {
    const json = makeFixtureJson();
    const { json: out } = applyDesktopModificationsToRawJson(json, { removals: [], placements: [] });
    expect(JSON.parse(out)).toEqual(JSON.parse(json));
  });
});

// ---------------------------------------------------------------------------
// 2. Removals — purge every producer form, every platform
// ---------------------------------------------------------------------------

describe("applyDesktopModificationsToRawJson — removals purge every producer form", () => {
  it("drops a matching sk[] entry", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "z", sk: [{ id: "U_00E1", text: "á" }] }]);
    const { json: out, warnings } = applyDesktopModificationsToRawJson(json, {
      removals: ["á"],
      placements: [],
    });
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "K_A")!;
    expect(ka.sk ?? []).toHaveLength(0);
  });

  it("drops a matching multitap[] entry", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "z", multitap: [{ id: "U_00E2", text: "â" }] }]);
    const { json: out } = applyDesktopModificationsToRawJson(json, { removals: ["â"], placements: [] });
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; multitap?: unknown[] }> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "K_A")!;
    expect(ka.multitap ?? []).toHaveLength(0);
  });

  it("drops a matching flick{} entry (direction removed)", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "z", flick: { n: { id: "U_00E0", text: "à" } } }]);
    const { json: out } = applyDesktopModificationsToRawJson(json, { removals: ["à"], placements: [] });
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; flick?: Record<string, unknown> }> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "K_A")!;
    expect(ka.flick?.["n"]).toBeUndefined();
  });

  it("purges the char across BOTH the tablet and phone platforms", () => {
    const json = makeTabletPhoneJson(
      [{ id: "K_A", text: "a" }],
      [{ id: "K_A", text: "x", sk: [{ id: "U_0061", text: "a" }] }],
    );
    const { json: out } = applyDesktopModificationsToRawJson(json, { removals: ["a"], placements: [] });
    const parsed = JSON.parse(out) as {
      tablet: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> };
      phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> };
    };

    // Tablet K_A's primary production ("a") is carved -> inert placeholder.
    const tabletDef = parsed.tablet.layer.find((l) => l.id === "default")!;
    const tabletKeys = tabletDef.row.flatMap((r) => r.key);
    expect(tabletKeys.find((k) => k["id"] === "K_A")).toBeUndefined();
    expect(tabletKeys.some((k) => (k["id"] as string).startsWith("T_removed_"))).toBe(true);

    // Phone K_A's sk[] entry for "a" is dropped too.
    const phoneDef = parsed.phone.layer.find((l) => l.id === "default")!;
    const phoneKa = phoneDef.row.flatMap((r) => r.key).find((k) => k.id === "K_A")!;
    expect(phoneKa.sk ?? []).toHaveLength(0);
  });

  it("keeps gesture entries for OTHER characters on the same key", () => {
    const json = makePhoneOnlyJson([
      {
        id: "K_A",
        text: "z",
        sk: [
          { id: "U_00E1", text: "á" },
          { id: "U_00E0", text: "à" },
        ],
      },
    ]);
    const { json: out } = applyDesktopModificationsToRawJson(json, { removals: ["á"], placements: [] });
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: Array<{ text?: string }> }> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
    expect(ka.sk![0]!.text).toBe("à");
  });
});

// ---------------------------------------------------------------------------
// 3. Removals — canonical (NFC) matching
// ---------------------------------------------------------------------------

describe("applyDesktopModificationsToRawJson — canonical NFC matching", () => {
  it("removes an NFD-stored occurrence (base + combining mark) of an NFC removal entry", () => {
    // "á" as NFD: "a" (U+0061) + combining acute (U+0301) — built explicitly
    // so this test's meaning can't drift if the source file's own encoding
    // ever gets renormalized.
    const nfdText = "a" + String.fromCharCode(0x0301);
    const json = makePhoneOnlyJson([{ id: "K_A", text: nfdText }]);
    const { json: out } = applyDesktopModificationsToRawJson(json, {
      removals: ["á"], // precomposed "a with acute"
      placements: [],
    });
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const allKeys = defLayer.row.flatMap((r) => r.key);
    expect(allKeys.find((k) => k["id"] === "K_A")).toBeUndefined();
    const placeholder = allKeys.find((k) => (k["id"] as string).startsWith("T_removed_"))!;
    expect(placeholder).toBeDefined();
    expect(placeholder["text"]).toBeUndefined();
  });

  it("removes an NFD-stored sk[] entry for an NFC removal", () => {
    const nfdText = "a" + String.fromCharCode(0x0301);
    const json = makePhoneOnlyJson([{ id: "K_B", text: "b", sk: [{ id: "K_SK", text: nfdText }] }]);
    const { json: out } = applyDesktopModificationsToRawJson(json, {
      removals: ["á"],
      placements: [],
    });
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: unknown[] }> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const kb = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "K_B")!;
    expect(kb.sk ?? []).toHaveLength(0);
  });

  it("removes a key whose primary production is a multi-codepoint U_ id (base + combining mark)", () => {
    // U_0061_0303 decodes to "a" (U+0061) + combining tilde (U+0303) -> NFC
    // matches the precomposed "a with tilde" (U+00E3) removal entry.
    const precomposedATilde = String.fromCharCode(0x00e3);
    const json = makePhoneOnlyJson([{ id: "U_0061_0303" }]);
    const { json: out } = applyDesktopModificationsToRawJson(json, {
      removals: [precomposedATilde],
      placements: [],
    });
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const allKeys = defLayer.row.flatMap((r) => r.key);
    expect(allKeys.find((k) => k["id"] === "U_0061_0303")).toBeUndefined();
    const placeholder = allKeys.find((k) => (k["id"] as string).startsWith("T_removed_"))!;
    expect(placeholder).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Removals — primary-key removal yields inert placeholder, geometry intact
// ---------------------------------------------------------------------------

describe("applyDesktopModificationsToRawJson — primary-key removal produces an inert placeholder", () => {
  it("never deletes the key object; row geometry/other fields survive verbatim", () => {
    const json = makePhoneOnlyJson([
      { id: "K_A", text: "a", sp: "0", width: "100", pad: "15", nextlayer: "shift" },
      { id: "K_B", text: "b" },
    ]);
    const { json: out, warnings } = applyDesktopModificationsToRawJson(json, {
      removals: ["a"],
      placements: [],
    });
    expect(warnings).toHaveLength(0);

    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const allKeys = defLayer.row.flatMap((r) => r.key);
    // Row still has exactly 2 keys — the key object was never dropped.
    expect(allKeys).toHaveLength(2);

    const placeholder = allKeys.find((k) => (k["id"] as string).startsWith("T_removed_"))!;
    expect(placeholder).toBeDefined();
    expect(placeholder["text"]).toBeUndefined();
    expect(placeholder["sp"]).toBe("0");
    expect(placeholder["width"]).toBe("100");
    expect(placeholder["pad"]).toBe("15");
    expect(placeholder["nextlayer"]).toBe("shift");
  });

  it("uses a deterministic T_removed_<n> counter across multiple removed keys", () => {
    const json = makePhoneOnlyJson([
      { id: "K_A", text: "a" },
      { id: "K_B", text: "b" },
      { id: "K_C", text: "c" },
    ]);
    const { json: out } = applyDesktopModificationsToRawJson(json, {
      removals: ["a", "b", "c"],
      placements: [],
    });
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ids = defLayer.row
      .flatMap((r) => r.key)
      .map((k) => k["id"] as string)
      .filter((id) => id.startsWith("T_removed_"));
    expect(ids).toEqual(["T_removed_0", "T_removed_1", "T_removed_2"]);
  });
});

// ---------------------------------------------------------------------------
// 5. Placements
// ---------------------------------------------------------------------------

describe("applyDesktopModificationsToRawJson — placements", () => {
  it("lands on an empty host key as its own production", () => {
    const json = makePhoneOnlyJson([{ id: "K_X" }]); // no text/output
    const { json: out, warnings } = applyDesktopModificationsToRawJson(json, {
      removals: [],
      placements: [{ char: "ñ", hostKey: "K_X" }],
    });
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const placed = defLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "U_00F1")!;
    expect(placed).toBeDefined();
    expect(placed["text"]).toBe("ñ");
  });

  it("lands on a non-empty host key as a longpress (sk[]) alternate", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out, warnings } = applyDesktopModificationsToRawJson(json, {
      removals: [],
      placements: [{ char: "á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<{ id: string; sk?: Array<{ text?: string }> }> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const ka = defLayer.row.flatMap((r) => r.key).find((k) => k.id === "K_A")!;
    expect(ka.sk).toHaveLength(1);
    expect(ka.sk![0]!.text).toBe("á");
  });

  it("warns and places via fallback when hostKey is absent from the layer", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const { json: out, warnings } = applyDesktopModificationsToRawJson(json, {
      removals: [],
      placements: [{ char: "ñ", hostKey: "K_NONEXISTENT" }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/K_NONEXISTENT/);
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    expect(defLayer.row.flatMap((r) => r.key).some((k) => k["id"] === "U_00F1")).toBe(true);
  });

  it("NFC-normalizes an NFD placement char so text and id agree", () => {
    // "n" + combining tilde (U+006E U+0303), NFD form of "ñ" (U+00F1).
    const nfdChar = "n" + "̃";
    const json = makePhoneOnlyJson([{ id: "K_X" }]); // no text/output
    const { json: out, warnings } = applyDesktopModificationsToRawJson(json, {
      removals: [],
      placements: [{ char: nfdChar, hostKey: "K_X" }],
    });
    expect(warnings).toHaveLength(0);
    const parsed = JSON.parse(out) as { phone: { layer: Array<{ id: string; row: Array<{ key: Array<Record<string, unknown>> }> }> } };
    const defLayer = parsed.phone.layer.find((l) => l.id === "default")!;
    const placed = defLayer.row.flatMap((r) => r.key).find((k) => k["id"] === "U_00F1")!;
    expect(placed).toBeDefined();
    expect(placed["text"]).toBe("ñ");
  });
});

// ---------------------------------------------------------------------------
// 6. No "provenance" key anywhere in the output JSON
// ---------------------------------------------------------------------------

describe("applyDesktopModificationsToRawJson — no provenance fields in wire output", () => {
  it("output JSON string never contains the substring \"provenance\"", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }, { id: "K_X" }]);
    const { json: out } = applyDesktopModificationsToRawJson(json, {
      removals: ["a"],
      placements: [{ char: "ñ", hostKey: "K_X" }, { char: "ő", hostKey: "K_MISSING" }],
    });
    expect(out).not.toContain("provenance");
  });
});

// ---------------------------------------------------------------------------
// 7. No mutation of the input string
// ---------------------------------------------------------------------------

describe("applyDesktopModificationsToRawJson — no mutation of input", () => {
  it("the input rawJson string is unchanged after the call", () => {
    const json = makePhoneOnlyJson([{ id: "K_A", text: "a" }]);
    const snapshot = JSON.parse(json) as object;
    applyDesktopModificationsToRawJson(json, {
      removals: ["a"],
      placements: [{ char: "ñ", hostKey: "K_A" }],
    });
    expect(JSON.parse(json)).toEqual(snapshot);
  });
});
