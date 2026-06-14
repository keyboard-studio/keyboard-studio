import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { renameFilesInVfs } from "./index.js";

// These tests pin the scoped-rewrite behavior of renameFilesInVfs against the
// over-rewrite risk in the previous blanket-replaceAll implementation. They
// mirror kmc-copy's copyKpsSourceFile / copySourceFile semantics from
// ../keyman/developer/src/kmc-copy/src/KeymanProjectCopier.ts — only file-path
// positions and exact-match ID tokens are rewritten; free-text fields and
// human-readable display names are preserved verbatim.

describe("renameFilesInVfs — scoped content rewriting", () => {
  describe(".kps free-text fields are preserved", () => {
    it("does NOT rewrite baseId inside <Info><Name> (display name)", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "source/base_id.kps",
        `<Package><Info><Name>base_id Keyboard</Name><Author>Author of base_id</Author><Copyright>(c) 2024 base_id Project</Copyright></Info><Files/></Package>`
      );

      renameFilesInVfs(vfs, "base_id", "my_keyboard");

      const out = vfs.get("source/my_keyboard.kps")!.content as string;
      expect(out).toContain("<Name>base_id Keyboard</Name>");
      expect(out).toContain("<Author>Author of base_id</Author>");
      expect(out).toContain("(c) 2024 base_id Project");
    });

    it("DOES rewrite baseId inside <File><Name> when value looks like a path", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "source/base_id.kps",
        `<Package><Info><Name>My Keyboard</Name></Info><Files><File><Name>source/base_id.kmn</Name></File><File><Name>source/base_id.kvks</Name></File></Files></Package>`
      );

      renameFilesInVfs(vfs, "base_id", "my_keyboard");

      const out = vfs.get("source/my_keyboard.kps")!.content as string;
      expect(out).toContain("source/my_keyboard.kmn");
      expect(out).toContain("source/my_keyboard.kvks");
      expect(out).toContain("<Name>My Keyboard</Name>");
    });

    it("DOES rewrite <Keyboard><ID> exact-match value", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "source/base_id.kps",
        `<Package><Keyboards><Keyboard><Name>My Keyboard</Name><ID>base_id</ID></Keyboard></Keyboards></Package>`
      );

      renameFilesInVfs(vfs, "base_id", "my_keyboard");

      const out = vfs.get("source/my_keyboard.kps")!.content as string;
      expect(out).toContain("<ID>my_keyboard</ID>");
    });
  });

  describe(".kvks scoped to <kbdname>", () => {
    it("rewrites <kbdname> exact-match value", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "source/base_id.kvks",
        `<?xml version="1.0"?><visualkeyboard><header><kbdname>base_id</kbdname></header><encoding name="unicode" fontname="Andika Afr"></encoding></visualkeyboard>`
      );

      renameFilesInVfs(vfs, "base_id", "my_keyboard");

      const out = vfs.get("source/my_keyboard.kvks")!.content as string;
      expect(out).toContain("<kbdname>my_keyboard</kbdname>");
      expect(out).toContain('fontname="Andika Afr"');
    });

    it("does NOT rewrite baseId substrings outside <kbdname>", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "source/base_id.kvks",
        `<?xml version="1.0"?><visualkeyboard><header><kbdname>base_id</kbdname></header><layer shift="default"><key vkey="K_A">base_id</key></layer></visualkeyboard>`
      );

      renameFilesInVfs(vfs, "base_id", "my_keyboard");

      const out = vfs.get("source/my_keyboard.kvks")!.content as string;
      expect(out).toContain("<kbdname>my_keyboard</kbdname>");
      // Key content (free text) is preserved
      expect(out).toContain("<key vkey=\"K_A\">base_id</key>");
    });
  });

  describe("word-boundary protection prevents partial-token rewrites", () => {
    it("does NOT rewrite baseId substrings that share a prefix with longer tokens", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "source/base_id.kps",
        `<Package><Files><File><Name>source/base_id_extra.kmn</Name></File></Files></Package>`
      );

      renameFilesInVfs(vfs, "base_id", "my_keyboard");

      const out = vfs.get("source/my_keyboard.kps")!.content as string;
      // base_id_extra is a different token; must not be rewritten to my_keyboard_extra
      expect(out).toContain("source/base_id_extra.kmn");
    });
  });
});
