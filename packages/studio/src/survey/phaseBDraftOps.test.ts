// Unit tests for the Phase B inventory draft — the shared draft-alphabet
// accumulator for the build-list (BuildListView center pane + CharacterMapPane
// right pane, spec character-map pane work). Since spec 090 the accumulator
// is the character-inventory / invisibles-inventory decision values plus the
// pure ops in ./phaseBDraftOps.ts, bound by ./useInventoryDraft.ts; the old
// draft store was deleted at T025 and these suites were re-pointed at
// the same contracts (the `draft()` adapter below is the old getState()
// shape: value fields plus the ops bound to the characters step).
//
// Scope: the draft's own add/remove/toggle/setAll/reset mechanics in
// isolation, including the NFC-vs-NFD dedup guarantee `add` inherits from
// `nfcDedup` (./charNormUtils.ts). Persistence round-trip of the snapshot
// helpers is covered separately in ../lib/draftPersistence.test.ts —
// do not re-cover it here.
//
// All decomposed/precomposed literals below use explicit \u escapes (not
// typed glyphs) — a glyph typed through an editor/tool pipeline can get
// silently NFC-normalized before it ever reaches the test file, which would
// quietly turn an "NFD vs NFC" test into a same-string no-op. \u escapes are
// unambiguous at the byte level regardless of tool/editor normalization.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import type { SourcedInventory } from "@keyboard-studio/engine";
import {
  getCharacterInventoryValue,
  getInvisiblesInventoryValue,
  inventoryOps,
  peekLastPick,
  resetInventoryDecisions,
  restoreInventoryFromSnapshot,
} from "./useInventoryDraft.ts";
import {
  draftConfirmedAlphabet,
  invisibleDecisionsOf,
  snapshotFromValues,
} from "./phaseBDraftOps.ts";
import { DEFAULT_PHASE_B_FONT } from "./surveyStyles.ts";

// The old store's getState() shape over the decision values.
function draft() {
  return {
    ...getCharacterInventoryValue(),
    lastPick: peekLastPick(),
    invisibleDecisions: invisibleDecisionsOf(getInvisiblesInventoryValue()),
    ...inventoryOps("characters"),
  };
}

// e-acute: precomposed (NFC, 1 codepoint) vs decomposed (NFD, "e" + combining
// acute U+0301, 2 codepoints). Same grapheme, different encodings.
const PRECOMPOSED_E_ACUTE = "é";
const DECOMPOSED_E_ACUTE = "é";

describe("phase B inventory draft — add", () => {
  it("adds a single character to an empty store", () => {
    draft().add("a");
    expect(draft().chars).toEqual(["a"]);
  });

  it("NFC-normalizes an incoming decomposed character before storing it", () => {
    draft().add(DECOMPOSED_E_ACUTE);
    expect(draft().chars).toEqual([PRECOMPOSED_E_ACUTE]);
  });

  it("dedupes an NFD-form add against an already-stored NFC form of the same grapheme", () => {
    draft().add(PRECOMPOSED_E_ACUTE);
    draft().add(DECOMPOSED_E_ACUTE);
    // Only one entry — the decomposed form must not appear as a second, distinct char.
    expect(draft().chars).toEqual([PRECOMPOSED_E_ACUTE]);
  });

  it("dedupes an NFC-form add against an already-stored NFD-originated form (order reversed)", () => {
    draft().add(DECOMPOSED_E_ACUTE);
    draft().add(PRECOMPOSED_E_ACUTE);
    expect(draft().chars).toEqual([PRECOMPOSED_E_ACUTE]);
  });

  it("dedupes a plain repeat add of the identical character", () => {
    draft().add("a");
    draft().add("a");
    expect(draft().chars).toEqual(["a"]);
  });

  it("preserves first-appearance order across multiple distinct adds", () => {
    draft().add("c");
    draft().add("a");
    draft().add("b");
    expect(draft().chars).toEqual(["c", "a", "b"]);
  });
});

describe("phase B inventory draft — remove", () => {
  it("removes a character present in the store", () => {
    draft().setAll(["a", "b", "c"]);
    draft().remove("b");
    expect(draft().chars).toEqual(["a", "c"]);
  });

  it("NFC-normalizes before comparing, so an NFD-form remove still hits an NFC-stored char", () => {
    draft().setAll([PRECOMPOSED_E_ACUTE]);
    draft().remove(DECOMPOSED_E_ACUTE);
    expect(draft().chars).toEqual([]);
  });

  it("removing a character that isn't present is a no-op", () => {
    draft().setAll(["a", "b"]);
    draft().remove("z");
    expect(draft().chars).toEqual(["a", "b"]);
  });
});

