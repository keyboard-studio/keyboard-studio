// Path semantics for the .kmp bridge. This is the whole risk of the feature:
// if `.kps` member references do not land on the right VirtualFS keys, every
// package build fails with an inscrutable "file does not exist".
//
// The cases below are taken from a REAL descriptor —
// c:\dev\keyboards\release\b\bambara\source\bambara.kps — whose <Files> list
// references ..\build\bambara.kmx, ..\build\bambara.js, ..\build\bambara.kvk,
// welcome.htm, readme.htm, and ..\LICENSE.md.

import { describe, it, expect } from "vitest";
import {
  isAbsolute,
  relative,
  resolve,
  resolveFilename,
  kmpPathCallbacks,
} from "./kmpPaths.js";

const KPS = "source/bambara.kps";

describe("resolveFilename — .kps member reference to VirtualFS key", () => {
  it("resolves ..\\build\\<id>.kmx up out of source/ (the case the whole feature rests on)", () => {
    expect(resolveFilename(KPS, "..\\build\\bambara.kmx")).toBe("build/bambara.kmx");
    expect(resolveFilename(KPS, "..\\build\\bambara.js")).toBe("build/bambara.js");
    expect(resolveFilename(KPS, "..\\build\\bambara.kvk")).toBe("build/bambara.kvk");
  });

  it("resolves a sibling doc file relative to the .kps directory", () => {
    expect(resolveFilename(KPS, "welcome.htm")).toBe("source/welcome.htm");
    expect(resolveFilename(KPS, "readme.htm")).toBe("source/readme.htm");
  });

  it("resolves ..\\LICENSE.md to the repo root", () => {
    expect(resolveFilename(KPS, "..\\LICENSE.md")).toBe("LICENSE.md");
  });

  it("resolves a nested subdirectory reference", () => {
    expect(resolveFilename(KPS, "help\\bambara.php")).toBe("source/help/bambara.php");
  });

  it("handles a .kps sitting at the VFS root (dirname === '')", () => {
    expect(resolveFilename("bambara.kps", "source/welcome.htm")).toBe("source/welcome.htm");
    expect(resolveFilename("bambara.kps", "welcome.htm")).toBe("welcome.htm");
  });

  it("handles mixed separators in one reference", () => {
    expect(resolveFilename("source/x.kps", "..\\build/x.kmx")).toBe("build/x.kmx");
    expect(resolveFilename("source\\x.kps", "..\\build\\x.kmx")).toBe("build/x.kmx");
  });

  it("returns a genuinely absolute reference unchanged, so it misses loudly", () => {
    // Not silently reinterpreted as relative to source/. kmc-package separately
    // warns on these via path.isAbsolute (Warn_AbsolutePath).
    expect(resolveFilename(KPS, "/etc/passwd")).toBe("/etc/passwd");
    expect(resolveFilename(KPS, "C:\\Windows\\x.dll")).toBe("C:/Windows/x.dll");
  });

  it("clamps over-popping traversal to a key a rootless VFS cannot hold", () => {
    // The clamp is the traversal safety net: the result cannot collide with a
    // real key, so the lookup misses and the build reports a missing member
    // rather than reaching outside the working copy.
    expect(resolveFilename(KPS, "..\\..\\..\\etc\\passwd")).toBe("etc/passwd");
  });

  it("falls back to the base filename when the reference is empty", () => {
    expect(resolveFilename(KPS, "")).toBe("source/bambara.kps");
  });

  it("REGRESSION GUARD: must NOT be unified with compiler/index.ts's resolveFilename", async () => {
    // The kmn bridge's version short-circuits on any separator and hands back
    // the reference verbatim. That is why this module exists. If someone
    // "consolidates" the two, this test fails and explains why.
    const kmnBridgeResolveFilename = (baseFilename: string, filename: string): string => {
      if (/^[/\\]/.test(filename) || /[/\\]/.test(filename)) return filename;
      const base = baseFilename.replace(/[/\\][^/\\]*$/, "");
      return base === "" ? filename : `${base}/${filename}`;
    };
    expect(kmnBridgeResolveFilename(KPS, "..\\build\\bambara.kmx")).toBe(
      "..\\build\\bambara.kmx",
    );
    expect(resolveFilename(KPS, "..\\build\\bambara.kmx")).toBe("build/bambara.kmx");
  });
});

describe("isAbsolute", () => {
  it("is false for every form the VirtualFS can hold", () => {
    for (const p of ["source/x.kps", "..\\build\\x.kmx", "x", "build/x.kmx", ""]) {
      expect(isAbsolute(p)).toBe(false);
    }
  });

  it("is true for root-anchored, UNC, and drive-spec paths", () => {
    for (const p of ["/x", "//host/share/x", "C:/x", "C:\\x", "z:\\x"]) {
      expect(isAbsolute(p)).toBe(true);
    }
  });
});

describe("relative — leading .. is PRESERVED (unlike normalize)", () => {
  it("walks up out of a sibling directory", () => {
    expect(relative("source", "build/x.kmx")).toBe("../build/x.kmx");
  });

  it("descends without a .. when the target is below", () => {
    expect(relative("source", "source/welcome.htm")).toBe("welcome.htm");
  });

  it("returns empty for identical paths", () => {
    expect(relative("a/b", "a/b")).toBe("");
  });
});

describe("resolve — rootless, not absolute", () => {
  it("resolves .. against a preceding segment and stays rootless", () => {
    expect(resolve("source", "../build/x.kmx")).toBe("build/x.kmx");
  });

  it("lets the right-most absolute argument win, Node-style", () => {
    expect(resolve("source", "/abs/x")).toBe("/abs/x");
  });

  it("ignores empty arguments", () => {
    expect(resolve("", "source", "", "x")).toBe("source/x");
  });
});

describe("kmpPathCallbacks — the surface handed to kmc-package", () => {
  it("provides every member CompilerPathCallbacks declares", () => {
    for (const k of [
      "dirname",
      "extname",
      "basename",
      "join",
      "normalize",
      "isAbsolute",
      "relative",
      "resolve",
    ]) {
      expect(typeof (kmpPathCallbacks as Record<string, unknown>)[k]).toBe("function");
    }
  });

  it("basename strips a directory and an optional extension (kmc-package's most-used call)", () => {
    expect(kmpPathCallbacks.basename("build/bambara.kmx")).toBe("bambara.kmx");
    expect(kmpPathCallbacks.basename("build/bambara.kvk", ".kvk")).toBe("bambara");
  });

  it("extname reports the member type package-validation keys on", () => {
    expect(kmpPathCallbacks.extname("build/bambara.kmx")).toBe(".kmx");
    expect(kmpPathCallbacks.extname("source/welcome.htm")).toBe(".htm");
  });

  it("join does NOT normalize — the lookup helpers must normalize their own keys", () => {
    // Pinned deliberately: kmp.ts's VFS lookups normalize incoming keys because
    // of exactly this. Do not "fix" join to make that redundant.
    expect(kmpPathCallbacks.join("source", "..", "x")).toBe("source/../x");
    expect(kmpPathCallbacks.normalize("source/../x")).toBe("x");
  });
});
