// Unit tests for phaseBDraftStore — the shared draft-alphabet accumulator for
// Phase B build-list (BuildListView center pane + CharacterMapPane right
// pane, spec character-map pane work).
//
// Scope: the store's own add/remove/toggle/setAll/reset mechanics in
// isolation, including the NFC-vs-NFD dedup guarantee `add` inherits from
// `nfcDedup` (../survey/charNormUtils.ts). Persistence round-trip of the
// snapshot helpers is covered separately in ../lib/draftPersistence.test.ts —
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
  usePhaseBDraftStore,
  draftConfirmedAlphabet,
  snapshotPhaseBDraft,
  applyPhaseBDraftSnapshot,
  resetPhaseBDraftDecisions,
} from "./phaseBDraftStore.ts";
import { DEFAULT_PHASE_B_FONT } from "../survey/surveyStyles.ts";

// e-acute: precomposed (NFC, 1 codepoint) vs decomposed (NFD, "e" + combining
// acute U+0301, 2 codepoints). Same grapheme, different encodings.
const PRECOMPOSED_E_ACUTE = "é";
const DECOMPOSED_E_ACUTE = "é";

afterEach(() => {
  usePhaseBDraftStore.getState().reset();
});

describe("phaseBDraftStore — add", () => {
  it("adds a single character to an empty store", () => {
    usePhaseBDraftStore.getState().add("a");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a"]);
  });

  it("NFC-normalizes an incoming decomposed character before storing it", () => {
    usePhaseBDraftStore.getState().add(DECOMPOSED_E_ACUTE);
    expect(usePhaseBDraftStore.getState().chars).toEqual([PRECOMPOSED_E_ACUTE]);
  });

  it("dedupes an NFD-form add against an already-stored NFC form of the same grapheme", () => {
    usePhaseBDraftStore.getState().add(PRECOMPOSED_E_ACUTE);
    usePhaseBDraftStore.getState().add(DECOMPOSED_E_ACUTE);
    // Only one entry — the decomposed form must not appear as a second, distinct char.
    expect(usePhaseBDraftStore.getState().chars).toEqual([PRECOMPOSED_E_ACUTE]);
  });

  it("dedupes an NFC-form add against an already-stored NFD-originated form (order reversed)", () => {
    usePhaseBDraftStore.getState().add(DECOMPOSED_E_ACUTE);
    usePhaseBDraftStore.getState().add(PRECOMPOSED_E_ACUTE);
    expect(usePhaseBDraftStore.getState().chars).toEqual([PRECOMPOSED_E_ACUTE]);
  });

  it("dedupes a plain repeat add of the identical character", () => {
    usePhaseBDraftStore.getState().add("a");
    usePhaseBDraftStore.getState().add("a");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a"]);
  });

  it("preserves first-appearance order across multiple distinct adds", () => {
    usePhaseBDraftStore.getState().add("c");
    usePhaseBDraftStore.getState().add("a");
    usePhaseBDraftStore.getState().add("b");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["c", "a", "b"]);
  });
});

