/**
 * Unit tests for the touch-key address scheme, focused on the OCCURRENCE
 * suffix — the part that lets an address name one specific key when several in
 * a layer share an id (`sil_cameroon_azerty` spells `T_BLANK` twenty-five times
 * inside one tablet layer).
 *
 * The load-bearing property is backward compatibility: every address written
 * before occurrences existed must keep its exact spelling and its exact
 * meaning, because persisted overlay operations and `deletedTouchKeyIds`
 * entries are full of them and there is no migration.
 */

import { describe, expect, it } from "vitest";
import {
  createKeyOccurrenceCounter,
  parseTouchKeyAddress,
  touchFlickAddress,
  touchKeyAddress,
  touchSubKeyAddress,
} from "./touch-key-address";

describe("touchKeyAddress — the occurrence suffix", () => {
  it("writes no suffix for the first occurrence, however it is spelled", () => {
    const bare = "phone:default:T_BLANK";
    expect(touchKeyAddress("phone", "default", "T_BLANK")).toBe(bare);
    expect(touchKeyAddress("phone", "default", "T_BLANK", 0)).toBe(bare);
    expect(touchKeyAddress("phone", "default", "T_BLANK", undefined)).toBe(bare);
  });

  it("writes `#n` from the second occurrence on", () => {
    expect(touchKeyAddress("phone", "default", "T_BLANK", 1)).toBe("phone:default:T_BLANK#1");
    expect(touchKeyAddress("phone", "default", "T_BLANK", 24)).toBe("phone:default:T_BLANK#24");
  });

  it("qualifies the KEY, so a sub-entry hangs off the occurrence it belongs to", () => {
    expect(touchSubKeyAddress("phone", "default", "T_BLANK", "sk", "U_00E1", 3)).toBe(
      "phone:default:T_BLANK#3:sk:U_00E1",
    );
    expect(touchFlickAddress("phone", "default", "T_BLANK", "n", 3)).toBe(
      "phone:default:T_BLANK#3:flick:n",
    );
  });
});

describe("parseTouchKeyAddress — reading the occurrence back", () => {
  it("round-trips every builder, with and without an occurrence", () => {
    const cases: Array<[string, { keyId: string; occurrence?: number }]> = [
      [touchKeyAddress("phone", "default", "K_A"), { keyId: "K_A" }],
      [touchKeyAddress("phone", "default", "T_BLANK", 7), { keyId: "T_BLANK", occurrence: 7 }],
    ];
    for (const [address, expected] of cases) {
      const parts = parseTouchKeyAddress(address)!;
      expect(parts).toBeDefined();
      expect(parts.platform).toBe("phone");
      expect(parts.layerId).toBe("default");
      expect(parts.keyId).toBe(expected.keyId);
      expect(parts.occurrence).toBe(expected.occurrence);
    }
  });

  it("leaves `occurrence` absent — not 0 — for a bare address, so an old consumer sees no new field", () => {
    const parts = parseTouchKeyAddress("phone:default:K_A")!;
    expect(parts.occurrence).toBeUndefined();
    expect("occurrence" in parts).toBe(false);
  });

  it("reads the occurrence and the sub-entry together, in that nesting", () => {
    const parts = parseTouchKeyAddress("phone:default:T_BLANK#3:sk:U_00E1")!;
    expect(parts.keyId).toBe("T_BLANK");
    expect(parts.occurrence).toBe(3);
    expect(parts.sub).toEqual({ kind: "sk", id: "U_00E1" });
  });

  it("keeps a colon-bearing key id intact alongside an occurrence", () => {
    // The parse is anchored from both ends and the key id may contain colons —
    // the occurrence is stripped from the END, after the sub-entry, so neither
    // eats into the id.
    const address = touchKeyAddress("phone", "default", "T_ODD:ID", 2);
    const parts = parseTouchKeyAddress(address)!;
    expect(parts.keyId).toBe("T_ODD:ID");
    expect(parts.occurrence).toBe(2);
  });

  it("does not mistake a trailing `#` or `#0` for an occurrence", () => {
    // The builder never writes either (occurrence 0 IS the bare address), so a
    // key id that literally ends this way keeps its own text.
    expect(parseTouchKeyAddress("phone:default:T_HASH#")!.keyId).toBe("T_HASH#");
    expect(parseTouchKeyAddress("phone:default:T_HASH#")!.occurrence).toBeUndefined();
    expect(parseTouchKeyAddress("phone:default:T_HASH#0")!.keyId).toBe("T_HASH#0");
    expect(parseTouchKeyAddress("phone:default:T_HASH#0")!.occurrence).toBeUndefined();
    expect(parseTouchKeyAddress("phone:default:T_HASH#01")!.keyId).toBe("T_HASH#01");
  });

  it("still rejects what it always rejected", () => {
    for (const bad of ["", "phone", "phone:default", "phone::K_A", ":default:K_A"]) {
      expect(parseTouchKeyAddress(bad)).toBeUndefined();
    }
  });
});

describe("createKeyOccurrenceCounter", () => {
  it("counts each id independently, from 0", () => {
    const next = createKeyOccurrenceCounter();
    expect([
      next("T_BLANK"),
      next("K_A"),
      next("T_BLANK"),
      next("T_BLANK"),
      next("K_A"),
    ]).toEqual([0, 0, 1, 2, 1]);
  });

  it("is per-layer: a fresh counter starts over", () => {
    const layerA = createKeyOccurrenceCounter();
    layerA("T_BLANK");
    layerA("T_BLANK");
    const layerB = createKeyOccurrenceCounter();
    expect(layerB("T_BLANK")).toBe(0);
  });

  it("composes with the builder to give a layer's repeated ids distinct addresses", () => {
    const next = createKeyOccurrenceCounter();
    const ids = ["K_SHIFT", "T_BLANK", "T_BLANK", "T_BLANK", "K_SHIFT"];
    const addresses = ids.map((id) => touchKeyAddress("tablet", "rightalt", id, next(id)));
    expect(new Set(addresses).size).toBe(ids.length);
    expect(addresses[0]).toBe("tablet:rightalt:K_SHIFT");
    expect(addresses[4]).toBe("tablet:rightalt:K_SHIFT#1");
    expect(addresses[3]).toBe("tablet:rightalt:T_BLANK#2");
  });
});
