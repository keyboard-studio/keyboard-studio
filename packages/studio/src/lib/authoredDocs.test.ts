// authoredDocs — the Documentation step's override + PHP/HTML preservation helpers (specs/html-editor).
//
// The .php fixture mirrors basic_kbdinben's help page: a leading header
// block plus a mid-body `<?php renderLanguageExamples(); ?>` fragment.

import { describe, it, expect } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import {
  applyAuthoredDocsToVfs,
  EMPTY_AUTHORED_DOCS,
  extractOpaqueBlocks,
  joinHtmlDocument,
  joinPhpPage,
  opaqueBlocksRoundTrip,
  phpPageRoundTrips,
  resolveDocMemberText,
  restoreOpaqueBlocks,
  splitHtmlDocument,
  splitPhpPage,
  type AuthoredDocs,
} from "./authoredDocs.ts";

const PHP_PAGE = [
  "<?php",
  "  $pagename = 'basic_kbdinben';",
  "  require_once('header.php');",
  "?>",
  "<p>Welcome to the InBen keyboard.</p>",
  "<?php renderLanguageExamples(); ?>",
  "<p>Type with the keyboard.</p>",
  "",
].join("\n");

const HTML_DOC = [
  "<!DOCTYPE html>",
  "<html><head><meta charset=\"utf-8\"><style>p { color: red; }</style></head>",
  "<body><h1>Welcome</h1><p>Hello.</p></body>",
  "</html>",
  "",
].join("\n");

describe("authoredDocs — override resolution", () => {
  it("an untouched member keeps the generated text; a touched member wins", () => {
    expect(resolveDocMemberText("welcome-htm", "generated", EMPTY_AUTHORED_DOCS)).toBe("generated");
    const authored: AuthoredDocs = { ...EMPTY_AUTHORED_DOCS, authoredWelcomeHtm: "edited" };
    expect(resolveDocMemberText("welcome-htm", "generated", authored)).toBe("edited");
    expect(resolveDocMemberText("readme-md", "generated", authored)).toBe("generated");
  });

  it("an empty authored string clears the member (it is still an override)", () => {
    const authored: AuthoredDocs = { ...EMPTY_AUTHORED_DOCS, authoredReadmeMd: "" };
    expect(resolveDocMemberText("readme-md", "generated", authored)).toBe("");
  });

  it("applyAuthoredDocsToVfs writes only touched members at their shipped paths", () => {
    const vfs = createVirtualFS([
      { path: "source/welcome/welcome.htm", content: "generated welcome", isBinary: false },
      { path: "source/readme.htm", content: "generated readme htm", isBinary: false },
      { path: "README.md", content: "generated readme", isBinary: false },
      { path: "source/help/test_kb.php", content: "generated php", isBinary: false },
    ]);
    applyAuthoredDocsToVfs(vfs, "test_kb", {
      ...EMPTY_AUTHORED_DOCS,
      authoredWelcomeHtm: "edited welcome",
      authoredHelpPhp: "edited php",
    });
    expect(vfs.get("source/welcome/welcome.htm")?.content).toBe("edited welcome");
    expect(vfs.get("source/help/test_kb.php")?.content).toBe("edited php");
    expect(vfs.get("source/readme.htm")?.content).toBe("generated readme htm");
    expect(vfs.get("README.md")?.content).toBe("generated readme");
  });
});

describe("authoredDocs — .php preservation", () => {
  it("splits the leading header from the body and rejoins byte-identically", () => {
    const split = splitPhpPage(PHP_PAGE);
    expect(split.header).toContain("$pagename = 'basic_kbdinben';");
    expect(split.body).toContain("Welcome to the InBen keyboard.");
    expect(split.body).not.toContain("$pagename");
    expect(joinPhpPage(split)).toBe(PHP_PAGE);
    expect(phpPageRoundTrips(PHP_PAGE)).toBe(true);
  });

  it("a page with no leading PHP block has an empty header", () => {
    const split = splitPhpPage("<p>Just HTML.</p>");
    expect(split.header).toBe("");
    expect(split.body).toBe("<p>Just HTML.</p>");
  });

  it("mid-body PHP survives extract + restore byte-identically", () => {
    const split = splitPhpPage(PHP_PAGE);
    expect(opaqueBlocksRoundTrip(split.body)).toBe(true);
    const { body, fragments } = extractOpaqueBlocks(split.body);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.kind).toBe("php");
    expect(fragments[0]?.source).toBe("<?php renderLanguageExamples(); ?>");
    expect(body).not.toContain("<?php");
    expect(body).toContain('data-doc-fragment="0"');
    const restored = restoreOpaqueBlocks(body, fragments);
    expect(restored.ok).toBe(true);
    expect(restored.text).toBe(split.body);
  });

  it("a deleted placeholder fails the restore instead of silently dropping the fragment", () => {
    const { body, fragments } = extractOpaqueBlocks(splitPhpPage(PHP_PAGE).body);
    const withoutPlaceholder = body.replace(/<span\b[^>]*data-doc-fragment="0"[^>]*>[^<]*<\/span>/, "");
    const restored = restoreOpaqueBlocks(withoutPlaceholder, fragments);
    expect(restored.ok).toBe(false);
  });

  it("a body that already carries a placeholder span cannot round-trip exactly", () => {
    // A pre-existing <span data-doc-fragment="0"> would collide with the
    // placeholders extraction adds, so the restore refuses instead of
    // swapping in the wrong fragment's source.
    const body = '<span data-doc-fragment="0">own span</span><p>Text.</p>';
    expect(opaqueBlocksRoundTrip(body)).toBe(false);
  });
});

describe("authoredDocs — full HTML documents", () => {
  it("splits a document around <body> and rejoins byte-identically", () => {
    const split = splitHtmlDocument(HTML_DOC);
    expect(split.prefix).toContain("<!DOCTYPE html>");
    expect(split.prefix).toContain("<style>");
    expect(split.body).toBe("<h1>Welcome</h1><p>Hello.</p>");
    expect(split.suffix).toBe("</body>\n</html>\n");
    expect(joinHtmlDocument(split)).toBe(HTML_DOC);
  });

  it("a body fragment with no <body> element splits as prefix/suffix empty", () => {
    const split = splitHtmlDocument("<p>Fragment.</p>");
    expect(split.prefix).toBe("");
    expect(split.suffix).toBe("");
    expect(split.body).toBe("<p>Fragment.</p>");
    expect(joinHtmlDocument(split)).toBe("<p>Fragment.</p>");
  });

  it("an inline <style> block in the body survives extract + restore byte-identically", () => {
    const body = "<style>.a { color: blue; }</style><p>Text.</p>";
    expect(opaqueBlocksRoundTrip(body)).toBe(true);
    const { fragments } = extractOpaqueBlocks(body);
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.kind).toBe("style");
  });
});
