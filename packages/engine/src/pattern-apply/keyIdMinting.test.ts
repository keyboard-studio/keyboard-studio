/**
 * Unit tests for keyIdMinting (spec 058 T079; contract:
 * specs/058-touch-key-editor/contracts/key-id-policy.md).
 *
 * Grouped:
 *   1. proposeKeyId - every row of section 2's minting table.
 *   2. The grapheme-cluster-is-not-special assertion.
 *   3. The titlecase fail-safe reason.
 *   4. checkKeyIdSyntax - both validation regimes.
 *   5. Reserved-id rejection, including the exact-match private-use blocklist.
 *   6. validateCandidateKeyId - uniqueness, the layer-override exemption, and
 *      case-only collision.
 */

import { describe, it, expect } from "vitest";
import {
  proposeKeyId,
  checkKeyIdSyntax,
  checkReservedKeyId,
  validateCandidateKeyId,
  RESERVED_PRIVATE_USE_KEY_IDS,
  RESERVED_SENTINEL_KEY_IDS,
  RESERVED_KEY_ID_PREFIXES,
} from "./keyIdMinting.js";

describe("proposeKeyId", () => {
  it("single codepoint, no case triple requested -> U_<HEX> with no rule, and offers a T_ alternative", () => {
    const proposal = proposeKeyId({ chars: "a", capsHandled: false });
    expect(proposal.path).toBe("unicode-default");
    expect(proposal.id).toBe("U_0061");
    expect(proposal.ruleRequired).toBe(false);
    expect(proposal.guardRequired).toBe(false);
    expect(proposal.alternative?.id).toBe("T_0061");
    expect(proposal.alternative?.ruleLine).toBe("+ [T_0061] > U+0061");
    expect(proposal.alternative?.reason).toEqual({ kind: "always-available" });
  });

  it("the T_ alternative's reason becomes shared-candidate when sharedCandidateCount > 0", () => {
    const proposal = proposeKeyId({ chars: "a", capsHandled: false, sharedCandidateCount: 3 });
    expect(proposal.alternative?.reason).toEqual({ kind: "shared-candidate", count: 3 });
  });

  it("combining mark -> T_<UPPERHEX>, guard AND producing rule required, no U_ alternative", () => {
    // U+0300 COMBINING GRAVE ACCENT
    const proposal = proposeKeyId({ chars: "̀", capsHandled: false });
    expect(proposal.path).toBe("combining-mark-guard");
    expect(proposal.id).toBe("T_0300");
    expect(proposal.ruleRequired).toBe(true);
    expect(proposal.guardRequired).toBe(true);
    expect(proposal.ruleLines).toEqual(["+ [T_0300] > U+0300"]);
    expect(proposal.alternative).toBeUndefined();
  });

  it("multi-codepoint / string output (ASCII digraph) -> T_<MNEMONIC>, producing rule only", () => {
    const proposal = proposeKeyId({ chars: "FCFA", capsHandled: false });
    expect(proposal.path).toBe("multi-codepoint-string");
    expect(proposal.id).toBe("T_FCFA");
    expect(proposal.ruleRequired).toBe(true);
    expect(proposal.guardRequired).toBe(false);
    expect(proposal.ruleLines).toEqual(["+ [T_FCFA] > 'FCFA'"]);
  });

  it("case triplication requested -> T_<id> plus the NCAPS/SHIFT+NCAPS/CAPS trio, gated on capsHandled", () => {
    const proposal = proposeKeyId({
      chars: "a",
      capsHandled: true,
      caseTripleRequested: true,
    });
    expect(proposal.path).toBe("case-triple");
    expect(proposal.id).toBe("T_0061");
    expect(proposal.ruleRequired).toBe(true);
    expect(proposal.guardRequired).toBe(false);
    expect(proposal.caseTriple).toEqual({
      ncaps: "+ [NCAPS T_0061] > U+0061",
      shiftNcaps: "+ [NCAPS SHIFT T_0061] > U+0041",
      caps: "+ [CAPS T_0061] > U+0041",
    });
    expect(proposal.noCaseTripleReason).toBeUndefined();
  });

  it("case triplication requested but CAPS is not handled -> falls back to unicode-default with a reason", () => {
    const proposal = proposeKeyId({
      chars: "a",
      capsHandled: false,
      caseTripleRequested: true,
    });
    expect(proposal.path).toBe("unicode-default");
    expect(proposal.id).toBe("U_0061");
    expect(proposal.noCaseTripleReason).toBe("caps-not-handled");
  });

  it("T_new_* is never minted by any path", () => {
    const chars = ["a", "̀", "FCFA"];
    for (const c of chars) {
      const proposal = proposeKeyId({ chars: c, capsHandled: true, caseTripleRequested: true });
      expect(proposal.id.startsWith("T_new_")).toBe(false);
      expect(proposal.alternative?.id.startsWith("T_new_")).toBeFalsy();
    }
  });

  it("empty input falls back to U_FFFD with no rule", () => {
    const proposal = proposeKeyId({ chars: "", capsHandled: false });
    expect(proposal.path).toBe("unicode-default");
    expect(proposal.id).toBe("U_FFFD");
    expect(proposal.ruleRequired).toBe(false);
  });

  describe("grapheme-cluster-is-not-special assertion", () => {
    it("an ASCII digraph and a multi-codepoint grapheme cluster follow the IDENTICAL mechanism (no cluster-specific branch)", () => {
      // "FCFA" (a Latin digraph string) and "क्ष" (Devanagari
      // KSHA - a base+virama+consonant conjunct, one authored "letter") are
      // both plain multi-codepoint text. Both must land on the same path with
      // the same shape of proposal - the only difference is whether the text
      // is ASCII-mnemonic-shaped, which is a property of the text, not of
      // "is this a cluster".
      const digraph = proposeKeyId({ chars: "FCFA", capsHandled: false });
      const conjunct = proposeKeyId({ chars: "क्ष", capsHandled: false });

      expect(digraph.path).toBe("multi-codepoint-string");
      expect(conjunct.path).toBe("multi-codepoint-string");
      expect(digraph.ruleRequired).toBe(true);
      expect(conjunct.ruleRequired).toBe(true);
      expect(digraph.guardRequired).toBe(false);
      expect(conjunct.guardRequired).toBe(false);

      // The non-ASCII cluster falls to the hex-join id form (same helper as
      // the combining-mark path uses per codepoint), never a mnemonic guess.
      expect(conjunct.id).toBe("T_0915_094D_0937");
      expect(conjunct.ruleLines).toEqual(["+ [T_0915_094D_0937] > 'क्ष'"]);
    });

    it("case triplication requested against multi-codepoint text is not-single-letter, not silently ignored", () => {
      const proposal = proposeKeyId({
        chars: "FCFA",
        capsHandled: true,
        caseTripleRequested: true,
      });
      expect(proposal.path).toBe("multi-codepoint-string");
      expect(proposal.noCaseTripleReason).toBe("not-single-letter");
    });
  });

  describe("titlecase fail-safe", () => {
    it("a General_Category Lt character gets no case triple, with a machine-readable reason distinct from other no-counterpart cases", () => {
      // U+01C5 LATIN CAPITAL LETTER D WITH SMALL LETTER Z WITH CARON (titlecase Dz).
      const proposal = proposeKeyId({
        chars: "ǅ",
        capsHandled: true,
        caseTripleRequested: true,
      });
      expect(proposal.path).toBe("unicode-default");
      expect(proposal.noCaseTripleReason).toBe("titlecase-self-third-form");
    });

    it("a caseless-script character requesting a triple gets the generic no-case-counterpart reason, not titlecase", () => {
      // U+0627 ARABIC LETTER ALEF - caseless.
      const proposal = proposeKeyId({
        chars: "ا",
        capsHandled: true,
        caseTripleRequested: true,
      });
      expect(proposal.path).toBe("unicode-default");
      expect(proposal.noCaseTripleReason).toBe("no-case-counterpart");
    });
  });

  it("a combining mark ignores a case-triple request with its own distinct reason (marks are not cased)", () => {
    const proposal = proposeKeyId({
      chars: "̀",
      capsHandled: true,
      caseTripleRequested: true,
    });
    expect(proposal.path).toBe("combining-mark-guard");
    expect(proposal.noCaseTripleReason).toBe("combining-mark");
  });
});

