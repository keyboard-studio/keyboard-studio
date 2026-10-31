/**
 * The #2235 capability settlement as code (queue-2235-ruling.md §2):
 * capability follows shape for S-06-owned rules.
 *
 * Pins:
 *   - fan-out members (incl. the tier-1 direct resolution) -> slot-fill
 *     + output-store alias; arming -> the unowned catch-all verdict;
 *     edge / double-press -> context-sensitive. Net = the unowned table:
 *     recognition is non-regressive by construction.
 *   - the scoped Decision-1b exemption: S-06-owned NAMED members take the
 *     same shape verdicts (named fan-out -> slot-fill, NOT opaque),
 *     while a named rule owned by anything else stays opaque (F3 preserved
 *     in classifyRemovalCapabilities.test.ts).
 *   - gate 2 made testable: with- vs without-recognition capability maps
 *     over the chain fixture show NO rule moving removable -> not-removable.
 */

import { describe, it, expect } from "vitest";
import { classifyRemovalCapabilities } from "./classifyRemovalCapabilities.js";
import { recognizePatterns } from "./index.js";
import { buildChainIR, buildNamedChainIR } from "./rules/__fixtures__/s06ChainIr.js";

describe("classifyRemovalCapabilities — S-06 settlement (#2235 §2)", () => {
  it("per-member verdicts on the numeric chain equal the §4 table", () => {
    const { ir } = buildChainIR();
    recognizePatterns(ir);
    const map = classifyRemovalCapabilities(ir);

    // Arming -> ordinary unowned verdict (catch-all unknown today).
    expect(map.get("rule#arm-1")).toBe("not-removable:unknown");
    expect(map.get("rule#arm-2")).toBe("not-removable:unknown");
    // Edges -> context-sensitive (the load-bearing wiring; no slot exists).
    for (const t of ["0060", "00b4", "005e", "007e", "00a8"]) {
      expect(map.get(`rule#edge-${t}`)).toBe("not-removable:context-sensitive");
    }
    // Double-press -> context-sensitive.
    expect(map.get("rule#double-press")).toBe("not-removable:context-sensitive");
    // Tier-2 resolutions AND the tier-1 direct resolution -> slot-fill.
    for (const t of ["0060", "00b4", "005e", "007e", "00a8"]) {
      expect(map.get(`rule#res-${t}`)).toBe("removable:slot-fill");
      expect(map.get(`store#dkt${t}`)).toBe("removable:slot-fill");
    }
    expect(map.get("rule#res-tier1")).toBe("removable:slot-fill");
    expect(map.get("store#dkt0021")).toBe("removable:slot-fill");
  });

  it("scoped 1b exemption: S-06-owned named members take shape verdicts, not opaque", () => {
    const { ir } = buildNamedChainIR();
    recognizePatterns(ir);
    const map = classifyRemovalCapabilities(ir);

    expect(map.get("rule#res-named")).toBe("removable:slot-fill");
    expect(map.get("store#out")).toBe("removable:slot-fill");
    expect(map.get("rule#edge-named")).toBe("not-removable:context-sensitive");
    expect(map.get("rule#fallback-named")).toBe("not-removable:context-sensitive");
    expect(map.get("rule#arm-named")).toBe("not-removable:unknown");
  });

  it("the same named rules WITHOUT S-06 ownership stay opaque (exemption is ownership-scoped)", () => {
    const { ir } = buildNamedChainIR();
    // No recognizePatterns: no S-06 stamp -> Decision 1b applies in full.
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#res-named")).toBe("not-removable:opaque");
    expect(map.get("rule#edge-named")).toBe("not-removable:opaque");
    expect(map.get("rule#arm-named")).toBe("not-removable:opaque");
    expect(map.has("store#out")).toBe(false);
  });

  it("gate 2: no S-06-owned rule sits below its UNOWNED shape verdict (fixture)", () => {
    // The settlement's baseline is the unowned shape table (ruling §2.2:
    // "the S-06 verdict table is exactly the verified unowned shape
    // table"). Arming's unowned verdict is the catch-all — its slot-fill
    // under the old pipeline came from S-02 ownership inheritance, the
    // blanket inheritance the settlement rejects (§4 table: arming ->
    // unowned shape verdict). So the regression test is: wherever the
    // unowned verdict is removable, the post-recognition verdict for an
    // S-06-owned rule must still be removable.
    const { ir: base } = buildChainIR();
    const mapUnowned = classifyRemovalCapabilities(structuredClone(base));

    const { ir: withIr } = buildChainIR();
    recognizePatterns(withIr);
    const mapWith = classifyRemovalCapabilities(withIr);
    const s06Owned = new Set(
      withIr.groups
        .flatMap((g) => g.rules)
        .filter((r) => r.ownedByPattern?.startsWith("latin_deadkey_chained_two_tier#"))
        .map((r) => r.nodeId),
    );
    expect(s06Owned.size).toBe(14);

    const regressions: string[] = [];
    for (const nodeId of s06Owned) {
      const before = mapUnowned.get(nodeId);
      const after = mapWith.get(nodeId);
      if (
        before?.startsWith("removable:") &&
        after !== undefined &&
        after.startsWith("not-removable:")
      ) {
        regressions.push(`${nodeId}: ${before} -> ${after}`);
      }
    }
    expect(regressions).toEqual([]);
  });
});
