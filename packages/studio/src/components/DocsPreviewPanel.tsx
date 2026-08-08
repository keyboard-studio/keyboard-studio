// DocsPreviewPanel — spec 061 Story 2: an in-studio, live preview of the four
// shipped documentation files, mounted from the Phase F ("help") step.
//
// Behind a "Preview documentation" disclosure toggle (same aria-expanded /
// aria-controls convention as editors/assignLoop/parts/RemovalBanner.tsx),
// so it never crowds the survey question above it by default. Reads
// useDocsPreview() on every render — no fetch, no debounce, no compiled
// artifact — so it reflects the current answers immediately, before any
// output package is produced (FR-015/SC-006).
//
// The two `.htm`/`.php` previews render inside a strictly sandboxed
// `<iframe srcDoc>` (no `allow-scripts`) rather than `dangerouslySetInnerHTML`
// in the parent DOM — the rendered strings are already HTML-escaped
// (helpDocsRender's own escapeHtml pass), but an iframe boundary is a second,
// structural guard against markup ever executing in the studio's own page.

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useDocsPreview } from "../hooks/useDocsPreview.ts";

const PANEL_ID = "docs-preview-panel-content";

export function DocsPreviewPanel(): React.ReactElement {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const preview = useDocsPreview();

  return (
    <div style={{ borderTop: "1px solid var(--app-border, #ccc)", marginTop: 16, paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        style={{
          display: "flex", alignItems: "center", gap: 8, background: "transparent",
          border: "none", cursor: "pointer", font: "600 13px var(--app-font)", padding: 0,
          color: "var(--app-text)",
        }}
      >
        {t({ id: "editor.help.docsPreview.toggle", message: "Preview documentation" })}
      </button>

      {open && (
        <div id={PANEL_ID} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
          <section>
            <h3 style={{ font: "600 12px var(--app-font)", margin: "0 0 6px" }}>
              {t({ id: "editor.help.docsPreview.readmeHeading", message: "README.md" })}
            </h3>
            <pre
              style={{
                whiteSpace: "pre-wrap", margin: 0, padding: 10, fontSize: 12,
                border: "1px solid var(--app-border, #ccc)", borderRadius: 4, maxHeight: 200, overflow: "auto",
              }}
            >
              {preview.readmeMd}
            </pre>
          </section>

          <section>
            <h3 style={{ font: "600 12px var(--app-font)", margin: "0 0 6px" }}>
              {t({ id: "editor.help.docsPreview.readmeHtmHeading", message: "Package popup text" })}
            </h3>
            <iframe
              title={t({ id: "editor.help.docsPreview.readmeHtmHeading", message: "Package popup text" })}
              srcDoc={preview.readmeHtm}
              sandbox=""
              style={{ width: "100%", minHeight: 100, border: "1px solid var(--app-border, #ccc)", borderRadius: 4 }}
            />
          </section>

          <section>
            <h3 style={{ font: "600 12px var(--app-font)", margin: "0 0 6px" }}>
              {t({ id: "editor.help.docsPreview.welcomeHtmHeading", message: "Welcome page" })}
            </h3>
            <iframe
              title={t({ id: "editor.help.docsPreview.welcomeHtmHeading", message: "Welcome page" })}
              srcDoc={preview.welcomeHtm}
              sandbox=""
              style={{ width: "100%", minHeight: 200, border: "1px solid var(--app-border, #ccc)", borderRadius: 4 }}
            />
          </section>

          <section>
            <h3 style={{ font: "600 12px var(--app-font)", margin: "0 0 6px" }}>
              {t({ id: "editor.help.docsPreview.helpPhpHeading", message: "Online help page" })}
            </h3>
            <iframe
              title={t({ id: "editor.help.docsPreview.helpPhpHeading", message: "Online help page" })}
              srcDoc={preview.helpPhp}
              sandbox=""
              style={{ width: "100%", minHeight: 200, border: "1px solid var(--app-border, #ccc)", borderRadius: 4 }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