describe("phase B inventory draft — toggle", () => {
  it("adds an absent character", () => {
    draft().toggle("a");
    expect(draft().chars).toEqual(["a"]);
  });

  it("removes a present character (add then toggle removes it)", () => {
    draft().add("a");
    draft().toggle("a");
    expect(draft().chars).toEqual([]);
  });

  it("round-trips: toggle twice returns to the original state", () => {
    draft().setAll(["x", "y"]);
    draft().toggle("x");
    expect(draft().chars).toEqual(["y"]);
    draft().toggle("x");
    expect(draft().chars).toEqual(["y", "x"]);
  });

  it("toggle on an NFD form removes an NFC-stored equivalent grapheme (not a distinct add)", () => {
    draft().setAll([PRECOMPOSED_E_ACUTE]);
    draft().toggle(DECOMPOSED_E_ACUTE);
    expect(draft().chars).toEqual([]);
  });
});

describe("phase B inventory draft — setAll", () => {
  it("replaces the whole list wholesale", () => {
    draft().setAll(["a", "b"]);
    draft().setAll(["x", "y", "z"]);
    expect(draft().chars).toEqual(["x", "y", "z"]);
  });

  it("replaces a non-empty list with an empty one", () => {
    draft().setAll(["a", "b"]);
    draft().setAll([]);
    expect(draft().chars).toEqual([]);
  });

  // NOTE ON THE ACTUAL CONTRACT: setAll's implementation is a raw
  // `set({ chars: next })` — it does NOT run nfcDedup and does NOT
  // NFC-normalize its input. Dedup/normalization is the CALLER's
  // responsibility: PhaseB.tsx's SuggestionPanel/CharChipEditor both
  // pre-dedupe via nfcDedup(...) before calling onChange (== setAll), and
  // applyPhaseBDraftSnapshot restores an already-normalized persisted
  // snapshot. The two tests below pin that real contract down so a future
  // caller that skips pre-dedup fails loudly here rather than silently
  // assuming setAll will clean up after it.
  it("does NOT dedupe duplicate entries in the input (caller's responsibility, not setAll's)", () => {
    draft().setAll(["a", "a", "b"]);
    expect(draft().chars).toEqual(["a", "a", "b"]);
  });

  it("does NOT NFC-normalize its input (caller's responsibility, not setAll's)", () => {
    draft().setAll([DECOMPOSED_E_ACUTE]);
    const stored = draft().chars;
    expect(stored).toEqual([DECOMPOSED_E_ACUTE]);
    expect(stored[0]).not.toBe(PRECOMPOSED_E_ACUTE);
  });
});

describe("phase B inventory draft — reset", () => {
  it("clears back to an empty alphabet", () => {
    draft().setAll(["a", "b", "c"]);
    draft().reset();
    expect(draft().chars).toEqual([]);
  });

  it("reset is idempotent on an already-empty store", () => {
    draft().reset();
    draft().reset();
    expect(draft().chars).toEqual([]);
  });

  it("does not touch selectedFont — font selection is left untouched, per the store's own reset() doc comment", () => {
    draft().setSelectedFont("charis-sil");
    draft().reset();
    expect(draft().selectedFont).toBe("charis-sil");
    // Restore the default so this test doesn't leak state to later tests
    // (this file's top-level afterEach only resets chars, not the font).
    draft().setSelectedFont(DEFAULT_PHASE_B_FONT);
  });
});

describe("phase B inventory draft — selectedFont", () => {
  afterEach(() => {
    draft().setSelectedFont(DEFAULT_PHASE_B_FONT);
  });

  it("defaults to DEFAULT_PHASE_B_FONT (noto-sans) on a fresh store", () => {
    expect(draft().selectedFont).toBe(DEFAULT_PHASE_B_FONT);
    expect(draft().selectedFont).toBe("noto-sans");
  });

  it("setSelectedFont updates the selection", () => {
    draft().setSelectedFont("charis-sil");
    expect(draft().selectedFont).toBe("charis-sil");
  });

  it("setSelectedFont does not disturb the accumulated chars list", () => {
    draft().setAll(["a", "b"]);
    draft().setSelectedFont("charis-sil");
    expect(draft().chars).toEqual(["a", "b"]);
  });
});

describe("phase B inventory draft — snapshot/restore round-trip", () => {
  afterEach(() => {
    draft().setSelectedFont(DEFAULT_PHASE_B_FONT);
  });

  it("round-trips both chars and selectedFont together", () => {
    draft().setAll(["a", "b", "ɛ"]);
    draft().setSelectedFont("charis-sil");

    const snapshot = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
    expect(snapshot).toEqual({
      chars: ["a", "b", "ɛ"],
      declaredRoles: {},
      // Spec 044 additions: setAll attributes everything it does not already
      // know to the author, and the sticky proposal decisions start clear.
      provenance: { a: "author", b: "author", "ɛ": "author" },
      // No proposal was seeded, so no source attested any `{..}` cluster.
      exemplarDigraphs: [],
      loanwordChars: [],
      rejected: [],
      proposalConfidence: {},
      exemplarMethodDeclined: false,
      // Spec 075 additions: no proposal seeded, no invisible asked.
      seededProposals: [],
      invisibleDecisions: {},
      selectedFont: "charis-sil",
    });

    draft().reset();
    draft().setSelectedFont(DEFAULT_PHASE_B_FONT);

    restoreInventoryFromSnapshot(snapshot);
    expect(draft().chars).toEqual(["a", "b", "ɛ"]);
    expect(draft().selectedFont).toBe("charis-sil");
  });
});

