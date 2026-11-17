/**
 * The Documentation step's "as installed" preview (design
 * docs/superpowers/specs/2026-11-16-docs-side-by-side-preview-design.md):
 * the file rendered in a sandboxed frame the way a keyboard user sees it,
 * with the page's own stylesheet and images taken from the same projection
 * the download ships. `sandbox=""` — no scripts, and the keyboard's CSS
 * cannot reach the studio (nor the studio's the page).
 */

import { useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useDocPreviewAssets } from "../../hooks/useDocPreviewAssets.ts";
import { buildPreviewDocument, type DocPreviewMember } from "../../lib/docPreviewDocument.ts";

/** How long typing must pause before the preview reloads. */
const PREVIEW_SETTLE_MS = 300;

export function DocPreviewFrame({
  member,
  text,
  fileLabel,
}: {
  member: DocPreviewMember;
  text: string;
  fileLabel: string;
}) {
  const { t } = useLingui();
  const { lookup, welcomePath, helpCssPaths } = useDocPreviewAssets();
  // Each new srcdoc reloads the frame (scrolled to the top), so follow the
  // editor only once typing pauses. Display-only: no validation, no D3 cycle.
  const [shown, setShown] = useState({ member, text });
  useEffect(() => {
    if (member !== shown.member) {
      setShown({ member, text }); // a different file shows at once
      return;
    }
    const id = setTimeout(() => setShown({ member, text }), PREVIEW_SETTLE_MS);
    return () => clearTimeout(id);
  }, [member, text, shown.member]);
  const doc = useMemo(
    () => buildPreviewDocument({ member: shown.member, text: shown.text, welcomePath, helpCssPaths, lookup }),
    [shown, welcomePath, helpCssPaths, lookup],
  );

  if (text.trim() === "") {
    return (
      <div style={{ color: "var(--app-text-muted)", fontSize: 13, fontStyle: "italic", padding: 16 }}>
        {t({ id: "editor.assignLoop.html.preview.empty", message: "Nothing to preview yet." })}
      </div>
    );
  }

  return (
    <iframe
      sandbox=""
      srcDoc={doc}
      title={t({
        id: "editor.assignLoop.html.preview.frameTitle",
        message: `Preview of ${fileLabel}, as installed`,
      })}
      data-testid="html-preview-frame"
      style={{
        border: "1px solid var(--app-border)",
        borderRadius: 8,
        // The installed page's own canvas (a browser default), not a studio
        // surface — so a keyword, not a theme token.
        background: "white",
        width: "100%",
        flex: 1,
        minHeight: 300,
      }}
    />
  );
}
