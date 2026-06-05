import { describe, it, expect } from "vitest";
import { unzipSync } from "fflate";
import { toZip, serializeToZip } from "./zip.js";
import type { VirtualFS, VirtualFSEntry } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Minimal in-memory VirtualFS for tests — no external dependency needed
// ---------------------------------------------------------------------------

function makeVirtualFS(entries: VirtualFSEntry[]): VirtualFS {
  const store = new Map<string, VirtualFSEntry>(entries.map((e) => [e.path, e]));
  return {
    get: (path) => store.get(path),
    set: (path, content, isBinary = false) => {
      const prev = store.get(path);
      store.set(path, { path, content, isBinary });
      return prev;
    },
    delete: (path) => store.delete(path),
    list: (prefix) =>
      [...store.keys()].filter((p) => prefix === undefined || p.startsWith(prefix)),
    entries: (prefix) =>
      [...store.values()].filter(
        (e) => prefix === undefined || e.path.startsWith(prefix)
      ),
  };
}

const dec = new TextDecoder();

// ---------------------------------------------------------------------------
// Fixture VirtualFS
// ---------------------------------------------------------------------------

const FIXTURE_KMN = `c version(10.0)\nstore(&NAME) "Test Keyboard"\nbegin > use(main)\ngroup(main) using keys\n`;
const FIXTURE_KPS = `<?xml version="1.0"?><Package><Info><Name value="Test"/><Version value="1.0"/></Info></Package>`;
const FIXTURE_KMX = new Uint8Array([0x4b, 0x4d, 0x58, 0x00, 0x01, 0x00]); // mock binary
const FIXTURE_README = `# Test Keyboard\n\nA test keyboard.\n`;

function makeFixtureFS(): VirtualFS {
  return makeVirtualFS([
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

  it("NEXT_STEPS.md content references keymanapp/keyboards", async () => {
    const bytes = await toZip(makeFixtureFS());
    const entries = unzipSync(bytes);
    const content = dec.decode(entries["NEXT_STEPS.md"]);
    expect(content).toContain("keymanapp/keyboards");
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
    const fsWithKmx = makeVirtualFS([
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
    const emptyFs = makeVirtualFS([]);
    const bytes = await toZip(emptyFs);
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(["NEXT_STEPS.md"]);
  });

  it("overrides any existing NEXT_STEPS.md in the VirtualFS", async () => {
    const fs = makeVirtualFS([
      { path: "NEXT_STEPS.md", content: "old content", isBinary: false },
    ]);
    const bytes = await toZip(fs);
    const entries = unzipSync(bytes);
    const content = dec.decode(entries["NEXT_STEPS.md"]);
    expect(content).not.toBe("old content");
    expect(content).toContain("keymanapp/keyboards");
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
