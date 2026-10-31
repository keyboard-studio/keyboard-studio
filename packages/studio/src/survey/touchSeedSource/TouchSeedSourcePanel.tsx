// TouchSeedSourcePanel — the touch_seed_source fork chooser (spec 035 FR-006),
// and the `touch-seed-source` gallery module's renderer (spec 090 T012).
//
// Renders the off-spine "touch_seed_source" step (contracts/seed-source-fork.md):
// lets the author pick "Import & adapt" (keep + adapt the base's shipped touch
// layout) vs "Reseed from desktop" (discard any shipped touch layout and derive
// a fresh tablet projection from the locked desktop work). The choice is the
// `touch-seed-source` decision: it arrives via DecisionRendererProps and the
// confirm reports it through onChange — the gallery host
// (TouchSeedSourceHost, this folder) records it; buildTouchLayoutJson's
// caller reads the decision to select the Case A/B derivation path (see
// seed-derivation.md). Step navigation arrives via GalleryStepContext.
//
// LIVE PREVIEW — REAL OSK (spec 035 R4b amendment; km-doc records the amendment
// separately). The right-hand pane no longer renders a homemade keycap grid —
// it renders the SAME live on-screen-keyboard preview TouchGallery uses
// (OSKFrame, fed by useKeyboardArtifact), forced into tablet OSK mode (the
// reseed derivation now emits a tablet-platform layout — see below) with
// no Desktop/Mobile toggle on this screen. This is a deliberate, explicit
// override of the earlier "no OSK / no engine calls in this panel" restriction
// (R4/R4a) — the user asked for the real preview, not a facsimile.
//
// The OSK's VFS transform injects whichever seed layout the currently-selected
// card represents: "Import & adapt" derives the base's shipped touch layout
// (Case B: raw-JSON splice) with the locked desktop work (`mods`, spec 035 R3)
// replayed onto it; "Reseed from desktop" derives a fresh tablet layout from
// scratch (Case A) with the same `mods` replayed. Both paths share
// `deriveSeedLayout` (buildTouchLayoutJson.ts) — the same pure seed-derivation
// TouchGallery's own "already in touch layout" detection uses — re-serialized
// via the engine's `emitTouchLayout` for VFS injection. There are no Phase E
// touch assignments yet at this step, so there is nothing else to apply.
//
// ADVISORY, NEVER GATING (R4): hints (missing phone platform on the base's
// shipped layout, phone/desktop discard on reseed, unplaced/spilled reseed
// characters) annotate the choices but never disable either one — the author
// decides which seed to use, "usable" is not auto-classified.
//
// GRACEFUL DEGRADATION: if there is no startIr yet, or the seed derivation
// throws, the OSK is not mounted at all (a blank iframe with no explanation is
// exactly the failure mode this guards against) — a graceful fallback message
// renders in its place, reusing the seed-source-reseed-preview-error pattern.
//
// DRAFT-DISCARD WARNING (R12): re-entry into this step with a DIFFERENT
// selection than the currently recorded choice, while an in-progress touch
// draft exists, warns before the confirm click — surfaced via the confirm
// button's label/state, not a browser dialog (no window.confirm in this repo).
// The actual touchDraft clear happens in this panel's confirm handler, at
// the moment the new seed decision is recorded (spec 088 D-06) — the
// warning here only decides whether to show it first.

import { useMemo, useState, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { DesktopModifications } from "@keyboard-studio/engine";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
// The value type is 088's canonical declaration in the decision store;
// importing it from the gallery module instead would close a
// module↔renderer import cycle (D-090-8).
import type { TouchSeedSourceValue } from "../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { type TouchSeedSource } from "../../stores/surveySessionStore.ts";
import { resolveStartTouchJson } from "../../lib/resolveStartTouchJson.ts";
import { touchDesktopModifications } from "../../lib/touchStepCompletion.ts";
import {
  clearTouchDraftOnSeedChange,
  defaultTouchSeedSource,
  deriveSeedPreview,
  parseBaseTouchPreview,
  startShipsUsableTouch,
} from "./touchSeedSourceContinue.ts";
import { formatUncoveredCharsList } from "../../lib/unimplementedInventory.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec, VfsTransform } from "../../hooks/useKeyboardArtifact.ts";
import { OSKFrame } from "../../components/OSKFrame.tsx";
import { PreviewSheet } from "../../components/PreviewSheet.tsx";
import { PreviewButton } from "../../components/PreviewButton.tsx";
import { ASSIGN_LOOP_LEFT_PANE_PCT } from "../../editors/assignLoop/AssignLoopShell.tsx";
import { useIsNarrow } from "../../hooks/useViewport.ts";
import { BREAKPOINTS } from "../../ui/breakpoints.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT,
} from "../../lib/galleryTheme.ts";


