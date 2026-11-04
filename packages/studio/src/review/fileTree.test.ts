// Tests for the /review folder-tree inventory model.

import { describe, expect, it } from "vitest";
import { buildFileTree, type FileTreeNode } from "./fileTree.ts";

const ID = "ibibio_tonal";

function find(
  nodes: FileTreeNode[],
  criterionId: string,
): FileTreeNode | undefined {
  for (const n of nodes) {
    if (n.criterionId === criterionId) return n;
    const hit = n.children ? find(n.children, criterionId) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

function findByName(
  nodes: FileTreeNode[],
  name: string,
): FileTreeNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n;
    const hit = n.children ? findByName(n.children, name) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

const FULL = [
  "README.md",
  "HISTORY.md",
  "LICENSE.md",
  `${ID}.kpj`,
  `source/${ID}.kps`,
  "source/welcome.htm",
  "source/readme.htm",
  `source/${ID}.php`,
  `source/${ID}.keyman-touch-layout`,
  `source/${ID}.kvks`,
  `source/${ID}.ico`,
  `source/${ID}.kmn`,
];

describe("buildFileTree", () => {
  it("marks every required file ok when properly placed", () => {
    const tree = buildFileTree(FULL, ID);
    for (const cid of [
      "5.0-readme-md-exists",
      "3.1b-history-file-exists",
      "4.0-license-md-exists",
      "1.14-kpj-file-exists",
      "8.0-kps-file-exists",
      "6.3b-welcome-htm-exists",
      "6.1b-readme-htm-exists",
      "11.1b-php-exists-with-header",
      "18.0-touch-layout-exists",
      "7.0-kvks-file-exists",
      "7.0-ico-file-exists",
    ]) {
      const n = find(tree, cid);
      expect(n, cid).toBeDefined();
      expect(n!.status, cid).toBe("ok");
    }
  });

  it("marks missing files red, naming the criterion", () => {
    const tree = buildFileTree(
      FULL.filter((p) => !p.endsWith(".kvks") && p !== "README.md"),
      ID,
    );
    const kvks = find(tree, "7.0-kvks-file-exists")!;
    expect(kvks.status).toBe("missing");
    expect(kvks.detail).toBe(
      "Missing — reported by 7.0-kvks-file-exists.",
    );
    const readme = find(tree, "5.0-readme-md-exists")!;
    expect(readme.status).toBe("missing");
  });

  it("marks a required file red when misplaced, naming where it was found", () => {
    const tree = buildFileTree(
      FULL.map((p) => (p === "README.md" ? `source/README.md` : p)),
      ID,
    );
    const readme = find(tree, "5.0-readme-md-exists")!;
    expect(readme.status).toBe("misplaced");
    expect(readme.detail).toBe(
      "Found at source/README.md — expected in the keyboard root.",
    );
  });

  it("accepts the source/welcome/ folder convention for welcome.htm", () => {
    const tree = buildFileTree(
      FULL.map((p) =>
        p === "source/welcome.htm" ? "source/welcome/welcome.htm" : p,
      ),
      ID,
    );
    expect(find(tree, "6.3b-welcome-htm-exists")!.status).toBe("ok");
  });

  it("marks .kpj.user and build/ yellow, only when present", () => {
    const without = buildFileTree(FULL, ID);
    expect(findByName(without, `${ID}.kpj.user`)).toBeUndefined();
    expect(findByName(without, "build")).toBeUndefined();

    const withOptional = buildFileTree(
      [...FULL, `${ID}.kpj.user`, "build/out.kmx"],
      ID,
    );
    const user = findByName(withOptional, `${ID}.kpj.user`)!;
    expect(user.status).toBe("optional");
    const build = findByName(withOptional, "build")!;
    expect(build.status).toBe("optional");
  });

  it("does not confuse .kpj.user with the .kpj itself", () => {
    const tree = buildFileTree(
      FULL.filter((p) => p !== `${ID}.kpj`).concat([`${ID}.kpj.user`]),
      ID,
    );
    // The .kpj is missing (red); the .kpj.user is yellow, not a substitute.
    expect(find(tree, "1.14-kpj-file-exists")!.status).toBe("missing");
    expect(findByName(tree, `${ID}.kpj.user`)!.status).toBe("optional");
  });

  it("lists non-required files neutrally under their folders", () => {
    const tree = buildFileTree([...FULL, "source/font.ttf"], ID);
    const font = findByName(tree, "font.ttf")!;
    expect(font.status).toBe("other");
    expect(font.criterionId).toBeUndefined();
  });

  it("click targets carry the criterion id", () => {
    const tree = buildFileTree(FULL, ID);
    expect(find(tree, "18.0-touch-layout-exists")!.criterionId).toBe(
      "18.0-touch-layout-exists",
    );
  });
});
