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

import { describe, it, expect, afterEach } from "vitest";
import { usePhaseBDraftStore } from "./phaseBDraftStore.ts";

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
});
