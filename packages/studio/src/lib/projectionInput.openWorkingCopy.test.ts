// applyOpenWorkingCopyFiles and the display-name parity of openModeProjection
// (spec 111 FR-043): pure helpers, no React.

import { describe, expect, it } from "vitest";
import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import { applyOpenWorkingCopyFiles, openModeProjection } from "./projectionInput.ts";

const FONT = new Uint8Array([0, 1, 2, 254, 255]);

function startVfs(): VirtualFS {
  return createVirtualFS([
    { path: "source/a.kmn", content: "edited", isBinary: false },
    { path: "source/new.txt", content: "added", isBinary: false },
    { path: "source/f.ttf", content: FONT, isBinary: true },
  ]);
}

function target(): VirtualFS {
  return createVirtualFS([
    { path: "source/a.kmn", content: "fetched", isBinary: false },
    { path: "source/only-fetched.txt", content: "kept", isBinary: false },
  ]);
}

describe("applyOpenWorkingCopyFiles", () => {
  it("replaces and adds the working copy's files on Open, keeping a fetched-only file", () => {
    const vfs = target();
    applyOpenWorkingCopyFiles(vfs, "adapt-existing", startVfs());
    expect(vfs.get("source/a.kmn")?.content).toBe("edited");
    expect(vfs.get("source/new.txt")?.content).toBe("added");
    expect(vfs.get("source/only-fetched.txt")?.content).toBe("kept");
  });

  it("carries a binary entry byte-for-byte with its binary flag", () => {
    const vfs = target();
    applyOpenWorkingCopyFiles(vfs, "adapt-existing", startVfs());
    const entry = vfs.get("source/f.ttf");
    expect(entry?.isBinary).toBe(true);
    expect(Array.from(entry?.content as Uint8Array)).toEqual(Array.from(FONT));
  });

  it.each([["new-from-base" as const], [null]])("does nothing outside Open (%s)", (mode) => {
    const vfs = target();
    applyOpenWorkingCopyFiles(vfs, mode, startVfs());
    expect(vfs.get("source/a.kmn")?.content).toBe("fetched");
    expect(vfs.get("source/new.txt")).toBeUndefined();
  });

  it("does nothing without a starting-point VFS", () => {
    const vfs = target();
    applyOpenWorkingCopyFiles(vfs, "adapt-existing", null);
    expect(vfs.get("source/a.kmn")?.content).toBe("fetched");
  });
});

describe("openModeProjection nameEdited", () => {
  const edited = (identityName: string | undefined, start: string | null | undefined): boolean =>
    openModeProjection({
      identity: identityName === undefined ? null : { displayName: identityName },
      startDisplayName: start,
    }).kps.nameEdited;

  it("is true only when a display name is set and differs from the starting point's", () => {
    expect(edited("New", "Old")).toBe(true);
    expect(edited("Old", "Old")).toBe(false);
    expect(edited(undefined, "Old")).toBe(false);
  });

  it("reads an unknown starting-point name as not edited", () => {
    expect(edited("New", null)).toBe(false);
    expect(edited("New", undefined)).toBe(false);
  });
});
