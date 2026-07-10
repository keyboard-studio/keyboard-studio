// Tests for applyKeycapLabelsToVfs — the S-01/S-08 keycap-label patcher.
//
// Coverage:
//   1. Nothing-to-patch: non-physical / target-less assignments short-circuit
//      before any VFS read, no warnings.
//   2. .kvks S-01: replaces an existing keycap's text on the unshifted layer.
//   3. .kvks S-01: appends a new <key> element when the vkey is absent from
//      an existing (matched) layer.
//   4. .kvks S-08: replaces an existing keycap's text on an existing
//      shift="RA" layer, leaving the unshifted layer untouched.
//   5. .kvks S-08: synthesizes a brand-new shift="RA" layer (+ <usealtgr/>)
//      when the base .kvks has no AltGr layer at all.
//   6. Missing .kvks -> one warning; missing touch layout -> silent (the two
//      helpers are NOT symmetric — documented, not "fixed").
//   7. Binary .kvks entry -> one warning, entry left untouched.
//   8. Touch layout S-01: patches the "default" layer's matching key text.
//   9. Touch layout S-08: patches only the "rightalt" layer, default layer
//      untouched.
//  10. Touch layout: top-level object IS the platform object (no nested
//      platform key) — the discovery fallback branch.
//  11. Touch layout: malformed JSON is silently skipped — no warning, no
//      write (contrast with applyCarveKeycapRemovalsToVfs, which DOES warn
//      on malformed touch JSON).
//  12. Path resolution: .kmn header stores (&VISUALKEYBOARD / &LAYOUTFILE)
//      redirect both asset paths away from the source/<keyboardId> default.
//  13. Path resolution: no header stores -> falls back to
//      source/<keyboardId>.<ext>.
//  14. SUSPECTED BUG — both patchKvks and patchTouchLayout call vfs.set()
//      unconditionally once a layer file is present, even when no target
//      actually matched anything in it (no "changed" guard, unlike the
//      sibling applyCarveKeycapRemovalsToVfs). Documented as current
//      behavior, not fixed here.

import { describe, it, expect, vi } from "vitest";
import { applyKeycapLabelsToVfs } from "./applyKeycapLabelsToVfs.js";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { MechanismAssignment, VirtualFS } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Builds a bare-vkey S-01 rule line whose RHS decodes back to `target`,
 * matching how the studio always builds these two values in lockstep
 * (shiftRules.ts's buildBaseRuleLines uses the same char for both). */
function makeS01Assignment(target: string, vkey: string): MechanismAssignment {
  const cp = (target.codePointAt(0) ?? 0x41).toString(16).toUpperCase().padStart(4, "0");
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [
      {
        patternId: "p-s01",
        strategyId: "S-01",
        slotValues: { kmnRules: `+ [${vkey}] > U+${cp}` },
      },
    ],
  };
}

function makeS08Assignment(target: string, vkey: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [
      {
        patternId: "p-s08",
        strategyId: "S-08",
        slotValues: { altgrKeyList: `[RALT ${vkey}]` },
      },
    ],
  };
}

/** Shifted AltGr (Shift+RightAlt) variant: `[SHIFT RALT K_X]`. */
function makeS08ShiftedAssignment(target: string, vkey: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [
      {
        patternId: "p-s08-shift",
        strategyId: "S-08",
        slotValues: { altgrKeyList: `[SHIFT RALT ${vkey}]` },
      },
    ],
  };
}

/** Default fixture: no &VISUALKEYBOARD/&LAYOUTFILE header stores, so asset
 * paths fall back to source/test.<ext>. */
function makeVfs(
  entries: { path: string; content: string }[],
  kmnContent = "c test keyboard\n",
): VirtualFS {
  return createVirtualFS([
    { path: "source/test.kmn", content: kmnContent, isBinary: false },
    ...entries.map((e) => ({ ...e, isBinary: false })),
  ]);
}

const KVKS_BASE = `<visualkeyboard>
<header><version>10.0</version></header>
<encoding name="unicode" fontname="Arial">
<layer shift="">
<key vkey="K_A">a</key>
</layer>
</encoding>
</visualkeyboard>`;

const KVKS_WITH_RA = `<visualkeyboard><encoding name="unicode">
<layer shift="">
<key vkey="K_A">a</key>
</layer>
<layer shift="RA">
<key vkey="K_A">a-ra</key>
</layer>
</encoding></visualkeyboard>`;

