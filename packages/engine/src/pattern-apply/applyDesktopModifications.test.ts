/**
 * Unit tests for applyDesktopModifications.
 *
 * Tests are grouped into:
 *   1. Removals — purge every producer form (text/output/U_-id, sk/flick/multitap)
 *      across every platform/layer
 *   2. Removals — canonical (NFC) matching, including an NFD-stored occurrence
 *   3. Removals — primary-key removal yields an inert placeholder, geometry intact
 *   4. Placements — host-present (empty host / non-empty host) and host-absent fallback
 *   5. Provenance — tagging + hand-set no-clobber
 *   6. Purity + determinism
 */

import { describe, it, expect } from "vitest";
import { applyDesktopModifications } from "./applyDesktopModifications.js";
import { BLANK_KEY_ID, BLANK_KEY_SP } from "./touch-mechanism-shared.js";
import { isSpacerKeyClass, type TouchLayoutIR, type TouchKeyIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, text: id.toLowerCase(), output: id.toLowerCase(), ...overrides };
}

function makeLayout(
  phoneDefaultKeys: TouchKeyIR[],
  options: { shiftLayer?: TouchKeyIR[]; tabletPlatform?: TouchKeyIR[] } = {},
): TouchLayoutIR {
  const phoneLayers: TouchLayoutIR["platforms"][number]["layers"] = [
    { id: "default", rows: [{ keys: phoneDefaultKeys }] },
  ];
  if (options.shiftLayer) {
    phoneLayers.push({ id: "shift", rows: [{ keys: options.shiftLayer }] });
  }

  const platforms: TouchLayoutIR["platforms"] = [{ id: "phone", layers: phoneLayers }];

  if (options.tabletPlatform) {
    platforms.push({
      id: "tablet",
      layers: [{ id: "default", rows: [{ keys: options.tabletPlatform }] }],
    });
  }

  return { platforms, nodeIds: [] };
}

function phoneDefaultKeys(layout: TouchLayoutIR): TouchKeyIR[] {
  const phone = layout.platforms.find((p) => p.id === "phone")!;
  const def = phone.layers.find((l) => l.id === "default")!;
  return def.rows.flatMap((r) => r.keys);
}

function getKey(layout: TouchLayoutIR, keyId: string): TouchKeyIR | undefined {
  return phoneDefaultKeys(layout).find((k) => k.id === keyId);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------------------------------------------------------------------------
// 1. Removals — purge every producer form, every platform
// ---------------------------------------------------------------------------

describe("applyDesktopModifications — removals purge every producer form", () => {
  it("drops a matching sk[] entry", () => {
    const key = makeKey("K_A", { sk: [{ nodeId: "sk1", id: "U_00E1", text: "á" }] });
    const layout = makeLayout([key]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: ["á"],
      placements: [],
    });
    expect(warnings).toHaveLength(0);
    expect(getKey(out, "K_A")!.sk ?? []).toHaveLength(0);
  });

  it("drops a matching multitap[] entry", () => {
    const key = makeKey("K_A", { multitap: [{ nodeId: "mt1", id: "U_00E2", text: "â" }] });
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, { removals: ["â"], placements: [] });
    expect(getKey(out, "K_A")!.multitap ?? []).toHaveLength(0);
  });

  it("drops a matching flick{} entry (direction removed)", () => {
    const key = makeKey("K_A", { flick: { n: { nodeId: "fl1", id: "U_00E0", text: "à" } } });
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, { removals: ["à"], placements: [] });
    expect(getKey(out, "K_A")!.flick?.["n"]).toBeUndefined();
  });

  it("purges the char across BOTH the phone default and tablet platforms", () => {
    const phoneKey = makeKey("K_A", { text: "a", output: "a" });
    const tabletKey = makeKey("K_A", {
      text: "x",
      output: "x",
      sk: [{ nodeId: "sk1", id: "U_0061", text: "a" }],
    });
    const layout = makeLayout([phoneKey], { tabletPlatform: [tabletKey] });
    const { layout: out } = applyDesktopModifications(layout, { removals: ["a"], placements: [] });

    // Phone K_A's primary production ("a") is carved -> inert placeholder.
    const phone = out.platforms.find((p) => p.id === "phone")!;
    const phoneDef = phone.layers.find((l) => l.id === "default")!;
    const phoneAll = phoneDef.rows.flatMap((r) => r.keys);
    expect(phoneAll.find((k) => k.id === "K_A")).toBeUndefined();
    expect(phoneAll.some((k) => k.id === BLANK_KEY_ID)).toBe(true);

    // Tablet K_A's sk[] entry for "a" is dropped too.
    const tablet = out.platforms.find((p) => p.id === "tablet")!;
    const tabletDef = tablet.layers.find((l) => l.id === "default")!;
    const tabletKeyOut = tabletDef.rows.flatMap((r) => r.keys).find((k) => k.id === "K_A")!;
    expect(tabletKeyOut.sk ?? []).toHaveLength(0);
  });

  it("keeps gesture entries for OTHER characters on the same key", () => {
    const key = makeKey("K_A", {
      sk: [
        { nodeId: "sk1", id: "U_00E1", text: "á" },
        { nodeId: "sk2", id: "U_00E0", text: "à" },
      ],
    });
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, { removals: ["á"], placements: [] });
    const sk = getKey(out, "K_A")!.sk!;
    expect(sk).toHaveLength(1);
    expect(sk[0]!.text).toBe("à");
  });
});

