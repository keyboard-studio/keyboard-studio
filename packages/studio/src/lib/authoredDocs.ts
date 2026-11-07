// authoredDocs — the Documentation step's authored overrides (specs/html-editor).
//
// One nullable string per editable doc member in the working-copy store
// (null = untouched, "" = cleared — the `customCss` convention). The
// override wins over regeneration at every point the generated text is
// produced, through one shared helper:
//   1. projectWorkingCopyVfs step 0b (applyAuthoredDocsToVfs),
//   2. serializeWorkingCopy step 5c (resolveDocMemberText, after regeneration),
//   3. useDocsPreview (resolveDocMemberText).
// Untouched members keep exactly their current generated/carried behavior.
//
// .php handling: the editor edits the body as HTML; the leading `<?php … ?>`
// header is preserved verbatim (engine `leadingPhpBlock`) and mid-body
// `<?php … ?>` fragments plus inline `<style>` blocks become opaque,
// non-editable placeholder nodes in the WYSIWYG editor and are re-inserted
// byte-for-byte on save. A file whose PHP cannot round-trip exactly falls
// back to code-mode-only — never a silent mangle, never a dropped block.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { leadingPhpBlock } from "@keyboard-studio/engine";
import { WELCOME_PAGE_PATH } from "./welcomeFolder.ts";

export type EditableDocMember = "welcome-htm" | "readme-htm" | "readme-md" | "help-php";

/** The four editable members, in selector order. */
export const EDITABLE_DOC_MEMBERS: readonly EditableDocMember[] = [
  "welcome-htm",
  "readme-htm",
  "readme-md",
  "help-php",
];

/** The authored overrides as the store holds them (null = untouched). */
export interface AuthoredDocs {
  authoredWelcomeHtm: string | null;
  authoredReadmeHtm: string | null;
  authoredReadmeMd: string | null;
  authoredHelpPhp: string | null;
}

export const EMPTY_AUTHORED_DOCS: AuthoredDocs = {
  authoredWelcomeHtm: null,
  authoredReadmeHtm: null,
  authoredReadmeMd: null,
  authoredHelpPhp: null,
};

/** The authored override for one member, or null when untouched. */
export function authoredFor(member: EditableDocMember, authored: AuthoredDocs): string | null {
  switch (member) {
    case "welcome-htm":
      return authored.authoredWelcomeHtm;
    case "readme-htm":
      return authored.authoredReadmeHtm;
    case "readme-md":
      return authored.authoredReadmeMd;
    case "help-php":
      return authored.authoredHelpPhp;
  }
}

/** Authored wins for a touched file; untouched files keep the generated text. */
export function resolveDocMemberText(
  member: EditableDocMember,
  generated: string,
  authored: AuthoredDocs,
): string {
  const override = authoredFor(member, authored);
  return override !== null ? override : generated;
}

/** The VFS path a member ships at (help-php under the resolved keyboard id). */
export function docMemberPath(member: EditableDocMember, keyboardId: string): string {
  switch (member) {
    case "welcome-htm":
      return WELCOME_PAGE_PATH;
    case "readme-htm":
      return "source/readme.htm";
    case "readme-md":
      return "README.md";
    case "help-php":
      return `source/help/${keyboardId}.php`;
  }
}

/**
 * Write the authored overrides into the projected VFS. Null (untouched)
 * changes nothing; "" clears the member (writes an empty file — the
 * member stays present, unlike customCss's file removal, because the
 * package descriptor lists every doc member).
 */
export function applyAuthoredDocsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  authored: AuthoredDocs,
  /** Where the welcome page ships; the folder path, except an Open walk on a flat-convention base. */
  welcomePath: string = WELCOME_PAGE_PATH,
): void {
  for (const member of EDITABLE_DOC_MEMBERS) {
    const override = authoredFor(member, authored);
    if (override === null) continue;
    vfs.set(member === "welcome-htm" ? welcomePath : docMemberPath(member, keyboardId), override, false);
  }
}

// ---------------------------------------------------------------------------
// .php split / rejoin
// ---------------------------------------------------------------------------

export interface SplitPhpPage {
  /** The leading `<?php … ?>` header block, verbatim ("" when the page has none). */
  header: string;
  /** Everything after the header — the editable body. */
  body: string;
}

/** Split a help `.php` page into its preserved header and editable body. */
export function splitPhpPage(page: string): SplitPhpPage {
  const header = leadingPhpBlock(page);
  return { header, body: page.slice(header.length) };
}

/** Rejoin a split page. Byte-identical to the original when the body is untouched. */
export function joinPhpPage(split: SplitPhpPage): string {
  return `${split.header}${split.body}`;
}

/** True when splitting then rejoining a page reproduces it byte-for-byte. */
export function phpPageRoundTrips(page: string): boolean {
  return joinPhpPage(splitPhpPage(page)) === page;
}

