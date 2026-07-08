// Tests for reconcileSiblingAssetPaths — repairing stale sibling asset-path
// header stores after a carve re-emit onto a renamed (scaffolded) VFS.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { reconcileSiblingAssetPaths } from "./reconcileSiblingAssetPaths.js";

function makeVfs(paths: string[]) {
  return createVirtualFS(
    paths.map((path) => ({ path, content: "x", isBinary: false })),
  );
}

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&VISUALKEYBOARD) 'old_id.kvks'
store(&LAYOUTFILE) 'old_id.keyman-touch-layout'
store(&BITMAP) 'Cameroon.ico'

begin Unicode > use(main)

group(main) using keys
+ [K_A] > 'a'
`;

describe("reconcileSiblingAssetPaths", () => {
  it("repoints a dangling reference to the keyboardId-named sibling", () => {
    const vfs = makeVfs(["source/new_id.kvks", "source/Cameroon.ico"]);
    const { kmn, rewrites } = reconcileSiblingAssetPaths(KMN, vfs, "new_id");
    expect(kmn).toContain("store(&VISUALKEYBOARD) 'new_id.kvks'");
    expect(rewrites).toContain("VISUALKEYBOARD");
    // BITMAP's file exists under its original name — untouched.
    expect(kmn).toContain("store(&BITMAP) 'Cameroon.ico'");
    expect(rewrites).not.toContain("BITMAP");
  });

  it("handles compound extensions (.keyman-touch-layout)", () => {
    const vfs = makeVfs(["source/new_id.keyman-touch-layout"]);
    const { kmn, rewrites } = reconcileSiblingAssetPaths(KMN, vfs, "new_id");
    expect(kmn).toContain("store(&LAYOUTFILE) 'new_id.keyman-touch-layout'");
    expect(rewrites).toEqual(["LAYOUTFILE"]);
  });

  it("leaves a valid reference alone", () => {
    const vfs = makeVfs(["source/old_id.kvks", "source/new_id.kvks"]);
    const { kmn, rewrites } = reconcileSiblingAssetPaths(KMN, vfs, "new_id");
    expect(kmn).toContain("store(&VISUALKEYBOARD) 'old_id.kvks'");
    expect(rewrites).not.toContain("VISUALKEYBOARD");
  });

  it("leaves a dangling reference alone when no keyboardId-named sibling exists", () => {
    const vfs = makeVfs([]);
    const { kmn, rewrites } = reconcileSiblingAssetPaths(KMN, vfs, "new_id");
    expect(kmn).toBe(KMN);
    expect(rewrites).toEqual([]);
  });

  it("skips non-sibling paths (containing a slash)", () => {
    const withDir = KMN.replace("'old_id.kvks'", "'sub/old_id.kvks'");
    const vfs = makeVfs(["source/new_id.kvks"]);
    const { kmn } = reconcileSiblingAssetPaths(withDir, vfs, "new_id");
    expect(kmn).toContain("store(&VISUALKEYBOARD) 'sub/old_id.kvks'");
  });

  it("never touches non-path stores like &NAME", () => {
    const vfs = makeVfs(["source/new_id.kvks"]);
    const { kmn } = reconcileSiblingAssetPaths(KMN, vfs, "new_id");
    expect(kmn).toContain("store(&NAME) 'Test'");
  });
});