export { parseBaseTouchPreview, type StartTouchLayoutSummary } from "./touchSeedSourceContinue.ts";

// ---------------------------------------------------------------------------
// Styles — gallery look (galleryTheme tokens), matching IntroSplash / TouchGallery.
// ---------------------------------------------------------------------------

const pageStyle: CSSProperties = {
  background: BG_PAGE,
  height: "100%",
  boxSizing: "border-box",
  fontFamily: FONT,
  color: TEXT_MAIN,
  padding: "24px 32px",
  overflowY: "auto",
};

const previewCardStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "16px 20px",
};

/**
 * Two-column grid: choices left, sticky live OSK preview right — sharing the
 * SAME split as every other live preview in the studio, `AssignLoopShell`'s
 * `ASSIGN_LOOP_LEFT_PANE_PCT` (45% left / 55% right), rather than a locally
 * invented ratio. Collapses to a single column (choices first, preview
 * below) at <=768px via the scoped `.ks-touch-seed-grid` media-query rule
 * below — inline styles can't express a media query, so this is a class hook
 * only; every actual value still comes from tokens/consts here, not from CSS.
 *
 * This step is a full-layout screen (StudioShell early-returns; there is no
 * persistent right pane competing for width) — the same context
 * MechanismGallery/TouchGallery render `AssignLoopShell` in — so reusing its
 * 45/55 split here means the reseed preview renders at the SAME size (both
 * absolute and relative to the viewport) as the main mobile/desktop OSK
 * preview, instead of stretching to (near) the full remaining width. That
 * full-bleed stretch was the bug this fixes: an unbounded `1fr` right column
 * paired with a capped `minmax(320px, 420px)` left column let the preview
 * grow far past its share of the screen on wide viewports. `minmax(320px,
 * ...)` keeps the left column from getting uncomfortably narrow on medium
 * viewports just above the 768px collapse breakpoint.
 */
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `minmax(320px, ${ASSIGN_LOOP_LEFT_PANE_PCT}%) 1fr`,
  gap: 32,
  alignItems: "start",
};

const previewColumnStyle: CSSProperties = {
  position: "sticky",
  top: 0,
};

const previewEyebrowStyle: CSSProperties = {
  margin: "0 0 8px 0",
  fontSize: 12,
  color: TEXT_DIM,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontFamily: FONT,
};

/** Choice-card style, mirroring TouchGallery's TouchMethodChooser cardStyle. */
const choiceCardStyle = (active: boolean): CSSProperties => ({
  borderRadius: 8,
  border: `1px solid ${active ? ACCENT : BORDER}`,
  background: active ? "var(--app-accent-subtle)" : BG_CARD,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  textAlign: "left",
  cursor: "pointer",
  width: "100%",
  fontFamily: FONT,
});

const fallbackNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: TEXT_DIM,
  fontFamily: FONT,
};

// ---------------------------------------------------------------------------
// TouchSeedSourcePanel
// ---------------------------------------------------------------------------

