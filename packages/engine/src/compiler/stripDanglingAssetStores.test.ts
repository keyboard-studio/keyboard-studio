import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile } from "./index.js";
import { stripDanglingAssetStores } from "./stripDanglingAssetStores.js";

// A base header that references three packaging-asset siblings, like basic_kbdus.
const BASE = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'US Basic'",
  "store(&VISUALKEYBOARD) 'basic_kbdus.kvks'",
  "store(&BITMAP) 'basic_kbdus.ico'",
  "store(&LAYOUTFILE) 'basic_kbdus.keyman-touch-layout'",
  "store(&TARGETS) 'any'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "",
].join("\n");

describe("stripDanglingAssetStores", () => {
  it("removes asset-store lines whose target file is absent from the VFS", () => {
    const vfs = createVirtualFS([
      { path: "source/x.kmn", content: BASE, isBinary: false },
    ]);
    const { kmn, stripped } = stripDanglingAssetStores(BASE, vfs);
    expect(stripped.sort()).toEqual(["BITMAP", "LAYOUTFILE", "VISUALKEYBOARD"]);
    expect(kmn).not.toMatch(/&BITMAP/);
    expect(kmn).not.toMatch(/&VISUALKEYBOARD/);
    expect(kmn).not.toMatch(/&LAYOUTFILE/);
    // Non-asset stores and rules are preserved.
    expect(kmn).toMatch(/&NAME/);
    expect(kmn).toMatch(/\+ \[K_A\] > 'a'/);
  });

  it("keeps an asset-store line when its target IS present in the VFS", () => {
    const vfs = createVirtualFS([
      { path: "source/x.kmn", content: BASE, isBinary: false },
      { path: "source/basic_kbdus.kvks", content: "<keyboard/>", isBinary: false },
    ]);
    const { kmn, stripped } = stripDanglingAssetStores(BASE, vfs);
    // .kvks present -> kept; .ico and touch-layout absent -> stripped.
    expect(stripped.sort()).toEqual(["BITMAP", "LAYOUTFILE"]);
    expect(kmn).toMatch(/&VISUALKEYBOARD/);
  });

  it("returns input unchanged when there are no dangling asset stores", () => {
    const noAssets = "store(&NAME) 'X'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n";
    const vfs = createVirtualFS([{ path: "source/x.kmn", content: noAssets, isBinary: false }]);
    const { kmn, stripped } = stripDanglingAssetStores(noAssets, vfs);
    expect(stripped).toEqual([]);
    expect(kmn).toBe(noAssets);
  });

  it("strips double-quoted dangling asset-store lines", () => {
    const doubleQuoted = [
      "store(&VERSION) '10.0'",
      'store(&BITMAP) "basic_kbdus.ico"',
      'store(&VISUALKEYBOARD) "basic_kbdus.kvks"',
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_A] > 'a'",
      "",
    ].join("\n");
    const vfs = createVirtualFS([
      { path: "source/x.kmn", content: doubleQuoted, isBinary: false },
    ]);
    const { kmn, stripped } = stripDanglingAssetStores(doubleQuoted, vfs);
    expect(stripped.sort()).toEqual(["BITMAP", "VISUALKEYBOARD"]);
    expect(kmn).not.toMatch(/&BITMAP/);
    expect(kmn).not.toMatch(/&VISUALKEYBOARD/);
    expect(kmn).toMatch(/\+ \[K_A\] > 'a'/);
  });

  it("a base with dangling assets compiles to artifacts AFTER stripping (regression for empty-artifact preview)", async () => {
    const vfs = createVirtualFS([
      { path: "source/x.kmn", content: BASE, isBinary: false },
    ]);
    // Before: dangling references => zero artifacts.
    const before = await compile(vfs, "x");
    expect(before.artifacts.length).toBe(0);

    // After: strip dangling refs, recompile => artifacts present.
    const { kmn } = stripDanglingAssetStores(BASE, vfs);
    vfs.set("source/x.kmn", kmn);
    const after = await compile(vfs, "x");
    expect(after.artifacts.length).toBeGreaterThan(0);
  }, 30_000);
});
