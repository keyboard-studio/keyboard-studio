/**
 * CssEditor — custom CSS editor step (after Touch Gallery).
 *
 * The keyboard's own OSK stylesheet (`&KMW_EMBEDCSS`), edited in the shared
 * two-pane gallery layout: the CSS on the left, the real KeymanWeb preview
 * (touch or desktop, the same pane the galleries use) on the right.
 *
 * - The editor opens on the keyboard's existing stylesheet, or on what the
 *   author left here before.
 * - Apply pushes the text through the working-copy projection, so the preview
 *   recompiles with it exactly as the zip will carry it.
 * - Continue records the result in the working copy (`customCss`); a step left
 *   untouched leaves the start keyboard's stylesheet alone.
 */

import { lazy, Suspense, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { readKeyboardCss } from "../../lib/customCss.ts";
import { galleryForwardBtnStyle, galleryGhostBtn, BORDER, TEXT_DIM } from "../../lib/galleryTheme.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { AssignLoopShell } from "./AssignLoopShell.tsx";
import { GalleryPreviewPane } from "./PreviewPane.tsx";

// Lazy-load the Monaco pane so it never lands in the main chunk.
const CssCodePane = lazy(() =>
  import("./CssCodePane.tsx").then((m) => ({ default: m.CssCodePane })),
);

export function CssEditor({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const identity = useWorkingCopyStore((s) => s.identity);
  const committedCss = useWorkingCopyStore((s) => s.customCss);
  const setCustomCss = useWorkingCopyStore((s) => s.setCustomCss);

  // What the editor opens on: this step's earlier result, else the start keyboard's own stylesheet.
  const seedText = useMemo(() => {
    if (committedCss !== null) return committedCss;
    if (startVfs === null || startKeyboard === null) return "";
    return readKeyboardCss(startVfs, startKeyboard.id)?.text ?? "";
  }, [committedCss, startVfs, startKeyboard]);

  // The text the author has applied this visit; null until they apply (or clear) something.
  const [applied, setApplied] = useState<string | null>(null);
  // Bumped by "Discard changes" to remount the editor on the seed text.
  const [editorGeneration, setEditorGeneration] = useState(0);

  const scaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );
  const vfsTransform = useWorkingCopyTransform(applied !== null ? { liveCss: applied } : undefined);
  const { stage, retry } = useKeyboardArtifact(startKeyboard, scaffoldSpec, vfsTransform);

  // Back to what the step opened on: the preview and the editor both drop this visit's edits.
  const handleDiscard = () => {
    setApplied(null);
    setEditorGeneration((g) => g + 1);
  };

  // Clearing the editor and applying it removes the keyboard's stylesheet; an untouched step leaves it as it was.
  const handleContinue = () => {
    if (applied !== null) setCustomCss(applied);
    onComplete({ css: applied ?? seedText });
  };

  const leftContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, minHeight: "100%", boxSizing: "border-box" }}>
      <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
        {t({
          id: "editor.assignLoop.css.description",
          message:
            "Add custom CSS to style your keyboard. This affects the touch layout and desktop on-screen keyboard. Leave empty to skip.",
        })}
      </p>

      <div style={{ flex: 1, minHeight: 300 }}>
        <Suspense
          fallback={
            <div style={{ padding: 16, color: TEXT_DIM, fontSize: 13 }}>
              {t({ id: "editor.assignLoop.css.code.loading", message: "Loading editor…" })}
            </div>
          }
        >
          <CssCodePane
            key={editorGeneration}
            initialText={seedText}
            onApply={setApplied}
          />
        </Suspense>
      </div>

      <button
        type="button"
        onClick={handleDiscard}
        disabled={applied === null}
        style={{ ...galleryGhostBtn, alignSelf: "flex-start", ...(applied === null ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
      >
        {t({ id: "editor.assignLoop.css.discard", message: "Discard changes" })}
      </button>

      {/* Bottom bar, as on the OSK step: Back / Continue stay reachable while the editor scrolls. */}
      <div
        style={{
          display: "flex",
          gap: 8,
          margin: "auto -16px -16px",
          padding: "12px 16px",
          borderTop: `1px solid ${BORDER}`,
          background: "var(--app-surface)",
          position: "sticky",
          bottom: 0,
          zIndex: 10,
        }}
      >
        {onBack && (
          <button type="button" onClick={onBack} style={galleryGhostBtn}>
            {t({ id: "editor.assignLoop.css.back", message: "Back" })}
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" data-testid="css-continue" onClick={handleContinue} style={galleryForwardBtnStyle}>
          {t({ id: "editor.assignLoop.css.continue", message: "Continue" })}
        </button>
      </div>
    </div>
  );

  return (
    <AssignLoopShell
      headingText={t({ id: "editor.assignLoop.css.title", message: "Custom CSS" })}
      modalityLabel={t({ id: "editor.assignLoop.css.editorLabel", message: "CSS" })}
      leftContent={leftContent}
      rightContent={
        <GalleryPreviewPane
          startKeyboard={startKeyboard}
          stage={stage}
          retry={retry}
          defaultOskMode="touch"
          heading={t({ id: "editor.assignLoop.preview.heading", message: "Live preview" })}
        />
      }
    />
  );
}