// ---------------------------------------------------------------------------
// 2. Removals — canonical (NFC) matching
// ---------------------------------------------------------------------------

describe("applyDesktopModifications — canonical NFC matching", () => {
  it("removes an NFD-stored occurrence (base + combining mark) of an NFC removal entry", () => {
    // "á" as NFD: "a" (U+0061) + combining acute (U+0301).
    const nfdText = "á";
    expect(nfdText.normalize("NFC")).toBe("á");
    expect(nfdText).not.toBe("á"); // sanity: genuinely NFD, distinct code units

    const key = makeKey("K_A", { text: nfdText, output: nfdText });
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, { removals: ["á"], placements: [] });

    // Primary production matched via NFC-normalized comparison -> inert placeholder.
    expect(getKey(out, "K_A")).toBeUndefined();
    const all = phoneDefaultKeys(out);
    const placeholder = all.find((k) => k.id === BLANK_KEY_ID)!;
    expect(placeholder).toBeDefined();
    expect(placeholder.text).toBeUndefined();
    expect(placeholder.output).toBeUndefined();
  });

  it("removes an NFD-stored sk[] entry for an NFC removal", () => {
    const nfdText = "á";
    const key = makeKey("K_B", { text: "b", output: "b", sk: [{ nodeId: "sk1", id: "K_SK", text: nfdText }] });
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, { removals: ["á"], placements: [] });
    expect(getKey(out, "K_B")!.sk ?? []).toHaveLength(0);
  });

  it("removes a key whose primary production is a multi-codepoint U_ id (base + combining mark)", () => {
    // U_0061_0303 decodes to "a" + combining tilde (NFD ã-equivalent) -> NFC-matches
    // the precomposed ã (U+00E3) removal entry.
    const key: TouchKeyIR = { nodeId: "node_K_C", id: "U_0061_0303" };
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, { removals: ["ã"], placements: [] });

    expect(getKey(out, "U_0061_0303")).toBeUndefined();
    const placeholder = phoneDefaultKeys(out).find((k) => k.id === BLANK_KEY_ID)!;
    expect(placeholder).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Removals — primary-key removal yields inert placeholder, geometry intact
// ---------------------------------------------------------------------------

describe("applyDesktopModifications — primary-key removal produces an inert placeholder", () => {
  it("never deletes the key object; row geometry/widths/nodeId are preserved", () => {
    const key = makeKey("K_A", { text: "a", output: "a", sp: 0, width: 100, pad: 10, nextlayer: "shift" });
    const layout = makeLayout([key, makeKey("K_B")]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: ["a"],
      placements: [],
    });
    expect(warnings).toHaveLength(0);

    const all = phoneDefaultKeys(out);
    // Row still has exactly 2 keys — the key object was never dropped.
    expect(all).toHaveLength(2);

    const placeholder = all.find((k) => k.id === BLANK_KEY_ID)!;
    expect(placeholder).toBeDefined();
    expect(placeholder.nodeId).toBe("node_K_A");
    expect(placeholder.text).toBeUndefined();
    expect(placeholder.output).toBeUndefined();
    // GEOMETRY survives verbatim — that is the whole reason the key object is
    // kept rather than deleted (R9).
    expect(placeholder.width).toBe(100);
    expect(placeholder.pad).toBe(10);
    expect(placeholder.nextlayer).toBe("shift");
    // `sp` does NOT survive, deliberately. It used to, and the result was a key
    // that produced nothing while still drawing as an ordinary character keycap
    // — the mirror of FR-029c's half-done suppression ("a live key that looks
    // dead"), and reported as carved keys being "unnecessarily visible". The
    // placeholder is now the non-interactive SPACER class: it holds its width,
    // which is what R9 needs, without drawing a keycap.
    expect(placeholder.sp).toBe(10);
  });

  // The defect this pins: a carved key produced nothing but still drew as an
  // ordinary character keycap, so an author looking at the rightalt layers saw
  // a full set of live-looking keys that silently did nothing.
  it("draws the placeholder as non-interactive, whatever class the carved key had", () => {
    const layout = makeLayout([
      makeKey("K_A", { text: "a", output: "a", sp: 0 }),
      makeKey("K_B", { text: "b", output: "b", sp: 8 }),
    ]);
    const { layout: out } = applyDesktopModifications(layout, {
      removals: ["a", "b"],
      placements: [],
    });

    const placeholders = phoneDefaultKeys(out).filter((k) => k.id === BLANK_KEY_ID);
    expect(placeholders).toHaveLength(2);
    for (const placeholder of placeholders) {
      expect(isSpacerKeyClass(placeholder.sp)).toBe(true);
    }
  });

  // Every emptied key is the SAME blank, deliberately. This replaced a
  // per-key `T_removed_<n>` mint, whose uniqueness bought individual
  // addressability but produced an id that appears nowhere in the corpus and
  // still drew as a live keycap. The corpus writes its blanks one way, and
  // matching it is what makes an adapted keyboard look like the one it came
  // from — `sil_cameroon_azerty` alone ships 66 `T_BLANK`s of its own.
  //
  // The cost is real and named rather than hidden: `touchKeyAddress` is built
  // from the id, so these three share one address, exactly as that base's own
  // blanks already do. Per-occurrence addressing is the outstanding work that
  // makes them individually selectable again.
  it("writes every emptied key as the same corpus blank", () => {
    const layout = makeLayout([
      makeKey("K_A", { text: "a", output: "a" }),
      makeKey("K_B", { text: "b", output: "b" }),
      makeKey("K_C", { text: "c", output: "c" }),
    ]);
    const { layout: out } = applyDesktopModifications(layout, {
      removals: ["a", "b", "c"],
      placements: [],
    });

    const keys = phoneDefaultKeys(out);
    expect(keys).toHaveLength(3);
    expect(keys.map((k) => k.id)).toEqual([BLANK_KEY_ID, BLANK_KEY_ID, BLANK_KEY_ID]);
    expect(keys.map((k) => k.sp)).toEqual([BLANK_KEY_SP, BLANK_KEY_SP, BLANK_KEY_SP]);
    // No trace of the retired mint.
    expect(keys.some((k) => k.id.startsWith("T_removed_"))).toBe(false);
  });

  it("does not orphan-guard — removing the sole producer of a char is allowed here", () => {
    // Coverage guard (a separate concern) reports orphaned chars; the replay itself
    // must still perform the removal unconditionally.
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: ["a"],
      placements: [],
    });
    expect(warnings).toHaveLength(0);
    expect(getKey(out, "K_A")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Placements
// ---------------------------------------------------------------------------

describe("applyDesktopModifications — placements", () => {
  it("lands on an empty host key as its own production", () => {
    const emptyKey: TouchKeyIR = { nodeId: "node_K_X", id: "K_X" }; // no text/output
    const layout = makeLayout([emptyKey]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "ñ", hostKey: "K_X" }],
    });
    expect(warnings).toHaveLength(0);
    const all = phoneDefaultKeys(out);
    const placed = all.find((k) => k.id === "U_00F1")!;
    expect(placed).toBeDefined();
    expect(placed.text).toBe("ñ");
  });

  it("lands on a non-empty host key as a longpress (sk[]) alternate", () => {
    const key = makeKey("K_A", { text: "a", output: "a" }); // already produces "a"
    const layout = makeLayout([key]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(0);
    const updated = getKey(out, "K_A")!;
    expect(updated.sk).toHaveLength(1);
    expect(updated.sk![0]!.text).toBe("á");
  });

  it("warns and places via fallback when hostKey is absent from the layer", () => {
    const layout = makeLayout([makeKey("K_A")]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "ñ", hostKey: "K_NONEXISTENT" }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/K_NONEXISTENT/);
    const all = phoneDefaultKeys(out);
    expect(all.some((k) => k.id === "U_00F1")).toBe(true);
  });

  it("NFC-normalizes an NFD placement char so text and id agree", () => {
    // "n" + combining tilde (U+006E U+0303), NFD form of "ñ" (U+00F1).
    const nfdChar = "ñ";
    const emptyKey: TouchKeyIR = { nodeId: "node_K_X", id: "K_X" };
    const layout = makeLayout([emptyKey]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: nfdChar, hostKey: "K_X" }],
    });
    expect(warnings).toHaveLength(0);
    const placed = phoneDefaultKeys(out).find((k) => k.id === "U_00F1")!;
    expect(placed).toBeDefined();
    expect(placed.text).toBe("ñ");
    expect(placed.id).toBe("U_00F1");
  });
});

