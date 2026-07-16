// SequenceGallery — interim (visual-only) Sequence Gallery.
//
// Product decision (this pass): the sequence box is VISUAL ONLY. It renders
// and is typeable, but Apply/Next/Done never record a MechanismAssignment
// and never re-emit anything — no multi_char_sequence pattern application
// happens here. The two inputs are ephemeral component state, reset whenever
// currentChar changes; they are never written to the working-copy store.
// The live preview reflects the working copy exactly as it already stands
// (base + prior-phase assignments) — unaffected by this box.
//
// Cycles through `sequenceFlaggedChars` (set by the Mechanism Gallery's S-03
// FLAG card — see MechanismGallery's flagCharForSequence/unflagCharForSequence),
// NOT lettersToAdd. Positional Back/Previous/Next/Done navigation reuses
// usePositionalCharNav so this gallery cannot drift from MechanismGallery's/
// TouchGallery's Back/Next/Skip semantics.
//
// RIGHT pane: GalleryPreviewPane — live OSK preview. SequenceGallery owns the
// single useKeyboardArtifact + useWorkingCopyTransform pipeline for this step
// (mirroring MechanismGallery) because StudioShell's own pipeline stays
// mounted while a full-layout step (carve/mechanisms/sequences/touch) is
// active — it just doesn't render its preview pane. Passing stage+retry down
// from a single owned pipeline here avoids a second concurrent WASM compile
// (decision D3 / spec §8 — one 300 ms debounce cycle).