describe("checkKeyIdSyntax - two validation regimes", () => {
  it("U_41 (unpadded) is accepted on import", () => {
    expect(checkKeyIdSyntax("U_41", { minting: false })).toEqual({ valid: true });
  });

  it("U_41 (unpadded) is rejected for minting", () => {
    expect(checkKeyIdSyntax("U_41", { minting: true })).toEqual({
      valid: false,
      reason: "unicode-unpadded",
    });
  });

  it("padded U_0041 is valid under both regimes", () => {
    expect(checkKeyIdSyntax("U_0041", { minting: false })).toEqual({ valid: true });
    expect(checkKeyIdSyntax("U_0041", { minting: true })).toEqual({ valid: true });
  });

  it("a U_ segment outside the semantic range is rejected under both regimes", () => {
    // 0x80 falls in the gap between the two allowed sub-ranges [0x20,0x7F] and [0xA0,0x10FFFF].
    expect(checkKeyIdSyntax("U_0080", { minting: false })).toEqual({
      valid: false,
      reason: "unicode-out-of-range",
    });
    expect(checkKeyIdSyntax("U_0080", { minting: true })).toEqual({
      valid: false,
      reason: "unicode-out-of-range",
    });
  });

  it("a K_ or T_ id needs no additional minting-only shape beyond the base regex", () => {
    expect(checkKeyIdSyntax("K_A", { minting: true })).toEqual({ valid: true });
    expect(checkKeyIdSyntax("T_ANYTHING", { minting: true })).toEqual({ valid: true });
  });

  it("a malformed id is rejected under both regimes", () => {
    expect(checkKeyIdSyntax("not an id", { minting: false })).toEqual({
      valid: false,
      reason: "malformed",
    });
    expect(checkKeyIdSyntax("not an id", { minting: true })).toEqual({
      valid: false,
      reason: "malformed",
    });
  });
});

