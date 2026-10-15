/**
 * Full-fidelity touch-layout round-trip tests (#2083).
 *
 * Acceptance criteria: `parse → emit` is lossless — deep-equal after parse of
 * the emitted output — plus targeted field assertions, on fixtures exercising
 * every field the codec previously dropped or re-encoded:
 *   - platform-level `displayUnderlying`, `fontsize`, `defaultHint`
 *   - per-key `font`, `fontsize`, `dk`
 *   - `sp` / `width` / `pad` source encoding (string vs number)
 *   - row ids
 *   - absent-vs-present `p` (provenance)
 *
 * Fixtures: the shipped `basic_kbdus` / `basic_kbdru` touch layouts (trimmed
 * copies live under studio/tests/fixtures/walkBases) plus a synthetic layout
 * exercising string-encoded `sp` and non-sequential row ids.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTouchLayout, emitTouchLayout } from "./parse-touch.js";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";

/** Loose wire shape for asserting on emitted JSON. */
type WireKey = Record<string, unknown>;
type WirePlatform = { layer: Array<{ row: Array<{ id?: number; key: WireKey[] }> }> } & Record<string, unknown>;
type WireLayout = Record<string, WirePlatform>;

const KBDUS = new URL(
  "../../../studio/tests/fixtures/walkBases/release/basic/basic_kbdus/source/basic_kbdus.keyman-touch-layout",
  import.meta.url,
);
const KBDRU = new URL(
  "../../../studio/tests/fixtures/walkBases/release/basic/basic_kbdru/source/basic_kbdru.keyman-touch-layout",
  import.meta.url,
);

/** Strip nodeIds (minted per parse) before comparing; everything else must match. */
function comparable(ir: TouchLayoutIR) {
  return { platforms: ir.platforms };
}

function roundTripTwice(src: string): { once: TouchLayoutIR; twice: TouchLayoutIR; emitted: string } {
  const once = parseTouchLayout(src);
  const emitted = emitTouchLayout(once);
  const twice = parseTouchLayout(emitted);
  return { once, twice, emitted };
}

describe("full-fidelity round-trip on shipped fixtures (#2083)", () => {
  for (const [name, url] of [["basic_kbdus", KBDUS], ["basic_kbdru", KBDRU]] as const) {
    it(`${name}: parse → emit → re-parse is deep-equal`, () => {
      const src = readFileSync(url, "utf8");
      const { once, twice } = roundTripTwice(src);
      expect(comparable(twice)).toEqual(comparable(once));
    });

    it(`${name}: platform displayUnderlying survives (was dropped)`, () => {
      const src = readFileSync(url, "utf8");
      const { emitted } = roundTripTwice(src);
      const out = JSON.parse(emitted) as WireLayout;
      expect(out["tablet"]?.displayUnderlying).toBe(false);
    });

    it(`${name}: no defaultHint is materialized (source omits it)`, () => {
      const src = readFileSync(url, "utf8");
      const { emitted } = roundTripTwice(src);
      const out = JSON.parse(emitted) as WireLayout;
      expect("defaultHint" in (out["tablet"] ?? {})).toBe(false);
    });

    it(`${name}: no "p" is materialized onto untagged keys`, () => {
      const src = readFileSync(url, "utf8");
      const { emitted } = roundTripTwice(src);
      const out = JSON.parse(emitted) as WireLayout;
      const firstKey = out["tablet"]?.layer?.[0]?.row?.[0]?.key?.[0];
      expect(firstKey).toBeDefined();
      expect("p" in firstKey).toBe(false);
    });

    it(`${name}: numeric sp/width/pad stay numeric (no re-encoding)`, () => {
      const src = readFileSync(url, "utf8");
      const { emitted } = roundTripTwice(src);
      const out = JSON.parse(emitted) as WireLayout;
      // basic_kbdus carries K_SYMBOLS with numeric sp:1 / width:140.
      let found: WireKey | null = null;
      for (const layer of out["tablet"].layer)
        for (const row of layer.row)
          for (const k of row.key) if (k.id === "K_SYMBOLS") found = k;
      expect(found).toBeDefined();
      expect(typeof found.sp).toBe("number");
      expect(typeof found.width).toBe("number");
    });

    it(`${name}: per-key fontsize survives (was dropped)`, () => {
      const src = readFileSync(url, "utf8");
      const { emitted } = roundTripTwice(src);
      const out = JSON.parse(emitted) as WireLayout;
      let found: WireKey | null = null;
      for (const layer of out["tablet"].layer)
        for (const row of layer.row)
          for (const k of row.key) if (k.fontsize !== undefined) found = k;
      expect(found?.fontsize).toBe(".6em");
    });
  }
});

