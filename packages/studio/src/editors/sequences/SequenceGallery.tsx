// SequenceGallery — the Sequence Gallery (S-03 multi-key sequences).
//
// Records a real `multi_char_sequence` MechanismAssignment. Content is the
// character(s) already typed that the sequence builds on (`firstLetterOut`);
// Indicator is the single key typed right after the content that triggers
// the collapse (`secondLetter`) — it must resolve to a PHYSICAL key on the
// base layout (checked via charToVkey, the same lookup MechanismGallery's
// trigger/swap/ralt key pickers use), since the emitted rule is a
// `using keys` group whose rightmost item is the Indicator; the flagged
// character being defined is the collapse target (`collapsedChar`). Apply
// records/updates a `scope:"individual"` assignment for `currentChar` via
// the working-copy store's `recordAssignments` — the same store call
// MechanismGallery's deadkey/swap/ralt branches use — so the existing
// useWorkingCopyTransform -> applyAssignmentsToVfs pipeline picks it up with
// no engine changes: the live preview and the emitted .kmn both reflect it.
//
// Cycles through `sequenceFlaggedChars` (set by the Mechanism Gallery's S-03
// FLAG card — see MechanismGallery's flagCharForSequence/unflagCharForSequence;
// unflagCharForSequence also strips this gallery's recorded assignment for
// that char — see the store action's own doc comment), NOT lettersToAdd.
// Positional Back/Previous/Next/Done navigation reuses usePositionalCharNav
// so this gallery cannot drift from MechanismGallery's/TouchGallery's
// Back/Next/Skip semantics.
//
// Apply/advance — mirrors MechanismGallery's canGoNext/Skip split exactly:
// the top toolbar's "Next character →"/"Done" is gated on the current
// character already having a recorded sequence assignment (so filled-but-
// unapplied box content can never be silently discarded through that
// control); an explicit, never-gated "Skip this character" button sits next
// to Apply for an author who deliberately wants to move on without defining
// a sequence for this character. Revisiting an already-recorded character
// prefills Content/Indicator from its stored slotValues.
//
// Deferred (explicitly out of scope for this pass — see NOTE at handleApply):
// rule-order/shadowing enforcement, indicator<->deadkey-trigger collision
// detection, multi-codepoint-output smart-backspace companion rule, RTL box
// mirroring, double-diacritic chaining, prefix (deadkey-first) direction.
//
// RIGHT pane: GalleryPreviewPane — live OSK preview. SequenceGallery owns the
// single useKeyboardArtifact + useWorkingCopyTransform pipeline for this step
// (mirroring MechanismGallery) because StudioShell's own pipeline stays
// mounted while a full-layout step (carve/mechanisms/sequences/touch) is
// active — it just doesn't render its preview pane. Passing stage+retry down
// from a single owned pipeline here avoids a second concurrent WASM compile
// (decision D3 / spec §8 — one 300 ms debounce cycle).

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import type { BaseKeyboard, MechanismAssignment, Pattern } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getPatternLibraryService } from "../../lib/services.ts";
import { useKeyboardArtifact, type ScaffoldSpec } from "../../hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "../../hooks/useWorkingCopyTransform.ts";
import { GalleryPreviewPane } from "../assignLoop/PreviewPane.tsx";
import { usePositionalCharNav } from "../assignLoop/usePositionalCharNav.ts";
import {
  PATTERN_DEADKEY, PATTERN_SWAP, PATTERN_RALT, PATTERN_SEQUENCE,
} from "../assignLoop/patternIds.ts";
import {
  resolveCharInput, reflectCharInput, type ResolveCharInputOptions,
} from "../../lib/charInput.ts";
import { charToVkey } from "../../lib/keyOptions.ts";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// Char-box resolve options — reuses the shared resolveCharInput/
// reflectCharInput helper (packages/studio/src/lib/charInput.ts), whose own
// doc comments already name these two boxes ("seqFirst"/"seqSecond") as the
// intended consumers.
// ---------------------------------------------------------------------------