// ---------------------------------------------------------------------------
// Three-store split (spec 071): bases / marks / attestedStacks / declaredRoles
// derive from the picks; removing a pick never leaves an orphaned mark.
// ---------------------------------------------------------------------------

describe("phase B inventory draft — three-store split (spec 071)", () => {
  const ACUTE = "́";

  it("a precomposed pick contributes base, mark, and attested stack; chars keeps the whole grapheme", () => {
    draft().add("é");
    const s = draft();
    expect(s.chars).toEqual(["é"]);
    expect(s.bases).toEqual(["e"]);
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toEqual([{ base: "e", marks: [ACUTE] }]);
  });

  it("reports the pick's contribution for the just-added highlight", () => {
    draft().add("e");
    draft().add("é");
    const { lastPick } = draft();
    expect(lastPick?.grapheme).toBe("é");
    expect(lastPick?.addedBases).toEqual([]); // "e" was already present
    expect(lastPick?.addedMarks).toEqual([ACUTE]);
    expect(lastPick?.addedStack).toEqual({ base: "e", marks: [ACUTE] });
  });

  it("does not duplicate an already-present base or mark (edge case)", () => {
    draft().add("é");
    draft().add("á");
    const s = draft();
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toHaveLength(2);
  });

  it("a plain letter lands only in bases; a lone combining mark only in marks", () => {
    draft().add("k");
    draft().add(ACUTE);
    const s = draft();
    expect(s.bases).toEqual(["k"]);
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toEqual([]);
  });

  it("removing the only accented pick removes its stack AND its now-orphaned mark", () => {
    draft().add("é");
    draft().remove("é");
    const s = draft();
    expect(s.chars).toEqual([]);
    expect(s.marks).toEqual([]);
    expect(s.attestedStacks).toEqual([]);
  });

  it("a PUA pick with a declared role lands in the right store and records the role", () => {
    const pua = String.fromCodePoint(0xe000);
    draft().add(pua, { role: "mark" });
    const s = draft();
    expect(s.marks).toEqual([pua]);
    expect(s.bases).toEqual([]);
    expect(s.declaredRoles[pua]).toBe("mark");
  });

  it("an unclassified PUA pick behaves as a letter until asked", () => {
    const pua = String.fromCodePoint(0xe001);
    draft().add(pua);
    const s = draft();
    expect(s.bases).toEqual([pua]);
    expect(s.declaredRoles[pua]).toBe("letter");
  });

  it("setAll rebuilds the stores from a normalized pick list while chars stays verbatim", () => {
    draft().setAll(["é", "é", "k"]);
    const s = draft();
    expect(s.chars).toEqual(["é", "é", "k"]); // pinned verbatim contract
    expect(s.bases).toEqual(["e", "k"]);
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toEqual([{ base: "e", marks: [ACUTE] }]);
  });

  it("draftConfirmedAlphabet(getCharacterInventoryValue()) resolves the current draft to a ConfirmedAlphabet", () => {
    draft().add("é");
    expect(draftConfirmedAlphabet(getCharacterInventoryValue())).toEqual({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
      declaredRoles: {},
    });
  });

  it("snapshot round-trip preserves declared roles", () => {
    const pua = String.fromCodePoint(0xe000);
    draft().add(pua, { role: "mark" });
    const snap = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
    draft().reset();
    restoreInventoryFromSnapshot(snap);
    const s = draft();
    expect(s.marks).toEqual([pua]);
    expect(s.declaredRoles[pua]).toBe("mark");
  });
});

// ---------------------------------------------------------------------------
// Category split (spec 047): deriveStores routes non-letters to derived
// numbers/punctuation/symbols/separators/controls arrays; letters stay in
// `bases`; `chars`/confirmed inventory stays COMPLETE (FR-004/005/013).
// ---------------------------------------------------------------------------