describe("synthetic full-surface fixture (#2083)", () => {
  // Exercises every previously-dropped/re-encoded field, string-encoded `sp`,
  // and non-sequential row ids.
  const SYNTHETIC = JSON.stringify({
    phone: {
      font: "Tahoma",
      fontsize: "1.2em",
      displayUnderlying: true,
      defaultHint: "custom",
      layer: [
        {
          id: "default",
          row: [
            {
              id: 7,
              key: [
                {
                  id: "K_A",
                  text: "a",
                  sp: "1",
                  width: "100",
                  pad: "50",
                  font: "Arial",
                  fontsize: ".6em",
                  dk: "dk1",
                  nextlayer: "shift",
                },
                { id: "K_B", text: "b", sp: 0, width: 100, pad: 55 },
              ],
            },
            {
              id: 3,
              key: [{ id: "K_C", text: "c", sk: [{ id: "U_00E7", text: "ç" }] }],
            },
          ],
        },
      ],
    },
  });

  it("parse → emit → re-parse is deep-equal", () => {
    const { once, twice } = roundTripTwice(SYNTHETIC);
    expect(comparable(twice)).toEqual(comparable(once));
  });

  it("preserves platform displayUnderlying, fontsize, font, defaultHint", () => {
    const { emitted } = roundTripTwice(SYNTHETIC);
    const out = JSON.parse(emitted) as WireLayout;
    const phone = out["phone"];
    expect(phone.displayUnderlying).toBe(true);
    expect(phone.fontsize).toBe("1.2em");
    expect(phone.font).toBe("Tahoma");
    expect(phone.defaultHint).toBe("custom");
  });

  it("preserves non-sequential row ids instead of regenerating them", () => {
    const { emitted } = roundTripTwice(SYNTHETIC);
    const out = JSON.parse(emitted) as WireLayout;
    const rows = out["phone"].layer[0].row;
    expect(rows[0].id).toBe(7);
    expect(rows[1].id).toBe(3);
  });

  it("preserves per-key font, fontsize, dk", () => {
    const { emitted } = roundTripTwice(SYNTHETIC);
    const out = JSON.parse(emitted) as WireLayout;
    const key = out["phone"].layer[0].row[0].key[0];
    expect(key.font).toBe("Arial");
    expect(key.fontsize).toBe(".6em");
    expect(key.dk).toBe("dk1");
  });

  it("preserves string vs number encoding of sp/width/pad per key", () => {
    const { emitted } = roundTripTwice(SYNTHETIC);
    const out = JSON.parse(emitted) as WireLayout;
    const [strKey, numKey] = out["phone"].layer[0].row[0].key;
    expect(strKey.sp).toBe("1");
    expect(strKey.width).toBe("100");
    expect(strKey.pad).toBe("50");
    expect(numKey.sp).toBe(0);
    expect(numKey.width).toBe(100);
    expect(numKey.pad).toBe(55);
  });

  it("keeps nextlayer untouched alongside either sp encoding", () => {
    const { emitted } = roundTripTwice(SYNTHETIC);
    const out = JSON.parse(emitted) as WireLayout;
    const key = out["phone"].layer[0].row[0].key[0];
    expect(key.nextlayer).toBe("shift");
  });

  it("IR carries the preserved fields with normalized numerics", () => {
    const { once } = roundTripTwice(SYNTHETIC);
    const platform = once.platforms[0]!;
    expect(platform.displayUnderlying).toBe(true);
    expect(platform.fontsize).toBe("1.2em");
    expect(platform.defaultHint).toBe("custom");
    expect(platform.layers[0]!.rows[0]!.id).toBe(7);
    const key = platform.layers[0]!.rows[0]!.keys[0]!;
    expect(key.sp).toBe(1);
    expect(key.spWire).toBe("1");
    expect(key.font).toBe("Arial");
    expect(key.fontsize).toBe(".6em");
    expect(key.dk).toBe("dk1");
  });
});
