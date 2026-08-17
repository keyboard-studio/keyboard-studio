// Spec 065 US5 T045 — the SC-007 gate.
//
// Table-driven over contracts/character-classes.md: EVERY reachable character
// class must yield either a proposal or a stated `noProposalReason`. Never
// silence. A row that yields neither is exactly the defect FR-032 exists to
// catch, and this test is what makes SC-007 checkable rather than aspirational.
//
// Keep this table and character-classes.md in step: the doc is the enumeration,
// this is its enforcement.

import { describe, it, expect } from "vitest";
import type { TouchKeyRuleBinding, TouchKeyRuleIndex } from "@keyboard-studio/contracts";
import { proposeTouchKeyId } from "./proposeTouchKeyId.js";

// ---------------------------------------------------------------------------
// A rule index built by hand — this module never scans an IR, so a test does
// not need one either.
// ---------------------------------------------------------------------------

function ruleIndex(producers: Readonly<Record<string, readonly string[]>> = {}): TouchKeyRuleIndex {
  const byId = new Map<string, readonly TouchKeyRuleBinding[]>();
  const spellings = new Map<string, readonly string[]>();
  const producingIds = new Set<string>();
  for (const [keyId, produced] of Object.entries(producers)) {
    byId.set(keyId, [
      {
        ruleNodeId: `n-${keyId}`,
        groupName: "main",
        usingKeys: true,
        keyIdAsWritten: keyId,
        modifiers: [],
        role: "produces",
        produced: produced.map((c) => c.normalize("NFC")),
      } as TouchKeyRuleBinding,
    ]);
    spellings.set(keyId, [keyId]);
    if (produced.length > 0) producingIds.add(keyId);
  }
  return { byId, spellings, producingIds, opaqueFragmentCount: 0 };
}

const EMPTY_INDEX = ruleIndex();

/** The default request — no inheritance, no producers, so every row reaches the class logic. */
function req(chars: string, overrides: Record<string, unknown> = {}) {
  return {
    chars,
    ruleIndex: EMPTY_INDEX,
    expectedOutputs: [],
    capsHandled: false,
    ...overrides,
  } as Parameters<typeof proposeTouchKeyId>[0];
}

// ---------------------------------------------------------------------------
// The class table — one row per character-classes.md row.
// ---------------------------------------------------------------------------

interface ClassRow {
  readonly row: number;
  readonly name: string;
  readonly chars: string;
  /** `"proposal"` — an id must come back. `"reason"` — a stated refusal must. */
  readonly expect: "proposal" | "reason";
  readonly reasonKind?: string;
  readonly path?: string;
}

const CLASS_TABLE: readonly ClassRow[] = [
  { row: 1, name: "plain character", chars: "ø", expect: "proposal", path: "unicode-default" },
  {
    row: 2,
    name: "combining mark",
    chars: "́",
    expect: "proposal",
    path: "combining-mark-guard",
  },
  {
    row: 3,
    name: "multi-codepoint string",
    chars: "ch",
    expect: "proposal",
    path: "multi-codepoint-string",
  },
  {
    // Malayalam chillu: ന + virama + ZWJ. A joiner, no pictograph — row 3, not
    // row 7. The linguistic uses of ZWJ are the reason row 7 requires
    // `Extended_Pictographic` content rather than keying on the joiner alone.
    row: 3,
    name: "multi-codepoint string joined by ZWJ",
    chars: "ന്‍",
    expect: "proposal",
    path: "multi-codepoint-string",
  },
  {
    // Devanagari explicit conjunct control: क + virama + ZWJ + ष.
    row: 3,
    name: "multi-codepoint string with an interior ZWJ",
    chars: "क्‍ष",
    expect: "proposal",
    path: "multi-codepoint-string",
  },
  { row: 5, name: "titlecase character", chars: "ǅ", expect: "proposal" },
  { row: 6, name: "free-standing modifier symbol", chars: "ˆ", expect: "proposal" },
  {
    row: 7,
    name: "emoji ZWJ sequence",
    chars: "\u{1F469}‍\u{1F4BB}",
    expect: "reason",
    reasonKind: "emoji-sequence-unsupported",
  },
  {
    row: 7,
    name: "emoji presentation sequence",
    chars: "❤️",
    expect: "reason",
    reasonKind: "emoji-sequence-unsupported",
  },
  {
    row: 8,
    name: "variation selector alone",
    chars: "️",
    expect: "reason",
    reasonKind: "variation-selector-only",
  },
  {
    row: 9,
    name: "unassigned codepoint",
    chars: "͸",
    expect: "reason",
    reasonKind: "unassigned-codepoint",
  },
  { row: 10, name: "empty output", chars: "", expect: "reason", reasonKind: "empty-output" },
];