const KVKS_WITH_SRA = `<visualkeyboard><encoding name="unicode">
<layer shift="">
<key vkey="K_A">a</key>
</layer>
<layer shift="SRA">
<key vkey="K_A">a-sra</key>
</layer>
</encoding></visualkeyboard>`;

/** Includes a real `shift="S"` layer with a K_E key, for the S-01 shift-companion tests. */
const KVKS_WITH_SHIFT = `<visualkeyboard><encoding name="unicode">
<layer shift="">
<key vkey="K_E">e</key>
</layer>
<layer shift="S">
<key vkey="K_E">E</key>
</layer>
</encoding></visualkeyboard>`;

// ---------------------------------------------------------------------------
// 1. Nothing to patch
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — nothing to patch", () => {
  it("short-circuits before touching the VFS for non-physical or target-less assignments", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);
    const setSpy = vi.spyOn(vfs, "set");

    const touchModality: MechanismAssignment = {
      scope: "individual",
      target: "z",
      modality: "touch",
      mechanisms: [{ patternId: "p1", strategyId: "S-01", slotValues: { kmnRules: "[K_Z]" } }],
    };
    const noTarget: MechanismAssignment = {
      scope: "individual",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: "p2", strategyId: "S-01", slotValues: { kmnRules: "[K_Y]" } }],
    };

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [touchModality, noTarget]);

    expect(warnings).toHaveLength(0);
    expect(setSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2-3. .kvks — S-01 (unshifted layer)
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — .kvks S-01 (unshifted layer)", () => {
  it("replaces an existing keycap's text in place", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<key vkey="K_A">Z</key>');
    expect(xml.match(/<layer\b/g)).toHaveLength(1);
  });

  it("appends a new <key> element when the vkey is absent from the matched layer", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("B", "K_B")]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<key vkey="K_A">a</key>');
    expect(xml).toContain('<key vkey="K_B">B</key>');
    expect(xml.match(/<layer\b/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4-5. .kvks — S-08 (AltGr / shift="RA" layer)
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — .kvks S-08 (AltGr layer)", () => {
  it("replaces text on an existing shift=\"RA\" layer, leaving the unshifted layer alone", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_WITH_RA }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS08Assignment("Q", "K_A")]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<key vkey="K_A">a</key>'); // unshifted layer untouched
    expect(xml).toContain('<key vkey="K_A">Q</key>'); // RA layer patched
    expect(xml.match(/<layer\b/g)).toHaveLength(2);
  });

  it("synthesizes a new shift=\"RA\" layer plus <usealtgr/> when none exists", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS08Assignment("Q", "K_B")]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<layer shift="RA">');
    expect(xml).toContain('<key vkey="K_B">Q</key>');
    expect(xml).toContain("<usealtgr/>");
    expect(xml.match(/<layer\b/g)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Shifted AltGr (Shift+RightAlt / shift="SRA" layer)
// ---------------------------------------------------------------------------

describe('applyKeycapLabelsToVfs — .kvks S-08 shifted (Shift+RightAlt / shift="SRA" layer)', () => {
  it('replaces text on an existing shift="SRA" layer, leaving the unshifted layer alone', () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_WITH_SRA }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [
      makeS08ShiftedAssignment("Q", "K_A"),
    ]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<key vkey="K_A">a</key>'); // unshifted layer untouched
    expect(xml).toContain('<key vkey="K_A">Q</key>'); // SRA layer patched
    expect(xml.match(/<layer\b/g)).toHaveLength(2);
  });

  it('synthesizes a new shift="SRA" layer plus <usealtgr/> when none exists', () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [
      makeS08ShiftedAssignment("Q", "K_B"),
    ]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<layer shift="SRA">');
    expect(xml).toContain('<key vkey="K_B">Q</key>');
    expect(xml).toContain("<usealtgr/>");
    expect(xml.match(/<layer\b/g)).toHaveLength(2);
  });

  it("lands an unshifted and a shifted AltGr char for the same key on different layers (no collision)", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [
      makeS08Assignment("Q", "K_B"),
      makeS08ShiftedAssignment("W", "K_B"),
    ]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    const raMatch = /<layer shift="RA">[\s\S]*?<\/layer>/.exec(xml);
    const sraMatch = /<layer shift="SRA">[\s\S]*?<\/layer>/.exec(xml);
    expect(raMatch?.[0]).toContain('<key vkey="K_B">Q</key>');
    expect(sraMatch?.[0]).toContain('<key vkey="K_B">W</key>');
    expect(raMatch?.[0]).not.toContain("W");
    expect(sraMatch?.[0]).not.toContain("Q");
  });
});