import { useState, useEffect, useMemo, type CSSProperties } from "react";
import type { BaseKeyboard, Pattern } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getPatternLibraryService } from "../../lib/services.ts";
import { useKeyboardArtifact, type ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { GalleryPreviewPane } from "../assignLoop/PreviewPane.tsx";
import { usePositionalCharNav } from "../assignLoop/usePositionalCharNav.ts";
import { PATTERN_DEADKEY, PATTERN_SWAP, PATTERN_RALT } from "../assignLoop/patternIds.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Shared styles — mirrors MechanismGallery's page/ghost/input styles so the
// two galleries read as one authoring surface.
// ---------------------------------------------------------------------------

const pageStyle: CSSProperties = {
  background: BG_PAGE,
  height: "100%",
  boxSizing: "border-box",
  fontFamily: FONT,
  color: TEXT_MAIN,
  display: "flex",
  flexDirection: "column",
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

const forwardBtnStyle: CSSProperties = {
  padding: "9px 20px",
  background: BLUE_ACTION,
  border: "none",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT,
};

// Identical to MechanismGallery's inputStyle (the restored S-03 config box
// used this exact styling before S-03 became a flag-only card).
const inputStyle: CSSProperties = {
  width: 52,
  padding: "6px 8px",
  background: BG_PAGE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_MAIN,
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  fontSize: 20,
  textAlign: "center",
  boxSizing: "border-box",
};

// ---------------------------------------------------------------------------
// SequenceGallery — main component
// ---------------------------------------------------------------------------

export interface SequenceGalleryProps {
  selectedBaseKeyboard: BaseKeyboard | null;
  onComplete?: () => void;
  onBack?: () => void;
}

export function SequenceGallery({
  selectedBaseKeyboard,
  onComplete,
  onBack,
}: SequenceGalleryProps) {
  const sequenceFlaggedChars = useWorkingCopyStore((s) => s.sequenceFlaggedChars);

  // currentChar: explicit state, kept in sync with sequenceFlaggedChars.
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const listKey = sequenceFlaggedChars.join("\0");
  useEffect(() => {
    setCurrentChar((prev) => {
      if (prev !== null && sequenceFlaggedChars.includes(prev)) return prev;
      return sequenceFlaggedChars[0] ?? null;
    });
    // Intentionally keyed on listKey only — re-run when the flagged list
    // itself changes, not on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey]);

  const {
    currentIdx,
    hasAnotherCharAfterCurrent,
    handleNext,
    handleBack,
    handlePreviousChar,
  } = usePositionalCharNav({
    list: sequenceFlaggedChars,
    currentChar,
    setCurrentChar,
    onComplete,
    onBack,
  });

  // ---------------------------------------------------------------------------
  // Visual-only sequence box state — ephemeral, reset per character. Never
  // recorded: no MechanismAssignment, no store write, no re-emit. See file
  // header — this is the interim, VISUAL-ONLY scope for this pass.
  // ---------------------------------------------------------------------------

  const [content, setContent] = useState("");
  const [indicator, setIndicator] = useState("");
  useEffect(() => {
    setContent("");
    setIndicator("");
  }, [currentChar]);

  // ---------------------------------------------------------------------------
  // Pattern loading — needed for patternMap (GalleryPreviewPane), so the live
  // preview faithfully reflects PRIOR (Phase C) assignments. Mirrors
  // MechanismGallery's pattern-loading effect: rank via filterFor, then make
  // sure the three method patterns MechanismGallery can produce are always
  // resolvable — no sequence pattern is ever loaded/applied here, since S-03
  // is flag-only (see MechanismGallery.PATTERN_SEQUENCE / flagCharForSequence).
  // ---------------------------------------------------------------------------

  const [patternMap, setPatternMap] = useState<Map<string, Pattern>>(new Map());
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedBaseKeyboard === null) {
      setPatternMap(new Map());
      setLoadError(null);
      return;
    }

    setPatternsLoading(true);
    setLoadError(null);
    const svc = getPatternLibraryService();

    svc
      .filterFor(selectedBaseKeyboard, undefined)
      .then((ranked) => {
        const ids = new Set<string>(ranked.map((m) => m.patternId));
        ids.add(PATTERN_DEADKEY);
        ids.add(PATTERN_SWAP);
        ids.add(PATTERN_RALT);
        return Promise.all([...ids].map((id) => svc.getById(id)));
      })
      .then((patterns) => {
        const map = new Map<string, Pattern>();
        for (const p of patterns) {
          if (p !== undefined) {
            map.set(p.id, p);
          } else {
            console.warn(
              "[SequenceGallery] getById() returned undefined for a patternId",
            );
          }
        }
        setPatternMap(map);
        setPatternsLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[SequenceGallery] filterFor error:", err);
        setLoadError(msg);
        setPatternsLoading(false);
      });
  }, [selectedBaseKeyboard]);

  // ---------------------------------------------------------------------------
  // Keyboard artifact pipeline — single owned compile for this step (see file
  // header for the single-artifact rationale).
  // ---------------------------------------------------------------------------

  const identity = useWorkingCopyStore((s) => s.identity);
  const scaffoldSpec = useMemo<ScaffoldSpec | null>(
    () =>
      identity?.keyboardId != null
        ? { keyboardId: identity.keyboardId, displayName: identity.displayName ?? "" }
        : null,
    [identity?.keyboardId, identity?.displayName],
  );
  const vfsTransform = useWorkingCopyTransform({ patternMap });
  const { stage: artifactStage, retry: artifactRetry } = useKeyboardArtifact(
    selectedBaseKeyboard,
    scaffoldSpec,
    vfsTransform,
  );

  // ---------------------------------------------------------------------------
  // Header — shared by every render branch below.
  // ---------------------------------------------------------------------------

  const header = (
    <div
      style={{
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "baseline",
        gap: 16,
        padding: "16px 24px 14px",
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: "1.05rem",
          fontWeight: 600,
          color: ACCENT,
          fontFamily: FONT,
        }}
      >
        Sequence Gallery
      </h1>
      <span
        style={{
          fontSize: 12,
          color: TEXT_DIM,
          fontFamily: FONT,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Desktop
      </span>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Empty state — no characters flagged for sequences. Checked ahead of the
  // no-base guard: with nothing to define there is nothing to preview either,
  // so the author can always move on regardless of base-keyboard state.
  // ---------------------------------------------------------------------------

  if (sequenceFlaggedChars.length === 0) {
    return (
      <div style={pageStyle}>
        {header}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 560,
            margin: "0 auto",
            padding: "24px 32px",
            textAlign: "center",
            gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: TEXT_DIM }}>
            No characters flagged for sequences. Flag characters in the
            Mechanism Gallery to define their sequences here.
          </p>
        </div>
        <div
          style={{
            borderTop: `1px solid ${BORDER}`,
            flexShrink: 0,
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 24px",
          }}
        >
          {onBack !== undefined ? (
            <button
              type="button"
              data-testid="sequences-back"
              onClick={onBack}
              style={ghostBtn}
            >
              &larr; Back
            </button>
          ) : (
            <span />
          )}
          {onComplete !== undefined && (
            <button
              type="button"
              data-testid="sequences-continue"
              onClick={onComplete}
              aria-label="Continue (sequence gallery)"
              style={forwardBtnStyle}
            >
              Continue &rarr;
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Guard: no base keyboard (only reachable with a non-empty flagged list —
  // an edge case, since a flagged char implies the working copy is already
  // instantiated, but guarded defensively to match MechanismGallery's shape).
  // ---------------------------------------------------------------------------

  if (selectedBaseKeyboard === null) {
    return (
      <div style={pageStyle}>
        {header}
        <div style={{ padding: "24px 32px" }}>
          {onBack !== undefined && (
            <button
              type="button"
              data-testid="sequences-back"
              onClick={onBack}
              style={ghostBtn}
            >
              &larr; Back
            </button>
          )}
          <div
            style={{
              maxWidth: 560,
              margin: "60px auto",
              textAlign: "center",
              color: TEXT_DIM,
            }}
          >
            <p style={{ fontSize: 15 }}>
              No base keyboard selected. Go back to choose a starting point.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Per-char forward control — exactly one control at a time: "Next
  // character" mid-list, or the completion action ("Done") from the last
  // flagged character. Never gated on the (visual-only, non-recording) box —
  // the author can always advance.
  // ---------------------------------------------------------------------------

  const forwardLabel = hasAnotherCharAfterCurrent ? "Next character →" : "Done";
  const forwardAriaLabel = hasAnotherCharAfterCurrent
    ? "Next character"
    : "Continue (sequence gallery)";

  // ---------------------------------------------------------------------------
  // Left pane
  // ---------------------------------------------------------------------------

  const leftContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "24px 20px",
        overflowY: "auto",
        boxSizing: "border-box",
        height: "100%",
      }}
    >
      <p
        role="status"
        aria-live="polite"
        aria-label={`${currentIdx + 1} of ${sequenceFlaggedChars.length}`}
        style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}
      >
        {currentIdx + 1} of {sequenceFlaggedChars.length}
      </p>

      {/* Top toolbar row — Back (left) + Previous/Next-or-Done (right). */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width: "100%",
        }}
      >
        {(onBack !== undefined || currentIdx > 0) && (
          <button
            type="button"
            data-testid="sequences-back"
            onClick={handleBack}
            style={{ ...ghostBtn, fontSize: 13 }}
          >
            &larr; Back
          </button>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            data-testid="sequences-prev-char"
            onClick={handlePreviousChar}
            disabled={currentIdx <= 0}
            aria-label="Previous character"
            style={{
              ...ghostBtn,
              fontSize: 13,
              ...(currentIdx <= 0
                ? { color: TEXT_DIM, opacity: 0.5, cursor: "not-allowed" }
                : {}),
            }}
          >
            &laquo; Previous character
          </button>

          <button
            type="button"
            data-testid="sequences-continue"
            onClick={handleNext}
            aria-label={forwardAriaLabel}
            style={forwardBtnStyle}
          >
            {forwardLabel}
          </button>
        </div>
      </div>

      {currentChar !== null && (
        <>
          {/* Character heading — same shape as MechanismGallery's "Add a key". */}
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Define a sequence
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span
                style={{ fontSize: 36, fontFamily: "monospace", lineHeight: 1 }}
                aria-label={`${toUPlusNotation(currentChar)} ${currentChar}`}
              >
                {currentChar}
              </span>
              <span style={{ fontSize: 13, color: TEXT_DIM }}>
                {toUPlusNotation(currentChar)}
              </span>
            </div>
          </div>

          {/* Visual-only sequence boxes — see file header: no Apply-to-record;
              typing here never touches the working-copy store. Two explained
              boxes model content (what you type first) + indicator (the
              single trigger character that follows it) -> currentChar. */}
          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, fontFamily: FONT }}>
              Content
            </span>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              The characters that come first — what you type before the indicator.
            </p>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              aria-label="Content characters"
              maxLength={8}
              style={{ ...inputStyle, width: 120, textAlign: "left" }}
            />
          </div>

          <div
            style={{
              background: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, fontFamily: FONT }}>
              Indicator
            </span>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              The single character that triggers the combination — typing it after the
              content produces {currentChar}.
            </p>
            <input
              type="text"
              value={indicator}
              onChange={(e) => setIndicator(e.target.value)}
              aria-label="Indicator character"
              // maxLength 2 (not 1): one grapheme may be two UTF-16 code units
              // (surrogate pair / base+combining mark), matching the input caps
              // used by the MechanismGallery character boxes.
              maxLength={2}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
              {content !== "" ? content : "[content]"}
              {" + "}
              {indicator !== "" ? indicator : "[indicator]"}
              {" "}
              &rarr;{" "}
              <span style={{ color: TEXT_MAIN, fontFamily: "monospace", fontSize: 16 }}>
                {currentChar}
              </span>
            </span>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
            More sequence options are coming soon.
          </p>
        </>
      )}

      {loadError !== null && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "10px 14px",
            background: "#2a0a0a",
            border: "1px solid #f85149",
            borderRadius: 6,
            color: "#f85149",
            fontSize: 12,
            fontFamily: FONT,
          }}
        >
          Pattern load error — preview transform may be incomplete.
          <br />
          <span style={{ fontSize: 11, color: TEXT_DIM }}>{loadError}</span>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Two-pane layout
  // ---------------------------------------------------------------------------

  return (
    <div
      style={{
        ...pageStyle,
        height: "100%",
        overflow: "hidden",
      }}
    >
      {header}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flexBasis: "45%",
            flexShrink: 0,
            borderRight: `1px solid ${BORDER}`,
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          {leftContent}
        </div>

        <div
          style={{
            flexGrow: 1,
            overflowY: "auto",
            padding: "24px 20px",
            boxSizing: "border-box",
          }}
        >
          {!patternsLoading && loadError === null ? (
            <GalleryPreviewPane
              baseKeyboard={selectedBaseKeyboard}
              stage={artifactStage}
              retry={artifactRetry}
              defaultOskMode="desktop"
              heading="Live preview"
              warningLabel="Apply warnings:"
            />
          ) : patternsLoading ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
              Loading patterns...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
