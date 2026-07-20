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
//  14. Change-gated write — patchKvks and patchTouchLayout only call vfs.set()
//      when a target actually changed the file; when a layer file is present
//      but nothing matched, the VFS entry is left untouched (a `changed` /
//      identity guard, matching the sibling applyCarveKeycapRemovalsToVfs).

import { describe, it, expect, vi } from "vitest";
import { applyKeycapLabelsToVfs } from "./applyKeycapLabelsToVfs.js";
import { propagateDesktopLayersToTouch } from "./propagateDesktopLayersToTouch.js";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type {
  KeyboardIR,
  MechanismAssignment,
  VirtualFS,
} from "@keyboard-studio/contracts";

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

// ---------------------------------------------------------------------------
// S-08 generalized combos (CTRL/ALT/etc. beyond RALT/SHIFT+RALT)
// ---------------------------------------------------------------------------

/** Arbitrary-combo S-08 assignment builder — mirrors makeS08Assignment but for any combo spec. */
function makeS08ComboAssignment(target: string, keySpec: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [
      {
        patternId: "p-s08-combo",
        strategyId: "S-08",
        slotValues: { altgrKeyList: keySpec },
      },
    ],
  };
}

describe("applyKeycapLabelsToVfs — S-08 generalized combos", () => {
  it("synthesizes a new kvks layer (no <usealtgr/>) for a CTRL-only combo", () => {
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [
      makeS08ComboAssignment("Q", "[CTRL K_B]"),
    ]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<layer shift="C">');
    expect(xml).toContain('<key vkey="K_B">Q</key>');
    expect(xml).not.toContain("<usealtgr/>");
  });

  it("unifies a Ctrl+RAlt combo to generic Ctrl+Alt (chirality unification), synthesizing a plain shift=\"CA\" layer with no <usealtgr/>", () => {
    // [CTRL RALT K_B] mixes a generic CTRL with a chiral RALT —
    // modifierCombos.ts's chirality unification demotes RALT to ALT before
    // this module ever sees it, since a mixed generic+chiral combo is
    // kmcmplib-invalid (KM_WARNING_KMCMP_4202659) and undeliverable by any
    // real keypress. The resulting all-generic [CTRL ALT] combo has no RALT
    // token, so no <usealtgr/> hint is added — it is not an AltGr-only layer.
    const vfs = makeVfs([{ path: "source/test.kvks", content: KVKS_BASE }]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [
      makeS08ComboAssignment("Q", "[CTRL RALT K_B]"),
    ]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    expect(xml).toContain('<layer shift="CA">');
    expect(xml).not.toContain('shift="RA"');
    expect(xml).not.toContain("<usealtgr/>");
  });

  it("leaves an already all-generic Ctrl+Alt combo as-is, patching the \"ctrl-alt\" touch layer (not \"rightalt\")", () => {
    // [CTRL ALT K_A] has no chiral token, so chirality unification is a
    // no-op — the touch layer id is the generic fallback "ctrl-alt", not the
    // attested "rightalt" id (which is reserved for a pure RALT combo).
    const touchLayout = JSON.stringify({
      tablet: {
        layer: [
          { id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] },
          { id: "ctrl-alt", row: [{ id: 1, key: [{ id: "K_A", text: "old" }] }] },
        ],
      },
    });
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_BASE },
      { path: "source/test.keyman-touch-layout", content: touchLayout },
    ]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [
      makeS08ComboAssignment("Z", "[CTRL ALT K_A]"),
    ]);

    expect(warnings).toHaveLength(0);
    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    expect(data.tablet.layer[0].row[0].key[0].text).toBe("a"); // default untouched
    expect(data.tablet.layer[1].row[0].key[0].text).toBe("Z");
  });

  it("skips the .kvks surface (no synthesis) for a combo containing CAPS; touch layout is untouched because no matching layer exists in this fixture (not because touchLayer is null)", () => {
    const touchLayout = JSON.stringify({
      tablet: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }] }] },
    });
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_BASE },
      { path: "source/test.keyman-touch-layout", content: touchLayout },
    ]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [
      makeS08ComboAssignment("Z", "[CAPS CTRL K_A]"),
    ]);

    expect(warnings).toHaveLength(0);
    const xml = vfs.get("source/test.kvks")?.content as string;
    // No new layer synthesized — kvksLayer is null for a CAPS-bearing combo.
    expect(xml.match(/<layer\b/g)).toHaveLength(1);
    // This module never synthesizes a MISSING touch layer (that's
    // propagateDesktopLayersToTouch's job) — the fixture has only "default",
    // so the ("ctrl-caps") patch target simply has nothing to match, not
    // because comboToTouchLayerId returned null for the CAPS-bearing combo
    // (it doesn't — see the dedicated pipeline-order test below).
    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    expect(data.tablet.layer[0].row[0].key[0].text).toBe("a"); // untouched
  });
});

