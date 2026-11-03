/**
 * HtmlEditor — documentation editor step (after Help & Tips, Phase F).
 *
 * Edits the keyboard's `welcome.htm` file — which is Markdown despite its
 * `.htm` extension (verified on keymanapp/keyboards: basic_kbdus, akan,
 * khmer_angkor). This is the full user manual.
 *
 * Features:
 * - Monaco editor for Markdown (lazy-loaded)
 * - Live preview: rendered Markdown side-by-side or toggleable
 * - `readme.htm`, `README.md`, and `.php` versions are generated exports
 *   from this source — the output pipeline handles them, not this editor
 * - On Continue: passes { markdown } via onComplete for the output pipeline
 */

import { lazy, Suspense, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { EditorStepProps } from "../../steps/types.ts";

// Lazy-load the Monaco pane so it never lands in the main chunk.
const HtmlCodePane = lazy(() =>
  import("./HtmlCodePane.tsx").then((m) => ({ default: m.HtmlCodePane })),
);

// ---------------------------------------------------------------------------
// Lightweight Markdown renderer
// ---------------------------------------------------------------------------
// A minimal, safe renderer for the live preview. We avoid pulling in a full
// Markdown parser (lockfile constraints); this covers the common constructs
// found in keyboard documentation: headings, paragraphs, bold/italic,
// lists, links, images, inline code, and fenced code blocks.
//
// Security: HTML is escaped BEFORE Markdown transforms are applied, so
// author-supplied angle brackets can never become live markup.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  // Text is already HTML-escaped by the caller.
  let out = text;
  // Images: ![alt](src)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%"/>');
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, "<code style=\"background:var(--app-surface);padding:1px 4px;border-radius:3px;font-size:0.9em\">$1</code>");
  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_ (careful not to clash with bold)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  return out;
}

