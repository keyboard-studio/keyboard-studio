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
import {
  usePhaseBDraftStore,
  draftConfirmedAlphabet,
  snapshotPhaseBDraft,
  applyPhaseBDraftSnapshot,
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
    expect(snapshot).toEqual({ chars: ["a", "b", "ɛ"], selectedFont: "charis-sil" });

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
