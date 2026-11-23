/**
 * The Documentation step's "as installed" preview document (design
 * docs/superpowers/specs/2026-11-16-docs-side-by-side-preview-design.md).
 *
 * Pure helpers: resolve a page's relative asset references against the
 * working copy's files and replace them with `data:` URLs, so a sandboxed
 * `srcdoc` iframe shows the page with its own stylesheet and images.
 * `data:` rather than object URLs because a `sandbox=""` frame has an opaque
 * origin and is not guaranteed to resolve the parent's `blob:` URLs.
 */

import { marked } from "marked";
import { splitPhpPage } from "./authoredDocs.ts";

/** A `data:` URL for a working-copy path, or undefined when the file is absent. */
export type AssetLookup = (vfsPath: string) => string | undefined;

/** The Documentation step's files, as `HtmlEditor` names them. */
export type DocPreviewMember =
  | "welcome-htm"
  | "readme-htm"
  | "help-php"
  | "readme-md"
  | "history-md"
  | "license-md";

/** Anything with a scheme (`https:`, `data:`, `mailto:`), protocol-relative, root-absolute or a bare fragment. */
const NON_RELATIVE_RE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

/**
 * The working-copy path a relative reference points at, resolved against
 * `baseDir` (`""` for the root, otherwise ending in `/`). Query and fragment
 * are dropped and percent-escapes decoded. Null for a non-relative ref, an
 * empty one, or one whose `..` climbs above the root.
 */
export function resolveRef(baseDir: string, ref: string): string | null {
  const trimmed = ref.trim();
  if (trimmed === "" || NON_RELATIVE_RE.test(trimmed)) return null;
  const pathPart = trimmed.split(/[?#]/, 1)[0] ?? "";
  if (pathPart === "") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  const segments = baseDir.split("/").filter((s) => s !== "");
  for (const seg of decoded.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(seg);
    }
  }
  return segments.length === 0 ? null : segments.join("/");
}

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/**
 * Rewrite each CSS `url(...)` whose ref resolves (against `cssDir`) to a
 * present file. Missing or external refs are left exactly as written.
 */
export function rewriteCssUrls(css: string, cssDir: string, lookup: AssetLookup, quote: '"' | "'" = '"'): string {
  return css.replace(CSS_URL_RE, (whole, _q: string, ref: string) => {
    const path = resolveRef(cssDir, ref);
    const url = path === null ? undefined : lookup(path);
    return url === undefined ? whole : `url(${quote}${url}${quote})`;
  });
}

const ATTR_RE = /(\s(?:src|href)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
const STYLE_ATTR_RE = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi;
const STYLE_BLOCK_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

/**
 * Rewrite a page's `src` / `href` attributes, `style` attributes and
 * `<style>` blocks so references that resolve against `baseDir` to a
 * present file become `data:` URLs.
 */
export function rewriteHtmlRefs(html: string, baseDir: string, lookup: AssetLookup): string {
  return html
    .replace(ATTR_RE, (whole, lead: string, dq: string | undefined, sq: string | undefined) => {
      const ref = dq ?? sq ?? "";
      const path = resolveRef(baseDir, ref);
      const url = path === null ? undefined : lookup(path);
      if (url === undefined) return whole;
      return dq !== undefined ? `${lead}"${url}"` : `${lead}'${url}'`;
    })
    .replace(STYLE_ATTR_RE, (_whole, lead: string, dq: string | undefined, sq: string | undefined) =>
      dq !== undefined
        ? `${lead}"${rewriteCssUrls(dq, baseDir, lookup, "'")}"`
        : `${lead}'${rewriteCssUrls(sq ?? "", baseDir, lookup, '"')}'`,
    )
    .replace(
      STYLE_BLOCK_RE,
      (_whole, open: string, body: string, close: string) => `${open}${rewriteCssUrls(body, baseDir, lookup)}${close}`,
    );
}

// GitHub-like base styles for the Markdown members (README, HISTORY, LICENSE),
// kept in markdownPreview.css: they style the previewed page, where studio
// theme tokens do not exist. Lazy glob, not a static `?raw` import: the
// i18n-content-extract checker loads this graph under tsx, which supports
// neither (see touchBuilder/builderTemplates.ts).
let markdownCss: string | undefined;
function markdownPreviewCss(): string {
  if (markdownCss === undefined) {
    const modules = import.meta.glob("./markdownPreview.css", {
      eager: true,
      query: "?raw",
      import: "default",
    }) as Record<string, string>;
    markdownCss = Object.values(modules)[0] ?? "";
  }
  return markdownCss;
}

/**
 * Links open "in a new tab", which the `sandbox=""` frame refuses — so a
 * click does nothing instead of navigating the preview away to a site that
 * refuses framing, or to the studio's own URL (an `about:srcdoc` page
 * resolves relative links against its parent), and leaving it stuck there.
 */
const BASE_TAG = '<base target="_blank">';

function shell(head: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">${BASE_TAG}${head}</head><body>${body}</body></html>`;
}

/** Put {@link BASE_TAG} first in a full page's head (or straight after `<html>` when it has none). */
function withBaseTag(page: string): string {
  if (/<head[\s>]/i.test(page)) return page.replace(/<head(\s[^>]*)?>/i, (open) => `${open}${BASE_TAG}`);
  return page.replace(/<html(\s[^>]*)?>/i, (open) => `${open}<head>${BASE_TAG}</head>`);
}

/** Every `<?php ... ?>` block (or an unclosed trailing one): server-side, never shown. */
const PHP_BLOCK_RE = /<\?php[\s\S]*?(?:\?>|$)/g;

export interface PreviewDocumentInput {
  member: DocPreviewMember;
  /** The file's current text (the full page for HTML members). */
  text: string;
  /** Where the welcome page ships (folder or flat convention), if known. */
  welcomePath: string | null;
  /** Stylesheets directly under `source/help/`, applied to the help body. */
  helpCssPaths: readonly string[];
  lookup: AssetLookup;
}

/** The complete HTML document a sandboxed `srcdoc` frame renders for `member`. */
export function buildPreviewDocument(input: PreviewDocumentInput): string {
  const { member, text, welcomePath, helpCssPaths, lookup } = input;
  const dir = baseDirFor(member, welcomePath);
  switch (member) {
    case "welcome-htm":
    case "readme-htm": {
      const page = /<html[\s>]/i.test(text) ? withBaseTag(text) : shell("", text);
      return rewriteHtmlRefs(page, dir, lookup);
    }
    case "help-php": {
      const body = splitPhpPage(text).body.replace(PHP_BLOCK_RE, "");
      const links = helpCssPaths
        .map((p) => `<link rel="stylesheet" href="${p.slice(p.lastIndexOf("/") + 1)}">`)
        .join("");
      return rewriteHtmlRefs(shell(links, body), dir, lookup);
    }
    default: {
      const html = marked.parse(text, { gfm: true, async: false });
      return rewriteHtmlRefs(shell(`<style>${markdownPreviewCss()}</style>`, html), dir, lookup);
    }
  }
}

/** The folder a member's relative references resolve against: where the file ships. */
export function baseDirFor(member: DocPreviewMember, welcomePath: string | null): string {
  switch (member) {
    case "welcome-htm": {
      if (welcomePath === null) return "source/welcome/";
      const slash = welcomePath.lastIndexOf("/");
      return slash < 0 ? "" : welcomePath.slice(0, slash + 1);
    }
    case "readme-htm":
      return "source/";
    case "help-php":
      return "source/help/";
    default:
      return "";
  }
}
