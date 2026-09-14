import { describe, it, expect } from "vitest";
import {
  docMemberPath,
  parseHistoryEntries,
  compareVersions,
  parseReadmePlatforms,
  parsePagename,
  expectedPagename,
  extractDataStatesLayers,
  stripPhpHeader,
  stripKeyboardLayoutSection,
  normalizeDocBody,
  extractInlineStyles,
  arraysEqual,
  findUnbalancedTags,
} from "./_shared.js";

describe("docMemberPath", () => {
  it("maps every member id to its projected output path", () => {
    expect(docMemberPath("readme-md", "test_kbd")).toBe("README.md");
    expect(docMemberPath("history-md", "test_kbd")).toBe("HISTORY.md");
    expect(docMemberPath("license-md", "test_kbd")).toBe("LICENSE.md");
    expect(docMemberPath("readme-htm", "test_kbd")).toBe("source/readme.htm");
    expect(docMemberPath("welcome-htm", "test_kbd")).toBe("source/welcome/welcome.htm");
    expect(docMemberPath("help-php", "test_kbd")).toBe("source/help/test_kbd.php");
  });
});

describe("parseHistoryEntries", () => {
  it("parses a well-formed multi-entry HISTORY.md", () => {
    const text = "## 1.2 (2024-03-01)\n* Added shift layer.\n\n## 1.0 (2024-01-01)\n* Initial release.\n";
    const entries = parseHistoryEntries(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ version: "1.2", date: "2024-03-01", dateValid: true, bullets: ["Added shift layer."] });
    expect(entries[1]).toMatchObject({ version: "1.0", date: "2024-01-01", dateValid: true, bullets: ["Initial release."] });
  });

  it("accepts both * and - bullets", () => {
    const text = "## 1.0 (2024-01-01)\n- Initial release.\n* Second bullet.\n";
    const entries = parseHistoryEntries(text);
    expect(entries[0]?.bullets).toEqual(["Initial release.", "Second bullet."]);
  });

  it("flags a heading that doesn't match <version> (<date>)", () => {
    const entries = parseHistoryEntries("## Version 1.2\n* Added shift layer.\n");
    expect(entries[0]?.version).toBeNull();
  });

  it("flags a date that isn't YYYY-MM-DD", () => {
    const entries = parseHistoryEntries("## 1.0 (Jan 2024)\n* Initial release.\n");
    expect(entries[0]?.dateValid).toBe(false);
  });

  it("collects non-bullet body lines as stray lines", () => {
    const entries = parseHistoryEntries("## 1.0 (2024-01-01)\nInitial release, no bullet.\n");
    expect(entries[0]?.strayLines).toEqual(["Initial release, no bullet."]);
    expect(entries[0]?.bullets).toEqual([]);
  });

  it("returns [] for text with no ## headings", () => {
    expect(parseHistoryEntries("no headings here\n")).toEqual([]);
  });
});

describe("compareVersions", () => {
  it("orders numeric segments numerically, not lexically", () => {
    expect(compareVersions("1.9", "1.10")).toBeLessThan(0);
    expect(compareVersions("1.10", "1.9")).toBeGreaterThan(0);
  });

  it("treats equal versions as equal", () => {
    expect(compareVersions("1.2", "1.2")).toBe(0);
  });

  it("treats a missing trailing segment as 0", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.1", "1.2")).toBeGreaterThan(0);
  });
});

describe("parseReadmePlatforms", () => {
  it("parses the bullet list under '## Supported Platforms'", () => {
    const text = "# Foo\n\ndesc\n\n## Supported Platforms\n- windows\n- mac\n";
    expect(parseReadmePlatforms(text)).toEqual(["windows", "mac"]);
  });

  it("returns [] when the section is absent", () => {
    expect(parseReadmePlatforms("# Foo\n\ndesc\n")).toEqual([]);
  });

  it("stops at the next heading", () => {
    const text = "## Supported Platforms\n- windows\n\n## Links\n- ignored\n";
    expect(parseReadmePlatforms(text)).toEqual(["windows"]);
  });
});

