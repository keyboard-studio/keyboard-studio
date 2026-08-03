/**
 * Unit tests for the FR-004 permitted-path authority (submit-paths.ts).
 *
 * Covers the nine ordered rules in data-model.md Section 2 -- every rejection
 * category, the accept corpus (the scaffolder's real §12 output paths, not
 * invented names), the derivation + prefixing helpers, the FR-005 whole-list
 * rejection rule, and the FR-015/US2 AC4 no-path-echoed guarantee.
 */

import { describe, it, expect } from "vitest";
import {
  validatePackagePaths,
  deriveKeyboardPrefix,
  applyKeyboardPrefix,
  type PathRejectionCategory,
} from "./submit-paths.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * The scaffolder's real §12 output set for keyboardId "my_keyboard" (see
 * packages/engine/src/scaffolder/scaffolder.test.ts's "generates all required
 * §12 paths" case) -- package-relative, i.e. as they exist before
 * applyKeyboardPrefix, matching what submitManagedPR validates.
 */
const SCAFFOLDER_ACCEPT_PATHS = [
  "source/my_keyboard.kmn",
  "source/my_keyboard.kps",
  "source/my_keyboard.kvks",
  "source/my_keyboard.keyman-touch-layout",
  "source/my_keyboard.ico",
  "source/welcome.htm",
  "source/readme.htm",
  "source/help/my_keyboard.php",
  "LICENSE.md",
  "HISTORY.md",
  "README.md",
  "tests/my_keyboard_tests.kmn",
];

// ---------------------------------------------------------------------------
// Rejections -- one case per corpus row in the T018 spec, exact category
// ---------------------------------------------------------------------------

describe("validatePackagePaths() -- rejections", () => {
  const cases: Array<{ name: string; path: string; category: PathRejectionCategory }> = [
    { name: "leading slash", path: "/etc/passwd", category: "absolute" },
    {
      name: "Windows drive first segment",
      path: "C:/Windows/system32/x.kmn",
      category: "absolute",
    },
    { name: "leading traversal segment", path: "../etc/passwd", category: "traversal" },
    {
      name: "interior traversal segment",
      path: "source/../../x",
      category: "traversal",
    },
    { name: "metadata first segment: release", path: "release/evil.kmn", category: "metadata" },
    { name: "metadata first segment: .github", path: ".github/workflows/x.yml", category: "metadata" },
    { name: "metadata first segment: .git", path: ".git/config", category: "metadata" },
    { name: "empty path", path: "", category: "malformed" },
    { name: "whitespace-only path", path: "   ", category: "malformed" },
    {
      name: "backslash separator",
      path: "source\\my_keyboard.kmn",
      category: "malformed",
    },
    { name: "double slash (empty interior segment)", path: "source//my_keyboard.kmn", category: "malformed" },
    { name: "trailing slash (empty final segment)", path: "source/", category: "malformed" },
    { name: "dot segment", path: "source/./my_keyboard.kmn", category: "malformed" },
  ];

  it.each(cases)("$name -> $category", ({ path, category }) => {
    const result = validatePackagePaths([path]);
    expect(result).toEqual({ ok: false, category });
  });

  it("a path within the un-prefixed 512 limit but over the limit once prefixed is malformed", () => {
    const prefixLength = deriveKeyboardPrefix("my_keyboard").length; // "release/m/my_keyboard/".length
    const prefix = "source/";
    const suffix = ".kmn";
    // Build a path whose length, once the prefix is added back, lands exactly
    // on the 512 ceiling -- states the intent from prefixLength rather than a
    // hardcoded magic-number path.
    const fillerLength = 512 - prefixLength - prefix.length - suffix.length;
    const atLimit = `${prefix}${"a".repeat(fillerLength)}${suffix}`;
    expect(atLimit.length + prefixLength).toBe(512);
    expect(validatePackagePaths([atLimit], prefixLength)).toEqual({ ok: true });

    const overLimit = `${prefix}${"a".repeat(fillerLength + 1)}${suffix}`;
    expect(overLimit.length + prefixLength).toBe(513);
    expect(validatePackagePaths([overLimit], prefixLength)).toEqual({
      ok: false,
      category: "malformed",
    });
  });
});