// ---------------------------------------------------------------------------
// S-01 base + shift companion (reported bug: companion's uppercase used to
// overwrite the base keycap instead of landing on the shift layer).
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — S-01 base + shift companion (reported bug)", () => {
  function makeCasePairAssignments(): MechanismAssignment[] {
    return [
      {
        scope: "individual",
        target: "θ", // theta (lowercase)
        modality: "physical",
        mechanisms: [
          {
            patternId: "p-base",
            strategyId: "S-01",
            slotValues: { kmnRules: "+ [K_E] > U+03B8" },
          },
        ],
      },
      {
        scope: "individual",
        target: "Θ", // Theta (uppercase companion)
        modality: "physical",
        mechanisms: [
          {
            patternId: "p-shift",
            strategyId: "S-01",
            slotValues: { kmnRules: "+ [SHIFT K_E] > U+0398" },
          },
        ],
      },
    ];
  }

  it("base keycap shows the lowercase char, shift keycap shows the companion — no collision", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_WITH_SHIFT }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", makeCasePairAssignments());

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    const baseMatch = /<layer shift="">[\s\S]*?<\/layer>/.exec(xml);
    const shiftMatch = /<layer shift="S">[\s\S]*?<\/layer>/.exec(xml);
    expect(baseMatch?.[0]).toContain('<key vkey="K_E">θ</key>');
    expect(shiftMatch?.[0]).toContain('<key vkey="K_E">Θ</key>');
    expect(baseMatch?.[0]).not.toContain("Θ");
    expect(shiftMatch?.[0]).not.toContain(">θ<");
  });

  it("CAPS case-pair quad in ONE assignment: base+shift patched, CAPS-state lines ignored, no collision", () => {
    // Mirrors shiftRules.ts's buildCasePairRuleLines quad for a CAPS-handling key.
    const kmnRules = [
      "+ [NCAPS K_E] > U+03B8",
      "+ [NCAPS SHIFT K_E] > U+0398",
      "+ [CAPS K_E] > U+0398",
      "+ [CAPS SHIFT K_E] > U+03B8",
    ].join("\n");
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "θ",
      modality: "physical",
      mechanisms: [
        { patternId: "p-quad", strategyId: "S-01", slotValues: { kmnRules } },
      ],
    };
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_WITH_SHIFT }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [assignment]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    const baseMatch = /<layer shift="">[\s\S]*?<\/layer>/.exec(xml);
    const shiftMatch = /<layer shift="S">[\s\S]*?<\/layer>/.exec(xml);
    expect(baseMatch?.[0]).toContain('<key vkey="K_E">θ</key>');
    expect(shiftMatch?.[0]).toContain('<key vkey="K_E">Θ</key>');
    expect(baseMatch?.[0]).not.toContain("Θ");
    expect(shiftMatch?.[0]).not.toContain(">θ<");
  });

  it("falls back to the assignment's target when the RHS is not decodable (outs() reference)", () => {
    // decodeRhsChar returns undefined for anything that is neither U+XXXX
    // tokens nor a quoted literal; parseS01RuleLine must then label the
    // keycap with the assignment's own target (backward compatibility with
    // pre-existing simple single-rule callers).
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "θ",
      modality: "physical",
      mechanisms: [
        {
          patternId: "p-outs",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [K_E] > outs(theta_store)" },
        },
      ],
    };
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_WITH_SHIFT }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [assignment]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    const baseMatch = /<layer shift="">[\s\S]*?<\/layer>/.exec(xml);
    expect(baseMatch?.[0]).toContain('<key vkey="K_E">θ</key>');
  });
});

