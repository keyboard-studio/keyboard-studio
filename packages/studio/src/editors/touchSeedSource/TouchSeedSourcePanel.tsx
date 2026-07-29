// TouchSeedSourcePanel — the touch_seed_source fork chooser (spec 035 FR-006).
//
// Renders the off-spine "touch_seed_source" step (contracts/seed-source-fork.md):
// lets the author pick "Import & adapt" (keep + adapt the base's shipped touch
// layout) vs "Reseed from desktop" (discard any shipped touch layout and derive
// a fresh tablet projection from the locked desktop work). The choice is recorded
// in surveySessionStore.touchSeedSource; buildTouchLayoutJson's caller reads it
// to select the Case A/B derivation path (see seed-derivation.md).
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
// GRACEFUL DEGRADATION: if there is no baseIr yet, or the seed derivation
// throws, the OSK is not mounted at all (a blank iframe with no explanation is
// exactly the failure mode this guards against) — a graceful fallback message
// renders in its place, reusing the seed-source-reseed-preview-error pattern.
//
// DRAFT-DISCARD WARNING (R12): re-entry into this step with a DIFFERENT
// selection than the currently recorded choice, while an in-progress touch
// draft exists, warns before the confirm click — surfaced via the confirm
// button's label/state, not a browser dialog (no window.confirm in this repo).
// The actual touchDraft clear happens in surveySessionStore.setTouchSeedSource
// (already wired) — this panel only decides whether to show the warning.

import { useMemo, useState, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { emitTouchLayout } from "@keyboard-studio/engine";
import type { EditorStepProps } from "../../steps/types.ts";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore, type TouchSeedSource } from "../../stores/surveySessionStore.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import { deriveDesktopModifications } from "../../lib/deriveDesktopModifications.ts";
import { deriveSeedLayout } from "../../lib/buildTouchLayoutJson.ts";
import { formatUncoveredCharsList } from "../../lib/unimplementedInventory.ts";
import { useKeyboardArtifact } from "../../hooks/useKeyboardArtifact.ts";
import type { ScaffoldSpec, VfsTransform } from "../../hooks/useKeyboardArtifact.ts";
import { OSKFrame } from "../../components/OSKFrame.tsx";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";

/** No desktop work to replay when there is no baseIr yet (mirrors TouchGallery's EMPTY_MODS). */
const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };

// ---------------------------------------------------------------------------
// Raw `.keyman-touch-layout` metadata parsing — for the advisory notes only
// (which platforms the base ships, whether the JSON is malformed). The actual
// keycap rendering is now the real OSK, so this no longer needs to walk
// layers/rows/keys — only the platform id list.
//
// Deliberately NOT the engine's parseTouchLayout (engine/src/codec/parse-touch.ts)
// — this is a lightweight shape sniff for the advisory text, not a full parse.
// ---------------------------------------------------------------------------

interface RawPreviewPlatform {
  layer?: unknown[];
}
type RawPreviewTouchLayout = Record<string, RawPreviewPlatform | undefined>;

function isRawPlatform(v: unknown): v is RawPreviewPlatform {
  return typeof v === "object" && v !== null && Array.isArray((v as RawPreviewPlatform).layer);
}

/** Preference order for which platform's layers to preview when several ship. */
const PREVIEW_PLATFORM_ORDER = ["phone", "tablet", "desktop"] as const;

function pickPreviewPlatformId(platformIds: readonly string[]): string | undefined {
  return PREVIEW_PLATFORM_ORDER.find((id) => platformIds.includes(id)) ?? platformIds[0];
}

export interface BaseTouchLayoutSummary {
  /** Platform ids the source layout ships, e.g. ["phone", "tablet"]. */
  platformIds: string[];
  /** The platform id preferred for display, per {@link PREVIEW_PLATFORM_ORDER}. */
  previewPlatformId: string;
}

/**
 * Parse a base's raw `.keyman-touch-layout` JSON string into a lightweight
 * platform-id summary. Returns null for absent or malformed input — both are
 * treated as "no usable base layout" by the caller (R4): the malformed case is
 * reported with a distinct note, but neither case blocks either choice.
 */
export function parseBaseTouchPreview(json: string | undefined): BaseTouchLayoutSummary | null {
  if (json === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as RawPreviewTouchLayout;
  const platformIds = Object.keys(obj).filter((id) => isRawPlatform(obj[id]));
  if (platformIds.length === 0) return null;

  const previewPlatformId = pickPreviewPlatformId(platformIds) ?? platformIds[0]!;
  return { platformIds, previewPlatformId };
}

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

const ghostBtn: CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

const previewCardStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "16px 20px",
};

