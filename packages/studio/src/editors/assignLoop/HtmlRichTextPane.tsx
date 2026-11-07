// HtmlRichTextPane — lazy-loaded TipTap v3 WYSIWYG pane for the Documentation step (specs/html-editor).
//
// `value` in, `onChange` out. HTML for `.htm` and the `.php` body,
// Markdown (via `@tiptap/markdown`) for `.md` files.
//
// The editor edits a body fragment, never a full document: the caller
// splits doctype/`<head>`/`<body>` chrome off first (lib/authoredDocs.ts
// `splitHtmlDocument`) and rejoins on save, so TipTap's document model
// cannot eat the page's `<style>` in `<head>` or its doctype. Mid-body
// `<?php … ?>` fragments and inline `<style>` blocks arrive already
// extracted as opaque placeholder spans (`data-doc-fragment`) and are
// rendered as non-editable atom nodes, so an edit can neither mangle nor
// drop them; `onChange` returns the HTML with the placeholders still in
// place and the caller restores the exact source text.

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Node, Mark, type Extensions } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { useLingui } from "@lingui/react/macro";

export type RichTextFormat = "html" | "markdown";

/**
 * Inline `<kbd>` mark: the generated typing guide wraps key labels in
 * `<kbd>` (lib/docContent.ts `shortestKeys`). StarterKit has no kbd mark,
 * so parsing dropped them; this mark round-trips them byte-for-byte.
 * There is no toolbar button for it — it exists to preserve the generated
 * markup, not to author new key labels.
 */
const Kbd = Mark.create({
  name: "kbd",
  parseHTML: () => [{ tag: "kbd" }],
  renderHTML: () => ["kbd", 0],
});

/**
 * The generated typing guide is a plain `<table>` (no attributes) whose
 * cells hold text and `<kbd>` (lib/docContent.ts `renderGuideTable`).
 * Stock TipTap tables need two adjustments so a rich edit does not dirty it:
 * - Cells hold inline content, not blocks: the default `block+` cells wrap
 *   every cell in `<p>` on serialize (`<td><p>ŋ</p></td>`). `inline*`
 *   keeps `<td>ŋ</td>` as-is, and cell text stays directly editable.
 * - Stock `renderHTML` always emits a `style` + `<colgroup>` (min-width
 *   bookkeeping for resizable columns, on even with `resizable: false`).
 *   This override serializes a clean table.
 * The one residual normalization is the `<thead>` fold: TipTap's table
 * model has no thead, so the header row serializes as `<th>` cells in the
 * first `<tbody>` row. It renders identically and carries the same content.
 */
const GuideTable = Table.extend({
  renderHTML: () => ["table", ["tbody", 0]],
});
const InlineTableCell = TableCell.extend({ content: "inline*" });
const InlineTableHeader = TableHeader.extend({ content: "inline*" });

/**
 * The pane's exact extension set, shared with the round-trip tests so the
 * tests pin what the pane actually parses and serializes. Tables and `<kbd>`
 * apply to HTML only: the generated README.md carries no tables, and
 * `@tiptap/markdown` serializes tables only when the table extensions are
 * registered — registering them in markdown mode would change the README
 * round-trip for no generated content.
 */
export function richTextExtensions(format: RichTextFormat): Extensions {
  if (format === "markdown") return [StarterKit, Markdown, DocFragment];
  return [
    StarterKit,
    Kbd,
    GuideTable.configure({ resizable: false }),
    TableRow,
    InlineTableHeader,
    InlineTableCell,
    DocFragment,
  ];
}

/**
 * An opaque, non-editable inline atom for one extracted fragment
 * (mid-body PHP or an inline `<style>` block). The fragment index rides in
 * `data-doc-fragment`; the label rides in `data-doc-label` so the node
 * survives a parse/serialize round-trip through the editor.
 */
const DocFragment = Node.create({
  name: "docFragment",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      index: { default: 0 },
      label: { default: "PHP code" },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-doc-fragment]",
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const index = Number(element.getAttribute("data-doc-fragment"));
          if (!Number.isInteger(index)) return false;
          return {
            index,
            label: element.getAttribute("data-doc-label") ?? element.textContent ?? "PHP code",
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "span",
      {
        "data-doc-fragment": String(node.attrs.index),
        "data-doc-label": String(node.attrs.label),
        contenteditable: "false",
      },
      String(node.attrs.label),
    ];
  },
});

