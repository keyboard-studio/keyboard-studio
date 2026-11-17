import { describe, it, expect } from "vitest";
import {
  baseDirFor,
  buildPreviewDocument,
  resolveRef,
  rewriteCssUrls,
  rewriteHtmlRefs,
  type AssetLookup,
} from "./docPreviewDocument.ts";

const ASSETS: Record<string, string> = {
  "source/welcome/kb.css": "data:text/css;base64,AA==",
  "source/welcome/chart.png": "data:image/png;base64,AA==",
  "source/welcome/img/bg.png": "data:image/png;base64,BB==",
  "source/kb.css": "data:text/css;base64,CC==",
  "source/welcome/my chart.png": "data:image/png;base64,DD==",
};
const lookup: AssetLookup = (p) => ASSETS[p];

describe("resolveRef", () => {
  it("resolves relative refs against the page's folder", () => {
    expect(resolveRef("source/welcome/", "chart.png")).toBe("source/welcome/chart.png");
    expect(resolveRef("source/welcome/", "./chart.png")).toBe("source/welcome/chart.png");
    expect(resolveRef("source/welcome/", "../kb.css")).toBe("source/kb.css");
    expect(resolveRef("source/welcome/", "chart.png?v=2#a")).toBe("source/welcome/chart.png");
    expect(resolveRef("source/welcome/", "my%20chart.png")).toBe("source/welcome/my chart.png");
  });

  it("leaves absolute, external and escaping refs alone", () => {
    for (const ref of [
      "https://x/y.png",
      "http://x",
      "//cdn/x.css",
      "data:image/png;base64,AA==",
      "mailto:a@b",
      "#top",
      "/abs.png",
      "../../../x.png",
    ]) {
      expect(resolveRef("source/welcome/", ref), ref).toBeNull();
    }
  });
});

describe("rewriteHtmlRefs", () => {
  it("rewrites src and href that resolve to a present file, and leaves the rest as written", () => {
    const out = rewriteHtmlRefs(
      '<link rel="stylesheet" href="kb.css"><img src="chart.png"><img src="missing.png"><a href="https://keyman.com">k</a>',
      "source/welcome/",
      lookup,
    );
    expect(out).toContain('href="data:text/css;base64,AA=="');
    expect(out).toContain('src="data:image/png;base64,AA=="');
    expect(out).toContain('src="missing.png"');
    expect(out).toContain('href="https://keyman.com"');
  });

  it("handles single-quoted attributes", () => {
    expect(rewriteHtmlRefs("<img src='chart.png'>", "source/welcome/", lookup)).toContain(
      "data:image/png;base64,AA==",
    );
  });

  it("rewrites url() in style attributes and style blocks", () => {
    const out = rewriteHtmlRefs(
      '<div style="background:url(chart.png)"></div><style>.a{background:url("chart.png")}</style>',
      "source/welcome/",
      lookup,
    );
    expect(out).not.toContain("url(chart.png)");
    expect(out).not.toContain('url("chart.png")');
    expect(out.match(/data:image\/png;base64,AA==/g)).toHaveLength(2);
  });
});

describe("rewriteCssUrls", () => {
  it("resolves url() against the stylesheet's own folder and keeps missing refs", () => {
    const out = rewriteCssUrls(
      ".a{background:url(img/bg.png)} .b{background:url('nope.png')}",
      "source/welcome/",
      lookup,
    );
    expect(out).toContain('url("data:image/png;base64,BB==")');
    expect(out).toContain("url('nope.png')");
  });
});

describe("buildPreviewDocument", () => {
  const base = { welcomePath: "source/welcome/welcome.htm", helpCssPaths: [] as string[], lookup };

  it("keeps a full welcome page's head and points its stylesheet at the working copy", () => {
    const doc = buildPreviewDocument({
      ...base,
      member: "welcome-htm",
      text: '<html><head><link rel="stylesheet" href="kb.css"></head><body><h1>Hi</h1></body></html>',
    });
    expect(doc).toContain("<head>");
    expect(doc).toContain('href="data:text/css;base64,AA=="');
  });

  it("keeps clicked links from navigating the preview away", () => {
    const full = buildPreviewDocument({
      ...base,
      member: "welcome-htm",
      text: "<html><head><title>T</title></head><body><a href=\"https://keyman.com\">k</a></body></html>",
    });
    expect(full).toMatch(/<head><base target="_blank">/);
    const md = buildPreviewDocument({ ...base, member: "readme-md", text: "[k](https://keyman.com)" });
    expect(md).toContain('<base target="_blank">');
  });

  it("wraps a welcome fragment in a page shell", () => {
    const doc = buildPreviewDocument({ ...base, member: "welcome-htm", text: "<h1>Hi</h1>" });
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("<h1>Hi</h1>");
  });

  it("shows the help page body with the help folder's stylesheet and no PHP", () => {
    const doc = buildPreviewDocument({
      member: "help-php",
      text: "<?php require 'header.php'; ?>\n<h1>Help</h1>",
      welcomePath: null,
      helpCssPaths: ["source/help/kb.css"],
      lookup: (p) => (p === "source/help/kb.css" ? "data:text/css;base64,EE==" : undefined),
    });
    expect(doc).toContain("<h1>Help</h1>");
    expect(doc).toContain('href="data:text/css;base64,EE=="');
    expect(doc).not.toContain("<?php");
  });

  it("renders README.md as Markdown with GitHub-like styles", () => {
    const doc = buildPreviewDocument({
      ...base,
      member: "readme-md",
      text: "# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    });
    expect(doc).toContain("<h1");
    expect(doc).toContain("<table");
    expect(doc).toContain("max-width: 880px");
  });
});

describe("baseDirFor", () => {
  it("uses the folder each file ships in", () => {
    expect(baseDirFor("welcome-htm", "source/welcome.htm")).toBe("source/");
    expect(baseDirFor("welcome-htm", "source/welcome/welcome.htm")).toBe("source/welcome/");
    expect(baseDirFor("welcome-htm", null)).toBe("source/welcome/");
    expect(baseDirFor("readme-htm", null)).toBe("source/");
    expect(baseDirFor("help-php", null)).toBe("source/help/");
    expect(baseDirFor("readme-md", null)).toBe("");
  });
});