describe("phase B inventory draft — category split (spec 047)", () => {
  const NBSP = " ";
  const ZWSP = "​";

  it("routes a letter, digit, punctuation, symbol, NBSP, and a surviving control each to exactly one array (FR-005/SC-002)", () => {
    draft().setAll(["a", "1", ".", "€", NBSP, ZWSP]);
    const s = draft();
    expect(s.bases).toEqual(["a"]);
    expect(s.numbers).toEqual(["1"]);
    expect(s.punctuation).toEqual(["."]);
    expect(s.symbols).toEqual(["€"]);
    expect(s.separators).toEqual([NBSP]);
    expect(s.controls).toEqual([ZWSP]); // ZWSP is \p{Cf} — control/other
  });

  it("no character is double-counted across the category arrays", () => {
    draft().setAll(["a", "1", ".", "€", NBSP, ZWSP]);
    const s = draft();
    const all = [
      ...s.bases,
      ...s.numbers,
      ...s.punctuation,
      ...s.symbols,
      ...s.separators,
      ...s.controls,
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it("marks and PUA-declared-letter keep their existing paths (edge cases)", () => {
    const ACUTE = "́";
    const pua = String.fromCodePoint(0xe000);
    draft().add(ACUTE); // lone mark
    draft().add(pua); // unclassified PUA → letter
    const s = draft();
    expect(s.marks).toEqual([ACUTE]);
    expect(s.bases).toEqual([pua]);
    // A mark or PUA never leaks into a GC category array.
    expect(s.numbers).toEqual([]);
    expect(s.controls).toEqual([]);
    expect(s.punctuation).toEqual([]);
  });

  it("chars/confirmedInventory stays COMPLETE across all categories (FR-013 / T016 regression guard)", () => {
    // The complete inventory lives in `chars`, NOT in `bases` — a downstream
    // consumer of the recorded alphabet must still see the non-letters even
    // though `bases` is now restricted to letters.
    draft().setAll(["a", "1", "."]);
    const s = draft();
    expect(s.chars).toEqual(["a", "1", "."]); // complete, verbatim
    expect(s.bases).toEqual(["a"]); // letters only — no digit/punctuation
    expect(s.bases).not.toContain("1");
    expect(s.bases).not.toContain(".");
  });

  it("removing a pick recomputes every derived array with no orphans", () => {
    draft().setAll(["a", "1", ".", "€"]);
    draft().remove("1");
    const s = draft();
    expect(s.chars).toEqual(["a", ".", "€"]);
    expect(s.numbers).toEqual([]); // the only number was removed
    expect(s.punctuation).toEqual(["."]);
    expect(s.symbols).toEqual(["€"]);
  });

  it("reset clears the derived category arrays", () => {
    draft().setAll(["1", ".", "€"]);
    draft().reset();
    const s = draft();
    expect(s.numbers).toEqual([]);
    expect(s.punctuation).toEqual([]);
    expect(s.symbols).toEqual([]);
    expect(s.separators).toEqual([]);
    expect(s.controls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Spec 044 — propose-then-confirm: provenance, rejection stickiness, and the
// invariant that seeding a proposal must not disturb anything 047 relies on.
// ---------------------------------------------------------------------------

/** Minimal SourcedInventory fixture — only what seedFromProposal reads. */
function inventory(
  chars: string[],
  source: "cldr" | "sldr" = "cldr",
  digraphs: string[] = [],
): SourcedInventory {
  const confidence = source === "cldr" ? "approved" : "generated";
  return {
    resolvedTag: "test",
    source,
    confidence,
    characters: chars.map((char) => ({ char, tier: "main" as const, source, confidence })),
    digraphs,
  };
}

describe("phase B inventory draft — seedFromProposal (spec 044 FR-016)", () => {
  afterEach(() => {
    resetInventoryDecisions();
  });

  it("seeds the main tier and tags every character with its source", () => {
    draft().seedFromProposal(inventory(["ŋ", "ɔ"], "sldr"));
    const s = draft();
    expect(s.chars).toContain("ŋ");
    expect(s.provenance["ŋ"]).toBe("sldr");
    expect(s.provenance["ɔ"]).toBe("sldr");
  });

  it("derives the uppercase counterpart alongside each lowercase letter", () => {
    // 047's case derivation: an alphabet without its uppercase half is not one
    // the author can accept and move on from.
    draft().seedFromProposal(inventory(["a", "ŋ"]));
    const s = draft();
    expect(s.chars).toContain("A");
    expect(s.chars).toContain("Ŋ");
    expect(s.provenance["A"]).toBe("cldr");
  });

  it("records the source's digraph clusters WITHOUT putting them in the alphabet", () => {
    // Ewondo's shape: the parse contributes d/z/k/p as typable letters and the
    // clusters separately. "dz" must never become a character to place on a key.
    draft().seedFromProposal(inventory(["d", "z", "k", "p"], "cldr", ["dz", "kp"]));
    const s = draft();
    expect(s.exemplarDigraphs).toEqual(["dz", "kp"]);
    expect(s.chars).not.toContain("dz");
    expect(s.chars).not.toContain("kp");
    expect(s.bases).not.toContain("dz");
    expect(s.chars).toContain("d");
    expect(s.chars).toContain("z");
  });

  it("unions digraphs across seeds rather than replacing them", () => {
    draft().seedFromProposal(inventory(["a"], "cldr", ["dz"]));
    draft().seedFromProposal(inventory(["b"], "sldr", ["dz", "ng"]));
    expect(draft().exemplarDigraphs).toEqual(["dz", "ng"]);
  });

  it("clears digraphs on reset, like the rest of the proposal payload", () => {
    draft().seedFromProposal(inventory(["a"], "cldr", ["dz"]));
    draft().reset();
    expect(draft().exemplarDigraphs).toEqual([]);
  });

  it("is idempotent", () => {
    const inv = inventory(["a", "b"]);
    draft().seedFromProposal(inv);
    const first = { ...draft() };
    draft().seedFromProposal(inv);
    const second = draft();
    expect(second.chars).toEqual(first.chars);
    expect(second.provenance).toEqual(first.provenance);
    expect(second.bases).toEqual(first.bases);
  });

  it("does not clobber an author-entered character that is also proposed", () => {
    draft().add("ŋ");
    expect(draft().provenance["ŋ"]).toBe("author");
    draft().seedFromProposal(inventory(["ŋ", "ɔ"]));
    // The stronger claim wins and survives the seed.
    expect(draft().provenance["ŋ"]).toBe("author");
    expect(draft().provenance["ɔ"]).toBe("cldr");
  });

  it("an author-entered character survives a RE-seed", () => {
    draft().seedFromProposal(inventory(["ŋ"]));
    draft().add("ŋ"); // author confirms it as their own
    draft().seedFromProposal(inventory(["ŋ"]));
    expect(draft().provenance["ŋ"]).toBe("author");
    expect(draft().chars.filter((c) => c === "ŋ")).toHaveLength(1);
  });
});

describe("phase B inventory draft — rejection is sticky (spec 044 FR-017)", () => {
  afterEach(() => {
    resetInventoryDecisions();
  });

  it("removing a PROPOSED character records it as rejected", () => {
    draft().seedFromProposal(inventory(["ŋ", "ɔ"]));
    draft().remove("ŋ");
    expect(draft().rejected).toContain("ŋ");
    expect(draft().chars).not.toContain("ŋ");
  });

  it("a rejected character is never re-proposed", () => {
    draft().seedFromProposal(inventory(["ŋ", "ɔ"]));
    draft().remove("ŋ");
    draft().seedFromProposal(inventory(["ŋ", "ɔ"]));
    expect(draft().chars).not.toContain("ŋ");
    expect(draft().provenance["ŋ"]).toBeUndefined();
  });

  it("the author can still add a rejected character back deliberately", () => {
    draft().seedFromProposal(inventory(["ŋ"]));
    draft().remove("ŋ");
    draft().add("ŋ");
    expect(draft().chars).toContain("ŋ");
    expect(draft().provenance["ŋ"]).toBe("author");
  });

  it("removing an AUTHORED character does not add it to rejected", () => {
    draft().add("ŋ");
    draft().remove("ŋ");
    expect(draft().rejected).toEqual([]);
  });

  it("rejection survives reset() — reset runs on every build-list entry", () => {
    draft().seedFromProposal(inventory(["ŋ"]));
    draft().remove("ŋ");
    draft().reset();
    expect(draft().rejected).toContain("ŋ");
    draft().seedFromProposal(inventory(["ŋ", "ɔ"]));
    expect(draft().chars).not.toContain("ŋ");
  });

  it("resetInventoryDecisions clears the sticky decisions for a new working copy", () => {
    draft().seedFromProposal(inventory(["ŋ"]));
    draft().remove("ŋ");
    draft().declineExemplarMethod();
    resetInventoryDecisions();
    expect(draft().rejected).toEqual([]);
    expect(draft().exemplarMethodDeclined).toBe(false);
  });
});

describe("phase B inventory draft — declined exemplar method (spec 044 FR-016a)", () => {
  afterEach(() => {
    resetInventoryDecisions();
  });

  it("starts undeclined and becomes sticky once declined", () => {
    expect(draft().exemplarMethodDeclined).toBe(false);
    draft().declineExemplarMethod();
    expect(draft().exemplarMethodDeclined).toBe(true);
    draft().reset();
    expect(draft().exemplarMethodDeclined).toBe(true);
  });

  it("declining does not prevent a later deliberate apply", () => {
    draft().declineExemplarMethod();
    draft().seedFromProposal(inventory(["ŋ"]));
    expect(draft().chars).toContain("ŋ");
  });
});

describe("phase B inventory draft — proposal sources union rather than override (spec 044 T053)", () => {
  afterEach(() => {
    resetInventoryDecisions();
  });

  it("a second proposal source composes with the first", () => {
    draft().seedFromProposal(inventory(["ŋ"], "cldr"));
    draft().addProposed("ɔ", "text");
    const s = draft();
    expect(s.chars).toEqual(expect.arrayContaining(["ŋ", "ɔ"]));
    expect(s.provenance["ŋ"]).toBe("cldr");
    expect(s.provenance["ɔ"]).toBe("text");
  });

  it("a character both sources propose keeps its first attribution, not the last", () => {
    draft().seedFromProposal(inventory(["ŋ"], "sldr"));
    draft().addProposed("ŋ", "text");
    expect(draft().provenance["ŋ"]).toBe("sldr");
  });

  it("a second source does not remove the first source's characters", () => {
    draft().seedFromProposal(inventory(["a", "b"]));
    draft().addProposed("c", "text");
    expect(draft().chars).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });
});

describe("phase B inventory draft — 047 invariants survive seeding (spec 044 obligation P7)", () => {
  afterEach(() => {
    resetInventoryDecisions();
  });

  it("chars stays the COMPLETE inventory after a seed", () => {
    draft().seedFromProposal(inventory(["a", "ŋ", "7", "?"]));
    const s = draft();
    for (const ch of ["a", "A", "ŋ", "Ŋ", "7", "?"]) {
      expect(s.chars, `${ch} missing from chars`).toContain(ch);
    }
  });

  it("each captured non-mark/non-PUA character lands in exactly one category array", () => {
    draft().seedFromProposal(inventory(["a", "7", "?", "+"]));
    const s = draft();
    const categories = [s.bases, s.numbers, s.punctuation, s.symbols, s.separators, s.controls];
    for (const ch of s.chars) {
      if (s.marks.includes(ch)) continue;
      const hits = categories.filter((arr) => arr.includes(ch)).length;
      expect(hits, `${ch} landed in ${hits} category arrays`).toBe(1);
    }
  });

  it("routes a seeded digit to numbers and a seeded precomposed letter to bases + marks", () => {
    draft().seedFromProposal(inventory(["7", PRECOMPOSED_E_ACUTE]));
    const s = draft();
    expect(s.numbers).toContain("7");
    expect(s.bases).toContain("e");
    expect(s.marks).toContain("́");
  });

  it("the seeded draft still resolves to a valid ConfirmedAlphabet", () => {
    draft().seedFromProposal(inventory(["a", "ŋ"]));
    const alphabet = draftConfirmedAlphabet(getCharacterInventoryValue());
    expect(alphabet.bases).toContain("a");
    expect(alphabet.bases).toContain("ŋ");
  });

  it("a snapshot round-trip preserves provenance and the sticky decisions", () => {
    draft().seedFromProposal(inventory(["ŋ", "ɔ"], "sldr"));
    draft().add("q");
    draft().remove("ɔ");
    draft().declineExemplarMethod();
    const snap = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());

    draft().reset();
    resetInventoryDecisions();
    restoreInventoryFromSnapshot(snap);

    const s = draft();
    expect(s.provenance["ŋ"]).toBe("sldr");
    expect(s.provenance["q"]).toBe("author");
    expect(s.rejected).toContain("ɔ");
    expect(s.exemplarMethodDeclined).toBe(true);
  });

  it("a pre-044 snapshot without the new fields restores as all-author", () => {
    restoreInventoryFromSnapshot({ chars: ["a", "b"], selectedFont: DEFAULT_PHASE_B_FONT });
    const s = draft();
    expect(s.provenance).toEqual({ a: "author", b: "author" });
    expect(s.rejected).toEqual([]);
    expect(s.exemplarMethodDeclined).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// spec 075 — seeded proposals, invisible decisions, carry-over (contract §2)
// ---------------------------------------------------------------------------

describe("phase B inventory draft — seedProposals (spec 075)", () => {
  beforeEach(() => {
    resetInventoryDecisions();
  });

  it("seeds every character with the given provenance and records the seed key", () => {
    draft().seedProposals(["!", "?"], "cldr", "punctuation:hi");
    const s = draft();
    expect(s.chars).toEqual(["!", "?"]);
    expect(s.punctuation).toEqual(["!", "?"]);
    expect(s.provenance).toEqual({ "!": "cldr", "?": "cldr" });
    expect(s.seededProposals).toEqual(["punctuation:hi"]);
  });

  it("is a no-op on a repeated seed key, even with different characters", () => {
    draft().seedProposals(["!"], "cldr", "punctuation:hi");
    draft().seedProposals(["?"], "cldr", "punctuation:hi");
    expect(draft().chars).toEqual(["!"]);
    expect(draft().seededProposals).toEqual(["punctuation:hi"]);
  });

  it("a different seed key seeds again; proposal sources union (base after cldr)", () => {
    draft().seedProposals(["!"], "cldr", "punctuation:hi");
    draft().seedProposals(["!", "#"], "base", "punctuation-base:k1");
    const s = draft();
    expect(s.chars).toEqual(["!", "#"]);
    // The first source to attest a character keeps the attribution.
    expect(s.provenance).toEqual({ "!": "cldr", "#": "base" });
    expect(s.seededProposals).toEqual(["punctuation:hi", "punctuation-base:k1"]);
  });

  it("vetoes a rejected character (FR-022) and never downgrades an author pick (FR-005)", () => {
    const s = draft();
    s.addProposed("?", "cldr");
    s.remove("?"); // rejection
    s.add("!"); // author
    s.seedProposals(["!", "?", ";"], "sldr", "punctuation:xx");
    const after = draft();
    expect(after.chars).toEqual(["!", ";"]);
    expect(after.provenance).toEqual({ "!": "author", ";": "sldr" });
    expect(after.rejected).toEqual(["?"]);
    // The key is still recorded — the veto is not a reason to retry the seed.
    expect(after.seededProposals).toEqual(["punctuation:xx"]);
  });

  it("accepts the new base and ascii-floor provenances", () => {
    draft().seedProposals(["#"], "ascii-floor", "punctuation-base:floor");
    expect(draft().provenance["#"]).toBe("ascii-floor");
  });
});

describe("phase B inventory draft — invisible decisions (spec 075)", () => {
  beforeEach(() => {
    resetInventoryDecisions();
  });

  it("acceptInvisible / declineInvisible write invisibleDecisions and never touch chars", () => {
    const s = draft();
    s.acceptInvisible("U+200C");
    s.declineInvisible("U+200D");
    const after = draft();
    expect(after.invisibleDecisions).toEqual({ "U+200C": "accepted", "U+200D": "declined" });
    expect(after.chars).toEqual([]);
    expect(after.controls).toEqual([]);
  });

  it("a later decision overwrites an earlier one for the same character", () => {
    draft().acceptInvisible("U+200C");
    draft().declineInvisible("U+200C");
    expect(draft().invisibleDecisions).toEqual({ "U+200C": "declined" });
  });

  it("canonicalises the key to uppercase U+XXXX and ignores malformed notation", () => {
    const s = draft();
    s.acceptInvisible("u+200c");
    s.acceptInvisible("00AD");
    s.acceptInvisible("not a code point");
    expect(draft().invisibleDecisions).toEqual({
      "U+200C": "accepted",
      "U+00AD": "accepted",
    });
  });
});

describe("phase B inventory draft — adoptControlsAsInvisibles carry-over (spec 075 FR-017)", () => {
  beforeEach(() => {
    resetInventoryDecisions();
  });

  it("moves every format (Cf) character out of controls into accepted decisions and out of chars", () => {
    const s = draft();
    s.add("\u200C"); // ZWNJ — Cf, filed under controls by glyphCategory
    s.add("\u00AD"); // SOFT HYPHEN — Cf
    s.add("!");
    expect(draft().controls).toEqual(["\u200C", "\u00AD"]);

    draft().adoptControlsAsInvisibles();
    const after = draft();
    expect(after.invisibleDecisions).toEqual({ "U+200C": "accepted", "U+00AD": "accepted" });
    expect(after.chars).toEqual(["!"]);
    expect(after.controls).toEqual([]);
    expect(after.provenance).toEqual({ "!": "author" });
    // A migration is not a rejection.
    expect(after.rejected).toEqual([]);
  });

  it("is idempotent and leaves non-format controls alone", () => {
    const s = draft();
    s.add("\u200D");
    s.add("\u0007"); // BEL — Cc, a control but not a format character
    s.adoptControlsAsInvisibles();
    const once = draft();
    s.adoptControlsAsInvisibles();
    const twice = draft();
    expect(twice.invisibleDecisions).toEqual(once.invisibleDecisions);
    expect(twice.invisibleDecisions).toEqual({ "U+200D": "accepted" });
    expect(twice.chars).toEqual(["\u0007"]);
  });
});

describe("phase B inventory draft — sticky class rules for the spec 075 fields", () => {
  beforeEach(() => {
    resetInventoryDecisions();
  });

  it("seededProposals and invisibleDecisions survive reset() and are cleared only by resetInventoryDecisions()", () => {
    const s = draft();
    s.seedProposals(["!"], "cldr", "punctuation:hi");
    s.acceptInvisible("U+200C");
    s.reset();
    expect(draft().chars).toEqual([]);
    expect(draft().seededProposals).toEqual(["punctuation:hi"]);
    expect(draft().invisibleDecisions).toEqual({ "U+200C": "accepted" });
    resetInventoryDecisions();
    expect(draft().seededProposals).toEqual([]);
    expect(draft().invisibleDecisions).toEqual({});
  });

  it("round-trips through snapshotPhaseBDraft / applyPhaseBDraftSnapshot", () => {
    const s = draft();
    s.seedProposals(["!"], "cldr", "punctuation:hi");
    s.acceptInvisible("U+200C");
    s.declineInvisible("U+200D");
    const snap = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
    expect(snap.seededProposals).toEqual(["punctuation:hi"]);
    expect(snap.invisibleDecisions).toEqual({ "U+200C": "accepted", "U+200D": "declined" });

    draft().reset();
    resetInventoryDecisions();
    restoreInventoryFromSnapshot(snap);
    const after = draft();
    expect(after.seededProposals).toEqual(["punctuation:hi"]);
    expect(after.invisibleDecisions).toEqual({ "U+200C": "accepted", "U+200D": "declined" });
    expect(after.chars).toEqual(["!"]);
    expect(after.provenance["!"]).toBe("cldr");
  });

  it("a pre-075 snapshot without the fields restores them empty", () => {
    restoreInventoryFromSnapshot({ chars: ["!"], selectedFont: DEFAULT_PHASE_B_FONT });
    expect(draft().seededProposals).toEqual([]);
    expect(draft().invisibleDecisions).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Spec 079 T037 (R-07) — the sticky alphabet evidence key
// ---------------------------------------------------------------------------

describe("phase B inventory draft — alphabetEvidenceKey (spec 079 R-07)", () => {
  beforeEach(() => {
    draft().reset();
    resetInventoryDecisions();
  });

  it("is absent until the alphabet is first built, then holds the stamped key", () => {
    expect(draft().alphabetEvidenceKey).toBeUndefined();
    draft().setAlphabetEvidenceKey("tl-Latn|Latn|Latn|basic_kbdus");
    expect(draft().alphabetEvidenceKey).toBe("tl-Latn|Latn|Latn|basic_kbdus");
  });

  it("survives reset() — reset runs on every build-list entry and must not forget the evidence", () => {
    draft().setAlphabetEvidenceKey("k1");
    draft().add("a");
    draft().reset();
    expect(draft().chars).toEqual([]);
    expect(draft().alphabetEvidenceKey).toBe("k1");
  });

  it("is cleared by resetInventoryDecisions() — a genuinely new working copy", () => {
    draft().setAlphabetEvidenceKey("k1");
    resetInventoryDecisions();
    expect(draft().alphabetEvidenceKey).toBeUndefined();
  });

  it("round-trips through PhaseBDraftSnapshot, and an old snapshot without it restores as unstamped", () => {
    draft().add("a");
    draft().setAlphabetEvidenceKey("k1");
    const snap = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
    expect(snap.alphabetEvidenceKey).toBe("k1");

    resetInventoryDecisions();
    draft().reset();
    restoreInventoryFromSnapshot(snap);
    expect(draft().alphabetEvidenceKey).toBe("k1");
    expect(draft().chars).toEqual(["a"]);

    restoreInventoryFromSnapshot({ chars: ["a"], selectedFont: DEFAULT_PHASE_B_FONT });
    expect(draft().alphabetEvidenceKey).toBeUndefined();
  });
});

describe("phase B inventory draft — loanword letters beside the alphabet", () => {
  beforeEach(() => {
    draft().reset();
  });

  it("addLoanword keeps letters out of chars and the alphabet stores", () => {
    draft().add("a");
    draft().addLoanword("q");
    const s = draft();
    expect(s.loanwordChars).toEqual(["q"]);
    expect(s.chars).toEqual(["a"]);
    expect(s.bases).not.toContain("q");
    expect(draftConfirmedAlphabet(getCharacterInventoryValue()).bases).not.toContain("q");
  });

  it("addLoanword is a no-op for a duplicate or an existing alphabet letter", () => {
    draft().add("x");
    draft().addLoanword("x");
    draft().addLoanword("q");
    draft().addLoanword("q");
    expect(draft().loanwordChars).toEqual(["q"]);
  });

  it("removeLoanword is an edit, not a rejection", () => {
    draft().addLoanword("q");
    draft().removeLoanword("q");
    expect(draft().loanwordChars).toEqual([]);
    expect(draft().rejected).not.toContain("q");
  });

  it("reset clears the loanword list", () => {
    draft().addLoanword("q");
    draft().reset();
    expect(draft().loanwordChars).toEqual([]);
  });

  it("round-trips through a snapshot without reaching chars", () => {
    draft().add("a");
    draft().addLoanword("q");
    draft().addLoanword("Q");
    const snapshot = snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
    draft().reset();
    restoreInventoryFromSnapshot(snapshot);
    expect(draft().loanwordChars).toEqual(["q", "Q"]);
    expect(draft().chars).toEqual(["a"]);
  });
});
