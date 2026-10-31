import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { checkDuplicateSourceFiles } from "./check-duplicate-files.js";

function vfsOf(files: Array<{ path: string; content: string | Uint8Array }>) {
  return createVirtualFS(
    files.map((f) => ({
      path: f.path,
      content: f.content,
      isBinary: f.content instanceof Uint8Array,
    })),
  );
}

describe("checkDuplicateSourceFiles (1.9)", () => {
  it("flags the same basename with identical content at two paths", () => {
    const { findings } = checkDuplicateSourceFiles(
      vfsOf([
        { path: "source/help/kb.css", content: "img { width: 100%; }" },
        { path: "source/welcome/kb.css", content: "img { width: 100%; }" },
        { path: "source/demo.kmn", content: "store(&VERSION) '10.0'" },
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_DUPLICATE_SOURCE_FILES");
    expect(findings[0]!.message).toContain("source/help/kb.css");
    expect(findings[0]!.message).toContain("source/welcome/kb.css");
  });

  it("does not flag the same basename with different content", () => {
    const { findings } = checkDuplicateSourceFiles(
      vfsOf([
        { path: "source/help/kb.css", content: "a {}" },
        { path: "source/welcome/kb.css", content: "b {}" },
      ]),
    );
    expect(findings).toEqual([]);
  });

  it("does not flag identical content under different basenames", () => {
    const { findings } = checkDuplicateSourceFiles(
      vfsOf([
        { path: "source/a.txt", content: "same" },
        { path: "source/b.txt", content: "same" },
      ]),
    );
    expect(findings).toEqual([]);
  });

  it("compares binary content byte-for-byte and matches basenames case-insensitively", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { findings } = checkDuplicateSourceFiles(
      vfsOf([
        { path: "source/Icon.ico", content: bytes },
        { path: "source/help/icon.ico", content: new Uint8Array([1, 2, 3, 4]) },
        { path: "source/welcome/icon.ico", content: new Uint8Array([1, 2, 3]) },
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("source/Icon.ico");
    expect(findings[0]!.message).toContain("source/help/icon.ico");
    expect(findings[0]!.message).not.toContain("welcome");
  });

  it("reports one finding per duplicate group", () => {
    const { findings } = checkDuplicateSourceFiles(
      vfsOf([
        { path: "a/x.txt", content: "1" },
        { path: "b/x.txt", content: "1" },
        { path: "a/y.txt", content: "2" },
        { path: "b/y.txt", content: "2" },
        { path: "c/y.txt", content: "2" },
      ]),
    );
    expect(findings).toHaveLength(2);
  });
});
