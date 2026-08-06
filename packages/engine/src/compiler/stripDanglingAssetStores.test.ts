import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { compile } from "./index.js";
import {
  stripDanglingAssetStores,
  dropUnbackedBitmapStore,
} from "./stripDanglingAssetStores.js";

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

  it("always strips KMW_HELPFILE and KMW_EMBEDJS even when their files are present in the VFS", () => {
    const withHelp = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'Arabic Izza'",
      "store(&KMW_HELPFILE) 'arabic_izza.htm'",
      "store(&KMW_EMBEDJS) 'arabic_izza.js'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_A] > 'a'",
      "",
    ].join("\n");
    const vfs = createVirtualFS([
      { path: "source/x.kmn", content: withHelp, isBinary: false },
      // Both help files ARE present in VFS — should still be stripped.
      { path: "source/arabic_izza.htm", content: "<html/>", isBinary: false },
      { path: "source/arabic_izza.js", content: "// embed", isBinary: false },
    ]);
    const { kmn, stripped } = stripDanglingAssetStores(withHelp, vfs);
    expect(stripped.sort()).toEqual(["KMW_EMBEDJS", "KMW_HELPFILE"]);
    expect(kmn).not.toMatch(/&KMW_HELPFILE/);
    expect(kmn).not.toMatch(/&KMW_EMBEDJS/);
    expect(kmn).toMatch(/&NAME/);
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

// ---------------------------------------------------------------------------
// dropUnbackedBitmapStore — the icon removal that applies to the SHIPPED .kmn.
//
// Pinned against the real kmcmplib WASM: an &BITMAP reference with no readable
// icon behind it does not degrade the build, it empties it. kmcmplib reports
// "Cannot open the bitmap or icon file for reading" at *warning* severity and
// then emits no .kmx, no .kvk and no .js at all — a silent build failure, which
// is why the reference is dropped from the author's source rather than only from
// the preview compile.
// ---------------------------------------------------------------------------

const WITH_BITMAP = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Icon Probe'",
  "store(&BITMAP) 'probe.ico'",
  "store(&TARGETS) 'any'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "",
].join("\n");

describe("dropUnbackedBitmapStore", () => {
  it("drops &BITMAP when its icon is absent from the VFS", () => {
    const vfs = createVirtualFS([
      { path: "source/probe.kmn", content: WITH_BITMAP, isBinary: false },
    ]);
    const { kmn, dropped } = dropUnbackedBitmapStore(WITH_BITMAP, vfs);
    expect(dropped).toBe("probe.ico");
    expect(kmn).not.toMatch(/&BITMAP/);
    // Everything else survives.
    expect(kmn).toContain("store(&NAME) 'Icon Probe'");
    expect(kmn).toContain("+ [K_A] > 'a'");
  });

  it("keeps &BITMAP when the icon is present", () => {
    const vfs = createVirtualFS([
      { path: "source/probe.kmn", content: WITH_BITMAP, isBinary: false },
      { path: "source/probe.ico", content: new Uint8Array([0, 0, 1, 0]), isBinary: true },
    ]);
    const { kmn, dropped } = dropUnbackedBitmapStore(WITH_BITMAP, vfs);
    expect(dropped).toBeNull();
    expect(kmn).toBe(WITH_BITMAP);
  });

  it("is a no-op on a .kmn with no &BITMAP", () => {
    const kmnNoIcon = WITH_BITMAP.replace("store(&BITMAP) 'probe.ico'\n", "");
    const vfs = createVirtualFS([
      { path: "source/probe.kmn", content: kmnNoIcon, isBinary: false },
    ]);
    const { kmn, dropped } = dropUnbackedBitmapStore(kmnNoIcon, vfs);
    expect(dropped).toBeNull();
    expect(kmn).toBe(kmnNoIcon);
  });

  it("leaves the other asset stores alone — only the icon is cosmetic", () => {
    const vfs = createVirtualFS([
      { path: "source/x.kmn", content: BASE, isBinary: false },
    ]);
    const { kmn } = dropUnbackedBitmapStore(BASE, vfs);
    expect(kmn).not.toMatch(/&BITMAP/);
    expect(kmn).toMatch(/&VISUALKEYBOARD/);
    expect(kmn).toMatch(/&LAYOUTFILE/);
  });

  it("turns a zero-artifact compile into a real build (oracle-pinned)", async () => {
    const vfs = createVirtualFS([
      { path: "source/probe.kmn", content: WITH_BITMAP, isBinary: false },
    ]);

    // Before: kmcmplib emits NOTHING, and says so only as a warning.
    const before = await compile(vfs, "probe");
    expect(before.artifacts).toEqual([]);
    expect(before.diagnostics.some((d) => /bitmap or icon/i.test(d.message))).toBe(true);
    expect(before.diagnostics.every((d) => d.severity !== "error" && d.severity !== "fatal")).toBe(
      true,
    );

    // After: artifacts.
    const { kmn } = dropUnbackedBitmapStore(WITH_BITMAP, vfs);
    vfs.set("source/probe.kmn", kmn);
    const after = await compile(vfs, "probe");
    expect(after.artifacts.length).toBeGreaterThan(0);
    expect(after.success).toBe(true);
  }, 30_000);

  it("a ZERO-BYTE icon is as fatal as a missing one (why no empty stub is scaffolded)", async () => {
    const vfs = createVirtualFS([
      { path: "source/probe.kmn", content: WITH_BITMAP, isBinary: false },
      { path: "source/probe.ico", content: new Uint8Array(0), isBinary: true },
    ]);

    const result = await compile(vfs, "probe");
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics.some((d) => /bitmap or icon/i.test(d.message))).toBe(true);

    // ...and the file being *present* is exactly why the preview's dangling-store
    // strip could not rescue it: there is nothing dangling to detect.
    const { stripped } = stripDanglingAssetStores(WITH_BITMAP, vfs);
    expect(stripped).not.toContain("BITMAP");
  }, 30_000);
});
