// TouchSeedSourcePanel — the touch_seed_source fork chooser (spec 035 FR-006).
//
// Renders the off-spine "touch_seed_source" step (contracts/seed-source-fork.md):
// lets the author pick "Import & adapt" (keep + adapt the base's shipped touch
// layout) vs "Reseed from desktop" (discard any shipped touch layout and derive
// a fresh phone projection from the locked desktop work). The choice is recorded
// in surveySessionStore.touchSeedSource; buildTouchLayoutJson's caller reads it
// to select the Case A/B derivation path (see seed-derivation.md).
//
// PREVIEW-ONLY (R4): this panel parses the base's raw `.keyman-touch-layout`
// JSON directly — no engine calls (no parseTouchLayout, no scaffoldTouchLayout,
// no compile) and no OSK iframe. It is a lightweight read-only summary so the
// choice is informed without invoking the compiler.
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
import type { EditorStepProps } from "../../steps/types.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore, type TouchSeedSource } from "../../stores/surveySessionStore.ts";
import { resolveBaseTouchJson } from "../../lib/resolveBaseTouchJson.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Raw `.keyman-touch-layout` preview parsing.
//
// Deliberately NOT the engine's parseTouchLayout (engine/src/codec/parse-touch.ts)
// — this preview never calls into the engine. The wire shape mirrored here
// (top-level platform keys, each with a `layer` array of `{ id, row: [{ key }] }`)
// is documented at the top of parse-touch.ts; only the fields a summary needs
// (id/text/output) are read.
// ---------------------------------------------------------------------------

interface RawPreviewKey {
  id?: string;
  text?: string;
  output?: string;
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

export interface TouchLayoutPreview {
  /** Platform ids the base layout ships, e.g. ["phone", "tablet"]. */
  platformIds: string[];
  /** The platform id these rows were drawn from (preference order below). */
  previewPlatformId: string;
  /** Rows of key labels from the preview platform's "default" layer. */
  rows: Array<{ keys: Array<{ label: string }> }>;
}

/** Preference order for which platform's rows to preview when several ship. */
const PREVIEW_PLATFORM_ORDER = ["phone", "tablet", "desktop"] as const;

function isRawPlatform(v: unknown): v is RawPreviewPlatform {
  return typeof v === "object" && v !== null && Array.isArray((v as RawPreviewPlatform).layer);
}

/**
 * Parse a base's raw `.keyman-touch-layout` JSON string into a lightweight
 * preview. Returns null for absent or malformed input — both are treated as
 * "no usable base layout" by the caller (R4): the malformed case is reported
 * with a distinct note, but neither case blocks either choice.
 */
export function parseBaseTouchPreview(json: string | undefined): TouchLayoutPreview | null {
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

  const previewPlatformId =
    PREVIEW_PLATFORM_ORDER.find((id) => platformIds.includes(id)) ?? platformIds[0]!;
  const platform = obj[previewPlatformId];
  const layers = isRawPlatform(platform) ? platform.layer ?? [] : [];
  const defaultLayer = layers.find((l) => (l.id ?? "default") === "default") ?? layers[0];
  const rows = (defaultLayer?.row ?? []).map((r) => ({
    keys: (r.key ?? []).map((k) => ({ label: k.text ?? k.output ?? k.id ?? "" })),
  }));

  return { platformIds, previewPlatformId, rows };
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
  marginBottom: 20,
};

const keycapRowStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  flexWrap: "wrap",
  marginBottom: 4,
};

const keycapStyle: CSSProperties = {
  minWidth: 22,
  height: 22,
  padding: "0 4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontSize: 11,
  color: TEXT_MAIN,
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
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);
  const storedSeedSource = useSurveySessionStore((s) => s.touchSeedSource);
  const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);

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
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
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

        {/* Preview */}
        <div style={previewCardStyle} data-testid="seed-source-preview">
          <p
            style={{
              margin: "0 0 8px 0",
              fontSize: 12,
              color: TEXT_DIM,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: FONT,
            }}
          >
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
              <div>
                {preview.rows.map((row, i) => (
                  <div key={i} style={keycapRowStyle}>
                    {row.keys.map((k, j) => (
                      <div key={j} style={keycapStyle}>
                        {k.label}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
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

        {/* Choices */}
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
    </div>
  );
}
