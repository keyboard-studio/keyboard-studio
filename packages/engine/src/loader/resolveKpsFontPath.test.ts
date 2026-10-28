import { describe, it, expect } from "vitest";
import { releasePathToVfsKey, resolveKpsFontPath } from "./fetchKeyboardSourceToVfs.js";

describe("resolveKpsFontPath", () => {
  const KB_PATH = "release/sil/sil_cameroon_azerty";

  describe("normal in-tree resolution", () => {
    it("resolves the real AndikaAfr-R.ttf deep path", () => {
      const raw = "..\\..\\..\\shared\\fonts\\sil\\andika_subsets\\AndikaAfr-R.ttf";
      expect(resolveKpsFontPath(raw, KB_PATH)).toBe(
        "release/shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf",
      );
    });

    it("resolves a simple sibling-folder font path", () => {
      // source/../fonts/MyFont.ttf from release/a/akan -> release/a/akan/fonts/MyFont.ttf
      const raw = "..\\fonts\\MyFont.ttf";
      expect(resolveKpsFontPath(raw, "release/a/akan")).toBe(
        "release/a/akan/fonts/MyFont.ttf",
      );
    });

    it("resolves forward-slash paths (cross-platform fallback)", () => {
      const raw = "../../../shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf";
      expect(resolveKpsFontPath(raw, KB_PATH)).toBe(
        "release/shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf",
      );
    });
  });

  describe("traversal safety", () => {
    it("returns null when the path escapes the release/ tree", () => {
      // Six levels up from release/sil/sil_cameroon_azerty/source would be above repo root.
      const raw = "..\\..\\..\\..\\..\\..\\etc\\passwd";
      expect(resolveKpsFontPath(raw, KB_PATH)).toBeNull();
    });

    it("returns null for a path that resolves exactly to root (no release/ prefix)", () => {
      // Exactly enough .. to reach the segments root without release/ prefix.
      const raw = "..\\..\\..\\..\\noescape\\font.ttf";
      // release/sil/sil_cameroon_azerty/source has 4 segments;
      // four .. pops leave us at "noescape/font.ttf" (no release/ prefix) -> null.
      expect(resolveKpsFontPath(raw, KB_PATH)).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles mixed slashes in the raw path", () => {
      // release/a/akan/source -> pop 2 -> release/a -> append shared/fonts/font.ttf
      const raw = "..\\../shared\\fonts/font.ttf";
      expect(resolveKpsFontPath(raw, "release/a/akan")).toBe(
        "release/a/shared/fonts/font.ttf",
      );
    });

    it("ignores empty segments and single dots", () => {
      const raw = ".\\./fonts\\.\\font.ttf";
      expect(resolveKpsFontPath(raw, "release/a/akan")).toBe(
        "release/a/akan/source/fonts/font.ttf",
      );
    });
  });
});

describe("releasePathToVfsKey", () => {
  const KB_PATH = "release/sil/sil_cameroon_qwerty";

  it("maps a keyboard-local asset to the plain source/ address (#2307)", () => {
    expect(releasePathToVfsKey("release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.css", KB_PATH)).toBe(
      "source/sil_cameroon_qwerty.css",
    );
  });

  it("keeps a nested keyboard-local asset's subpath under source/", () => {
    expect(releasePathToVfsKey("release/sil/sil_cameroon_qwerty/source/welcome/kb.css", KB_PATH)).toBe(
      "source/welcome/kb.css",
    );
  });

  it("keeps a shared/ asset release-relative, minus the release/ prefix", () => {
    expect(releasePathToVfsKey("release/shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf", KB_PATH)).toBe(
      "shared/fonts/sil/andika_subsets/AndikaAfr-R.ttf",
    );
  });

  it("does not remap an asset from a DIFFERENT keyboard's tree", () => {
    expect(releasePathToVfsKey("release/sil/other_keyboard/source/other.css", KB_PATH)).toBe(
      "sil/other_keyboard/source/other.css",
    );
  });
});
