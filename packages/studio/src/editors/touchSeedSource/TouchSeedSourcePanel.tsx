// TouchSeedSourcePanel — the touch_seed_source fork chooser (spec 035 FR-006).
//
// Renders the off-spine "touch_seed_source" step (contracts/seed-source-fork.md):
// lets the author pick "Import & adapt" (keep + adapt the base's shipped touch
// layout) vs "Reseed from desktop" (discard any shipped touch layout and derive
// a fresh phone projection from the locked desktop work). The choice is recorded
// in surveySessionStore.touchSeedSource; buildTouchLayoutJson's caller reads it
// to select the Case A/B derivation path (see seed-derivation.md).
//
// LIVE PREVIEW, PURE-DERIVATION-ONLY (spec 035 R4a amendment, approved —
// supersedes the earlier "no engine calls" R4 note): the right-hand pane shows
// a live preview matching the currently-selected card. "Import & adapt" shows
// the base's shipped `.keyman-touch-layout` (parsed directly from raw JSON —
// still no engine calls on that path). "Reseed from desktop" shows the ACTUAL
// derived phone layout by calling `deriveSeedLayout` (buildTouchLayoutJson.ts)
// — the PURE, non-compiling seed derivation shared with TouchGallery's own
// "already in touch layout" detection. This panel still never compiles and
// never touches the OSK iframe/preview worker — `deriveSeedLayout` performs no
// I/O and returns a `TouchLayoutIR` in memory only.
//
// ADVISORY, NEVER GATING (R4): hints (missing phone platform, tablet/desktop
// discard on reseed) annotate the choices but never disable either one — the
// author decides which seed to use, "usable" is not auto-classified.
//
// DRAFT-DISCARD WARNING (R12): re-entry into this step with a DIFFERENT
// selection than the currently recorded choice, while an in-progress touch
// draft exists, warns before the confirm click — surfaced via the confirm
// button's label/state, not a browser dialog (no window.confirm in this repo).
// The actual touchDraft clear happens in surveySessionStore.setTouchSeedSource
// (already wired) — this panel only decides whether to show the warning.

import { useMemo, useState, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { EditorStepProps } from "../../steps/types.ts";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore, type TouchSeedSource } from "../../stores/surveySessionStore.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import { deriveDesktopModifications } from "../../lib/deriveDesktopModifications.ts";
import { deriveSeedLayout } from "../../lib/buildTouchLayoutJson.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";
import {
  TouchLayoutPreview,
  pickPreviewPlatformId,
  mapTouchLayoutIrToPreview,
  type TouchLayoutPreviewData,
  type TouchPreviewKey,
  type TouchPreviewLayer,
} from "../assignLoop/parts/TouchLayoutPreview.tsx";

/** No desktop work to replay when there is no baseIr yet (mirrors TouchGallery's EMPTY_MODS). */
const EMPTY_MODS: DesktopModifications = { removals: [], placements: [] };

// ---------------------------------------------------------------------------
// Raw `.keyman-touch-layout` preview parsing.
//
// Deliberately NOT the engine's parseTouchLayout (engine/src/codec/parse-touch.ts)
// — this preview never calls into the engine. The wire shape mirrored here
// (top-level platform keys, each with a `layer` array of `{ id, row: [{ key }] }`)
// is documented at the top of parse-touch.ts; only the fields a summary needs
// (id/text/output/hint/sk) are read.
// ---------------------------------------------------------------------------

interface RawPreviewKey {
  id?: string;
  text?: string;
  output?: string;
  hint?: string;
  sk?: RawPreviewKey[];
}
interface RawPreviewRow {
  key?: RawPreviewKey[];
}
interface RawPreviewLayer {
  id?: string;
  row?: RawPreviewRow[];
}
interface RawPreviewPlatform {
  layer?: RawPreviewLayer[];
}
type RawPreviewTouchLayout = Record<string, RawPreviewPlatform | undefined>;

function isRawPlatform(v: unknown): v is RawPreviewPlatform {
  return typeof v === "object" && v !== null && Array.isArray((v as RawPreviewPlatform).layer);
}

function mapRawKeyToPreviewKey(k: RawPreviewKey): TouchPreviewKey {
  // exactOptionalPropertyTypes: only assign the optional keys that have a
  // value — see the equivalent note on mapTouchKeyIrToPreviewKey.
  return {
    id: k.id ?? "",
    label: k.text ?? k.output ?? k.id ?? "",
    ...(k.hint !== undefined ? { hint: k.hint } : {}),
    ...(k.sk !== undefined ? { sk: k.sk.map(mapRawKeyToPreviewKey) } : {}),
  };
}

/**
 * Parse a base's raw `.keyman-touch-layout` JSON string into the shared
 * {@link TouchLayoutPreviewData} shape (see
 * ../assignLoop/parts/TouchLayoutPreview.tsx). Returns null for absent or
 * malformed input — both are treated as "no usable base layout" by the
 * caller (R4): the malformed case is reported with a distinct note, but
 * neither case blocks either choice.
 */
export function parseBaseTouchPreview(json: string | undefined): TouchLayoutPreviewData | null {
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
  const platform = obj[previewPlatformId];
  const rawLayers = isRawPlatform(platform) ? platform.layer ?? [] : [];
  const layers: TouchPreviewLayer[] = rawLayers.map((l) => ({
    id: l.id ?? "default",
    rows: (l.row ?? []).map((r) => ({ keys: (r.key ?? []).map(mapRawKeyToPreviewKey) })),
  }));

  return { platformIds, previewPlatformId, layers };
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
 * Two-column grid: choices left (minmax(320px,460px)), sticky live preview
 * right. Collapses to a single column (choices first, preview below) at
 * <=768px via the scoped `.ks-touch-seed-grid` media-query rule below —
 * inline styles can't express a media query, so this is a class hook only;
 * every actual value still comes from tokens/consts here, not from CSS.
 * The outer wrapper already caps width at 1100px and centers, so this grid
 * only needs the column/gap shape.
 */
const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 460px) 1fr",
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