describe("phaseBDraftStore — remove", () => {
  it("removes a character present in the store", () => {
    usePhaseBDraftStore.getState().setAll(["a", "b", "c"]);
    usePhaseBDraftStore.getState().remove("b");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a", "c"]);
  });

  it("NFC-normalizes before comparing, so an NFD-form remove still hits an NFC-stored char", () => {
    usePhaseBDraftStore.getState().setAll([PRECOMPOSED_E_ACUTE]);
    usePhaseBDraftStore.getState().remove(DECOMPOSED_E_ACUTE);
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("removing a character that isn't present is a no-op", () => {
    usePhaseBDraftStore.getState().setAll(["a", "b"]);
    usePhaseBDraftStore.getState().remove("z");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a", "b"]);
  });
});

describe("phaseBDraftStore — toggle", () => {
  it("adds an absent character", () => {
    usePhaseBDraftStore.getState().toggle("a");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a"]);
  });

  it("removes a present character (add then toggle removes it)", () => {
    usePhaseBDraftStore.getState().add("a");
    usePhaseBDraftStore.getState().toggle("a");
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("round-trips: toggle twice returns to the original state", () => {
    usePhaseBDraftStore.getState().setAll(["x", "y"]);
    usePhaseBDraftStore.getState().toggle("x");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["y"]);
    usePhaseBDraftStore.getState().toggle("x");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["y", "x"]);
  });

  it("toggle on an NFD form removes an NFC-stored equivalent grapheme (not a distinct add)", () => {
    usePhaseBDraftStore.getState().setAll([PRECOMPOSED_E_ACUTE]);
    usePhaseBDraftStore.getState().toggle(DECOMPOSED_E_ACUTE);
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });
});

describe("phaseBDraftStore — setAll", () => {
  it("replaces the whole list wholesale", () => {
    usePhaseBDraftStore.getState().setAll(["a", "b"]);
    usePhaseBDraftStore.getState().setAll(["x", "y", "z"]);
    expect(usePhaseBDraftStore.getState().chars).toEqual(["x", "y", "z"]);
  });

  it("replaces a non-empty list with an empty one", () => {
    usePhaseBDraftStore.getState().setAll(["a", "b"]);
    usePhaseBDraftStore.getState().setAll([]);
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
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
    usePhaseBDraftStore.getState().setAll(["a", "a", "b"]);
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a", "a", "b"]);
  });

  it("does NOT NFC-normalize its input (caller's responsibility, not setAll's)", () => {
    usePhaseBDraftStore.getState().setAll([DECOMPOSED_E_ACUTE]);
    const stored = usePhaseBDraftStore.getState().chars;
    expect(stored).toEqual([DECOMPOSED_E_ACUTE]);
    expect(stored[0]).not.toBe(PRECOMPOSED_E_ACUTE);
  });
});

describe("phaseBDraftStore — reset", () => {
  it("clears back to an empty alphabet", () => {
    usePhaseBDraftStore.getState().setAll(["a", "b", "c"]);
    usePhaseBDraftStore.getState().reset();
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("reset is idempotent on an already-empty store", () => {
    usePhaseBDraftStore.getState().reset();
    usePhaseBDraftStore.getState().reset();
    expect(usePhaseBDraftStore.getState().chars).toEqual([]);
  });

  it("does not touch selectedFont — font selection is left untouched, per the store's own reset() doc comment", () => {
    usePhaseBDraftStore.getState().setSelectedFont("charis-sil");
    usePhaseBDraftStore.getState().reset();
    expect(usePhaseBDraftStore.getState().selectedFont).toBe("charis-sil");
    // Restore the default so this test doesn't leak state to later tests
    // (this file's top-level afterEach only resets chars, not the font).
    usePhaseBDraftStore.getState().setSelectedFont(DEFAULT_PHASE_B_FONT);
  });
});

describe("phaseBDraftStore — selectedFont", () => {
  afterEach(() => {
    usePhaseBDraftStore.getState().setSelectedFont(DEFAULT_PHASE_B_FONT);
  });

  it("defaults to DEFAULT_PHASE_B_FONT (noto-sans) on a fresh store", () => {
    expect(usePhaseBDraftStore.getState().selectedFont).toBe(DEFAULT_PHASE_B_FONT);
    expect(usePhaseBDraftStore.getState().selectedFont).toBe("noto-sans");
  });

  it("setSelectedFont updates the selection", () => {
    usePhaseBDraftStore.getState().setSelectedFont("charis-sil");
    expect(usePhaseBDraftStore.getState().selectedFont).toBe("charis-sil");
  });

  it("setSelectedFont does not disturb the accumulated chars list", () => {
    usePhaseBDraftStore.getState().setAll(["a", "b"]);
    usePhaseBDraftStore.getState().setSelectedFont("charis-sil");
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a", "b"]);
  });
});

describe("phaseBDraftStore — snapshotPhaseBDraft/applyPhaseBDraftSnapshot round-trip", () => {
  afterEach(() => {
    usePhaseBDraftStore.getState().setSelectedFont(DEFAULT_PHASE_B_FONT);
  });

  it("round-trips both chars and selectedFont together", () => {
    usePhaseBDraftStore.getState().setAll(["a", "b", "ɛ"]);
    usePhaseBDraftStore.getState().setSelectedFont("charis-sil");

    const snapshot = snapshotPhaseBDraft();
    expect(snapshot).toEqual({
      chars: ["a", "b", "ɛ"],
      declaredRoles: {},
      // Spec 044 additions: setAll attributes everything it does not already
      // know to the author, and the sticky proposal decisions start clear.
      provenance: { a: "author", b: "author", "ɛ": "author" },
      rejected: [],
      exemplarMethodDeclined: false,
      selectedFont: "charis-sil",
    });

    usePhaseBDraftStore.getState().reset();
    usePhaseBDraftStore.getState().setSelectedFont(DEFAULT_PHASE_B_FONT);

    applyPhaseBDraftSnapshot(snapshot);
    expect(usePhaseBDraftStore.getState().chars).toEqual(["a", "b", "ɛ"]);
    expect(usePhaseBDraftStore.getState().selectedFont).toBe("charis-sil");
  });
});

// ---------------------------------------------------------------------------
// Three-store split (spec 046): bases / marks / attestedStacks / declaredRoles
// derive from the picks; removing a pick never leaves an orphaned mark.
// ---------------------------------------------------------------------------

describe("phaseBDraftStore — three-store split (spec 046)", () => {
  const ACUTE = "́";

  beforeEach(() => {
    usePhaseBDraftStore.getState().reset();
  });

  it("a precomposed pick contributes base, mark, and attested stack; chars keeps the whole grapheme", () => {
    usePhaseBDraftStore.getState().add("é");
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toEqual(["é"]);
    expect(s.bases).toEqual(["e"]);
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toEqual([{ base: "e", marks: [ACUTE] }]);
  });

  it("reports the pick's contribution for the just-added highlight", () => {
    usePhaseBDraftStore.getState().add("e");
    usePhaseBDraftStore.getState().add("é");
    const { lastPick } = usePhaseBDraftStore.getState();
    expect(lastPick?.grapheme).toBe("é");
    expect(lastPick?.addedBases).toEqual([]); // "e" was already present
    expect(lastPick?.addedMarks).toEqual([ACUTE]);
    expect(lastPick?.addedStack).toEqual({ base: "e", marks: [ACUTE] });
  });

  it("does not duplicate an already-present base or mark (edge case)", () => {
    usePhaseBDraftStore.getState().add("é");
    usePhaseBDraftStore.getState().add("á");
    const s = usePhaseBDraftStore.getState();
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toHaveLength(2);
  });

  it("a plain letter lands only in bases; a lone combining mark only in marks", () => {
    usePhaseBDraftStore.getState().add("k");
    usePhaseBDraftStore.getState().add(ACUTE);
    const s = usePhaseBDraftStore.getState();
    expect(s.bases).toEqual(["k"]);
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toEqual([]);
  });

  it("removing the only accented pick removes its stack AND its now-orphaned mark", () => {
    usePhaseBDraftStore.getState().add("é");
    usePhaseBDraftStore.getState().remove("é");
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toEqual([]);
    expect(s.marks).toEqual([]);
    expect(s.attestedStacks).toEqual([]);
  });

  it("a PUA pick with a declared role lands in the right store and records the role", () => {
    const pua = String.fromCodePoint(0xe000);
    usePhaseBDraftStore.getState().add(pua, { role: "mark" });
    const s = usePhaseBDraftStore.getState();
    expect(s.marks).toEqual([pua]);
    expect(s.bases).toEqual([]);
    expect(s.declaredRoles[pua]).toBe("mark");
  });

  it("an unclassified PUA pick behaves as a letter until asked", () => {
    const pua = String.fromCodePoint(0xe001);
    usePhaseBDraftStore.getState().add(pua);
    const s = usePhaseBDraftStore.getState();
    expect(s.bases).toEqual([pua]);
    expect(s.declaredRoles[pua]).toBe("letter");
  });

  it("setAll rebuilds the stores from a normalized pick list while chars stays verbatim", () => {
    usePhaseBDraftStore.getState().setAll(["é", "é", "k"]);
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toEqual(["é", "é", "k"]); // pinned verbatim contract
    expect(s.bases).toEqual(["e", "k"]);
    expect(s.marks).toEqual([ACUTE]);
    expect(s.attestedStacks).toEqual([{ base: "e", marks: [ACUTE] }]);
  });

  it("draftConfirmedAlphabet() resolves the current draft to a ConfirmedAlphabet", () => {
    usePhaseBDraftStore.getState().add("é");
    expect(draftConfirmedAlphabet()).toEqual({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
      declaredRoles: {},
    });
  });

  it("snapshot round-trip preserves declared roles", () => {
    const pua = String.fromCodePoint(0xe000);
    usePhaseBDraftStore.getState().add(pua, { role: "mark" });
    const snap = snapshotPhaseBDraft();
    usePhaseBDraftStore.getState().reset();
    applyPhaseBDraftSnapshot(snap);
    const s = usePhaseBDraftStore.getState();
    expect(s.marks).toEqual([pua]);
    expect(s.declaredRoles[pua]).toBe("mark");
  });
});

// ---------------------------------------------------------------------------
// Category split (spec 047): deriveStores routes non-letters to derived
// numbers/punctuation/symbols/separators/controls arrays; letters stay in
// `bases`; `chars`/confirmed inventory stays COMPLETE (FR-004/005/013).
// ---------------------------------------------------------------------------

describe("phaseBDraftStore — category split (spec 047)", () => {
  const NBSP = " ";
  const ZWSP = "​";

  beforeEach(() => {
    usePhaseBDraftStore.getState().reset();
  });

  it("routes a letter, digit, punctuation, symbol, NBSP, and a surviving control each to exactly one array (FR-005/SC-002)", () => {
    usePhaseBDraftStore.getState().setAll(["a", "1", ".", "€", NBSP, ZWSP]);
    const s = usePhaseBDraftStore.getState();
    expect(s.bases).toEqual(["a"]);
    expect(s.numbers).toEqual(["1"]);
    expect(s.punctuation).toEqual(["."]);
    expect(s.symbols).toEqual(["€"]);
    expect(s.separators).toEqual([NBSP]);
    expect(s.controls).toEqual([ZWSP]); // ZWSP is \p{Cf} — control/other
  });

  it("no character is double-counted across the category arrays", () => {
    usePhaseBDraftStore.getState().setAll(["a", "1", ".", "€", NBSP, ZWSP]);
    const s = usePhaseBDraftStore.getState();
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
    usePhaseBDraftStore.getState().add(ACUTE); // lone mark
    usePhaseBDraftStore.getState().add(pua); // unclassified PUA → letter
    const s = usePhaseBDraftStore.getState();
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
    usePhaseBDraftStore.getState().setAll(["a", "1", "."]);
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toEqual(["a", "1", "."]); // complete, verbatim
    expect(s.bases).toEqual(["a"]); // letters only — no digit/punctuation
    expect(s.bases).not.toContain("1");
    expect(s.bases).not.toContain(".");
  });

  it("removing a pick recomputes every derived array with no orphans", () => {
    usePhaseBDraftStore.getState().setAll(["a", "1", ".", "€"]);
    usePhaseBDraftStore.getState().remove("1");
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toEqual(["a", ".", "€"]);
    expect(s.numbers).toEqual([]); // the only number was removed
    expect(s.punctuation).toEqual(["."]);
    expect(s.symbols).toEqual(["€"]);
  });

  it("reset clears the derived category arrays", () => {
    usePhaseBDraftStore.getState().setAll(["1", ".", "€"]);
    usePhaseBDraftStore.getState().reset();
    const s = usePhaseBDraftStore.getState();
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
function inventory(chars: string[], source: "cldr" | "sldr" = "cldr"): SourcedInventory {
  const confidence = source === "cldr" ? "approved" : "generated";
  return {
    resolvedTag: "test",
    source,
    confidence,
    characters: chars.map((char) => ({ char, tier: "main" as const, source, confidence })),
    digraphs: [],
  };
}

describe("phaseBDraftStore — seedFromProposal (spec 044 FR-016)", () => {
  afterEach(() => {
    resetPhaseBDraftDecisions();
  });

  it("seeds the main tier and tags every character with its source", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ", "ɔ"], "sldr"));
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toContain("ŋ");
    expect(s.provenance["ŋ"]).toBe("sldr");
    expect(s.provenance["ɔ"]).toBe("sldr");
  });

  it("derives the uppercase counterpart alongside each lowercase letter", () => {
    // 047's case derivation: an alphabet without its uppercase half is not one
    // the author can accept and move on from.
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["a", "ŋ"]));
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toContain("A");
    expect(s.chars).toContain("Ŋ");
    expect(s.provenance["A"]).toBe("cldr");
  });

  it("is idempotent", () => {
    const inv = inventory(["a", "b"]);
    usePhaseBDraftStore.getState().seedFromProposal(inv);
    const first = { ...usePhaseBDraftStore.getState() };
    usePhaseBDraftStore.getState().seedFromProposal(inv);
    const second = usePhaseBDraftStore.getState();
    expect(second.chars).toEqual(first.chars);
    expect(second.provenance).toEqual(first.provenance);
    expect(second.bases).toEqual(first.bases);
  });

  it("does not clobber an author-entered character that is also proposed", () => {
    usePhaseBDraftStore.getState().add("ŋ");
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBe("author");
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ", "ɔ"]));
    // The stronger claim wins and survives the seed.
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBe("author");
    expect(usePhaseBDraftStore.getState().provenance["ɔ"]).toBe("cldr");
  });

  it("an author-entered character survives a RE-seed", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"]));
    usePhaseBDraftStore.getState().add("ŋ"); // author confirms it as their own
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"]));
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBe("author");
    expect(usePhaseBDraftStore.getState().chars.filter((c) => c === "ŋ")).toHaveLength(1);
  });
});

describe("phaseBDraftStore — rejection is sticky (spec 044 FR-017)", () => {
  afterEach(() => {
    resetPhaseBDraftDecisions();
  });

  it("removing a PROPOSED character records it as rejected", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ", "ɔ"]));
    usePhaseBDraftStore.getState().remove("ŋ");
    expect(usePhaseBDraftStore.getState().rejected).toContain("ŋ");
    expect(usePhaseBDraftStore.getState().chars).not.toContain("ŋ");
  });

  it("a rejected character is never re-proposed", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ", "ɔ"]));
    usePhaseBDraftStore.getState().remove("ŋ");
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ", "ɔ"]));
    expect(usePhaseBDraftStore.getState().chars).not.toContain("ŋ");
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBeUndefined();
  });

  it("the author can still add a rejected character back deliberately", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"]));
    usePhaseBDraftStore.getState().remove("ŋ");
    usePhaseBDraftStore.getState().add("ŋ");
    expect(usePhaseBDraftStore.getState().chars).toContain("ŋ");
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBe("author");
  });

  it("removing an AUTHORED character does not add it to rejected", () => {
    usePhaseBDraftStore.getState().add("ŋ");
    usePhaseBDraftStore.getState().remove("ŋ");
    expect(usePhaseBDraftStore.getState().rejected).toEqual([]);
  });

  it("rejection survives reset() — reset runs on every build-list entry", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"]));
    usePhaseBDraftStore.getState().remove("ŋ");
    usePhaseBDraftStore.getState().reset();
    expect(usePhaseBDraftStore.getState().rejected).toContain("ŋ");
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ", "ɔ"]));
    expect(usePhaseBDraftStore.getState().chars).not.toContain("ŋ");
  });

  it("resetPhaseBDraftDecisions clears the sticky decisions for a new working copy", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"]));
    usePhaseBDraftStore.getState().remove("ŋ");
    usePhaseBDraftStore.getState().declineExemplarMethod();
    resetPhaseBDraftDecisions();
    expect(usePhaseBDraftStore.getState().rejected).toEqual([]);
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(false);
  });
});

