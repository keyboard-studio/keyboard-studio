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

  describe("sibling-file renames (.css, .htm, .js)", () => {
    it("renames source/<baseId>.css to source/<keyboardId>.css and rewrites selectors", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "source/base_id.css",
        ".kmw-keyboard-base_id { color: red; }",
      );
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      expect(vfs.get("source/base_id.css")).toBeUndefined();
      const renamed = vfs.get("source/my_keyboard.css");
      expect(renamed).not.toBeUndefined();
      expect(renamed!.content).toBe(
        ".kmw-keyboard-my_keyboard { color: red; }",
      );
    });

    it("renames source/<baseId>.htm and source/<baseId>.js when present", () => {
      const vfs = createVirtualFS();
      vfs.set("source/base_id.htm", "<html>help</html>");
      vfs.set("source/base_id.js", "var x = 1;");
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      expect(vfs.get("source/my_keyboard.htm")).not.toBeUndefined();
      expect(vfs.get("source/my_keyboard.js")).not.toBeUndefined();
      expect(vfs.get("source/base_id.htm")).toBeUndefined();
      expect(vfs.get("source/base_id.js")).toBeUndefined();
    });

    it("leaves non-id-named htm/js/css in subdirs untouched", () => {
      const vfs = createVirtualFS();
      vfs.set("source/welcome/welcome.htm", "<html>welcome</html>");
      vfs.set("source/help/kb.css", ".help { padding: 4px; }");
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      // Untouched: paths that don't match `source/<baseId>.<ext>`.
      expect(vfs.get("source/welcome/welcome.htm")).not.toBeUndefined();
      expect(vfs.get("source/help/kb.css")).not.toBeUndefined();
    });
  });

  describe("root-level .kpj project file (#1035)", () => {
    const KPJ = [
      `<?xml version="1.0" encoding="utf-8"?>`,
      `<KeymanDeveloperProject><Options>`,
      `<CompilerWarningsAsErrors>True</CompilerWarningsAsErrors>`,
      `<WarnDeprecatedCode>False</WarnDeprecatedCode>`,
      `</Options></KeymanDeveloperProject>`,
    ].join("");

    it("renames root-level <baseId>.kpj to <keyboardId>.kpj so compile() still finds its flags", () => {
      const vfs = createVirtualFS();
      vfs.set("base_id.kpj", KPJ);

      renameFilesInVfs(vfs, "base_id", "my_keyboard");

      expect(vfs.get("base_id.kpj")).toBeUndefined();
      const renamed = vfs.get("my_keyboard.kpj");
      expect(renamed).not.toBeUndefined();
      // Content is carried over verbatim — the modern .kpj is <Options>-only, so
      // the base id lives in the filename, not the body: nothing to rewrite.
      expect(renamed!.content).toBe(KPJ);
    });

    it("does not fabricate a .kpj when the base had none", () => {
      const vfs = createVirtualFS();
      vfs.set("source/base_id.kmn", "store(&NAME) 'x'");
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      expect(vfs.get("my_keyboard.kpj")).toBeUndefined();
      expect(vfs.get("base_id.kpj")).toBeUndefined();
    });

    it("only renames the root-level id-named .kpj, not a same-named file in source/", () => {
      const vfs = createVirtualFS();
      vfs.set("base_id.kpj", KPJ);
      // A .kpj nested under source/ does not use the compile lookup path and
      // must be left where it is (defensive: the rename is root-anchored).
      vfs.set("source/base_id.kpj", KPJ);
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      expect(vfs.get("my_keyboard.kpj")).not.toBeUndefined();
      expect(vfs.get("source/base_id.kpj")).not.toBeUndefined();
    });
  });
});