export function TouchSeedSourceRenderer({ value, onChange }: DecisionRendererProps<TouchSeedSourceValue>) {
  const { t } = useLingui();
  const { onComplete, onBack } = useGalleryStepContext();
  const startVfs = useWorkingCopyStore((s) => s.startVfs);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const identity = useWorkingCopyStore((s) => s.identity);
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);
  // The recorded choice arrives as the renderer's value (spec 090 T012);
  // null mirrors selectTouchSeedSource's unrecorded case.
  const storedSeedSource: TouchSeedSource | null = value ?? null;

  // Desktop modifications to replay onto the seed preview (spec 035 R3) —
  // same read/derive pattern as TouchGallery's own `mods` memo (carve
  // removals + Phase C letter placements), with the same EMPTY_MODS
  // fallback when startIr hasn't loaded yet.
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const carveChars = useWorkingCopyStore((s) => s.carveChars);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const modsDepsKey = `${deletedNodeIds.size}:${deletedItemIds.size}:${carveChars.size}:${phaseResults.length}`;
  const mods = useMemo<DesktopModifications>(() => {
    return touchDesktopModifications(startIr, deletedNodeIds, deletedItemIds, phaseResults, carveChars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIr, modsDepsKey]);

  const rawJson = useMemo(() => resolveStartTouchJson(startVfs), [startVfs]);
  const preview = useMemo(() => parseBaseTouchPreview(rawJson), [rawJson]);

  const hasUsableBaseLayout = useMemo(() => startShipsUsableTouch(startVfs), [startVfs]);
  const isMalformed = rawJson !== undefined && preview === null;
  const hasPhonePlatform = preview !== null && preview.platformIds.includes("phone");
  const hasOtherPlatforms = preview !== null && preview.platformIds.some((id) => id !== "phone");

  // Default: Import & adapt when a usable base layout exists, else Reseed (R4).
  // On re-entry, start from the previously recorded choice rather than
  // re-deriving the default, so returning to this step doesn't silently
  // flip the selection back.
  const [selected, setSelected] = useState<TouchSeedSource>(
    defaultTouchSeedSource(startVfs, storedSeedSource),
  );


  // ---------------------------------------------------------------------------
  // Live OSK preview (spec 035 R4b) — the SAME seed-derivation mechanism
  // TouchGallery uses (deriveSeedLayout, buildTouchLayoutJson.ts), reflecting
  // whichever card is currently selected. No Phase E assignments exist yet at
  // this step, so the seed IS the whole layout — there is nothing further to
  // apply on top of it.
  // ---------------------------------------------------------------------------

  const currentSeedPreview = useMemo<{ json: string; unplacedChars: string[] } | null>(() => {
    if (startIr === null) return null;
    return deriveSeedPreview(startIr, rawJson, selected, mods);
  }, [startIr, selected, rawJson, mods]);

  // Named string locals computed BEFORE the JSX below — the message body
  // must not embed a conditional (ternary) expression as a direct <Trans>
  // child (see MechanismGallery/TouchGallery's matching convention notes).
  // Empty/unused when unplacedChars is empty — the note below doesn't render
  // in that case, so the wasted computation is harmless.
  const unplacedChars = currentSeedPreview?.unplacedChars ?? [];
  const unplacedCountLabel = t({
    id: "editor.touchSeed.reseedUnplacedNote.count",
    message: plural(unplacedChars.length, { one: "# character", other: "# characters" }),
  });
  const unplacedVerb = t({
    id: "editor.touchSeed.reseedUnplacedNote.verb",
    message: plural(unplacedChars.length, { one: "was", other: "were" }),
  });
  const unplacedCharsList = formatUncoveredCharsList(unplacedChars);

  const scaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );

  // Inject the currently-selected seed's derived touch layout into the VFS
  // before compile — this is what makes the OSK show "Import & adapt" vs
  // "Reseed from desktop" as two genuinely different live previews. When the
  // derivation failed (currentSeedPreview === null), leave the VFS untouched
  // rather than inject nothing meaningful — the OSK is not mounted in that
  // case anyway (see renderTouchOsk below).
  const vfsTransform = useMemo<VfsTransform>(
    () => (vfs, kbId) => {
      if (currentSeedPreview !== null) {
        vfs.set(`source/${kbId}.keyman-touch-layout`, currentSeedPreview.json);
      }
      return { warnings: [] };
    },
    [currentSeedPreview],
  );

  const { stage, retry } = useKeyboardArtifact(startKeyboard, scaffoldSpec, vfsTransform);

  /**
   * Render the real, live OSK in forced mobile/touch mode, or — when the seed
   * derivation failed or hasn't loaded a base yet — a graceful fallback note
   * (never a crash, never a blank iframe with no explanation).
   */
  function renderTouchOsk(errorTestId: string) {
    if (currentSeedPreview === null) {
      return (
        <p data-testid={errorTestId} style={fallbackNoteStyle}>
          <Trans id="editor.touchSeed.reseedPreviewError">
            Could not derive a preview from the current desktop work.
          </Trans>
        </p>
      );
    }
    return (
      <div data-testid="seed-source-osk-preview">
        <OSKFrame startKeyboard={startKeyboard} oskMode="tablet" stage={stage} retry={retry} />
      </div>
    );
  }

  // Re-entry with a genuinely different pick, while a touch draft exists —
  // the only case that needs the discard warning (R12).
  const isChangingRecordedChoice = storedSeedSource !== null && selected !== storedSeedSource;
  const showDraftWarning = isChangingRecordedChoice && touchDraft !== null;

  function handleConfirm(): void {
    // Spec 088 T026 (research D-06): recording a DIFFERENT seed value clears
    // the working copy's touch draft HERE, at the decision's writer — its
    // charTouch entries reference host keys of the other seed and would
    // half-apply. A no-op re-confirm of the same value leaves it untouched.
    // (This side effect used to ride on the session store's seed setter.)
    clearTouchDraftOnSeedChange(selected, storedSeedSource);
    // Spec 090 T012: the record itself is the host's — onChange records the
    // touch-seed-source decision (provenance "asked", this step) and runs
    // the module's apply.
    onChange(selected);
    onComplete(undefined);
  }

  // Back / Confirm now live in the footer (spec 081).
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.assignLoop.backButton", message: "← Back" }),
            onClick: onBack,
            testId: "seed-source-back",
            ariaLabel: t({ id: "editor.assignLoop.touch.backToMechanismsPhaseCAriaLabel", message: "Back to mechanisms" }),
          },
        }
      : {}),
    forward: {
      label: showDraftWarning
        ? t({ id: "editor.touchSeed.discardAndConfirmButton", message: "Discard touch edits & confirm" })
        : t({ id: "editor.touchSeed.confirmButton", message: "Confirm" }),
      onClick: handleConfirm,
      testId: "seed-source-confirm",
    },
  });

  // ---------------------------------------------------------------------------
  // Narrow-viewport layout (mobile adaptation, Phase 4): the seed
  // cards stack full-width and the live preview moves into a PreviewSheet —
  // opening it mounts the OSK iframe, dismissing it unmounts the iframe
  // (principle 9). At tablet widths the existing ≤768px collapse (choices
  // above, preview below) is unchanged.
  // ---------------------------------------------------------------------------
  const narrow = useIsNarrow();
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const showTouchPreviewLabel = t({
    id: "editor.touchSeed.showPreview",
    message: "Show touch preview",
  });
  const previewButtonLabel = t({
    id: "previewButton.label",
    message: "Preview",
  });
  const touchPreviewSheetLabel = t({
    id: "editor.touchSeed.previewSheetLabel",
    message: "Touch preview",
  });

  const choicesContent = (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        <button
          type="button"
          aria-pressed={selected === "import-adapt"}
          data-testid="seed-source-import-adapt"
          onClick={() => setSelected("import-adapt")}
          style={choiceCardStyle(selected === "import-adapt")}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: selected === "import-adapt" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.touchSeed.importAdaptTitle">Import &amp; adapt</Trans>
          </span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            {hasUsableBaseLayout
              ? <Trans id="editor.touchSeed.importAdaptStartingUsable">Keep the starting keyboard's shipped touch layout and carry your desktop work onto it.</Trans>
              : <Trans id="editor.touchSeed.importAdaptStartingUnusable">There is no starting touch layout to import — this option starts from an empty layout.</Trans>}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={selected === "reseed-from-desktop"}
          data-testid="seed-source-reseed"
          onClick={() => setSelected("reseed-from-desktop")}
          style={choiceCardStyle(selected === "reseed-from-desktop")}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: selected === "reseed-from-desktop" ? ACCENT : TEXT_MAIN,
            }}
          >
            <Trans id="editor.touchSeed.reseedTitle">Reseed from desktop</Trans>
          </span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>
            <Trans id="editor.touchSeed.reseedDescription">Derive a fresh tablet layout from your desktop key assignments.</Trans>
            {hasOtherPlatforms && (
              <Trans id="editor.touchSeed.reseedDiscardsStartingPlatforms">
                {" "}Choosing this discards the starting keyboard's shipped phone/desktop touch platforms — only a tablet layout is produced.
              </Trans>
            )}
          </span>
        </button>
      </div>

      {showDraftWarning && (
        <p
          data-testid="seed-source-draft-warning"
          style={{ margin: "0 0 14px 0", fontSize: 12, color: "var(--app-danger-text)", fontFamily: FONT }}
        >
          <Trans id="editor.touchSeed.draftWarning">
            [WARN] Changing the seed source will discard your in-progress touch edits.
          </Trans>
        </p>
      )}
    </>
  );

  const previewContent = selected === "import-adapt" ? (
    <div style={previewCardStyle} data-testid="seed-source-preview">
      <p style={previewEyebrowStyle}>
        <Trans id="editor.touchSeed.startingLayoutEyebrow">Starting touch layout</Trans>
      </p>
      {preview !== null && (
        <p style={{ margin: "0 0 10px 0", fontSize: 13, color: TEXT_MAIN, fontFamily: FONT }}>
          {t({
            id: "editor.touchSeed.shipsLine",
            message: `Ships: ${{ platforms: preview.platformIds.join(", ") }} (showing "${{ previewPlatform: preview.previewPlatformId }}" default layer)`,
          })}
        </p>
      )}
      {preview === null && (
        <p
          data-testid={isMalformed ? "seed-source-malformed-note" : "seed-source-absent-note"}
          style={{ margin: "0 0 10px 0", fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}
        >
          {isMalformed
            ? <Trans id="editor.touchSeed.startingMalformedNote">The starting keyboard's touch layout could not be read (malformed JSON) — treated as no layout.</Trans>
            : <Trans id="editor.touchSeed.startingAbsentNote">The starting keyboard ships no touch layout.</Trans>}
        </p>
      )}

      {renderTouchOsk("seed-source-preview-error")}

      {preview !== null && !hasPhonePlatform && (
        <p
          data-testid="seed-source-no-phone-warn"
          style={{ margin: "10px 0 0 0", fontSize: 12, color: "var(--app-warning-text)", fontFamily: FONT }}
        >
          <Trans id="editor.touchSeed.noPhonePlatformWarning">[WARN] this layout has no phone platform.</Trans>
        </p>
      )}
    </div>
  ) : (
    <div style={previewCardStyle} data-testid="seed-source-reseed-preview">
      <p style={previewEyebrowStyle}>
        <Trans id="editor.touchSeed.reseedPreviewEyebrow">Derived tablet layout (reseed preview)</Trans>
      </p>

      {renderTouchOsk("seed-source-reseed-preview-error")}

      {currentSeedPreview !== null && currentSeedPreview.unplacedChars.length > 0 && (
        <p
          data-testid="seed-source-reseed-extras-note"
          style={{ margin: "10px 0 0 0", fontSize: 12, color: "var(--app-warning-text)", fontFamily: FONT }}
        >
          <Trans id="editor.touchSeed.reseedUnplacedNote">
            [WARN] {unplacedCountLabel} from the desktop layout could not be
            placed and {unplacedVerb} omitted: {unplacedCharsList}
          </Trans>
        </p>
      )}
    </div>
  );

  return (
    <div style={pageStyle}>
      {/* No maxWidth cap here (previously 1100px). This is a full-layout step
          (StudioShell early-returns — no persistent right pane sharing the
          width), so the preview column below should be free to grow with the
          viewport the same way the main mobile OSK preview does (TouchGallery
          -> AssignLoopShell's flexGrow:1 right pane, which is also uncapped).
          A hard cap here was squeezing the OSK preview noticeably smaller
          than that main preview on ordinary desktop widths. */}
      <div style={{ width: "100%" }}>
        <h1
          style={{
            marginTop: 24,
            marginBottom: 6,
            fontSize: "1.3rem",
            fontWeight: 600,
            color: ACCENT,
            fontFamily: FONT,
          }}
        >
          <Trans id="editor.touchSeed.heading">Choose your touch layout starting point</Trans>
        </h1>
        <p style={{ margin: "0 0 20px 0", fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}>
          <Trans id="editor.touchSeed.intro">
            This choice seeds the mobile/touch layout. Individual characters can
            still be reviewed and adjusted afterward in the Touch Layout step.
          </Trans>
        </p>

        {narrow ? (
          <>
            {choicesContent}
            <PreviewButton
              label={previewButtonLabel}
              ariaLabel={showTouchPreviewLabel}
              onClick={() => setPreviewSheetOpen(true)}
              testId="seed-source-show-preview"
              placement="sticky"
            />
            <PreviewSheet
              open={previewSheetOpen}
              onOpenChange={setPreviewSheetOpen}
              label={touchPreviewSheetLabel}
              testId="seed-source-preview-sheet"
            >
              {previewContent}
            </PreviewSheet>
          </>
        ) : (
          <>
            {/* Scoped responsive rule — see gridStyle's docstring; <=tabletMax
                collapses the grid to one column (choices first, preview below)
                and drops the preview column's sticky positioning. The px value
                is interpolated from the shared breakpoint vocabulary, not a
                local magic number. */}
            <style>{`
              @media (max-width: ${BREAKPOINTS.tabletMax}px) {
                .ks-touch-seed-grid { grid-template-columns: 1fr !important; }
                .ks-touch-seed-preview-col { position: static !important; }
              }
            `}</style>

            <div className="ks-touch-seed-grid" style={gridStyle}>
              {/* Left column — choices */}
              <div>{choicesContent}</div>

              {/* Right column — live OSK preview, matching the currently-selected
                  card (spec 035 R4b) — forced tablet mode, no desktop OSK
                  and no mode toggle on this screen. */}
              <div className="ks-touch-seed-preview-col" style={previewColumnStyle}>
                {previewContent}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
