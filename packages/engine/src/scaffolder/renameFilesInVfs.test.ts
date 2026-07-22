import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { renameFilesInVfs } from "./index.js";
import { parseKpjFlags } from "../compiler/parseKpjFlags.js";

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
      const renamedHtm = vfs.get("source/my_keyboard.htm");
      expect(renamedHtm).not.toBeUndefined();
      expect(renamedHtm?.content).toBe("<html>help</html>");
      const renamedJs = vfs.get("source/my_keyboard.js");
      expect(renamedJs).not.toBeUndefined();
      expect(renamedJs?.content).toBe("var x = 1;");
      expect(vfs.get("source/base_id.htm")).toBeUndefined();
      expect(vfs.get("source/base_id.js")).toBeUndefined();
    });

    it("leaves non-id-named htm/js/css in subdirs untouched", () => {
      const vfs = createVirtualFS();
      vfs.set("source/welcome/welcome.htm", "<html>welcome</html>");
      vfs.set("source/help/kb.css", ".help { padding: 4px; }");
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      // Untouched: paths that don't match `source/<baseId>.<ext>`.
      const welcomeHtm = vfs.get("source/welcome/welcome.htm");
      expect(welcomeHtm).not.toBeUndefined();
      expect(welcomeHtm?.content).toBe("<html>welcome</html>");
      const kbCss = vfs.get("source/help/kb.css");
      expect(kbCss).not.toBeUndefined();
      expect(kbCss?.content).toBe(".help { padding: 4px; }");
    });
  });

  describe("root-level .kpj rename (compiler-flags survival)", () => {
    // A .kpj lives at the VFS root as `<baseId>.kpj`, not under source/.
    // compile() reads it as `<keyboardId>.kpj`; if it isn't renamed the flags
    // are silently dropped to defaults. These pin the rename + scoped rewrite.
    const KPJ = (id: string) =>
      `<?xml version="1.0" encoding="utf-8"?>
<KeymanDeveloperProject>
  <Options>
    <CompilerWarningsAsErrors>True</CompilerWarningsAsErrors>
    <WarnDeprecatedCode>False</WarnDeprecatedCode>
  </Options>
  <Files>
    <File>
      <ID>id_182ce1ceca069ede255f63119b64f2a5</ID>
      <Filename>${id}.kmn</Filename>
      <Filepath>source\\${id}.kmn</Filepath>
      <Details><Name>Display ${id} Name</Name></Details>
    </File>
    <File>
      <ID>id_ede98e4633e239f933cbfd1f4e1b766c</ID>
      <Filename>README.md</Filename>
      <Filepath>README.md</Filepath>
    </File>
  </Files>
</KeymanDeveloperProject>`;

    it("renames root <baseId>.kpj to <keyboardId>.kpj", () => {
      const vfs = createVirtualFS();
      vfs.set("base_id.kpj", KPJ("base_id"));
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      expect(vfs.get("base_id.kpj")).toBeUndefined();
      const renamed = vfs.get("my_keyboard.kpj");
      expect(renamed).not.toBeUndefined();
      // Verify that the file content is preserved (not just existence)
      expect(renamed!.content).toContain("<KeymanDeveloperProject>");
      expect(renamed!.content).toContain("<CompilerWarningsAsErrors>True</CompilerWarningsAsErrors>");
    });

    it("keeps the base keyboard's compiler flags at the new path (not defaults)", () => {
      const vfs = createVirtualFS();
      vfs.set("base_id.kpj", KPJ("base_id"));
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      // This is exactly what compile() does: read `<keyboardId>.kpj` and parse.
      const flags = parseKpjFlags(vfs.get("my_keyboard.kpj")!.content as string);
      expect(flags).toEqual({
        compilerWarningsAsErrors: true, // non-default — proves the file survived
        warnDeprecatedCode: false, // non-default — proves it wasn't lost to defaults
      });
    });

    it("rewrites <Filename>/<Filepath> id-basename references to the new id", () => {
      const vfs = createVirtualFS();
      vfs.set("base_id.kpj", KPJ("base_id"));
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      const out = vfs.get("my_keyboard.kpj")!.content as string;
      expect(out).toContain("<Filename>my_keyboard.kmn</Filename>");
      expect(out).toContain("<Filepath>source\\my_keyboard.kmn</Filepath>");
    });

    it("leaves file GUIDs, display names, and non-id files untouched", () => {
      const vfs = createVirtualFS();
      vfs.set("base_id.kpj", KPJ("base_id"));
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      const out = vfs.get("my_keyboard.kpj")!.content as string;
      // GUID hashes never contain the base id token, but assert explicitly.
      expect(out).toContain("<ID>id_182ce1ceca069ede255f63119b64f2a5</ID>");
      // Display <Name> free text is preserved verbatim.
      expect(out).toContain("<Name>Display base_id Name</Name>");
      // Files that don't use the id as basename are untouched.
      expect(out).toContain("<Filename>README.md</Filename>");
    });

    it("does not over-rewrite a base id that is a prefix of another token", () => {
      const vfs = createVirtualFS();
      vfs.set(
        "base_id.kpj",
        `<KeymanDeveloperProject><Files><File><Filename>base_id.kmn</Filename><Filepath>source\\base_id_extra.kmn</Filepath></File></Files></KeymanDeveloperProject>`,
      );
      renameFilesInVfs(vfs, "base_id", "my_keyboard");
      const out = vfs.get("my_keyboard.kpj")!.content as string;
      expect(out).toContain("<Filename>my_keyboard.kmn</Filename>");
      // `base_id_extra` must NOT become `my_keyboard_extra` (word-boundary).
      expect(out).toContain("<Filepath>source\\base_id_extra.kmn</Filepath>");
    });

    it("does nothing when no root .kpj is present", () => {
      const vfs = createVirtualFS();
      vfs.set("source/base_id.kmn", "store(&VERSION) '1.0'");
      expect(() => renameFilesInVfs(vfs, "base_id", "my_keyboard")).not.toThrow();
      expect(vfs.get("my_keyboard.kpj")).toBeUndefined();
    });
  });
});