describe("parsePagename / expectedPagename", () => {
  it("parses $pagename, unescaping PHP single-quote escapes", () => {
    const php = "<?php\n  $pagename = 'Foo\\'s Keyboard Help';\n  $pagetitle = $pagename;\n?>\n";
    expect(parsePagename(php)).toBe("Foo's Keyboard Help");
  });

  it("returns null when $pagename is absent", () => {
    expect(parsePagename("<html></html>")).toBeNull();
  });

  it("appends 'Keyboard Help' when the display name doesn't already end in Keyboard", () => {
    expect(expectedPagename("Dagbani")).toBe("Dagbani Keyboard Help");
  });

  it("appends only 'Help' when the display name already ends in Keyboard (case-insensitive)", () => {
    expect(expectedPagename("Foo Keyboard")).toBe("Foo Keyboard Help");
    expect(expectedPagename("Foo keyboard")).toBe("Foo keyboard Help");
  });
});

describe("extractDataStatesLayers", () => {
  it("splits a comma-separated data-states value", () => {
    expect(extractDataStatesLayers('<span data-states="default,shift">')).toEqual(["default", "shift"]);
  });

  it("returns [] when data-states is absent", () => {
    expect(extractDataStatesLayers("<span>")).toEqual([]);
  });

  it("dedupes across multiple attributes", () => {
    const html = '<span data-states="default"></span><span data-states="default,shift"></span>';
    expect(extractDataStatesLayers(html)).toEqual(["default", "shift"]);
  });
});

describe("stripPhpHeader / stripKeyboardLayoutSection / normalizeDocBody", () => {
  it("strips a leading <?php ... ?> block", () => {
    const text = "<?php\n  $pagename = 'X';\n?>\n<html><body><p>Hi</p></body></html>";
    expect(stripPhpHeader(text)).toBe("<html><body><p>Hi</p></body></html>");
  });

  it("is a no-op when there is no PHP header", () => {
    const text = "<html><body><p>Hi</p></body></html>";
    expect(stripPhpHeader(text)).toBe(text);
  });

  it("strips the Keyboard Layout section", () => {
    const text = '<html><body><p>Hi</p><h2>Keyboard Layout</h2><p><img src="a.svg"></p></body></html>';
    expect(stripKeyboardLayoutSection(text)).toBe("<html><body><p>Hi</p></body></html>");
  });

  it("normalizes surrounding-whitespace differences to the same body", () => {
    const a = "<html><body><p>Hi</p></body></html>";
    const b = "  <html><body><p>Hi</p></body></html>  \n";
    expect(normalizeDocBody(a)).toBe(normalizeDocBody(b));
  });
});

describe("extractInlineStyles / arraysEqual", () => {
  it("extracts style attribute values in document order", () => {
    const html = '<p style="color:red">a</p><p style="color:blue">b</p>';
    expect(extractInlineStyles(html)).toEqual(["color:red", "color:blue"]);
  });

  it("extracts <style> block contents, whitespace stripped", () => {
    const html = "<style>p { color: red; }</style>";
    expect(extractInlineStyles(html)).toEqual(["p{color:red;}"]);
  });

  it("strips non-rendering whitespace differences", () => {
    expect(extractInlineStyles('<p style="color:  red">a</p>')).toEqual(["color:red"]);
  });

  it("arraysEqual compares by value", () => {
    expect(arraysEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(arraysEqual(["a"], ["a", "b"])).toBe(false);
    expect(arraysEqual(["a"], ["b"])).toBe(false);
  });
});

describe("findUnbalancedTags", () => {
  it("finds nothing wrong with well-formed HTML", () => {
    expect(findUnbalancedTags("<html><body><p>Hi</p></body></html>")).toEqual([]);
  });

  it("does not require a closing tag for void elements", () => {
    expect(findUnbalancedTags("<p>Hi<br><img src=\"a.png\"></p>")).toEqual([]);
  });

  it("does not flag a self-closed element", () => {
    expect(findUnbalancedTags('<svg><path d="M0 0"/></svg>')).toEqual([]);
  });

  it("flags an unclosed element", () => {
    const findings = findUnbalancedTags("<html><body><p>Hi</body></html>");
    expect(findings).toEqual([{ tag: "p", kind: "mismatched" }]);
  });

  it("flags a stray closing tag with no matching open tag", () => {
    const findings = findUnbalancedTags("<p>Hi</p></p>");
    expect(findings).toContainEqual({ tag: "p", kind: "stray-closing" });
  });

  it("flags an element left open at end of document", () => {
    const findings = findUnbalancedTags("<html><body><p>Hi");
    const tags = findings.map((f) => f.tag).sort();
    expect(tags).toEqual(["body", "html", "p"]);
  });
});