export interface HtmlRichTextPaneProps {
  /** The editable body text: HTML, or Markdown when `format` is "markdown". May carry `data-doc-fragment` placeholder spans. */
  value: string;
  format: RichTextFormat;
  /** Called with the editor's current content (HTML, or Markdown for `format: "markdown"`), placeholders intact. */
  onChange: (text: string) => void;
}

export function HtmlRichTextPane({ value, format, onChange }: HtmlRichTextPaneProps) {
  const { t } = useLingui();
  const editor = useEditor({
    extensions: richTextExtensions(format),
    content: value,
    ...(format === "markdown" ? { contentType: "markdown" as const } : {}),
    onUpdate: ({ editor: next }) => {
      onChange(format === "markdown" ? next.getMarkdown() : next.getHTML());
    },
  });

  // The parent remounts this pane (via `key`) when the selected file or
  // its seed changes, so no live content sync is needed here; this effect
  // only covers the first mount racing the editor's creation.
  //
  // The sync must NOT emit an update: `editor.getHTML()` is the parsed and
  // re-serialised form of `value`, so it near-never string-equals the raw
  // source (whitespace, attribute order, `<p>` wrapping, the table's
  // `<thead>` folded into `<tbody>`) — and any update it emitted would
  // record a phantom edit the author never made, whose override then beats
  // generation at serialize time. emitUpdate:false keeps the sync silent;
  // real edits still flow out through onUpdate. (PR #2569: the golden walk
  // failed with welcome.htm differing on CI while local walks pass; this
  // silences the one emission path the mount owns. If the lane still fails,
  // the mechanism is elsewhere and needs the CI walked bytes to name it.)
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    if (format === "markdown") {
      if (editor.getMarkdown() !== value)
        editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    } else if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // Intentionally once, on mount: live edits flow out through onUpdate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (editor === null) {
    return (
      <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
        {t({ id: "editor.assignLoop.html.rich.loading", message: "Loading editor…" })}
      </div>
    );
  }

  const button = (label: string, active: boolean, onClick: () => void, testId: string) => (
    <button
      key={testId}
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "4px 10px",
        fontSize: 12,
        borderRadius: 6,
        border: `1px solid ${active ? "var(--app-accent)" : "var(--app-border)"}`,
        background: active ? "var(--app-accent-bg)" : "var(--app-surface)",
        color: "var(--app-text)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <style>{`.tiptap{outline:none;min-height:280px}.tiptap p{margin:0 0 8px}.tiptap h1,.tiptap h2,.tiptap h3{margin:12px 0 8px}.tiptap ul,.tiptap ol{margin:0 0 8px;padding-left:24px}.tiptap blockquote{margin:0 0 8px;padding-left:12px;border-left:3px solid var(--app-border)}.tiptap pre{background:var(--app-surface);padding:8px;border-radius:6px;overflow:auto}.tiptap span[data-doc-fragment]{background:var(--app-accent-bg);border:1px dashed var(--app-accent);border-radius:4px;padding:0 6px;font-size:12px;white-space:nowrap}.tiptap table{border-collapse:collapse;margin:0 0 8px}.tiptap th,.tiptap td{border:1px solid var(--app-border);padding:4px 8px;text-align:left}.tiptap th{background:var(--app-surface)}.tiptap kbd{font-family:inherit;border:1px solid var(--app-border);border-bottom-width:2px;border-radius:4px;padding:0 4px;background:var(--app-surface)}`}</style>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="toolbar" aria-label={t({ id: "editor.assignLoop.html.rich.toolbar", message: "Formatting" })}>
        {button(t({ id: "editor.assignLoop.html.rich.bold", message: "Bold" }), editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "rich-bold")}
        {button(t({ id: "editor.assignLoop.html.rich.italic", message: "Italic" }), editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "rich-italic")}
        {button(t({ id: "editor.assignLoop.html.rich.heading", message: "Heading" }), editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "rich-heading")}
        {button(t({ id: "editor.assignLoop.html.rich.bulletList", message: "Bullets" }), editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "rich-bullets")}
        {button(t({ id: "editor.assignLoop.html.rich.orderedList", message: "Ordered list" }), editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "rich-ordered")}
        {button(t({ id: "editor.assignLoop.html.rich.quote", message: "Quote" }), editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "rich-quote")}
        {button(t({ id: "editor.assignLoop.html.rich.codeBlock", message: "Code block" }), editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), "rich-code")}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 280,
          overflowY: "auto",
          border: "1px solid var(--app-border)",
          borderRadius: 8,
          padding: 12,
          background: "var(--app-background)",
          color: "var(--app-text)",
          fontSize: 14,
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