// ---------------------------------------------------------------------------
// 4b. Placements — case-derived layer targeting
// ---------------------------------------------------------------------------

function phoneLayerKeys(layout: TouchLayoutIR, layerId: string): TouchKeyIR[] {
  const phone = layout.platforms.find((p) => p.id === "phone")!;
  const layer = phone.layers.find((l) => l.id === layerId)!;
  return layer.rows.flatMap((r) => r.keys);
}

describe("applyDesktopModifications — placements target the case-derived layer", () => {
  it("lands an uppercase char on the shift layer's host key (empty host -> primary)", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [{ nodeId: "node_K_A_shift", id: "K_A" }], // empty shift-layer host
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }], // "Á" = "A" with acute (upper)
    });
    expect(warnings).toHaveLength(0);

    const shiftKeys = phoneLayerKeys(out, "shift");
    const placed = shiftKeys.find((k) => k.id === "U_00C1")!;
    expect(placed).toBeDefined();
    expect(placed.text).toBe("Á");

    // Default layer's K_A is unchanged (still "a", no sk[]).
    const defaultKa = getKey(out, "K_A")!;
    expect(defaultKa.text).toBe("a");
    expect(defaultKa.sk ?? []).toHaveLength(0);
  });

  it("lands an uppercase char on the shift layer's host key as an sk[] alternate when the shift host is occupied", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      // Occupied shift-layer host producing a DIFFERENT char than the
      // placement — the realistic shift seed, where "K_A" already gives "A".
      shiftLayer: [makeKey("K_A", { text: "A", output: "A" })],
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(0);

    const shiftKa = phoneLayerKeys(out, "shift").find((k) => k.id === "K_A")!;
    expect(shiftKa.text).toBe("A"); // primary production kept
    expect(shiftKa.sk).toHaveLength(1);
    expect(shiftKa.sk![0]!.text).toBe("Á");

    // Default layer untouched.
    const defaultKa = getKey(out, "K_A")!;
    expect(defaultKa.text).toBe("a");
    expect(defaultKa.sk ?? []).toHaveLength(0);
  });

  it("is a no-op when the shift host already produces the placed char (no self-referential sk[])", () => {
    // A shift-layer seed commonly already carries the uppercase form as its
    // primary production. Re-placing that same char must not append the key to
    // its own sk[] — a key offering itself as its own longpress alternate.
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [makeKey("K_A", { text: "Á", output: "Á" })],
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(0);

    const shiftKa = phoneLayerKeys(out, "shift").find((k) => k.id === "K_A")!;
    expect(shiftKa.text).toBe("Á");
    expect(shiftKa.sk ?? []).toHaveLength(0);
  });

  it("is a no-op when the host produces the placed char in a different normalization form", () => {
    // Host text is NFD ("A" + combining acute); the placement is NFC "Á".
    // Placements NFC-normalize before matching, so this is the same character
    // and must not become an sk[] alternate.
    const nfdUpperAAcute = "A" + String.fromCodePoint(0x0301);
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [makeKey("K_A", { text: nfdUpperAAcute, output: nfdUpperAAcute })],
    });
    const { layout: out } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }],
    });

    const shiftKa = phoneLayerKeys(out, "shift").find((k) => k.id === "K_A")!;
    expect(shiftKa.sk ?? []).toHaveLength(0);
  });

  it("still lands a lowercase char on the default layer (regression guard)", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [makeKey("K_A", { text: "Á", output: "Á" })],
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "á", hostKey: "K_A" }], // "á" = "a" with acute (lower)
    });
    expect(warnings).toHaveLength(0);

    const defaultKa = getKey(out, "K_A")!;
    expect(defaultKa.sk).toHaveLength(1);
    expect(defaultKa.sk![0]!.text).toBe("á");

    // Shift layer untouched.
    const shiftKa = phoneLayerKeys(out, "shift").find((k) => k.id === "K_A")!;
    expect(shiftKa.text).toBe("Á");
    expect(shiftKa.sk ?? []).toHaveLength(0);
  });

  it("falls back to the default layer (with a warning) when no shift layer exists", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })]); // no shift layer at all
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/shift/);

    const defaultKa = getKey(out, "K_A")!;
    expect(defaultKa.sk).toHaveLength(1);
    expect(defaultKa.sk![0]!.text).toBe("Á");
  });

  it("is a no-op when a HAND-SET host already produces the placed char (no duplicate fallback key)", () => {
    // The no-op guard must precede the hand-set no-clobber branch: "nothing to
    // place" beats "do not clobber". Routing this to the hand-set fallback
    // appended a SECOND key with the same production and warned about
    // overwriting an author edit that was not happening.
    //
    // Routine input now that placements target the case-derived layer:
    // promoteOnManualEdit marks the key an author edits as hand-set, the
    // case-pair flow puts uppercase chars on the shift key, and a reseed then
    // replays the placement onto that hand-set key.
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [makeKey("K_A", { text: "Á", output: "Á", provenance: "hand-set" })],
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(0);

    const shiftKeys = phoneLayerKeys(out, "shift");
    expect(shiftKeys).toHaveLength(1); // no appended U_00C1 twin
    expect(shiftKeys[0]!.id).toBe("K_A");
    expect(shiftKeys[0]!.text).toBe("Á");
    expect(shiftKeys[0]!.provenance).toBe("hand-set"); // author's edit untouched
    expect(shiftKeys[0]!.sk ?? []).toHaveLength(0);
  });

  it("still falls back for a hand-set host that produces a DIFFERENT char", () => {
    // The no-clobber branch itself is unchanged — only its position relative to
    // the no-op guard moved. A hand-set host producing something else must
    // still fall back rather than being overwritten.
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [makeKey("K_A", { text: "A", output: "A", provenance: "hand-set" })],
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/hand-set/);

    const shiftKeys = phoneLayerKeys(out, "shift");
    const handSet = shiftKeys.find((k) => k.id === "K_A")!;
    expect(handSet.text).toBe("A"); // not clobbered
    expect(handSet.sk ?? []).toHaveLength(0);
    const fallback = shiftKeys.find((k) => k.id === "U_00C1")!;
    expect(fallback).toBeDefined(); // placement not lost
    expect(fallback.text).toBe("Á");
  });

  it("routes each placement of a MIXED-CASE batch to its own layer in one call", () => {
    // The per-layer working-state map is the machinery this change introduced;
    // a single-placement test never exercises two layers being accumulated
    // concurrently. Same hostKey, both cases, one call.
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [makeKey("K_A", { text: "A", output: "A" })],
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [
        { char: "á", hostKey: "K_A" },
        { char: "Á", hostKey: "K_A" },
      ],
    });
    expect(warnings).toHaveLength(0);

    // Lowercase went to default, uppercase to shift — neither leaked.
    const defaultKa = getKey(out, "K_A")!;
    expect(defaultKa.text).toBe("a");
    expect(defaultKa.sk).toHaveLength(1);
    expect(defaultKa.sk![0]!.text).toBe("á");

    const shiftKa = phoneLayerKeys(out, "shift").find((k) => k.id === "K_A")!;
    expect(shiftKa.text).toBe("A");
    expect(shiftKa.sk).toHaveLength(1);
    expect(shiftKa.sk![0]!.text).toBe("Á");
  });

  it("appends the fallback to the SHIFT layer when the host key is absent from it", () => {
    // Shift layers are routinely sparser than default. The fallback must land
    // on the layer the case rule chose — not the default layer — and the
    // warning must name that layer.
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: [makeKey("K_Q", { text: "Q", output: "Q" })], // no K_A here
    });
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "Á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not found/);
    expect(warnings[0]).toMatch(/"shift" layer/);

    const shiftKeys = phoneLayerKeys(out, "shift");
    const placed = shiftKeys.find((k) => k.id === "U_00C1")!;
    expect(placed).toBeDefined();
    expect(placed.text).toBe("Á");

    // Default layer got nothing — the fallback did not leak across layers.
    expect(phoneLayerKeys(out, "default").some((k) => k.id === "U_00C1")).toBe(false);
    const defaultKa = getKey(out, "K_A")!;
    expect(defaultKa.sk ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Provenance
// ---------------------------------------------------------------------------

describe("applyDesktopModifications — provenance", () => {
  it("tags a newly-produced empty-host placement as physical-suggested", () => {
    const emptyKey: TouchKeyIR = { nodeId: "node_K_X", id: "K_X" };
    const layout = makeLayout([emptyKey]);
    const { layout: out } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "ñ", hostKey: "K_X" }],
    });
    const placed = phoneDefaultKeys(out).find((k) => k.id === "U_00F1")!;
    expect(placed.provenance).toBe("physical-suggested");
  });

  it("tags a longpress-alternate placement's parent key as physical-suggested", () => {
    const key = makeKey("K_A", { provenance: "base-derived" });
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "á", hostKey: "K_A" }],
    });
    expect(getKey(out, "K_A")!.provenance).toBe("physical-suggested");
  });

  it("never overwrites a hand-set key — placement is redirected to a fallback with a warning", () => {
    const handSetKey = makeKey("K_A", { provenance: "hand-set" });
    const layout = makeLayout([handSetKey]);
    const { layout: out, warnings } = applyDesktopModifications(layout, {
      removals: [],
      placements: [{ char: "á", hostKey: "K_A" }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/hand-set/);
    // K_A itself is untouched.
    const untouched = getKey(out, "K_A")!;
    expect(untouched.provenance).toBe("hand-set");
    expect(untouched.sk ?? []).toHaveLength(0);
    // The char still lands somewhere (fallback), tagged physical-suggested.
    const fallback = phoneDefaultKeys(out).find((k) => k.id === "U_00E1")!;
    expect(fallback).toBeDefined();
    expect(fallback.provenance).toBe("physical-suggested");
  });

  it("keeps unchanged keys' provenance as-is (structural sharing)", () => {
    const key = makeKey("K_B", { provenance: "hand-set" });
    const layout = makeLayout([key]);
    const { layout: out } = applyDesktopModifications(layout, { removals: [], placements: [] });
    expect(getKey(out, "K_B")).toBe(key); // same reference — untouched
  });
});