// ---------------------------------------------------------------------------
// Opaque placeholder nodes (mid-body PHP + inline <style> in the WYSIWYG)
// ---------------------------------------------------------------------------

/** One opaque fragment pulled out of the edited body before TipTap sees it. */
export interface OpaqueFragment {
  /** The exact source text, re-inserted byte-for-byte on save. */
  source: string;
  /** "php" for `<?php … ?>`, "style" for an inline `<style>` block. */
  kind: "php" | "style";
}

export interface ExtractedOpaqueBlocks {
  /** The body with each opaque fragment replaced by a placeholder span. */
  body: string;
  fragments: OpaqueFragment[];
}

const OPAQUE_RE = /(<\?php[\s\S]*?\?>|<style\b[^>]*>[\s\S]*?<\/style\s*>)/gi;

function fragmentLabel(kind: "php" | "style"): string {
  return kind === "php" ? "PHP code" : "Style";
}

/**
 * Pull mid-body `<?php … ?>` fragments and inline `<style>` blocks out of
 * an editable body, replacing each with an opaque placeholder span the
 * WYSIWYG renders as a non-editable node. The span carries the fragment
 * index in `data-doc-fragment`; its text is a label, never the source.
 */
export function extractOpaqueBlocks(body: string): ExtractedOpaqueBlocks {
  const fragments: OpaqueFragment[] = [];
  const replaced = body.replace(OPAQUE_RE, (match) => {
    const kind: "php" | "style" = match.toLowerCase().startsWith("<?php") ? "php" : "style";
    const index = fragments.length;
    fragments.push({ source: match, kind });
    return `<span data-doc-fragment="${index}" contenteditable="false">${fragmentLabel(kind)}</span>`;
  });
  return { body: replaced, fragments };
}

const PLACEHOLDER_SPAN_RE =
  /<span\b[^>]*\bdata-doc-fragment="(\d+)"[^>]*>(?:[\s\S]*?)<\/span\s*>/gi;

/**
 * Re-insert the opaque fragments into editor HTML, replacing each
 * placeholder span with its exact source text. Returns `ok: false` when
 * any fragment has no placeholder (the author deleted it in the editor —
 * the caller must refuse to save that way) or a placeholder names an
 * unknown fragment.
 */
export function restoreOpaqueBlocks(
  html: string,
  fragments: readonly OpaqueFragment[],
): { text: string; ok: boolean } {
  const seen = new Set<number>();
  let ok = true;
  // A body that already carried a `data-doc-fragment` span collides with
  // the placeholders extraction adds: the count of spans in the editor
  // HTML must be exactly the fragment count, or a span would be replaced
  // with the wrong fragment's source.
  const spanCount = html.match(PLACEHOLDER_SPAN_RE)?.length ?? 0;
  if (spanCount !== fragments.length) ok = false;
  const text = html.replace(PLACEHOLDER_SPAN_RE, (_match, indexText: string) => {
    const index = Number(indexText);
    const fragment = fragments[index];
    if (fragment === undefined) {
      ok = false;
      return _match;
    }
    seen.add(index);
    return fragment.source;
  });
  if (seen.size !== fragments.length) ok = false;
  return { text, ok };
}

/** True when extract + restore reproduces the body byte-for-byte. */
export function opaqueBlocksRoundTrip(body: string): boolean {
  const { body: extracted, fragments } = extractOpaqueBlocks(body);
  const { text, ok } = restoreOpaqueBlocks(extracted, fragments);
  return ok && text === body;
}

// ---------------------------------------------------------------------------
// Full HTML document split (TipTap edits the body; doctype/head survive)
// ---------------------------------------------------------------------------

export interface SplitHtmlDocument {
  /** Doctype + `<head>` + opening `<body>` tag ("" when the text has no body element). */
  prefix: string;
  /** The `<body>` contents — what the WYSIWYG edits. */
  body: string;
  /** Closing `</body></html>` ("" when the text has no body element). */
  suffix: string;
}

/** Split a full HTML document around its `<body>` element. */
export function splitHtmlDocument(html: string): SplitHtmlDocument {
  const openMatch = /<body\b[^>]*>/i.exec(html);
  if (openMatch === null) return { prefix: "", body: html, suffix: "" };
  const bodyStart = openMatch.index + openMatch[0].length;
  const closeMatch = /<\/body\s*>/i.exec(html.slice(bodyStart));
  if (closeMatch === null) {
    return { prefix: html.slice(0, bodyStart), body: html.slice(bodyStart), suffix: "" };
  }
  const bodyEnd = bodyStart + closeMatch.index;
  return {
    prefix: html.slice(0, bodyStart),
    body: html.slice(bodyStart, bodyEnd),
    suffix: html.slice(bodyEnd),
  };
}

/** Rejoin a split document. Byte-identical when the body is untouched. */
export function joinHtmlDocument(split: SplitHtmlDocument): string {
  return `${split.prefix}${split.body}${split.suffix}`;
}
