import { describe, it, expect, vi } from "vitest";
import { unzipSync } from "fflate";
import { toZip, serializeToZip } from "./zip.js";
import type { VirtualFSEntry, VirtualFS, BaseKeyboard } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { createScaffolderService } from "../scaffolder/index.js";

const dec = new TextDecoder();

// ---------------------------------------------------------------------------
// Fixture VirtualFS
// ---------------------------------------------------------------------------

const FIXTURE_KMN = `c version(10.0)\nstore(&NAME) "Test Keyboard"\nbegin > use(main)\ngroup(main) using keys\n`;
const FIXTURE_KPS = `<?xml version="1.0"?><Package><Info><Name value="Test"/><Version value="1.0"/></Info></Package>`;
const FIXTURE_KMX = new Uint8Array([0x4b, 0x4d, 0x58, 0x00, 0x01, 0x00]); // mock binary
const FIXTURE_README = `# Test Keyboard\n\nA test keyboard.\n`;

function makeFixtureFS(): VirtualFS {
  return createVirtualFS([
    { path: "source/test.kmn", content: FIXTURE_KMN, isBinary: false },
    { path: "source/test.kps", content: FIXTURE_KPS, isBinary: false },
    { path: "build/test.kmx", content: FIXTURE_KMX, isBinary: true },
    { path: "README.md", content: FIXTURE_README, isBinary: false },
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("toZip", () => {
  it("returns a non-empty Uint8Array", async () => {
    const bytes = await toZip(makeFixtureFS());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("produces a valid zip (unzipSync does not throw)", async () => {
    const bytes = await toZip(makeFixtureFS());
    expect(() => unzipSync(bytes)).not.toThrow();
  });

  it("includes all fixture files in the archive", async () => {
    const bytes = await toZip(makeFixtureFS());
    const entries = unzipSync(bytes);
    const paths = Object.keys(entries);

    expect(paths).toContain("source/test.kmn");
    expect(paths).toContain("source/test.kps");
    expect(paths).toContain("build/test.kmx");
    expect(paths).toContain("README.md");
  });

  it("injects NEXT_STEPS.md into the archive", async () => {
    const bytes = await toZip(makeFixtureFS());
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toContain("NEXT_STEPS.md");
  });

  it("NEXT_STEPS.md content references keyboard-studio/keyboards", async () => {
    const bytes = await toZip(makeFixtureFS());
    const entries = unzipSync(bytes);
    const content = dec.decode(entries["NEXT_STEPS.md"]);
    expect(content).toContain("keyboard-studio/keyboards");
  });

  it("preserves text file content exactly", async () => {
    const bytes = await toZip(makeFixtureFS());
    const entries = unzipSync(bytes);

    expect(dec.decode(entries["source/test.kmn"])).toBe(FIXTURE_KMN);
    expect(dec.decode(entries["source/test.kps"])).toBe(FIXTURE_KPS);
    expect(dec.decode(entries["README.md"])).toBe(FIXTURE_README);
  });

  it("preserves binary file content exactly", async () => {
    const bytes = await toZip(makeFixtureFS());
    const entries = unzipSync(bytes);
    expect(entries["build/test.kmx"]).toEqual(FIXTURE_KMX);
  });

  it("includes compiled artifacts (.kmx) in the zip (spec §12)", async () => {
    const fsWithKmx = createVirtualFS([
      { path: "source/x.kmn", content: "c version(10.0)", isBinary: false },
      { path: "build/x.kmx", content: new Uint8Array([1, 2, 3]), isBinary: true },
      { path: "build/x.js", content: "// compiled", isBinary: false },
    ]);
    const bytes = await toZip(fsWithKmx);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toContain("build/x.kmx");
    expect(Object.keys(entries)).toContain("build/x.js");
  });

  it("handles an empty VirtualFS (only NEXT_STEPS.md in output)", async () => {
    const emptyFs = createVirtualFS([]);
    const bytes = await toZip(emptyFs);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(["NEXT_STEPS.md"]);
  });

  it("overrides any existing NEXT_STEPS.md in the VirtualFS", async () => {
    const fs = createVirtualFS([
      { path: "NEXT_STEPS.md", content: "old content", isBinary: false },
    ]);
    const bytes = await toZip(fs);
    const entries = unzipSync(bytes);
    const content = dec.decode(entries["NEXT_STEPS.md"]);
    expect(content).not.toBe("old content");
    expect(content).toContain("keyboard-studio/keyboards");
  });
});

// ---------------------------------------------------------------------------
// Zip-slip / path-traversal hardening
//
// A sibling-store path lifted out of a malicious/adapted .kmn header (e.g.
// `store(&DISPLAYMAP) '..\..\..\evil'`) reaches the VFS as a key that, if
// written verbatim as a zip entry name, escapes the extraction directory on a
// naive extractor. toZip must clamp every entry to the archive root while
// leaving ordinary clean keys byte-identical.
// ---------------------------------------------------------------------------

describe("toZip — path-traversal (zip-slip) hardening", () => {
  it("clamps a `..`-traversing entry so it cannot escape the archive root", async () => {
    const fs = createVirtualFS([
      { path: "source/../../../evil.txt", content: "pwn", isBinary: false },
    ]);
    const entries = unzipSync(await toZip(fs));
    const paths = Object.keys(entries);
    // No entry may contain a parent-dir segment or be absolute.
    for (const p of paths) {
      expect(p.split(/[\\/]/)).not.toContain("..");
      expect(p.startsWith("/")).toBe(false);
    }
    // The content still lands, clamped into the root.
    expect(paths).toContain("evil.txt");
    expect(dec.decode(entries["evil.txt"])).toBe("pwn");
  });

  it("strips a leading slash and a Windows drive prefix", async () => {
    const fs = createVirtualFS([
      { path: "/etc/passwd", content: "a", isBinary: false },
      { path: "C:\\Windows\\system32\\evil.dll", content: "b", isBinary: true },
    ]);
    const paths = Object.keys(unzipSync(await toZip(fs)));
    expect(paths).toContain("etc/passwd");
    expect(paths).toContain("Windows/system32/evil.dll");
    expect(paths.some((p) => p.startsWith("/") || /^[A-Za-z]:/.test(p))).toBe(false);
  });

  it("leaves ordinary clean keys byte-identical (no-op for the common case)", async () => {
    const bytes = await toZip(makeFixtureFS());
    const paths = Object.keys(unzipSync(bytes));
    expect(paths).toContain("source/test.kmn");
    expect(paths).toContain("build/test.kmx");
    expect(paths).toContain("README.md");
  });
});

describe("serializeToZip", () => {
  it("is an alias for toZip producing identical output", async () => {
    const fs = makeFixtureFS();
    // Build two VirtualFS instances with the same contents
    const fsA = makeFixtureFS();
    const fsB = makeFixtureFS();
    const a = await toZip(fsA);
    const b = await serializeToZip(fsB);
    // Compare unzipped keys (zip byte-for-byte may differ due to timestamps)
    expect(Object.keys(unzipSync(a)).sort()).toEqual(
      Object.keys(unzipSync(b)).sort()
    );
    void fs; // suppress unused variable
  });
});

// ---------------------------------------------------------------------------
// Sidecar (.kmn.imported) inclusion — spec §12 lines 1126-1128
// Sidecars must appear in the zip so the user's local working blob contains
// the original for diff; publishPR excludes them from the commit tree separately.
// ---------------------------------------------------------------------------

describe("toZip — sidecar (.kmn.imported) files", () => {
  it("includes a .kmn.imported entry in the zip archive", async () => {
    const fs = createVirtualFS([
      { path: "source/cm_qwerty.kmn", content: "c emitted\n", isBinary: false },
      { path: "source/cm_qwerty.kmn.imported", content: "c original\n", isBinary: false },
    ]);
    const bytes = await toZip(fs);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toContain("source/cm_qwerty.kmn.imported");
  });

  it("preserves the exact content of a .kmn.imported entry", async () => {
    const originalContent = "c version(10.0)\nstore(&NAME) \"CM Qwerty\"\n";
    const fs = createVirtualFS([
      { path: "source/cm_qwerty.kmn.imported", content: originalContent, isBinary: false },
    ]);
    const bytes = await toZip(fs);
    const entries = unzipSync(bytes);
    expect(dec.decode(entries["source/cm_qwerty.kmn.imported"])).toBe(originalContent);
  });

  it("includes both the emitted .kmn and the .kmn.imported sidecar", async () => {
    const fs = createVirtualFS([
      { path: "source/test_kb.kmn", content: "c emitted\n", isBinary: false },
      { path: "source/test_kb.kmn.imported", content: "c original\n", isBinary: false },
    ]);
    const bytes = await toZip(fs);
    const entries = unzipSync(bytes);
    const paths = Object.keys(entries);
    expect(paths).toContain("source/test_kb.kmn");
    expect(paths).toContain("source/test_kb.kmn.imported");
  });
});

// ---------------------------------------------------------------------------
// toZip round-trip: scaffolded VFS (issue #32)
//
// Asserts the three properties the task requires for a scaffold-produced VFS:
//   1. The result starts with the ZIP local-file-header magic bytes PK\x03\x04.
//   2. Every entry that comes from the scaffolder is rooted under "source/",
//      "build/", "tests/", or at the keyboard root — i.e. none are at an
//      unexpected path.
//   3. NEXT_STEPS.md is present (already covered generically above, but
//      re-asserted here in the scaffolded-VFS context for traceability).
//
// Uses the same fetch-mock approach as scaffolder.test.ts.
// ---------------------------------------------------------------------------

const SCAFFOLD_KMN = `store(&NAME) 'Zip Test Base'
store(&VERSION) '14.0'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
`;

const ZIP_TEST_BASE: BaseKeyboard = {
  id: "zip_test_base",
  path: "release/z/zip_test_base",
  script: "Latn",
  targets: ["web"],
  displayName: "Zip Test Base",
  version: "14.0",
};

function makeScaffoldedVFS(opts?: import("@keyboard-studio/contracts").ScaffoldOptions): Promise<VirtualFS> {
  const mockFetch = vi.fn().mockImplementation((url: string) => {
    if ((url as string).includes(".kmn")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => SCAFFOLD_KMN,
        arrayBuffer: async () => new TextEncoder().encode(SCAFFOLD_KMN).buffer,
        json: async () => ({}),
        headers: new Headers(),
        redirected: false,
        statusText: "OK",
        type: "basic" as ResponseType,
        url: "",
        clone: function () { return this as unknown as Response; },
        body: null,
        bodyUsed: false,
        blob: async () => new Blob([SCAFFOLD_KMN]),
        formData: async () => new FormData(),
        bytes: async () => new TextEncoder().encode(SCAFFOLD_KMN),
      } as unknown as Response);
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      text: async () => "Not Found",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);
  });

  const service = createScaffolderService({ fetchImpl: mockFetch as typeof fetch });
  return service.scaffold(ZIP_TEST_BASE, "zip_test_kb", "Zip Test Keyboard", opts)
    .then((r) => r.vfs);
}

describe("toZip — scaffolded VFS round-trip (issue #32)", () => {
  it("result is a non-empty Uint8Array starting with ZIP magic bytes PK\\x03\\x04", async () => {
    const vfs = await makeScaffoldedVFS();
    const bytes = await toZip(vfs);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    // Local file header signature: 0x50 0x4B 0x03 0x04
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  it("archive entries from scaffolded VFS are source/-rooted or at keyboard root", async () => {
    const vfs = await makeScaffoldedVFS();
    const bytes = await toZip(vfs);
    const entries = unzipSync(bytes);
    const paths = Object.keys(entries);

    // Every path must start with one of the known top-level prefixes or be a
    // root-level file (no directory separator). This catches any scaffolder
    // path leak that would place files at an unexpected location.
    const ALLOWED_PREFIXES = ["source/", "build/", "tests/", "NEXT_STEPS.md"];
    const ROOT_FILES = /^[^/]+$/; // no slash → root-level file

    for (const p of paths) {
      const isAllowed =
        ALLOWED_PREFIXES.some((pfx) => p.startsWith(pfx)) ||
        ROOT_FILES.test(p);
      expect(isAllowed, `unexpected archive path: ${p}`).toBe(true);
    }
  });

  it("NEXT_STEPS.md is present in the scaffolded-VFS archive", async () => {
    const vfs = await makeScaffoldedVFS();
    const bytes = await toZip(vfs);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toContain("NEXT_STEPS.md");
  });

  it("source/<keyboardId>.kmn is present in the scaffolded-VFS archive", async () => {
    const vfs = await makeScaffoldedVFS();
    const bytes = await toZip(vfs);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toContain("source/zip_test_kb.kmn");
  });

  // VirtualFSEntry type used here to verify entry shape from VFS before zipping.
  it("every VirtualFSEntry in the scaffolded VFS survives the zip round-trip", async () => {
    const vfs = await makeScaffoldedVFS();
    const vfsEntries: VirtualFSEntry[] = vfs.entries();
    const bytes = await toZip(vfs);
    const zipEntries = unzipSync(bytes);
    const zipPaths = new Set(Object.keys(zipEntries));

    for (const entry of vfsEntries) {
      expect(
        zipPaths.has(entry.path),
        `VFS entry "${entry.path}" missing from zip`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// T027 / SC-002 — the DELIVERED zip carries the confirmed attribution
//
// Asserted on real zip bytes read back with unzipSync, rather than in a browser:
// the claim being verified is "the file the author downloads names the right
// rights holder", and that is decided by scaffold -> toZip, not by the UI.
// ---------------------------------------------------------------------------

describe("attribution reaches the delivered zip (spec 064 T027)", () => {
  const ATTRIBUTION = {
    authorName: "Alice Example",
    authorEmail: "alice@example.org",
    copyrightHolder: "Bafut Language Committee",
  };

  async function zipFiles(opts?: import("@keyboard-studio/contracts").ScaffoldOptions) {
    const vfs = await makeScaffoldedVFS(opts);
    const entries = unzipSync(await toZip(vfs));
    const read = (suffix: string): string => {
      const key = Object.keys(entries).find((k) => k.endsWith(suffix));
      if (key === undefined) throw new Error(`no zip entry ending in ${suffix}`);
      return dec.decode(entries[key]!);
    };
    return { paths: Object.keys(entries), read };
  }

  it("LICENSE.md in the zip names the confirmed copyright holder", async () => {
    const { read } = await zipFiles({ attribution: ATTRIBUTION, emitYear: 2026 });
    expect(read("LICENSE.md")).toContain("Copyright © 2026 Bafut Language Committee");
  });

  it("LICENSE.md in the zip carries the full MIT body", async () => {
    const { read } = await zipFiles({ attribution: ATTRIBUTION, emitYear: 2026 });
    expect(read("LICENSE.md")).toContain("Permission is hereby granted, free of charge");
  });

  // SC-001: the bug this feature exists to remove.
  it("never names the keyboard's own display name as the holder", async () => {
    const { read } = await zipFiles({ attribution: ATTRIBUTION, emitYear: 2026 });
    const license = read("LICENSE.md");
    expect(license).not.toContain("Zip Test Keyboard");
    expect(license).not.toMatch(/Copyright © \d{4} Zip Test/);
  });

  // SC-003: one source of truth on the HOLDER — the .kmn/.kps mirrors omit
  // the year (criterion 4.6/#1545); LICENSE.md alone carries it.
  it("the .kmn COPYRIGHT store agrees with LICENSE.md's holder", async () => {
    const { read } = await zipFiles({ attribution: ATTRIBUTION, emitYear: 2026 });
    expect(read("LICENSE.md")).toContain("Copyright © 2026 Bafut Language Committee");
    expect(read(".kmn")).toContain("store(&COPYRIGHT) 'Copyright © Bafut Language Committee'");
  });

  it("the .kps carries the same holder plus the author with a mailto", async () => {
    const { read } = await zipFiles({ attribution: ATTRIBUTION, emitYear: 2026 });
    const kps = read(".kps");
    expect(kps).toContain("Copyright © Bafut Language Committee");
    expect(kps).toContain('<Author URL="mailto:alice@example.org">Alice Example</Author>');
  });

  // With no attribution the zip still builds, but states no holder at all — the
  // UI gate (usePreviewArtifact/OutputScreen) is what stops it being downloaded.
  it("invents no holder when attribution is absent", async () => {
    const { read } = await zipFiles({ emitYear: 2026 });
    const license = read("LICENSE.md");
    expect(license).not.toMatch(/^Copyright/m);
    expect(license).toContain("Permission is hereby granted, free of charge");
  });
});