// ---------------------------------------------------------------------------
// S-01 shift companion — touch layout
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — touch layout S-01 shift label", () => {
  it('patches the "shift" layer key when present, leaving "default" untouched', () => {
    const touchLayout = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_E", text: "e" }] }] },
          { id: "shift", row: [{ id: 1, key: [{ id: "K_E", text: "E" }] }] },
        ],
      },
    });
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_WITH_SHIFT },
      { path: "source/test.keyman-touch-layout", content: touchLayout },
    ]);
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "Θ",
      modality: "physical",
      mechanisms: [
        {
          patternId: "p-shift",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [SHIFT K_E] > U+0398" },
        },
      ],
    };

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [assignment]);

    expect(warnings).toHaveLength(0);
    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    expect(data.tablet.layer[1].row[0].key[0].text).toBe("Θ");
    expect(data.tablet.layer[0].row[0].key[0].text).toBe("e"); // default untouched
  });

  it('no-ops silently (no throw) when the touch layout has no "shift" layer', () => {
    const touchLayout = JSON.stringify({
      tablet: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_E", text: "e" }] }] }] },
    });
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_WITH_SHIFT },
      { path: "source/test.keyman-touch-layout", content: touchLayout },
    ]);
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "Θ",
      modality: "physical",
      mechanisms: [
        {
          patternId: "p-shift",
          strategyId: "S-01",
          slotValues: { kmnRules: "+ [SHIFT K_E] > U+0398" },
        },
      ],
    };

    expect(() => applyKeycapLabelsToVfs(vfs, "test", [assignment])).not.toThrow();
    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    expect(data.tablet.layer[0].row[0].key[0].text).toBe("e"); // untouched, no throw
  });
});

// ---------------------------------------------------------------------------
// 6-7. Missing / binary .kvks
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — missing or binary .kvks", () => {
  it("warns once when .kvks is absent, but stays silent for an absent touch layout", () => {
    // Neither source/test.kvks nor source/test.keyman-touch-layout exist.
    // NOTE (documented asymmetry, not a bug): patchKvks always pushes a
    // warning for a missing .kvks; patchTouchLayout treats an absent touch
    // layout as a fully silent no-op. The two helpers are not symmetric.
    const vfs = makeVfs([]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no .kvks found");
  });

  it("warns once for a binary .kvks entry and leaves it untouched", () => {
    const vfs = createVirtualFS([
      { path: "source/test.kmn", content: "c test\n", isBinary: false },
      { path: "source/test.kvks", content: new Uint8Array([1, 2, 3]), isBinary: true },
    ]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("marked binary");
    expect(vfs.get("source/test.kvks")?.isBinary).toBe(true);
    expect(vfs.get("source/test.kvks")?.content).toEqual(new Uint8Array([1, 2, 3]));
  });
});

// ---------------------------------------------------------------------------
// 8-9. Touch layout — happy path
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — touch layout happy path", () => {
  const touchLayout = JSON.stringify({
    tablet: {
      layer: [
        { id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] },
        { id: "rightalt", row: [{ id: 1, key: [{ id: "K_A", text: "a-ra" }] }] },
      ],
    },
  });

  it("S-01 patches the matching key on the \"default\" layer only", () => {
    // Include a .kvks fixture too so the (unrelated) missing-.kvks warning
    // doesn't leak into this touch-layout-focused assertion.
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_BASE },
      { path: "source/test.keyman-touch-layout", content: touchLayout },
    ]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(0);
    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    expect(data.tablet.layer[0].key ?? data.tablet.layer[0].row[0].key[0].text).toBeDefined();
    expect(data.tablet.layer[0].row[0].key[0].text).toBe("Z");
    expect(data.tablet.layer[1].row[0].key[0].text).toBe("a-ra"); // rightalt untouched
  });

  it("S-08 patches the matching key on the \"rightalt\" layer only", () => {
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_BASE },
      { path: "source/test.keyman-touch-layout", content: touchLayout },
    ]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS08Assignment("Q", "K_A")]);

    expect(warnings).toHaveLength(0);
    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    expect(data.tablet.layer[0].row[0].key[0].text).toBe("a"); // default untouched
    expect(data.tablet.layer[1].row[0].key[0].text).toBe("Q");
  });
});

describe("applyKeycapLabelsToVfs — touch layout platform discovery fallback", () => {
  it("treats the top-level object itself as the platform object when it has a `layer` array", () => {
    const touchLayout = JSON.stringify({
      layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }],
    });
    const vfs = makeVfs([{ path: "source/test.keyman-touch-layout", content: touchLayout }]);

    applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    expect(data.layer[0].row[0].key[0].text).toBe("Z");
  });
});

describe("applyKeycapLabelsToVfs — malformed touch layout JSON", () => {
  it("is silently skipped: no warning, no write", () => {
    // Contrast with applyCarveKeycapRemovalsToVfs, which DOES push a warning
    // for malformed touch JSON. Documented current behavior, not fixed here.
    const vfs = makeVfs([
      { path: "source/test.keyman-touch-layout", content: "{ not valid json" },
    ]);
    const setSpy = vi.spyOn(vfs, "set");

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    // Only the (unrelated) missing-.kvks warning fires — nothing about the touch layout.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no .kvks found");
    expect(setSpy).not.toHaveBeenCalledWith(
      "source/test.keyman-touch-layout",
      expect.anything(),
      expect.anything(),
    );
    expect(vfs.get("source/test.keyman-touch-layout")?.content).toBe("{ not valid json");
  });
});