// Content ("seqFirst") — the sequence's left-context box. NOT singleGrapheme:
// content may legitimately span several graphemes (a digraph/trigraph
// collapse, e.g. "ng"), per domain guidance.
const SEQ_CONTENT_RESOLVE_OPTIONS: ResolveCharInputOptions = {
  multiToken: true,
  blockDelimiters: true,
};

// Indicator ("seqSecond") — a single keystroke. singleGrapheme is
// grapheme-aware (Intl.Segmenter), so a lone combining mark typed as the
// indicator is NOT hard-rejected — only more than one grapheme is.
const SEQ_INDICATOR_RESOLVE_OPTIONS: ResolveCharInputOptions = {
  multiToken: true,
  singleGrapheme: true,
  blockDelimiters: true,
  singleGraphemeReason: "Enter one indicator character.",
};

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
  // Recorded sequence assignments — read directly from Phase C (like
  // MechanismGallery's own sessionAssignments), so this gallery's Apply can
  // find/replace the ONE multi_char_sequence assignment for currentChar
  // without disturbing any other mechanism recorded for other characters.
  // ---------------------------------------------------------------------------

  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const recordAssignments = useWorkingCopyStore((s) => s.recordAssignments);

  const sessionAssignments = useMemo(
    () =>
      (phaseResults.find((p) => p.phase === "C")?.assignments ?? []).filter(
        (a) => a.modality === "physical",
      ),
    [phaseResults],
  );

  // The (at most one) existing multi_char_sequence assignment for currentChar
  // — used both to prefill the boxes on revisit and to replace-not-duplicate
  // on re-Apply.
  const existingSequenceAssignment = useMemo(() => {
    if (currentChar === null) return null;
    return (
      sessionAssignments.find(
        (a) =>
          a.scope === "individual" &&
          a.target === currentChar &&
          a.mechanisms.some((m) => m.patternId === PATTERN_SEQUENCE),
      ) ?? null
    );
  }, [sessionAssignments, currentChar]);

  // ---------------------------------------------------------------------------
  // Sequence box state — Content ("seqFirst") / Indicator ("seqSecond").
  // Reset on every currentChar change, then immediately prefilled from any
  // already-recorded sequence assignment for the NEW currentChar (revisit
  // case). Deliberately keyed on currentChar only (not on
  // existingSequenceAssignment itself) — Apply mutates the store but must NOT
  // clear/refill what the author is actively looking at; only navigating to a
  // different character re-syncs the boxes.
  // ---------------------------------------------------------------------------

  const [content, setContent] = useState("");
  const [indicator, setIndicator] = useState("");
  useEffect(() => {
    const seqMech = existingSequenceAssignment?.mechanisms.find(
      (m) => m.patternId === PATTERN_SEQUENCE,
    );
    setContent(seqMech?.slotValues?.["firstLetterOut"] ?? "");
    setIndicator(seqMech?.slotValues?.["secondLetter"] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChar]);

  const contentResolved = resolveCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
  const indicatorResolved = resolveCharInput(indicator, SEQ_INDICATOR_RESOLVE_OPTIONS);
  const contentReflection = reflectCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
  const indicatorReflection = reflectCharInput(indicator, SEQ_INDICATOR_RESOLVE_OPTIONS);

  // Indicator vkey-resolvability (P1) — the emitted rule is a `using keys`
  // group whose rightmost item is the Indicator; kmcmplib requires that item
  // resolve to a PHYSICAL key on the base layout. resolveCharInput's
  // singleGrapheme option only counts grapheme clusters — it says nothing
  // about key-resolvability, so for a non-Latin/non-ASCII Indicator (common
  // for S-03 target scripts) an ungated Apply would record a rule that later
  // fails only at the WASM oracle, several steps downstream of this box. Uses
  // the SAME charToVkey lookup MechanismGallery's trigger/swap/ralt key
  // pickers resolve through (lib/keyOptions.ts, via
  // resolveKeyPickerSelection in lib/charInput.ts) — deliberately reused
  // rather than re-implemented, so the two galleries can never disagree about
  // what counts as a resolvable key.
  const indicatorVkey = indicatorResolved.ok ? charToVkey(indicatorResolved.value) : null;
  const indicatorUnresolvable = indicatorResolved.ok && indicatorVkey === null;

  const canApply = useMemo(
    () => currentChar !== null && contentResolved.ok && indicatorResolved.ok && indicatorVkey !== null,
    [currentChar, contentResolved.ok, indicatorResolved.ok, indicatorVkey],
  );

  // ---------------------------------------------------------------------------
  // Apply — records/updates the multi_char_sequence MechanismAssignment for
  // currentChar. Filter-then-append (not a naive push) so repeated Apply
  // clicks REPLACE this char's sequence assignment rather than accumulating
  // duplicates — mirrors MechanismGallery's handleRemoveCovered/
  // handleCompanionConfirm filter-then-record pattern.
  //
  // Deferred (NOT implemented here — see file header): rule-order/shadowing
  // enforcement, indicator<->deadkey-trigger collision detection,
  // multi-codepoint-output smart-backspace companion rule, RTL box mirroring,
  // double-diacritic chaining, prefix (deadkey-first) direction.
  // ---------------------------------------------------------------------------

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;
    const contentValue = resolveCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
    const indicatorValue = resolveCharInput(indicator, SEQ_INDICATOR_RESOLVE_OPTIONS);
    if (!contentValue.ok || !indicatorValue.ok) return;
    // Re-check vkey resolvability here too (not just via canApply) — never
    // silently record an Indicator that can't be wired to a physical key.
    if (charToVkey(indicatorValue.value) === null) return;

    const assignment: MechanismAssignment = {
      scope: "individual",
      target: currentChar,
      modality: "physical",
      mechanisms: [
        {
          patternId: PATTERN_SEQUENCE,
          strategyId: "S-03",
          slotValues: {
            firstLetterOut: contentValue.value,
            secondLetter: indicatorValue.value,
            collapsedChar: currentChar.normalize("NFC"),
          },
        },
      ],
      source: "user",
    };

    const next = sessionAssignments.filter(
      (a) =>
        !(
          a.scope === "individual" &&
          a.target === currentChar &&
          a.mechanisms.some((m) => m.patternId === PATTERN_SEQUENCE)
        ),
    );
    recordAssignments([...next, assignment]);
  }, [currentChar, canApply, content, indicator, sessionAssignments, recordAssignments]);

  // ---------------------------------------------------------------------------
  // Pattern loading — needed for patternMap (GalleryPreviewPane + the emit
  // pipeline below), so the live preview faithfully reflects PRIOR (Phase C)
  // assignments AND this gallery's own multi_char_sequence apply. Mirrors
  // MechanismGallery's pattern-loading effect: rank via filterFor, then make
  // sure the four method patterns either gallery can produce are always
  // resolvable — PATTERN_SEQUENCE must be loaded here since this gallery now
  // applies it directly, rather than only flagging.
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
        ids.add(PATTERN_SEQUENCE);
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
  // Per-char forward control — mirrors MechanismGallery's canGoNext/Skip
  // split (MechanismGallery.tsx's canGoNext + its "Skip this character"
  // button): the TOP toolbar's "Next character →"/"Done" is gated on the
  // CURRENT character already having a recorded sequence assignment, so
  // filled-but-unapplied box content can never be silently discarded via that
  // control. The explicit "Skip this character" button (rendered next to
  // Apply, below) is pure forward navigation — it records nothing and is
  // never gated, exactly like MechanismGallery's Skip — so an author who
  // deliberately wants to leave a character without a sequence still has a
  // one-click way forward. Revisiting an already-recorded character always
  // re-enables the top control, so Back-then-Next over a finished character
  // never traps the author.
  // ---------------------------------------------------------------------------

  const canGoNext = currentChar !== null && existingSequenceAssignment !== null;

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
            disabled={!canGoNext}
            aria-label={forwardAriaLabel}
            style={{
              ...forwardBtnStyle,
              background: canGoNext ? BLUE_ACTION : "#21262d",
              color: canGoNext ? "#e6edf3" : TEXT_DIM,
              cursor: canGoNext ? "pointer" : "not-allowed",
            }}
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

          {/* Content / Indicator sequence box — Apply records a real
              multi_char_sequence MechanismAssignment (see handleApply). Two
              explained boxes model content (what you type first) + indicator
              (the single trigger character that follows it) -> currentChar. */}
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
            <label
              htmlFor="sequences-content-input"
              style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, fontFamily: FONT }}
            >
              Content
            </label>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              The characters that come first — what you type before the indicator.
            </p>
            <input
              id="sequences-content-input"
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              data-testid="sequences-content"
              maxLength={24}
              style={{ ...inputStyle, width: 120, textAlign: "left" }}
            />
            {contentReflection.kind === "ok" && (
              <span role="status" aria-live="polite" style={{ fontSize: 10, color: TEXT_DIM, fontFamily: FONT }}>
                {contentReflection.text}
              </span>
            )}
            {contentReflection.kind === "error" && (
              <span role="alert" style={{ fontSize: 10, color: "#f85149", opacity: 0.85, fontFamily: FONT }}>
                {contentReflection.reason}
              </span>
            )}
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
            <label
              htmlFor="sequences-indicator-input"
              style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, fontFamily: FONT }}
            >
              Indicator
            </label>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              The single character that triggers the combination — typing it after the
              content produces {currentChar}.
            </p>
            <input
              id="sequences-indicator-input"
              type="text"
              value={indicator}
              onChange={(e) => setIndicator(e.target.value)}
              data-testid="sequences-indicator"
              // maxLength 2 (not 1): one grapheme may be two UTF-16 code units
              // (surrogate pair / base+combining mark), matching the input caps
              // used by the MechanismGallery character boxes.
              maxLength={2}
              style={inputStyle}
            />
            {indicatorReflection.kind === "ok" && !indicatorUnresolvable && (
              <span role="status" aria-live="polite" style={{ fontSize: 10, color: TEXT_DIM, fontFamily: FONT }}>
                {indicatorReflection.text}
              </span>
            )}
            {indicatorReflection.kind === "error" && (
              <span role="alert" style={{ fontSize: 10, color: "#f85149", opacity: 0.85, fontFamily: FONT }}>
                {indicatorReflection.reason}
              </span>
            )}
            {indicatorUnresolvable && (
              <span role="alert" style={{ fontSize: 10, color: "#f85149", opacity: 0.85, fontFamily: FONT }}>
                '{indicatorResolved.ok ? indicatorResolved.value : ""}' isn't a key on
                this layout — pick a character that maps to a physical key.
              </span>
            )}
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

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              data-testid="sequences-apply"
              onClick={handleApply}
              disabled={!canApply}
              aria-label={`Apply sequence for ${toUPlusNotation(currentChar)} ${currentChar}`}
              style={{
                padding: "7px 16px",
                background: canApply ? BLUE_ACTION : "#21262d",
                border: "none",
                borderRadius: 6,
                color: canApply ? "#e6edf3" : TEXT_DIM,
                fontSize: 13,
                fontWeight: 600,
                cursor: canApply ? "pointer" : "not-allowed",
                fontFamily: FONT,
              }}
            >
              Apply
            </button>
            <button
              type="button"
              data-testid="sequences-skip"
              onClick={handleNext}
              aria-label={`Skip this character (${toUPlusNotation(currentChar)} ${currentChar})`}
              style={{
                background: "transparent",
                border: "none",
                color: TEXT_DIM,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: FONT,
                padding: "4px 8px",
                textDecoration: "underline",
              }}
            >
              Skip this character
            </button>
            {existingSequenceAssignment !== null && (
              <span
                role="status"
                aria-live="polite"
                style={{ fontSize: 12, color: "#56d364", fontFamily: FONT }}
              >
                Sequence recorded
              </span>
            )}
          </div>
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
