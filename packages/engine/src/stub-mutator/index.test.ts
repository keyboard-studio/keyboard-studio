import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { applyIdentityStubMutation } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYBOARDS_ROOT = resolve(__dirname, "../../../../../keyboards");
const SIBLING_REPO_PRESENT = existsSync(KEYBOARDS_ROOT);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

// A minimal but realistic keyboard file with all three mutable metadata lines
// plus two keyboard rule lines, so the round-trip test can confirm rules
// are untouched.
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

  it("replaces straight apostrophe with RIGHT SINGLE QUOTATION MARK (U+2019) in name", () => {
    const vfs = makeVfs();
    applyIdentityStubMutation(vfs, KEYBOARD_ID, { name: "O'Brien" });
    expect(getText(vfs)).toContain("store(&NAME) 'O\u2019Brien'");
  });
});

// ---------------------------------------------------------------------------
// Live-keyboard tests (require sibling keymanapp/keyboards repo at ../keyboards)
// ---------------------------------------------------------------------------

function loadRealKeyboard(id: string): VirtualFS {
  const kmnPath = resolve(KEYBOARDS_ROOT, `release/basic/${id}/source/${id}.kmn`);
  const content = readFileSync(kmnPath, "utf8");
  return createVirtualFS([{ path: `source/${id}.kmn`, content, isBinary: false }]);
}

describe.skipIf(!SIBLING_REPO_PRESENT)(
  "applyIdentityStubMutation — live keyboards (sibling repo)",
  () => {
    it("basic_kbdus: mutates all three fields and leaves the rest unchanged", () => {
      const vfs = loadRealKeyboard("basic_kbdus");
      const original = vfs.get("source/basic_kbdus.kmn")!.content as string;
      applyIdentityStubMutation(vfs, "basic_kbdus", {
        name: "Test US",
        copyright: "Copyright © 2025 Test",
        version: "9.9",
      });
      const updated = vfs.get("source/basic_kbdus.kmn")!.content as string;
      expect(updated).toContain("store(&NAME) 'Test US'");
      expect(updated).toContain("store(&COPYRIGHT) 'Copyright © 2025 Test'");
      expect(updated).toContain("store(&KEYBOARDVERSION) '9.9'");
      // Round-trip: only the three targeted lines changed
      const before = original.split("\n");
      const after = updated.split("\n");
      expect(after).toHaveLength(before.length);
      for (let i = 0; i < before.length; i++) {
        if (!/store\s*\(\s*&(NAME|COPYRIGHT|KEYBOARDVERSION)\s*\)/i.test(before[i])) {
          expect(after[i]).toBe(before[i]);
        }
      }
    });

    it("basic_kbdgr: mutates display name only, leaves copyright and version unchanged", () => {
      const vfs = loadRealKeyboard("basic_kbdgr");
      const original = vfs.get("source/basic_kbdgr.kmn")!.content as string;
      applyIdentityStubMutation(vfs, "basic_kbdgr", { name: "German Test" });
      const updated = vfs.get("source/basic_kbdgr.kmn")!.content as string;
      expect(updated).toContain("store(&NAME) 'German Test'");
      // Copyright and version lines must be byte-identical to the original
      const copyrightLine = original.split("\n").find((l) =>
        /store\s*\(\s*&COPYRIGHT\s*\)/i.test(l)
      );
      const versionLine = original.split("\n").find((l) =>
        /store\s*\(\s*&KEYBOARDVERSION\s*\)/i.test(l)
      );
      expect(updated).toContain(copyrightLine!);
      expect(updated).toContain(versionLine!);
    });
  }
);