// ---------------------------------------------------------------------------
// 12-13. Path resolution
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — asset path resolution", () => {
  it("redirects both asset paths per the .kmn header's &VISUALKEYBOARD/&LAYOUTFILE stores", () => {
    const kmnWithHeaderStores = `store(&VISUALKEYBOARD) 'custom/foo.kvks'
store(&LAYOUTFILE) 'custom/foo.keyman-touch-layout'
begin Unicode > use(main)
`;
    const touchLayout = JSON.stringify({
      tablet: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] },
    });
    const vfs = makeVfs(
      [
        { path: "source/custom/foo.kvks", content: KVKS_BASE },
        { path: "source/custom/foo.keyman-touch-layout", content: touchLayout },
      ],
      kmnWithHeaderStores,
    );

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(0);
    expect(vfs.get("source/custom/foo.kvks")?.content).toContain('<key vkey="K_A">Z</key>');
    const data = JSON.parse(vfs.get("source/custom/foo.keyman-touch-layout")?.content as string);
    expect(data.tablet.layer[0].row[0].key[0].text).toBe("Z");
    // The default fallback paths were never consulted/created.
    expect(vfs.get("source/test.kvks")).toBeUndefined();
    expect(vfs.get("source/test.keyman-touch-layout")).toBeUndefined();
  });

  it("falls back to source/<keyboardId>.<ext> when the .kmn declares no header stores", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]); // no header stores in the .kmn

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(0);
    expect(vfs.get("source/test.kvks")?.content).toContain('<key vkey="K_A">Z</key>');
  });
});

// ---------------------------------------------------------------------------
// 14. Suspected bug — unconditional write, no "changed" guard
// ---------------------------------------------------------------------------

describe("applyKeycapLabelsToVfs — SUSPECTED BUG: unconditional write when nothing matched", () => {
  it("calls vfs.set() for .kvks even when the target layer does not exist (content ends up byte-identical)", () => {
    // KVKS_WITH_RA has no `shift=""`... it DOES have one; use a kvks with
    // ONLY an RA layer so the S-01 (kvksLayer === "") lookup finds no layer
    // and (unlike S-08) there is no synthesis fallback for "" — patchKvks
    // falls straight through the loop with `xml` unchanged, yet still calls
    // `vfs.set(kvksPath, xml, false)` unconditionally at the end of the
    // function (no `changed` flag, unlike applyCarveKeycapRemovalsToVfs's
    // clearKvksKeycaps, which gates its vfs.set on an explicit `changed`
    // boolean). This is current behavior, documented — not fixed here.
    const kvksOnlyRA = `<visualkeyboard><encoding name="unicode">
<layer shift="RA">
<key vkey="K_A">a-ra</key>
</layer>
</encoding></visualkeyboard>`;
    const vfs = makeVfs([{ path: "source/test.kvks", content: kvksOnlyRA }]);
    const setSpy = vi.spyOn(vfs, "set");

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(0);
    expect(setSpy).toHaveBeenCalledWith("source/test.kvks", kvksOnlyRA, false);
    expect(vfs.get("source/test.kvks")?.content).toBe(kvksOnlyRA); // byte-identical, but still written
  });

  it("calls vfs.set() for the touch layout even when no layer id matched a target", () => {
    // touchLayer for S-01 is always "default"; give the file only a
    // "rightalt" layer so nothing in patchMap ever matches. patchTouchLayout
    // still serializes and writes `data` unconditionally at the end.
    const touchRightaltOnly = JSON.stringify(
      { tablet: { layer: [{ id: "rightalt", row: [{ id: 1, key: [{ id: "K_A", text: "a-ra" }] }] }] } },
      null,
      2,
    );
    const vfs = makeVfs([
      { path: "source/test.keyman-touch-layout", content: touchRightaltOnly },
    ]);
    const setSpy = vi.spyOn(vfs, "set");

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(1); // missing .kvks
    expect(setSpy).toHaveBeenCalledWith(
      "source/test.keyman-touch-layout",
      touchRightaltOnly,
      false,
    );
    expect(vfs.get("source/test.keyman-touch-layout")?.content).toBe(touchRightaltOnly);
  });
});