// ---------------------------------------------------------------------------
// Real pipeline order (studio's projectWorkingCopyVfs.ts step 2.5 then
// 3.5): propagateDesktopLayersToTouch synthesizes a CAPS combo's touch
// layer FIRST, then applyKeycapLabelsToVfs patches that layer's keycap —
// exercised here with only the two engine functions, in that order.
// ---------------------------------------------------------------------------

function makeEmptyIR(): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "test_kb",
      name: "Test KB",
      bcp47: [],
      copyright: "",
      version: "1.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

describe("applyKeycapLabelsToVfs — real pipeline order with propagateDesktopLayersToTouch (CAPS combo)", () => {
  it("patches the keycap onto the touch layer that propagateDesktopLayersToTouch just synthesized for a bare CAPS combo", () => {
    // A combo recognized by BOTH engine functions: patternId
    // "modifier_as_layer_switch" (propagateDesktopLayersToTouch's union step)
    // and strategyId "S-08" (applyKeycapLabelsToVfs's keycap-target collection).
    const assignment: MechanismAssignment = {
      scope: "individual",
      target: "A",
      modality: "physical",
      mechanisms: [
        {
          patternId: "modifier_as_layer_switch",
          strategyId: "S-08",
          slotValues: { altgrKeyList: "[CAPS K_A]" },
        },
      ],
    };

    const rawTouchJson = JSON.stringify({
      tablet: {
        layer: [
          {
            id: "default",
            row: [
              {
                id: 1,
                key: [
                  { id: "K_A", text: "a" },
                  { id: "K_LOPT", text: "*Menu*" }, // anchor key for the reachability switch
                ],
              },
            ],
          },
        ],
      },
    });

    // Step 2.5 — synthesize the "caps" touch layer (no CAPS rule in the IR
    // at all; the combo is sourced purely from the pending assignment).
    const { json: propagatedJson, warnings: propagateWarnings } = propagateDesktopLayersToTouch(
      rawTouchJson,
      makeEmptyIR(),
      [assignment],
    );
    expect(propagateWarnings).toHaveLength(0);
    const propagatedData = JSON.parse(propagatedJson);
    const capsLayer = propagatedData.tablet.layer.find((l: { id: string }) => l.id === "caps");
    expect(capsLayer).toBeDefined();
    expect(capsLayer.row[0].key[0].text).toBe(""); // blank — no output known to propagation yet

    // Step 3.5 — patch the keycap onto the layer step 2.5 just synthesized.
    const vfs = makeVfs([
      { path: "source/test.kvks", content: KVKS_BASE },
      { path: "source/test.keyman-touch-layout", content: propagatedJson },
    ]);

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [assignment]);
    expect(warnings).toHaveLength(0);

    const data = JSON.parse(vfs.get("source/test.keyman-touch-layout")?.content as string);
    const patchedCapsLayer = data.tablet.layer.find((l: { id: string }) => l.id === "caps");
    expect(patchedCapsLayer.row[0].key[0].text).toBe("A");
    expect(data.tablet.layer.find((l: { id: string }) => l.id === "default").row[0].key[0].text).toBe(
      "a",
    ); // default untouched
  });
});

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

describe("applyKeycapLabelsToVfs — change-gated write when nothing matched", () => {
  it("does not call vfs.set() for .kvks when the target layer does not exist", () => {
    // Use a kvks with ONLY an RA layer so the S-01 (kvksLayer === "") lookup
    // finds no layer and — unlike S-08 — there is no synthesis fallback for
    // "": patchKvks falls straight through the loop with `xml` unchanged.
    // patchKvks now gates its vfs.set on `xml !== originalXml` (matching the
    // sibling applyCarveKeycapRemovalsToVfs's `changed` guard), so no write
    // happens and the VFS entry is left untouched.
    const kvksOnlyRA = `<visualkeyboard><encoding name="unicode">
<layer shift="RA">
<key vkey="K_A">a-ra</key>
</layer>
</encoding></visualkeyboard>`;
    const vfs = makeVfs([{ path: "source/test.kvks", content: kvksOnlyRA }]);
    const setSpy = vi.spyOn(vfs, "set");

    const { warnings } = applyKeycapLabelsToVfs(vfs, "test", [makeS01Assignment("Z", "K_A")]);

    expect(warnings).toHaveLength(0);
    expect(setSpy).not.toHaveBeenCalledWith("source/test.kvks", kvksOnlyRA, false);
    expect(vfs.get("source/test.kvks")?.content).toBe(kvksOnlyRA); // untouched
  });

  it("does not call vfs.set() for the touch layout when no layer id matched a target", () => {
    // touchLayer for S-01 is always "default"; give the file only a
    // "rightalt" layer so nothing in patchMap ever matches. patchTouchLayout
    // now gates its vfs.set on a `changed` flag, so it leaves the entry as-is.
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
    expect(setSpy).not.toHaveBeenCalledWith(
      "source/test.keyman-touch-layout",
      touchRightaltOnly,
      false,
    );
    expect(vfs.get("source/test.keyman-touch-layout")?.content).toBe(touchRightaltOnly);
  });
});