describe("phaseBDraftStore — declined exemplar method (spec 044 FR-016a)", () => {
  afterEach(() => {
    resetPhaseBDraftDecisions();
  });

  it("starts undeclined and becomes sticky once declined", () => {
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(false);
    usePhaseBDraftStore.getState().declineExemplarMethod();
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(true);
    usePhaseBDraftStore.getState().reset();
    expect(usePhaseBDraftStore.getState().exemplarMethodDeclined).toBe(true);
  });

  it("declining does not prevent a later deliberate apply", () => {
    usePhaseBDraftStore.getState().declineExemplarMethod();
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"]));
    expect(usePhaseBDraftStore.getState().chars).toContain("ŋ");
  });
});

describe("phaseBDraftStore — proposal sources union rather than override (spec 044 T053)", () => {
  afterEach(() => {
    resetPhaseBDraftDecisions();
  });

  it("a second proposal source composes with the first", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"], "cldr"));
    usePhaseBDraftStore.getState().addProposed("ɔ", "text");
    const s = usePhaseBDraftStore.getState();
    expect(s.chars).toEqual(expect.arrayContaining(["ŋ", "ɔ"]));
    expect(s.provenance["ŋ"]).toBe("cldr");
    expect(s.provenance["ɔ"]).toBe("text");
  });

  it("a character both sources propose keeps its first attribution, not the last", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ"], "sldr"));
    usePhaseBDraftStore.getState().addProposed("ŋ", "text");
    expect(usePhaseBDraftStore.getState().provenance["ŋ"]).toBe("sldr");
  });

  it("a second source does not remove the first source's characters", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["a", "b"]));
    usePhaseBDraftStore.getState().addProposed("c", "text");
    expect(usePhaseBDraftStore.getState().chars).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });
});