// ---------------------------------------------------------------------------
// 6. Purity + determinism
// ---------------------------------------------------------------------------

describe("applyDesktopModifications — purity", () => {
  it("does not mutate the input layout", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" }), makeKey("K_B")]);
    const clone = deepClone(layout);
    applyDesktopModifications(layout, {
      removals: ["a"],
      placements: [{ char: "ñ", hostKey: "K_B" }],
    });
    expect(layout).toEqual(clone);
  });

  it("shift layer and tablet platform are structurally shared when untouched", () => {
    const shiftKeys = [makeKey("K_A_SHIFT")];
    const tabletKeys = [makeKey("K_TABLET")];
    const layout = makeLayout([makeKey("K_A", { text: "a", output: "a" })], {
      shiftLayer: shiftKeys,
      tabletPlatform: tabletKeys,
    });
    const phonePlatform = layout.platforms.find((p) => p.id === "phone")!;
    const inputShiftLayer = phonePlatform.layers.find((l) => l.id === "shift")!;
    const inputTablet = layout.platforms.find((p) => p.id === "tablet")!;

    const { layout: out } = applyDesktopModifications(layout, { removals: ["a"], placements: [] });

    const outPhone = out.platforms.find((p) => p.id === "phone")!;
    const outShift = outPhone.layers.find((l) => l.id === "shift")!;
    const outTablet = out.platforms.find((p) => p.id === "tablet")!;

    expect(outShift).toBe(inputShiftLayer);
    expect(outTablet).toBe(inputTablet);
  });
});

describe("applyDesktopModifications — determinism", () => {
  it("the same (seed, mods) input produces deep-equal output across two runs", () => {
    const layout = makeLayout([
      makeKey("K_A", { sk: [{ nodeId: "sk1", id: "U_00E1", text: "á" }] }),
      makeKey("K_B"),
      makeKey("K_C"),
    ]);
    const mods = {
      removals: ["á", "c"],
      placements: [
        { char: "ñ", hostKey: "K_B" },
        { char: "ő", hostKey: "K_NONEXISTENT" },
      ],
    };

    const run1 = applyDesktopModifications(deepClone(layout), mods);
    const run2 = applyDesktopModifications(deepClone(layout), mods);

    expect(run1.layout).toEqual(run2.layout);
    expect(run1.warnings).toEqual(run2.warnings);
  });
});