describe("checkReservedKeyId", () => {
  it.each(RESERVED_KEY_ID_PREFIXES)("rejects the reserved prefix %s", (prefix) => {
    expect(checkReservedKeyId(`${prefix}0`)).toBe("reserved-prefix");
  });

  it.each(RESERVED_SENTINEL_KEY_IDS)("rejects the sentinel %s when not intended as one", (id) => {
    expect(checkReservedKeyId(id)).toBe("reserved-sentinel");
  });

  it.each(RESERVED_SENTINEL_KEY_IDS)("allows the sentinel %s when intended as one", (id) => {
    expect(checkReservedKeyId(id, { intendedAsSentinel: true })).toBeUndefined();
  });

  it.each(RESERVED_PRIVATE_USE_KEY_IDS)(
    "rejects the exact-match private-use id %s (never a regex/prefix exclusion)",
    (id) => {
      expect(checkReservedKeyId(id)).toBe("reserved-private-use");
    },
  );

  it("the literal * in a private-use id is otherwise valid syntax under both regexes, so a near-miss is NOT rejected as private-use", () => {
    // Only an EXACT match against the blocklist is private-use; a similarly
    // shaped id that isn't one of the three exact strings must pass through.
    expect(checkReservedKeyId("T_*_MT_SHIFT_TO_SOMETHING_ELSE")).toBeUndefined();
    expect(checkKeyIdSyntax("T_*_MT_SHIFT_TO_SOMETHING_ELSE", { minting: true })).toEqual({
      valid: true,
    });
  });

  it("an ordinary id is not reserved", () => {
    expect(checkReservedKeyId("T_0300")).toBeUndefined();
    expect(checkReservedKeyId("U_0061")).toBeUndefined();
  });
});

describe("validateCandidateKeyId", () => {
  it("rejects a duplicate id in the same layer scope", () => {
    const result = validateCandidateKeyId("T_0300", {
      minting: true,
      existingIdsInScope: [{ id: "T_0300" }],
    });
    expect(result).toEqual({
      valid: false,
      reason: "duplicate-in-layer",
      conflictingId: "T_0300",
    });
  });

  it("exempts the duplicate when the candidate carries a distinct per-key layer override", () => {
    const result = validateCandidateKeyId("T_0300", {
      minting: true,
      existingIdsInScope: [{ id: "T_0300", layer: "shift" }],
      layerOverride: "caps",
    });
    expect(result).toEqual({ valid: true });
  });

  it("still rejects when the candidate's layer override matches the conflicting key's own override", () => {
    const result = validateCandidateKeyId("T_0300", {
      minting: true,
      existingIdsInScope: [{ id: "T_0300", layer: "shift" }],
      layerOverride: "shift",
    });
    expect(result).toEqual({
      valid: false,
      reason: "duplicate-in-layer",
      conflictingId: "T_0300",
    });
  });

  it("rejects a case-only collision against an existing id", () => {
    const result = validateCandidateKeyId("T_mark", {
      minting: true,
      existingIdsInScope: [{ id: "T_MARK" }],
    });
    expect(result).toEqual({
      valid: false,
      reason: "case-only-collision",
      conflictingId: "T_MARK",
    });
  });

  it("rejects a reserved prefix before ever consulting uniqueness", () => {
    const result = validateCandidateKeyId("T_new_3", {
      minting: true,
      existingIdsInScope: [],
    });
    expect(result).toEqual({ valid: false, reason: "reserved-prefix" });
  });

  it("accepts a well-formed, unreserved, unique candidate", () => {
    const result = validateCandidateKeyId("T_0300", {
      minting: true,
      existingIdsInScope: [{ id: "T_0301" }],
    });
    expect(result).toEqual({ valid: true });
  });
});