/** Render Markdown to sanitized HTML for preview. */
export function renderMarkdownPreview(markdown: string): string {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let inFence = false;
  let fenceContent: string[] = [];
  let inList = false;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const text = paragraph.join(" ");
      html.push(`<p style="margin:0 0 12px;line-height:1.6">${renderInline(escapeHtml(text))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    // Fenced code blocks
    if (/^(```+|~~~+)/.test(trimmed)) {
      if (inFence) {
        html.push(
          `<pre style="background:var(--app-surface);padding:12px;border-radius:6px;overflow:auto;font-size:12px"><code>${escapeHtml(fenceContent.join("\n"))}</code></pre>`,
        );
        fenceContent = [];
        inFence = false;
      } else {
        flushParagraph();
        flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceContent.push(line);
      continue;
    }

    // Blank line: flush paragraph and list
    if (trimmed === "") {
      flushParagraph();
      flushList();
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = (headingMatch[1] ?? "").length;
      const text = headingMatch[2] ?? "";
      const size = [20, 18, 16, 14, 13, 12][level - 1] ?? 14;
      html.push(
        `<h${level} style="margin:16px 0 8px;font-size:${size}px;color:var(--app-text)">${renderInline(escapeHtml(text))}</h${level}>`,
      );
      continue;
    }

    // Unordered list items
    const listMatch = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (listMatch) {
      flushParagraph();
      if (!inList) {
        html.push('<ul style="margin:0 0 12px;padding-left:24px;line-height:1.6">');
        inList = true;
      }
      html.push(`<li>${renderInline(escapeHtml(listMatch[1] ?? ""))}</li>`);
      continue;
    }

    // Ordered list items
    const orderedMatch = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      if (!inList) {
        html.push('<ol style="margin:0 0 12px;padding-left:24px;line-height:1.6">');
        inList = true;
      }
      html.push(`<li>${renderInline(escapeHtml(orderedMatch[1] ?? ""))}</li>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push('<hr style="border:none;border-top:1px solid var(--app-border);margin:16px 0"/>');
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      const quoteText = trimmed.replace(/^>\s?/, "");
      html.push(
        `<blockquote style="margin:0 0 12px;padding:8px 12px;border-left:3px solid var(--app-accent);color:var(--app-text-muted)">${renderInline(escapeHtml(quoteText))}</blockquote>`,
      );
      continue;
    }

    // Regular text: accumulate into paragraph
    // (flush list first — a non-list line ends the list)
    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (inFence && fenceContent.length > 0) {
    html.push(
      `<pre style="background:var(--app-surface);padding:12px;border-radius:6px;overflow:auto;font-size:12px"><code>${escapeHtml(fenceContent.join("\n"))}</code></pre>`,
    );
  }

  return html.join("\n");
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type PreviewMode = "edit" | "preview" | "side-by-side";

export function HtmlEditor({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();

  const [markdown, setMarkdown] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("side-by-side");

  const previewHtml = useMemo(() => renderMarkdownPreview(markdown), [markdown]);

  const handleApply = (newMarkdown: string) => {
    setMarkdown(newMarkdown);
  };

  const handleContinue = () => {
    // The output pipeline generates readme.htm, README.md, and .php from this source
    onComplete({ markdown });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20, color: "var(--app-text)" }}>
        {t({ id: "editor.assignLoop.html.title", message: "Documentation" })}
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
        {t({
          id: "editor.assignLoop.html.description",
          message:
            "Write the user documentation for your keyboard (welcome.htm). This is the full user manual — summaries and web versions are generated from it automatically.",
        })}
      </p>

      {/* Preview mode toggle */}
      <div style={{ display: "flex", gap: 8 }}>
        {(
          [
            ["edit", t({ id: "editor.assignLoop.html.previewMode.edit", message: "Edit" })],
            ["preview", t({ id: "editor.assignLoop.html.previewMode.preview", message: "Preview" })],
            ["side-by-side", t({ id: "editor.assignLoop.html.previewMode.sideBySide", message: "Side by side" })],
          ] as Array<[PreviewMode, string]>
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPreviewMode(mode)}
            aria-pressed={previewMode === mode}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${previewMode === mode ? "var(--app-accent)" : "var(--app-border)"}`,
              background: previewMode === mode ? "var(--app-accent-bg)" : "var(--app-surface)",
              color: "var(--app-text)",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Editor + Preview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: previewMode === "side-by-side" ? "1fr 1fr" : "1fr",
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Markdown Editor */}
        {(previewMode === "edit" || previewMode === "side-by-side") && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 300 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text)", marginBottom: 8 }}>
              {t({ id: "editor.assignLoop.html.editorLabel", message: "Markdown" })}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Suspense
                fallback={
                  <div style={{ padding: 16, color: "var(--app-text-muted)", fontSize: 13 }}>
                    {t({ id: "editor.assignLoop.html.code.loading", message: "Loading editor…" })}
                  </div>
                }
              >
                <HtmlCodePane initialText={markdown} onApply={handleApply} />
              </Suspense>
            </div>
          </div>
        )}

        {/* Preview */}
        {(previewMode === "preview" || previewMode === "side-by-side") && (
          <div
            style={{
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              background: "var(--app-background)",
              overflow: "auto",
              minHeight: 300,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--app-text-muted)", marginBottom: 12 }}>
              {t({ id: "editor.assignLoop.html.preview.label", message: "Preview" })}
            </div>
            {markdown.trim() === "" ? (
              <div style={{ color: "var(--app-text-muted)", fontSize: 13, fontStyle: "italic" }}>
                {t({
                  id: "editor.assignLoop.html.preview.empty",
                  message: "Nothing to preview yet — write some documentation on the left.",
                })}
              </div>
            ) : (
              <div
                style={{ fontSize: 14, color: "var(--app-text)" }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          gap: 8,
          paddingTop: 16,
          borderTop: "1px solid var(--app-border)",
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text)",
              cursor: "pointer",
            }}
          >
            {t({ id: "editor.assignLoop.html.back", message: "Back" })}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleContinue}
          style={{
            padding: "10px 24px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid var(--app-accent)",
            background: "var(--app-accent-bg)",
            color: "var(--app-text)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {t({ id: "editor.assignLoop.html.continue", message: "Continue" })}
        </button>
      </div>
    </div>
  );
}