describe("phaseBDraftStore — 047 invariants survive seeding (spec 044 obligation P7)", () => {
  afterEach(() => {
    resetPhaseBDraftDecisions();
  });

  it("chars stays the COMPLETE inventory after a seed", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["a", "ŋ", "7", "?"]));
    const s = usePhaseBDraftStore.getState();
    for (const ch of ["a", "A", "ŋ", "Ŋ", "7", "?"]) {
      expect(s.chars, `${ch} missing from chars`).toContain(ch);
    }
  });

  it("each captured non-mark/non-PUA character lands in exactly one category array", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["a", "7", "?", "+"]));
    const s = usePhaseBDraftStore.getState();
    const categories = [s.bases, s.numbers, s.punctuation, s.symbols, s.separators, s.controls];
    for (const ch of s.chars) {
      if (s.marks.includes(ch)) continue;
      const hits = categories.filter((arr) => arr.includes(ch)).length;
      expect(hits, `${ch} landed in ${hits} category arrays`).toBe(1);
    }
  });

  it("routes a seeded digit to numbers and a seeded precomposed letter to bases + marks", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["7", PRECOMPOSED_E_ACUTE]));
    const s = usePhaseBDraftStore.getState();
    expect(s.numbers).toContain("7");
    expect(s.bases).toContain("e");
    expect(s.marks).toContain("́");
  });

  it("the seeded draft still resolves to a valid ConfirmedAlphabet", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["a", "ŋ"]));
    const alphabet = draftConfirmedAlphabet();
    expect(alphabet.bases).toContain("a");
    expect(alphabet.bases).toContain("ŋ");
  });

  it("a snapshot round-trip preserves provenance and the sticky decisions", () => {
    usePhaseBDraftStore.getState().seedFromProposal(inventory(["ŋ", "ɔ"], "sldr"));
    usePhaseBDraftStore.getState().add("q");
    usePhaseBDraftStore.getState().remove("ɔ");
    usePhaseBDraftStore.getState().declineExemplarMethod();
    const snap = snapshotPhaseBDraft();

    usePhaseBDraftStore.getState().reset();
    resetPhaseBDraftDecisions();
    applyPhaseBDraftSnapshot(snap);

    const s = usePhaseBDraftStore.getState();
    expect(s.provenance["ŋ"]).toBe("sldr");
    expect(s.provenance["q"]).toBe("author");
    expect(s.rejected).toContain("ɔ");
    expect(s.exemplarMethodDeclined).toBe(true);
  });

  it("a pre-044 snapshot without the new fields restores as all-author", () => {
    applyPhaseBDraftSnapshot({ chars: ["a", "b"], selectedFont: DEFAULT_PHASE_B_FONT });
    const s = usePhaseBDraftStore.getState();
    expect(s.provenance).toEqual({ a: "author", b: "author" });
    expect(s.rejected).toEqual([]);
    expect(s.exemplarMethodDeclined).toBe(false);
  });
});
