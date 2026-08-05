import { describe, it, expect } from "vitest";
import { dedupeKpsPathsById, matchKeyboardScopePath } from "./corpus-scope.js";

describe("matchKeyboardScopePath", () => {
  it("matches the Keyman 17+ source/ layout and extracts the id", () => {
    expect(
      matchKeyboardScopePath("release/b/balochi_inpage/source/balochi_inpage.kps")
    ).toEqual({ id: "balochi_inpage", layout: "source" });
  });

  it("matches the legacy flat-root layout and extracts the id", () => {
    expect(
      matchKeyboardScopePath("release/s/sil_euro_latin/sil_euro_latin.kps")
    ).toEqual({ id: "sil_euro_latin", layout: "flat" });
  });

  it("returns null when the .kps basename does not match the <id> directory", () => {
    expect(
      matchKeyboardScopePath("release/b/basic_kbdus/source/other_name.kps")
    ).toBeNull();
    expect(
      matchKeyboardScopePath("release/b/basic_kbdus/other_name.kps")
    ).toBeNull();
  });

  it("returns null for paths outside release/", () => {
    expect(matchKeyboardScopePath("docs/keyboard-index.md")).toBeNull();
  });

  it("returns null for a bare directory path with no .kps file", () => {
    expect(matchKeyboardScopePath("release/b/basic_kbdus/source")).toBeNull();
  });

  it("returns null for a non-canonical nested path (extra segment past source/)", () => {
    // The `^...$` anchoring must reject a .kps buried below the canonical
    // source/ depth (e.g. under extras/) rather than mis-extracting an id.
    expect(
      matchKeyboardScopePath("release/b/basic_kbdus/source/extras/basic_kbdus.kps")
    ).toBeNull();
    expect(
      matchKeyboardScopePath("release/b/basic_kbdus/nested/basic_kbdus.kps")
    ).toBeNull();
  });
});

describe("dedupeKpsPathsById", () => {
  it("collapses a transitional duplicate (same id under both layouts) to the source/ entry", () => {
    // A keyboard mid-migration can have BOTH its legacy flat-root .kps
    // and its new source/ .kps present under the same <id> folder at once.
    const paths = [
      "release/s/sil_euro_latin/sil_euro_latin.kps",
      "release/s/sil_euro_latin/source/sil_euro_latin.kps",
    ];
    expect(dedupeKpsPathsById(paths)).toEqual([
      "release/s/sil_euro_latin/source/sil_euro_latin.kps",
    ]);
  });

  it("prefers source/ regardless of input order", () => {
    const paths = [
      "release/s/sil_euro_latin/source/sil_euro_latin.kps",
      "release/s/sil_euro_latin/sil_euro_latin.kps",
    ];
    expect(dedupeKpsPathsById(paths)).toEqual([
      "release/s/sil_euro_latin/source/sil_euro_latin.kps",
    ]);
  });

  it("leaves single-layout keyboards untouched and keeps unrelated ids separate", () => {
    const paths = [
      "release/b/basic_kbdus/source/basic_kbdus.kps",
      "release/s/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kps",
    ];
    expect(dedupeKpsPathsById(paths).sort()).toEqual([...paths].sort());
  });

  it("drops paths that match neither layout", () => {
    expect(dedupeKpsPathsById(["docs/keyboard-index.md"])).toEqual([]);
  });
});
