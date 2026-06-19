// Tests for adapt-staging helpers (Track 2 output-only).
//
// Coverage:
//   bumpKeyboardVersion:
//     1. "1.0" → "1.1"
//     2. "1.0.2" → "1.0.3"
//     3. "2.0" → "2.1"
//     4. "not-a-version" → "not-a-version.1"
//   stageAdaptHistory:
//     5. Creates HISTORY.md when none exists.
//     6. Prepend to existing HISTORY.md, preserving original content below.
//     7. Exact entry text format matches ATX heading convention.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { bumpKeyboardVersion, stageAdaptHistory } from "./adapt-staging.ts";

// ---------------------------------------------------------------------------
// bumpKeyboardVersion
// ---------------------------------------------------------------------------

describe("bumpKeyboardVersion", () => {
  it("increments last segment of two-part version: 1.0 → 1.1", () => {
    expect(bumpKeyboardVersion("1.0")).toBe("1.1");
  });

  it("increments last segment of three-part version: 1.0.2 → 1.0.3", () => {
    expect(bumpKeyboardVersion("1.0.2")).toBe("1.0.3");
  });

  it("increments single two-part version starting at zero: 2.0 → 2.1", () => {
    expect(bumpKeyboardVersion("2.0")).toBe("2.1");
  });

  it("appends .1 when last segment is non-integer: not-a-version → not-a-version.1", () => {
    expect(bumpKeyboardVersion("not-a-version")).toBe("not-a-version.1");
  });

  it("appends .1 when last segment is a float string: 1.0a → 1.0a.1", () => {
    expect(bumpKeyboardVersion("1.0a")).toBe("1.0a.1");
  });

  it("correctly increments large segment values: 1.9 → 1.10", () => {
    expect(bumpKeyboardVersion("1.9")).toBe("1.10");
  });

  it("strips trailing dot before processing: 1.0. → 1.1", () => {
    expect(bumpKeyboardVersion("1.0.")).toBe("1.1");
  });

  it("strips multiple trailing dots: 1.0... → 1.1", () => {
    expect(bumpKeyboardVersion("1.0...")).toBe("1.1");
  });

  it("returns 1.1 for empty string input", () => {
    expect(bumpKeyboardVersion("")).toBe("1.1");
  });

  it("returns 1.1 for whitespace-only input", () => {
    expect(bumpKeyboardVersion("   ")).toBe("1.1");
  });

  it("leading-zero segment: 1.09 → 1.10 (parseInt strips leading zero; documents actual behavior)", () => {
    // parseInt("09", 10) === 9, so the segment is treated as 9 and incremented to 10.
    // Real release versions don't use leading zeros; this documents the actual behavior.
    expect(bumpKeyboardVersion("1.09")).toBe("1.10");
  });
});

// ---------------------------------------------------------------------------
// stageAdaptHistory
// ---------------------------------------------------------------------------

describe("stageAdaptHistory", () => {
  it("creates HISTORY.md when none exists", () => {
    const vfs = createVirtualFS();
    stageAdaptHistory(vfs, "my_kbd", "basic_kbdus", "1.0", "1.1", "2026-06-18");
    const entry = vfs.get("HISTORY.md");
    expect(entry).toBeDefined();
    expect(typeof entry!.content).toBe("string");
  });

  it("produces the correct ATX heading entry text (fresh HISTORY)", () => {
    const vfs = createVirtualFS();
    stageAdaptHistory(vfs, "my_kbd", "basic_kbdus", "1.0", "1.1", "2026-06-18");
    const content = vfs.get("HISTORY.md")!.content as string;
    expect(content).toContain("## 1.1 (2026-06-18)");
    expect(content).toContain("* Adapted from basic_kbdus v1.0 via keyboard-studio.");
  });

  it("prepends new entry when HISTORY.md already exists, preserving original content below", () => {
    const vfs = createVirtualFS([
      {
        path: "HISTORY.md",
        content: "## 1.0 (2025-01-01)\n* Initial release.\n",
        isBinary: false,
      },
    ]);
    stageAdaptHistory(vfs, "my_kbd", "basic_kbdus", "1.0", "1.1", "2026-06-18");
    const content = vfs.get("HISTORY.md")!.content as string;

    // New entry is at the top.
    expect(content.indexOf("## 1.1 (2026-06-18)")).toBeLessThan(
      content.indexOf("## 1.0 (2025-01-01)"),
    );
    // Original content is preserved.
    expect(content).toContain("## 1.0 (2025-01-01)");
    expect(content).toContain("* Initial release.");
    // New adapt line is present.
    expect(content).toContain("* Adapted from basic_kbdus v1.0 via keyboard-studio.");
  });

  it("exact entry text: heading line followed by bullet line", () => {
    const vfs = createVirtualFS();
    stageAdaptHistory(vfs, "ha_sil", "basic_kbdus", "2.0", "2.1", "2026-06-18");
    const content = vfs.get("HISTORY.md")!.content as string;
    const lines = content.split("\n");
    expect(lines[0]).toBe("## 2.1 (2026-06-18)");
    expect(lines[1]).toBe("* Adapted from basic_kbdus v2.0 via keyboard-studio.");
  });

  it("uses the dateIso parameter, not a hardcoded date", () => {
    const vfs = createVirtualFS();
    stageAdaptHistory(vfs, "my_kbd", "basic_kbdus", "1.0", "1.1", "2099-12-31");
    const content = vfs.get("HISTORY.md")!.content as string;
    expect(content).toContain("2099-12-31");
  });
});