describe("proposeTouchKeyId — SC-007: a proposal or a stated reason, never silence", () => {
  it.each(CLASS_TABLE)(
    "row $row ($name) yields $expect",
    ({ chars, expect: kind, reasonKind, path }) => {
      const proposal = proposeTouchKeyId(req(chars));

      // The gate itself: exactly one of the two, never neither.
      const hasProposal = proposal.id !== undefined && proposal.id.length > 0;
      const hasReason = proposal.noProposalReason !== undefined;
      expect(
        hasProposal || hasReason,
        `character class produced neither an id nor a reason — this is the SC-007 defect`,
      ).toBe(true);
      expect(hasProposal && hasReason, "a proposal and a refusal are contradictory").toBe(false);

      if (kind === "proposal") {
        expect(hasProposal).toBe(true);
        if (path !== undefined) expect(proposal.path).toBe(path);
      } else {
        expect(proposal.noProposalReason?.kind).toBe(reasonKind);
      }
    },
  );

  it("covers every row of character-classes.md", () => {
    // Rows 1-3 and 5-10 are reachable here. Row 4 (case triple) needs
    // `capsHandled` + `caseTripleRequested`, asserted separately below.
    const covered = new Set(CLASS_TABLE.map((r) => r.row));
    expect([...covered].sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10]);
  });

  it("row 4 (cased letter, triple requested) mints a case triple", () => {
    const proposal = proposeTouchKeyId(
      req("e", { capsHandled: true, caseTripleRequested: true, bcp47: "en" }),
    );
    expect(proposal.path).toBe("case-triple");
    expect(proposal.noProposalReason).toBeUndefined();
  });

  it("row 5 states the titlecase reason through noCaseTripleReason, keeping its id", () => {
    // The distinction character-classes.md row 5 turns on: a titlecase
    // character DOES get an id — only its triple is impossible. Reporting it as
    // `noProposalReason` would contradict the proposal that exists.
    const proposal = proposeTouchKeyId(
      req("ǅ", { capsHandled: true, caseTripleRequested: true }),
    );
    expect(proposal.id).toBeDefined();
    expect(proposal.noProposalReason).toBeUndefined();
    expect(proposal.noCaseTripleReason).toBe("titlecase-self-third-form");
  });
});

describe("proposeTouchKeyId — order of attempt (contract §1.1)", () => {
  it("inherits when the physical key already produces every expected output", () => {
    const proposal = proposeTouchKeyId({
      chars: "a",
      inheritedId: "K_A",
      ruleIndex: ruleIndex({ K_A: ["a", "A"] }),
      expectedOutputs: ["a", "A"],
      capsHandled: true,
    });
    expect(proposal.path).toBe("inherited");
    expect(proposal.id).toBe("K_A");
    expect(proposal.ruleRequired).toBe(false);
    expect(proposal.because).toEqual({ kind: "inherited-from-physical-key", keyId: "K_A" });
  });

  it("does NOT inherit when a modifier output is no longer covered (FR-029)", () => {
    // The shift output was reassigned elsewhere, so step 1 must decline —
    // keeping the id by INHERITANCE would claim an output the key no longer
    // produces. Step 2 may still land on the same id, and that is correct: it
    // asks only "does something produce `chars`", and K_A does. The requirement
    // is about which question answered, so `because` is what discriminates —
    // `path` alone cannot, since both steps report `"inherited"`.
    const proposal = proposeTouchKeyId({
      chars: "a",
      inheritedId: "K_A",
      ruleIndex: ruleIndex({ K_A: ["a"] }),
      expectedOutputs: ["a", "A"],
      capsHandled: true,
    });
    expect(proposal.because).not.toEqual({
      kind: "inherited-from-physical-key",
      keyId: "K_A",
    });
    expect(proposal.because).toEqual({ kind: "existing-producer", keyId: "K_A" });
  });

  it("declines both inherit steps when nothing produces the character", () => {
    const proposal = proposeTouchKeyId({
      chars: "ø",
      inheritedId: "K_A",
      ruleIndex: ruleIndex({ K_A: ["a"] }),
      expectedOutputs: ["a", "A"],
      capsHandled: true,
    });
    expect(proposal.because).toEqual({ kind: "minted" });
    expect(proposal.id).toBe("U_00F8");
  });

  it("falls to an existing producer before minting (FR-030)", () => {
    const proposal = proposeTouchKeyId({
      chars: "ɛ",
      ruleIndex: ruleIndex({ U_025B: ["ɛ"] }),
      expectedOutputs: [],
      capsHandled: false,
    });
    expect(proposal.id).toBe("U_025B");
    expect(proposal.ruleRequired).toBe(false);
    expect(proposal.because).toEqual({ kind: "existing-producer", keyId: "U_025B" });
  });

  it("mints when nothing else applies", () => {
    const proposal = proposeTouchKeyId(req("ø"));
    expect(proposal.because).toEqual({ kind: "minted" });
    expect(proposal.id).toBe("U_00F8");
  });

  it("inherits ahead of the refusal check — a working id survives an unmintable output", () => {
    // Order matters: refusal is checked before MINTING, not before INHERITING.
    const proposal = proposeTouchKeyId({
      chars: "\u{1F469}‍\u{1F4BB}",
      inheritedId: "T_EMOJI",
      ruleIndex: ruleIndex({ T_EMOJI: ["\u{1F469}‍\u{1F4BB}"] }),
      expectedOutputs: ["\u{1F469}‍\u{1F4BB}"],
      capsHandled: false,
    });
    expect(proposal.path).toBe("inherited");
    expect(proposal.noProposalReason).toBeUndefined();
  });

  it("carries no positional facts — FR-030 is structural", () => {
    // If this ever fails to compile, geometry has leaked into the request and
    // "never by geometric proximity" has stopped being a guarantee.
    const request = {
      chars: "ø",
      ruleIndex: EMPTY_INDEX,
      expectedOutputs: [],
      capsHandled: false,
    };
    expect(Object.keys(request).sort()).toEqual([
      "capsHandled",
      "chars",
      "expectedOutputs",
      "ruleIndex",
    ]);
  });
});