// ---------------------------------------------------------------------------
// TouchSeedSourcePanel
// ---------------------------------------------------------------------------

export function TouchSeedSourcePanel({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);
  const storedSeedSource = useSurveySessionStore((s) => s.touchSeedSource);
  const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);

  // Desktop modifications to replay onto the reseed preview (spec 035 R3) —
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

  // The ACTUAL derived phone layout (spec 035 R4a) — calls the pure
  // deriveSeedLayout, never scaffoldTouchLayout's compiling siblings and
  // never the OSK iframe. Null (never thrown) when baseIr hasn't loaded yet
  // or the derivation itself fails — both render the same graceful note.
  const reseedResult = useMemo(() => {
    if (baseIr === null) return null;
    try {
      return deriveSeedLayout(baseIr, { mods, seedSource: "reseed-from-desktop" });
    } catch (err) {
      // A genuine derivation failure (as opposed to "no baseIr yet", handled
      // by the guard above) has no other signal — the graceful
      // seed-source-reseed-preview-error fallback below still renders, but
      // this is otherwise silent, so log it for anyone debugging in devtools.
      devLog.error("[TouchSeedSourcePanel] reseed preview derivation failed:", err);
      return null;
    }
  }, [baseIr, mods]);
  const reseedPreview = useMemo(
    () => (reseedResult !== null ? mapTouchLayoutIrToPreview(reseedResult.layout) : null),
    [reseedResult],
  );

  // Default: Import & adapt when a usable base layout exists, else Reseed (R4).
  // On re-entry, start from the previously recorded choice rather than
  // re-deriving the default, so returning to this step doesn't silently
  // flip the selection back.
  const [selected, setSelected] = useState<TouchSeedSource>(
    storedSeedSource ?? (hasUsableBaseLayout ? "import-adapt" : "reseed-from-desktop"),
  );

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
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
                  <Trans id="editor.touchSeed.reseedDescription">Derive a fresh phone layout from your desktop key assignments.</Trans>
                  {hasOtherPlatforms && (
                    <Trans id="editor.touchSeed.reseedDiscardsPlatforms">
                      {" "}Choosing this discards the base's shipped tablet/desktop touch platforms — only a phone layout is produced.
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

          {/* Right column — live preview, matching the currently-selected card (R4a) */}
          <div className="ks-touch-seed-preview-col" style={previewColumnStyle}>
            {selected === "import-adapt" ? (
              <div style={previewCardStyle} data-testid="seed-source-preview">
                <p style={previewEyebrowStyle}>
                  <Trans id="editor.touchSeed.baseLayoutEyebrow">Base touch layout</Trans>
                </p>
                {preview !== null ? (
                  <>
                    <p style={{ margin: "0 0 10px 0", fontSize: 13, color: TEXT_MAIN, fontFamily: FONT }}>
                      {t({
                        id: "editor.touchSeed.shipsLine",
                        message: `Ships: ${{ platforms: preview.platformIds.join(", ") }} (showing "${{ previewPlatform: preview.previewPlatformId }}" default layer)`,
                      })}
                    </p>
                    <TouchLayoutPreview
                      data={preview}
                      emptyMessage={
                        <Trans id="editor.touchSeed.absentNote">This base ships no touch layout.</Trans>
                      }
                    />
                    {!hasPhonePlatform && (
                      <p
                        data-testid="seed-source-no-phone-warn"
                        style={{ margin: "10px 0 0 0", fontSize: 12, color: "#d29922", fontFamily: FONT }}
                      >
                        <Trans id="editor.touchSeed.noPhonePlatformWarning">[WARN] this layout has no phone platform.</Trans>
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    data-testid={isMalformed ? "seed-source-malformed-note" : "seed-source-absent-note"}
                    style={{ margin: 0, fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}
                  >
                    {isMalformed
                      ? <Trans id="editor.touchSeed.malformedNote">This base's touch layout could not be read (malformed JSON) — treated as no layout.</Trans>
                      : <Trans id="editor.touchSeed.absentNote">This base ships no touch layout.</Trans>}
                  </p>
                )}
              </div>
            ) : (
              <div style={previewCardStyle} data-testid="seed-source-reseed-preview">
                <p style={previewEyebrowStyle}>
                  <Trans id="editor.touchSeed.reseedPreviewEyebrow">Derived phone layout (reseed preview)</Trans>
                </p>
                {reseedPreview !== null ? (
                  <>
                    <TouchLayoutPreview
                      data={reseedPreview}
                      emptyMessage={
                        <Trans id="editor.touchSeed.reseedPreviewError">
                          Could not derive a preview from the current desktop work.
                        </Trans>
                      }
                    />
                    {reseedResult !== null && reseedResult.unplacedChars.length > 0 && (
                      <p
                        data-testid="seed-source-reseed-extras-note"
                        style={{ margin: "10px 0 0 0", fontSize: 12, color: "#d29922", fontFamily: FONT }}
                      >
                        <Trans id="editor.touchSeed.reseedExtrasNote">
                          [WARN] These characters had no matching key and were relocated to the
                          space bar&apos;s longpress &ldquo;extras&rdquo; menu: {reseedResult.unplacedChars.join(", ")}
                        </Trans>
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    data-testid="seed-source-reseed-preview-error"
                    style={{ margin: 0, fontSize: 13, color: TEXT_DIM, fontFamily: FONT }}
                  >
                    <Trans id="editor.touchSeed.reseedPreviewError">
                      Could not derive a preview from the current desktop work.
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