/**
 * Two-column grid: choices left (minmax(320px,420px), a comfortably readable
 * fixed-ish width), sticky live OSK preview right (1fr — takes the rest of
 * the available width). Collapses to a single column (choices first, preview
 * below) at <=768px via the scoped `.ks-touch-seed-grid` media-query rule
 * below — inline styles can't express a media query, so this is a class hook
 * only; every actual value still comes from tokens/consts here, not from CSS.
 *
 * This step is a full-layout screen (StudioShell early-returns; there is no
 * persistent right pane competing for width), so the preview column is meant
 * to use the whole remaining page width, the same way the main mobile OSK
 * preview does (TouchGallery -> AssignLoopShell's flexGrow:1 right pane).
 * Previously the outer wrapper capped total content width at 1100px, which
 * squeezed the 1fr preview column down to ~600px — visibly smaller than the
 * ~700px+ the main preview renders at. The outer wrapper's maxWidth cap has
 * since been removed (see its render site below) so this column is free to
 * grow with the viewport instead.
 */
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 420px) 1fr",
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
  background: active ? "#0d2840" : BG_CARD,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  textAlign: "left",
  cursor: "pointer",
  width: "100%",
  fontFamily: FONT,
});

const confirmBtnStyle = (warn: boolean): CSSProperties => ({
  padding: "10px 24px",
  background: warn ? "#7a2a2a" : BLUE_ACTION,
  border: "none",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
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

export function TouchSeedSourcePanel({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const identity = useWorkingCopyStore((s) => s.identity);
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);
  const storedSeedSource = useSurveySessionStore((s) => s.touchSeedSource);
  const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);

  // Desktop modifications to replay onto the seed preview (spec 035 R3) —
  // same read/derive pattern as TouchGallery's own `mods` memo (carve
  // removals + Phase C letter placements), with the same EMPTY_MODS
  // fallback when baseIr hasn't loaded yet.
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const modsDepsKey = `${deletedNodeIds.size}:${deletedItemIds.size}:${phaseResults.length}`;
  const mods = useMemo<DesktopModifications>(() => {
    if (baseIr === null) return EMPTY_MODS;
    return deriveDesktopModifications(baseIr, deletedNodeIds, deletedItemIds, phaseResults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIr, modsDepsKey]);

  const rawJson = useMemo(() => resolveBaseTouchJson(baseVfs), [baseVfs]);
  const preview = useMemo(() => parseBaseTouchPreview(rawJson), [rawJson]);

  const hasUsableBaseLayout = preview !== null;
  const isMalformed = rawJson !== undefined && preview === null;
  const hasPhonePlatform = preview !== null && preview.platformIds.includes("phone");
  const hasOtherPlatforms = preview !== null && preview.platformIds.some((id) => id !== "phone");

  // Default: Import & adapt when a usable base layout exists, else Reseed (R4).
  // On re-entry, start from the previously recorded choice rather than
  // re-deriving the default, so returning to this step doesn't silently
  // flip the selection back.
  const [selected, setSelected] = useState<TouchSeedSource>(
    storedSeedSource ?? (hasUsableBaseLayout ? "import-adapt" : "reseed-from-desktop"),
  );

  // ---------------------------------------------------------------------------
  // Live OSK preview (spec 035 R4b) — the SAME seed-derivation mechanism
  // TouchGallery uses (deriveSeedLayout, buildTouchLayoutJson.ts), reflecting
  // whichever card is currently selected. No Phase E assignments exist yet at
  // this step, so the seed IS the whole layout — there is nothing further to
  // apply on top of it.
  // ---------------------------------------------------------------------------

  const currentSeedPreview = useMemo<{ json: string; unplacedChars: string[] } | null>(() => {
    if (baseIr === null) return null;
    try {
      const baseTouchJson = selected === "reseed-from-desktop" ? undefined : rawJson;
      const { layout, unplacedChars } = deriveSeedLayout(baseIr, {
        ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
        mods,
        seedSource: selected,
      });
      return { json: emitTouchLayout(layout), unplacedChars };
    } catch (err) {
      // A genuine derivation failure (as opposed to "no baseIr yet", handled
      // by the guard above) has no other signal — the graceful fallback note
      // still renders, but this is otherwise silent, so log it for anyone
      // debugging in devtools.
      devLog.error("[TouchSeedSourcePanel] seed preview derivation failed:", err);
      return null;
    }
  }, [baseIr, selected, rawJson, mods]);

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

  const { stage, retry } = useKeyboardArtifact(baseKeyboard, scaffoldSpec, vfsTransform);

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
        <OSKFrame baseKeyboard={baseKeyboard} oskMode="tablet" stage={stage} retry={retry} />
      </div>
    );
  }

  // Re-entry with a genuinely different pick, while a touch draft exists —
  // the only case that needs the discard warning (R12).
  const isChangingRecordedChoice = storedSeedSource !== null && selected !== storedSeedSource;
  const showDraftWarning = isChangingRecordedChoice && touchDraft !== null;

  function handleConfirm(): void {
    setTouchSeedSource(selected);
    onComplete(undefined);
  }

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
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t({ id: "editor.assignLoop.touch.backToMechanismsPhaseCAriaLabel", message: "Back to mechanisms (Phase C)" })}
            data-testid="seed-source-back"
            style={ghostBtn}
          >
            <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
          </button>
        )}

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

        {/* Scoped responsive rule — see gridStyle's docstring; <=768px
            collapses the grid to one column (choices first, preview below)
            and drops the preview column's sticky positioning. */}
        <style>{`
          @media (max-width: 768px) {
            .ks-touch-seed-grid { grid-template-columns: 1fr !important; }
            .ks-touch-seed-preview-col { position: static !important; }
          }
        `}</style>

        <div className="ks-touch-seed-grid" style={gridStyle}>
          {/* Left column — choices */}
          <div>
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
                    ? <Trans id="editor.touchSeed.importAdaptUsable">Keep the base's shipped touch layout and carry your desktop work onto it.</Trans>
                    : <Trans id="editor.touchSeed.importAdaptUnusable">There is no base touch layout to import — this option starts from an empty layout.</Trans>}
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
                    <Trans id="editor.touchSeed.reseedDiscardsPlatforms">
                      {" "}Choosing this discards the base's shipped phone/desktop touch platforms — only a tablet layout is produced.
                    </Trans>
                  )}
                </span>
              </button>
            </div>

            {showDraftWarning && (
              <p
                data-testid="seed-source-draft-warning"
                style={{ margin: "0 0 14px 0", fontSize: 12, color: "#f0a0a0", fontFamily: FONT }}
              >
                <Trans id="editor.touchSeed.draftWarning">
                  [WARN] Changing the seed source will discard your in-progress touch edits.
                </Trans>
              </p>
            )}

            <button
              type="button"
              data-testid="seed-source-confirm"
              onClick={handleConfirm}
              style={confirmBtnStyle(showDraftWarning)}
            >
              {showDraftWarning
                ? t({ id: "editor.touchSeed.discardAndConfirmButton", message: "Discard touch edits & confirm" })
                : t({ id: "editor.touchSeed.confirmButton", message: "Confirm" })}
            </button>
          </div>

          {/* Right column — live OSK preview, matching the currently-selected
              card (spec 035 R4b) — forced tablet mode, no desktop OSK
              and no mode toggle on this screen. */}
          <div className="ks-touch-seed-preview-col" style={previewColumnStyle}>
            {selected === "import-adapt" ? (
              <div style={previewCardStyle} data-testid="seed-source-preview">
                <p style={previewEyebrowStyle}>
                  <Trans id="editor.touchSeed.baseLayoutEyebrow">Base touch layout</Trans>
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
                      ? <Trans id="editor.touchSeed.malformedNote">This base's touch layout could not be read (malformed JSON) — treated as no layout.</Trans>
                      : <Trans id="editor.touchSeed.absentNote">This base ships no touch layout.</Trans>}
                  </p>
                )}

                {renderTouchOsk("seed-source-preview-error")}

                {preview !== null && !hasPhonePlatform && (
                  <p
                    data-testid="seed-source-no-phone-warn"
                    style={{ margin: "10px 0 0 0", fontSize: 12, color: "#d29922", fontFamily: FONT }}
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
                    style={{ margin: "10px 0 0 0", fontSize: 12, color: "#d29922", fontFamily: FONT }}
                  >
                    <Trans id="editor.touchSeed.reseedUnplacedNote">
                      [WARN] {unplacedCountLabel} from the desktop layout could not be
                      placed and {unplacedVerb} omitted: {unplacedCharsList}
                    </Trans>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
