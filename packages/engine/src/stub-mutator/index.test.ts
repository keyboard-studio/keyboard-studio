import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { applyIdentityStubMutation } from "./index.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

// A minimal but realistic keyboard file with all three mutable metadata lines
// plus two keyboard rule lines, so the round-trip test can confirm rules
// are untouched.
//
// Note: live-repo integration tests against real keyboards (e.g. basic_kbdus)
// require the sibling keymanapp/keyboards repo to be checked out at ../keyboards.
const FIXTURE_KMN = [
  "store(&NAME) 'Original Name'",
  "store(&COPYRIGHT) 'Copyright © 2020 Original Author'",
  "store(&KEYBOARDVERSION) '1.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
].join("\n");

const KEYBOARD_ID = "test_kb";

function makeVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: FIXTURE_KMN, isBinary: false },
  ]);
}

function getText(vfs: VirtualFS): string {
  const entry = vfs.get(`source/${KEYBOARD_ID}.kmn`);
  if (entry === undefined || typeof entry.content !== "string") {
    throw new Error("fixture not found");
  }
  return entry.content;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyIdentityStubMutation", () => {
  it("updates the display name when name is provided", () => {
    const vfs = makeVfs();
    applyIdentityStubMutation(vfs, KEYBOARD_ID, { name: "My New Keyboard" });
    expect(getText(vfs)).toContain("store(&NAME) 'My New Keyboard'");
  });

  it("updates the copyright line when copyright is provided", () => {
    const vfs = makeVfs();
    applyIdentityStubMutation(vfs, KEYBOARD_ID, {
      copyright: "Copyright © 2025 New Author",
    });
    expect(getText(vfs)).toContain(
      "store(&COPYRIGHT) 'Copyright © 2025 New Author'"
    );
  });

  it("updates the version number when version is provided", () => {
    const vfs = makeVfs();
    applyIdentityStubMutation(vfs, KEYBOARD_ID, { version: "2.0" });
    expect(getText(vfs)).toContain("store(&KEYBOARDVERSION) '2.0'");
  });

  it("updates all three fields at once", () => {
    const vfs = makeVfs();
    applyIdentityStubMutation(vfs, KEYBOARD_ID, {
      name: "All Three",
      copyright: "Copyright © 2025 Someone",
      version: "3.0",
    });
    const text = getText(vfs);
    expect(text).toContain("store(&NAME) 'All Three'");
    expect(text).toContain("store(&COPYRIGHT) 'Copyright © 2025 Someone'");
    expect(text).toContain("store(&KEYBOARDVERSION) '3.0'");
  });

  it("leaves non-provided fields unchanged (round-trip)", () => {
    const vfs = makeVfs();
    applyIdentityStubMutation(vfs, KEYBOARD_ID, { name: "Changed Name" });
    const before = FIXTURE_KMN.split("\n");
    const after = getText(vfs).split("\n");
    expect(after).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) {
      if (/store\s*\(\s*&NAME\s*\)/i.test(before[i])) {
        expect(after[i]).toBe("store(&NAME) 'Changed Name'");
      } else {
        expect(after[i]).toBe(before[i]);
      }
    }
  });

  it("does not touch keyboard rules or other file content", () => {
    const vfs = makeVfs();
    applyIdentityStubMutation(vfs, KEYBOARD_ID, {
      name: "X",
      copyright: "Y",
      version: "9.9",
    });
    const text = getText(vfs);
    expect(text).toContain("begin Unicode > use(main)");
    expect(text).toContain("group(main) using keys");
    expect(text).toContain("+ [K_A] > 'a'");
    expect(text).toContain("+ [K_B] > 'b'");
  });

  it("throws when the keyboard file is not in the VirtualFS", () => {
    const vfs = createVirtualFS();
    expect(() =>
      applyIdentityStubMutation(vfs, "nonexistent_kb", { name: "X" })
    ).toThrow("stub-mutator: keyboard file not found");
  });
});
