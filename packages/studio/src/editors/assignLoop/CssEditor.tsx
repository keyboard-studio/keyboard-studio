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
 * - The editor shows `.kmw-keyboard-` selectors under the author's keyboard id,
 *   as the output will; the working copy keeps them under the start id, as the
 *   start files do, so the projection can relink them to whatever id is current.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { rewriteKmwKeyboardSelectors } from "@keyboard-studio/engine";
import { readKeyboardCss } from "../../lib/customCss.ts";
import { galleryGhostBtn, TEXT_DIM } from "../../lib/galleryTheme.ts";
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

  const startId = startKeyboard?.id ?? "";
  const keyboardId = identity?.keyboardId ?? startId;
  const toDisplay = (css: string | null) => (css === null ? null : rewriteKmwKeyboardSelectors(css, startId, keyboardId));

  // The start keyboard's own stylesheet, as the working copy holds it (null when it has none there).
  const startCssText = useMemo(
    () => (startVfs === null || startKeyboard === null ? null : (readKeyboardCss(startVfs, startKeyboard.id)?.text ?? null)),
    [startVfs, startKeyboard],
  );

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

  // The preview's own VFS is the other place the stylesheet shows up: whatever styles the preview is what the editor should open
  // on, even where the working copy's start VFS does not carry the file. Taken once, before any edit of this visit.
  const [previewCssText, setPreviewCssText] = useState<string | null>(null);
  useEffect(() => {
    if (stage.kind !== "ready" || previewCssText !== null || applied !== null) return;
    setPreviewCssText(readKeyboardCss(stage.vfs, stage.keyboardId)?.text ?? "");
  }, [stage, previewCssText, applied]);

  // What the editor opens on: this step's earlier result, else the keyboard's own stylesheet. Null while the preview has yet to say.
  // The preview's text is already relinked (it is the projected VFS); the other two are stored under the start id.
  const seedText = toDisplay(committedCss ?? startCssText) ?? previewCssText ?? (stage.kind === "error" ? "" : null);

  // Back to what the step opened on: the preview and the editor both drop this visit's edits.
  const handleDiscard = () => {
    setApplied(null);
    setEditorGeneration((g) => g + 1);
  };

  // Clearing the editor and applying it removes the keyboard's stylesheet; an untouched step leaves it as it was.
  const handleContinue = () => {
    if (applied !== null) setCustomCss(rewriteKmwKeyboardSelectors(applied, keyboardId, startId));
    onComplete({ css: applied ?? seedText ?? "" });
  };

  // Footer nav (spec 081, #2527): Back / Continue publish to the footer
  // instead of rendering in the sticky in-body bar. The "Discard changes"
  // button stays in the body — it is an editor action, not step nav.
  // Test id is unchanged, so e2e keeps finding css-continue in the footer.
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.assignLoop.css.back", message: "Back" }),
            onClick: onBack,
            testId: "css-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "editor.assignLoop.css.continue", message: "Continue" }),
      onClick: handleContinue,
      testId: "css-continue",
    },
  });

  const leftContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, height: "100%", boxSizing: "border-box" }}>
      <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
        {t({
          id: "editor.assignLoop.css.description",
          message:
            "Add custom CSS to style your keyboard. This affects the touch layout and desktop on-screen keyboard. Leave empty to skip.",
        })}
      </p>

      {/* The editor takes every pixel the pane has; a flex column gives Monaco's height:100% a definite box to resolve against. */}
      <div style={{ flex: 1, minHeight: 300, display: "flex", flexDirection: "column" }}>
        <Suspense
          fallback={
            <div style={{ padding: 16, color: TEXT_DIM, fontSize: 13 }}>
              {t({ id: "editor.assignLoop.css.code.loading", message: "Loading editor…" })}
            </div>
          }
        >
          {seedText === null ? (
            <div style={{ padding: 16, color: TEXT_DIM, fontSize: 13 }}>
              {t({ id: "editor.assignLoop.css.code.loading", message: "Loading editor…" })}
            </div>
          ) : (
            <CssCodePane key={editorGeneration} initialText={seedText} onApply={setApplied} />
          )}
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
