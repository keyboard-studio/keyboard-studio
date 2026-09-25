import { describe, it, expect } from "vitest";
import {
  docMemberPath,
  parseHistoryEntries,
  extractHistoryPreamble,
  splitHistoryPreamble,
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

  it("parses setext/hyphen-underline headings (criteria.md §3.5 / corpus)", () => {
    const text =
      "1.1 (2019-02-02)\n---------------\n* Fixed something.\n\n1.0 (2018-01-01)\n---------------\n* Initial release.\n";
    const entries = parseHistoryEntries(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      headingRaw: "1.1 (2019-02-02)",
      version: "1.1",
      date: "2019-02-02",
      dateValid: true,
      bullets: ["Fixed something."],
    });
    expect(entries[1]).toMatchObject({ version: "1.0", bullets: ["Initial release."] });
  });

  it("parses a mix of ATX and setext entries in one file", () => {
    const text =
      "## 1.2 (2024-03-01)\n* Tool adapt entry.\n\n1.0 (2020-01-01)\n---------------\n* Initial release.\n";
    const entries = parseHistoryEntries(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.version).toBe("1.2");
    expect(entries[1]?.version).toBe("1.0");
  });

  it("ignores a leading title preamble — entries start at the first real heading", () => {
    const text =
      "# EuroLatin (SIL) Change History\n\n## 1.0 (2020-01-01)\n* Initial release.\n";
    const entries = parseHistoryEntries(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.version).toBe("1.0");
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

  it("returns [] for text with no ## or setext headings", () => {
    expect(parseHistoryEntries("no headings here\n")).toEqual([]);
  });

  it("parses setext (underline) style H2 headings", () => {
    const text = "1.2 (2024-03-01)\n-----------------\n* Added shift layer.\n\n1.0 (2024-01-01)\n-----------------\n* Initial release.\n";
    const entries = parseHistoryEntries(text);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ version: "1.2", date: "2024-03-01", bullets: ["Added shift layer."] });
    expect(entries[1]).toMatchObject({ version: "1.0", date: "2024-01-01", bullets: ["Initial release."] });
  });

  it("ignores an ATX H1 preamble title and parses entries below it", () => {
    const text = "# Change History\n\n## 1.0 (2024-01-01)\n* Initial release.\n";
    const entries = parseHistoryEntries(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.version).toBe("1.0");
  });

  it("ignores a setext H1 preamble title and parses entries below it", () => {
    const text = "Change History\n==============\n\n1.0 (2024-01-01)\n-----------------\n* Initial release.\n";
    const entries = parseHistoryEntries(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.version).toBe("1.0");
  });
});

describe("extractHistoryPreamble", () => {
  it("returns '' when there is no preamble", () => {
    expect(extractHistoryPreamble("## 1.0 (2024-01-01)\n* Initial release.\n")).toBe("");
  });

  it("extracts an ATX H1 preamble with trailing blank line", () => {
    const text = "# Change History\n\n## 1.0 (2024-01-01)\n* Initial release.\n";
    expect(extractHistoryPreamble(text)).toBe("# Change History\n\n");
  });

  it("extracts a setext H1 preamble", () => {
    const text = "Change History\n==============\n\n1.0 (2024-01-01)\n-----------------\n* Initial release.\n";
    expect(extractHistoryPreamble(text)).toBe("Change History\n==============\n\n");
  });

  it("returns '' for an empty string", () => {
    expect(extractHistoryPreamble("")).toBe("");
  });
});

describe("splitHistoryPreamble", () => {
  it("returns an empty preamble when the file starts with an entry", () => {
    const text = "## 1.0 (2024-01-01)\n* Initial release.\n";
    expect(splitHistoryPreamble(text)).toEqual({ preamble: "", rest: text });
  });

  it("keeps an ATX title above the first entry", () => {
    const text = "# Change History\n\n## 1.0 (2024-01-01)\n* Initial release.\n";
    const { preamble, rest } = splitHistoryPreamble(text);
    expect(preamble).toBe("# Change History\n");
    expect(rest).toBe("## 1.0 (2024-01-01)\n* Initial release.\n");
  });

  it("keeps a setext title above the first setext entry", () => {
    const text =
      "EuroLatin (SIL) Change History\n==============================\n\n1.0 (2020-01-01)\n---------------\n* Initial release.\n";
    const { preamble, rest } = splitHistoryPreamble(text);
    expect(preamble).toContain("EuroLatin (SIL) Change History");
    expect(preamble).toContain("==============================");
    expect(rest.startsWith("1.0 (2020-01-01)")).toBe(true);
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

  it("strips html/body wrappers so welcome.htm and fresh help.php bodies compare equal", () => {
    const welcome = "<html><body><p>Welcome to Test</p></body></html>";
    const helpFrag = "<p>Welcome to Test</p>";
    expect(normalizeDocBody(welcome)).toBe(normalizeDocBody(helpFrag));
  });

  it("treats a full welcome document and a help body fragment as the same body", () => {
    const welcome = "<html><body><p>Hi</p></body></html>";
    const help = "<?php\n  $pagename = 'X';\n?>\n<p>Hi</p>";
    expect(normalizeDocBody(welcome)).toBe(normalizeDocBody(help));
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
