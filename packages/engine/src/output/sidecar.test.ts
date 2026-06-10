import { describe, it, expect } from "vitest";
import { addSidecar, isSidecarPath } from "./sidecar.js";
import type { VirtualFS, VirtualFSEntry } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Minimal in-memory VirtualFS (inline for isolation)
// ---------------------------------------------------------------------------

function makeVirtualFS(entries: VirtualFSEntry[] = []): VirtualFS {
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

// ---------------------------------------------------------------------------
// isSidecarPath
// ---------------------------------------------------------------------------

describe("isSidecarPath", () => {
  it("returns true for a .kmn.imported path", () => {
    expect(isSidecarPath("source/cm_qwerty.kmn.imported")).toBe(true);
  });

  it("returns false for a plain .kmn path", () => {
    expect(isSidecarPath("source/cm_qwerty.kmn")).toBe(false);
  });

  it("returns false for a .kmx path", () => {
    expect(isSidecarPath("build/cm_qwerty.kmx")).toBe(false);
  });

  it("returns false for a .kps path", () => {
    expect(isSidecarPath("source/cm_qwerty.kps")).toBe(false);
  });

  it("returns false for a bare filename with no extension", () => {
    expect(isSidecarPath("source/README")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addSidecar
// ---------------------------------------------------------------------------

describe("addSidecar", () => {
  it("adds a new VFS entry at source/<id>.kmn.imported", () => {
    const vfs = makeVirtualFS();
    addSidecar(vfs, "c version(10.0)\n", "cm_qwerty");

    const entry = vfs.get("source/cm_qwerty.kmn.imported");
    expect(entry).toBeDefined();
    expect(entry?.content).toBe("c version(10.0)\n");
    expect(entry?.isBinary).toBe(false);
  });

  it("stores the exact original .kmn text without modification", () => {
    const vfs = makeVirtualFS();
    const original = "c version(10.0)\nstore(&NAME) \"Test\"\nbegin > use(main)\n";
    addSidecar(vfs, original, "test_kb");

    const entry = vfs.get("source/test_kb.kmn.imported");
    expect(entry?.content).toBe(original);
  });

  it("returns the same VirtualFS instance (mutates in place)", () => {
    const vfs = makeVirtualFS();
    const returned = addSidecar(vfs, "c test\n", "my_kb");
    expect(returned).toBe(vfs);
  });

  it("isSidecarPath identifies the written path as a sidecar", () => {
    const vfs = makeVirtualFS();
    addSidecar(vfs, "c test\n", "foo_kb");
    const paths = vfs.list();
    const sidecarPaths = paths.filter(isSidecarPath);
    expect(sidecarPaths).toHaveLength(1);
    expect(sidecarPaths[0]).toBe("source/foo_kb.kmn.imported");
  });

  it("is idempotent — calling twice produces the same single entry", () => {
    const vfs = makeVirtualFS();
    addSidecar(vfs, "c version(10.0)\n", "cm_qwerty");
    addSidecar(vfs, "c version(10.0)\n", "cm_qwerty");

    const allPaths = vfs.list();
    const sidecarPaths = allPaths.filter(isSidecarPath);
    expect(sidecarPaths).toHaveLength(1);
    expect(vfs.get("source/cm_qwerty.kmn.imported")?.content).toBe("c version(10.0)\n");
  });

  it("overwrites with the latest text on a second call (idempotency under mutation)", () => {
    const vfs = makeVirtualFS();
    addSidecar(vfs, "first content\n", "cm_qwerty");
    addSidecar(vfs, "second content\n", "cm_qwerty");

    expect(vfs.get("source/cm_qwerty.kmn.imported")?.content).toBe("second content\n");
  });

  it("does not disturb pre-existing VFS entries", () => {
    const vfs = makeVirtualFS([
      { path: "source/cm_qwerty.kmn", content: "c emitted\n", isBinary: false },
    ]);
    addSidecar(vfs, "c original\n", "cm_qwerty");

    expect(vfs.get("source/cm_qwerty.kmn")?.content).toBe("c emitted\n");
  });
});