// ---------------------------------------------------------------------------
// Accepts -- the scaffolder's real output set
// ---------------------------------------------------------------------------

describe("validatePackagePaths() -- accepts", () => {
  it.each(SCAFFOLDER_ACCEPT_PATHS)("accepts the scaffolder's own output path %s", (path) => {
    expect(validatePackagePaths([path])).toEqual({ ok: true });
  });

  it("accepts the whole scaffolder output set as a single submission", () => {
    expect(validatePackagePaths(SCAFFOLDER_ACCEPT_PATHS)).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// deriveKeyboardPrefix()
// ---------------------------------------------------------------------------

describe("deriveKeyboardPrefix()", () => {
  it("derives release/<firstLetter>/<keyboardId>/", () => {
    expect(deriveKeyboardPrefix("my_keyboard")).toBe("release/m/my_keyboard/");
  });

  it("uses the keyboardId's own first character even for a single-char id", () => {
    expect(deriveKeyboardPrefix("x")).toBe("release/x/x/");
  });

  const invalidIds = [
    { name: "uppercase letters", id: "MyKeyboard" },
    { name: "hyphen", id: "my-keyboard" },
    { name: "empty string", id: "" },
    { name: "over the 80-char length bound", id: "a".repeat(81) },
  ];

  it.each(invalidIds)("throws on a keyboardId with $name", ({ id }) => {
    expect(() => deriveKeyboardPrefix(id)).toThrow();
  });

  it("throws rather than returning a PathCheckResult for an invalid keyboardId", () => {
    // The distinction is deliberate (see submit-paths.ts docblock): an invalid
    // keyboardId reaching this function is a programming error, not a
    // user-facing rejection, so it must never surface as { ok: false, ... }.
    let thrown: unknown;
    try {
      deriveKeyboardPrefix("Not Valid");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// applyKeyboardPrefix()
// ---------------------------------------------------------------------------

describe("applyKeyboardPrefix()", () => {
  it("prefixes every path in the list with the derived prefix", () => {
    const result = applyKeyboardPrefix("my_keyboard", [
      "source/my_keyboard.kmn",
      "README.md",
    ]);
    expect(result).toEqual([
      "release/m/my_keyboard/source/my_keyboard.kmn",
      "release/m/my_keyboard/README.md",
    ]);
  });

  it("prefixes the full scaffolder output set", () => {
    const result = applyKeyboardPrefix("my_keyboard", SCAFFOLDER_ACCEPT_PATHS);
    expect(result).toHaveLength(SCAFFOLDER_ACCEPT_PATHS.length);
    for (const path of result) {
      expect(path.startsWith("release/m/my_keyboard/")).toBe(true);
    }
  });

  it("throws for an invalid keyboardId rather than silently prefixing", () => {
    expect(() => applyKeyboardPrefix("Invalid-Id", ["README.md"])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// FR-005: whole-list rejection -- no partial acceptance
// ---------------------------------------------------------------------------

describe("validatePackagePaths() -- whole-list rejection (FR-005)", () => {
  it("rejects the entire list when only the last entry is bad", () => {
    const result = validatePackagePaths([
      "source/my_keyboard.kmn",
      "source/my_keyboard.kps",
      "README.md",
      "../escape.txt",
    ]);
    expect(result).toEqual({ ok: false, category: "traversal" });
  });

  it("rejects on the first bad entry found, in list order, even with more good entries after it", () => {
    const result = validatePackagePaths([
      "source/my_keyboard.kmn",
      "/etc/passwd",
      "README.md",
    ]);
    expect(result).toEqual({ ok: false, category: "absolute" });
  });
});

// ---------------------------------------------------------------------------
// FR-015 / US2 AC4: the offending path is never echoed
// ---------------------------------------------------------------------------

describe("validatePackagePaths() -- no path echoed (US2 AC4 / FR-015)", () => {
  it("a failure result carries only `ok` and `category`, never the path", () => {
    const secretLookingPath = "/etc/shadow-secret-value-should-not-leak";
    const result = validatePackagePaths([secretLookingPath]);
    expect(result.ok).toBe(false);
    expect(Object.keys(result).sort()).toEqual(["category", "ok"]);
    expect(JSON.stringify(result)).not.toContain(secretLookingPath);
  });
});
