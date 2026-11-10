// HtmlRichTextPane — table + `<kbd>` round-trip (specs/html-editor, PR #2569).
//
// The generated typing guide is a plain `<table>` whose cells hold text and
// `<kbd>` (lib/docContent.ts `renderGuideTable` / `shortestKeys`). These
// tests drive the pane's exact extension set headlessly — TipTap's Editor
// loads under vitest/jsdom — and pin the serialized shape: cells stay inline
// (no `<p>` wrappers), `<kbd>` survives byte-for-byte, and the only
// normalization is the `<thead>` fold (TipTap's table model has no thead, so
// the header row serializes as `<th>` cells in the first `<tbody>` row).
// The pane-mount test pins the no-phantom-edit property end to end: opening
// the step on a table-bearing page and Continuing without touching anything
// must not record an override (the golden-walk lane proves the same on the
// shipped bytes).

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { render } from "../../test/renderWithI18n.tsx";
import { HtmlRichTextPane, richTextExtensions } from "./HtmlRichTextPane.tsx";

afterEach(() => {
  cleanup();
});

// The generated welcome.htm typing-guide shape (lib/docContent.ts).
const GUIDE =
  `<p>Typing guide</p>` +
  `<table><thead><tr><th>Character</th><th>Name</th><th>Keys</th></tr></thead>` +
  `<tbody><tr><td>ŋ</td><td>U+014B LATIN SMALL LETTER ENG</td><td><kbd>AltGr</kbd> then <kbd>n</kbd></td></tr>` +
  `<tr><td>ɔ</td><td>U+0254 LATIN SMALL LETTER OPEN O</td><td>See the layout pictures</td></tr></tbody></table>` +
  `<p>Hold <kbd>Shift</kbd> for more.</p>`;

// GUIDE as the pane serializes it: identical except the `<thead>` fold.
const GUIDE_NORMALIZED =
  `<p>Typing guide</p>` +
  `<table><tbody><tr><th>Character</th><th>Name</th><th>Keys</th></tr>` +
  `<tr><td>ŋ</td><td>U+014B LATIN SMALL LETTER ENG</td><td><kbd>AltGr</kbd> then <kbd>n</kbd></td></tr>` +
  `<tr><td>ɔ</td><td>U+0254 LATIN SMALL LETTER OPEN O</td><td>See the layout pictures</td></tr></tbody></table>` +
  `<p>Hold <kbd>Shift</kbd> for more.</p>`;

function guideEditor(): Editor {
  return new Editor({ extensions: richTextExtensions("html"), content: GUIDE });
}

describe("HtmlRichTextPane — table + kbd round-trip", () => {
  it("an unedited guide table serializes with the same rows, cells and kbd — only the thead folds", () => {
    const ed = guideEditor();
    const html = ed.getHTML();
    expect(html).toBe(GUIDE_NORMALIZED);
    expect(html).not.toContain("<thead>");
    expect(html).not.toContain("colgroup");
    expect(html).not.toContain("min-width");
    expect(html).not.toContain("<td><p>");
    ed.destroy();
  });

  it("a rich edit elsewhere preserves the table and kbd exactly", () => {
    const ed = guideEditor();
    ed.chain().focus().insertContentAt(1, "EDITED ").run();
    const html = ed.getHTML();
    expect(html).toBe(GUIDE_NORMALIZED.replace("<p>Typing guide</p>", "<p>EDITED Typing guide</p>"));
    ed.destroy();
  });

  it("table cell text is editable", () => {
    const ed = guideEditor();
    const { doc } = ed.state;
    let cellPos = -1;
    doc.descendants((node, pos) => {
      if (cellPos === -1 && node.isText && node.text === "ŋ") cellPos = pos;
      return cellPos === -1;
    });
    expect(cellPos).toBeGreaterThan(0);
    ed.chain().focus().setTextSelection(cellPos).insertContent("X").run();
    expect(ed.getHTML()).toContain("<td>Xŋ</td>");
    expect(ed.getHTML()).toContain("<kbd>AltGr</kbd> then <kbd>n</kbd>");
    ed.destroy();
  });

  it("the mount sync emits no update (no phantom edit)", async () => {
    let updates = 0;
    const ed = new Editor({
      extensions: richTextExtensions("html"),
      content: GUIDE,
      onUpdate: () => {
        updates += 1;
      },
    });
    // The pane's mount effect: re-set the same content silently when the
    // serialized form differs (here it differs — the thead fold).
    if (ed.getHTML() !== GUIDE) {
      ed.commands.setContent(GUIDE, { emitUpdate: false });
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(updates).toBe(0);
    ed.destroy();
  });

  it("markdown mode has no table node and round-trips a README fragment", () => {
    const ed = new Editor({
      extensions: richTextExtensions("markdown"),
      content: "# Test KB\n\nGenerated readme.\n",
      contentType: "markdown",
    });
    expect(ed.schema.nodes.table).toBeUndefined();
    expect(ed.getMarkdown()).toContain("# Test KB");
    expect(ed.getMarkdown()).toContain("Generated readme.");
    ed.destroy();
  });

  it("mounting the pane on the guide emits no change", async () => {
    const onChange = vi.fn();
    render(<HtmlRichTextPane value={GUIDE} format="html" onChange={onChange} />);
    await screen.findByText("Typing guide");
    await new Promise((r) => setTimeout(r, 50));
    expect(onChange).not.toHaveBeenCalled();
  });
});
