// SequenceGallery — the Sequence Gallery (S-03 multi-key sequences).
//
// A flagged character may hold MULTIPLE sequences (e.g. "á" reachable via
// both "a"+"´" and "a"+"s"). Representation: ONE `scope:"individual"`
// MechanismAssignment per character, whose `mechanisms` array holds MULTIPLE
// `multi_char_sequence` MechanismRefs — one per distinct (content, indicator)
// pair, each with its own `{ firstLetterOut, secondLetter, collapsedChar }`
// slotValues. This is permitted by the contract (`MechanismAssignment.
// mechanisms` is documented many-to-many — see
// packages/contracts/src/assignmentMap.ts) and requires NO engine changes:
// `applyAssignments` already flattens every assignment's mechanisms and
// deduplicates by (patternId, serialized slotValues), so two distinct
// sequence refs for the same char each emit their own `.kmn` rule, and an
// identical (content, indicator) pair collapses to one.
//
// Content is the character(s) already typed that the sequence builds on
// (`firstLetterOut`); Indicator is the single key typed right after the
// content that triggers the collapse (`secondLetter`) — it must resolve to a
// PHYSICAL key on the base layout (checked via charToVkey, the same lookup
// MechanismGallery's trigger/swap/ralt key pickers use), since the emitted
// rule is a `using keys` group whose rightmost item is the Indicator; the
// flagged character being defined is the collapse target (`collapsedChar`).
// Apply ADDS a new sequence ref to `currentChar`'s assignment (creating the
// assignment on the first Apply) via the working-copy store's
// `recordAssignments` — the same store call MechanismGallery's deadkey/swap/
// ralt branches use — so the existing useWorkingCopyTransform ->
// applyAssignmentsToVfs pipeline picks it up with no engine changes: the live
// preview and the emitted .kmn both reflect every recorded sequence.
//
// Cycles through `sequenceFlaggedChars` (set by the Mechanism Gallery's S-03
// FLAG card — see MechanismGallery's flagCharForSequence/unflagCharForSequence;
// unflagCharForSequence still strips the WHOLE assignment (all recorded
// sequences) for that char — see the store action's own doc comment), NOT
// lettersToAdd. Positional Back/Previous/Next/Done navigation reuses
// usePositionalCharNav so this gallery cannot drift from MechanismGallery's/
// TouchGallery's Back/Next/Skip semantics.
//
// Apply/advance — mirrors MechanismGallery's canGoNext/Skip split exactly:
// the top toolbar's "Next character →"/"Done" is gated on the current
// character already having AT LEAST ONE recorded sequence (so filled-but-
// unapplied box content can never be silently discarded through that
// control); an explicit, never-gated "Skip this character" button sits next
// to Apply for an author who deliberately wants to move on without defining
// a sequence for this character. Apply always ADDS a sequence and then
// CLEARS both boxes (so the author can immediately define another one for
// the same char); the boxes are therefore never prefilled on revisit — the
// already-recorded sequences for the current char are shown as a list below
// the boxes, each with its own Remove control.
//
// Deferred (explicitly out of scope for this pass — see NOTE at handleApply):
// rule-order/shadowing enforcement, indicator<->deadkey-trigger collision
// detection, multi-codepoint-output smart-backspace companion rule, RTL box
// mirroring, double-diacritic chaining, prefix (deadkey-first) direction.
// Not an oversight of the multi-sequence model above: two sequences for the
// SAME output char whose Content differs in length but shares an Indicator
// (e.g. "a"+"´"->"á" vs "ba"+"´"->"bá") can shadow order-dependently at emit
// time — this is the SAME class of concern as the deferred rule-order item,
// just newly reachable now that one char can carry several sequence rules;
// it is backstopped by the WASM oracle (Layer A Check #11), not enforced here.
//
// RIGHT pane: GalleryPreviewPane — live OSK preview. SequenceGallery owns the
// single useKeyboardArtifact + useWorkingCopyTransform pipeline for this step
// (mirroring MechanismGallery) because StudioShell's own pipeline stays
// mounted while a full-layout step (carve/mechanisms/sequences/touch) is
// active — it just doesn't render its preview pane. Passing stage+retry down
// from a single owned pipeline here avoids a second concurrent WASM compile
// (decision D3 / spec §8 — one 300 ms debounce cycle).

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { BaseKeyboard, MechanismAssignment, MechanismRef, Pattern } from "@keyboard-studio/contracts";
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
  BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
  galleryPageStyle,
  galleryGhostBtn as ghostBtn,
  galleryInputStyle as inputStyle,
  galleryForwardBtnStyle as forwardBtnStyle,
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
//
// singleGraphemeReason is user-facing chrome (an error string), but this
// object is constructed at module scope where no useLingui() is available —
// buildSeqIndicatorResolveOptions(t) below builds the localized version
// per-render, called from the component (which has a live t()).
function buildSeqIndicatorResolveOptions(
  t: (descriptor: { id: string; message: string }) => string,
): ResolveCharInputOptions {
  return {
    multiToken: true,
    singleGrapheme: true,
    blockDelimiters: true,
    singleGraphemeReason: t({ id: "editor.sequences.indicatorSingleGraphemeReason", message: "Enter one indicator character." }),
  };
}

// ---------------------------------------------------------------------------
// Shared styles — ghostBtn/inputStyle/forwardBtnStyle are imported (aliased)
// from ../../lib/galleryTheme.ts, byte-for-byte shared with MechanismGallery.tsx
// (and, for ghostBtn, TouchGallery.tsx) so the galleries can't drift apart.
// pageStyle layers this gallery's flex-column page layout on top of the
// shared galleryPageStyle base (MechanismGallery/TouchGallery use the base
// as-is; only SequenceGallery needs the flex column).
// ---------------------------------------------------------------------------

const pageStyle: CSSProperties = {
  ...galleryPageStyle,
  display: "flex",
  flexDirection: "column",
};

// ---------------------------------------------------------------------------
// partitionSequenceAssignment — the ONE place that knows the "does this
// assignment belong to currentChar's PATTERN_SEQUENCE bucket?" predicate
// (scope:"individual" + target === char + at least one PATTERN_SEQUENCE
// mechanism). Every read site (the existing-sequences memo) and every write
// site (handleApply's recompute + exclude-filter, handleRemoveSequence's
// exclude-filter) derives from this single function so a future predicate
// tweak (e.g. adding a modality check) can't miss one of the four call
// sites. Returns BOTH halves of the partition: `mechs` (this char's
// PATTERN_SEQUENCE refs, already flattened out of whichever assignment held
// them) and `rest` (every other assignment, untouched) — write sites splice
// their own rebuilt assignment back into `rest`; the read site only needs
// `mechs`.
// ---------------------------------------------------------------------------

function partitionSequenceAssignment(
  sessionAssignments: MechanismAssignment[],
  char: string,
): { mechs: MechanismRef[]; rest: MechanismAssignment[] } {
  const isSequenceAssignmentForChar = (a: MechanismAssignment): boolean =>
    a.scope === "individual" &&
    a.target === char &&
    a.mechanisms.some((m) => m.patternId === PATTERN_SEQUENCE);

  const existing = sessionAssignments.find(isSequenceAssignmentForChar);
  const mechs =
    existing?.mechanisms.filter((m) => m.patternId === PATTERN_SEQUENCE) ?? [];
  const rest = sessionAssignments.filter((a) => !isSequenceAssignmentForChar(a));

  return { mechs, rest };
}

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
  const { t } = useLingui();
  const seqIndicatorResolveOptions = useMemo(() => buildSeqIndicatorResolveOptions(t), [t]);
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

  // All PATTERN_SEQUENCE refs recorded so far for currentChar — one per
  // recorded sequence. Used to render the recorded-sequences list, to gate
  // canGoNext, and as the append/remove target in
  // handleApply/handleRemoveSequence. Derived via partitionSequenceAssignment
  // (see above) so this memo can never disagree with the write sites about
  // which assignment belongs to currentChar.
  const existingSequenceMechanisms = useMemo(() => {
    if (currentChar === null) return [];
    return partitionSequenceAssignment(sessionAssignments, currentChar).mechs;
  }, [sessionAssignments, currentChar]);

  // ---------------------------------------------------------------------------
  // Sequence box state — Content ("seqFirst") / Indicator ("seqSecond").
  // Reset (cleared) on every currentChar change AND after every successful
  // Apply — the boxes are ALWAYS for composing the NEXT sequence to add, never
  // a view onto an existing one (multi-sequence model: existing sequences for
  // currentChar are rendered in the list below, each with its own Remove
  // control, not prefilled back into these boxes).
  // ---------------------------------------------------------------------------

  const [content, setContent] = useState("");
  const [indicator, setIndicator] = useState("");
  useEffect(() => {
    setContent("");
    setIndicator("");
  }, [currentChar]);

  const contentResolved = resolveCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
  const indicatorResolved = resolveCharInput(indicator, seqIndicatorResolveOptions);
  const contentReflection = reflectCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
  const indicatorReflection = reflectCharInput(indicator, seqIndicatorResolveOptions);

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
  // Apply — ADDS a new sequence to currentChar's multi_char_sequence
  // MechanismAssignment (creating the assignment on the first Apply for this
  // char). If an identical (content, indicator) pair is already recorded,
  // this is a no-op (no duplicate ref is created). On success, both boxes are
  // cleared so the author can immediately define another sequence for the
  // same character.
  //
  // Deferred (NOT implemented here — see file header): rule-order/shadowing
  // enforcement, indicator<->deadkey-trigger collision detection,
  // multi-codepoint-output smart-backspace companion rule, RTL box mirroring,
  // double-diacritic chaining, prefix (deadkey-first) direction.
  // ---------------------------------------------------------------------------

  const handleApply = useCallback(() => {
    if (currentChar === null || !canApply) return;
    // Normalize ONCE — used for both the assignment's `target` (the identity
    // key partitionSequenceAssignment and Mechanism Gallery lookups key off)
    // and the sequence's own `collapsedChar` slot value, so the two can never
    // diverge (a P1 in an earlier review: only collapsedChar was normalized,
    // leaving `target` un-normalized).
    const char = currentChar.normalize("NFC");
    const contentValue = resolveCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
    const indicatorValue = resolveCharInput(indicator, seqIndicatorResolveOptions);
    if (!contentValue.ok || !indicatorValue.ok) return;
    // Re-check vkey resolvability here too (not just via canApply) — never
    // silently record an Indicator that can't be wired to a physical key.
    if (charToVkey(indicatorValue.value) === null) return;

    const { mechs: existingMechs, rest } = partitionSequenceAssignment(
      sessionAssignments,
      char,
    );

    // Dedup by (firstLetterOut, secondLetter) — an identical sequence is a
    // no-op rather than a duplicate ref.
    const alreadyRecorded = existingMechs.some(
      (m) =>
        m.slotValues?.["firstLetterOut"] === contentValue.value &&
        m.slotValues?.["secondLetter"] === indicatorValue.value,
    );

    if (!alreadyRecorded) {
      const newRef: MechanismRef = {
        patternId: PATTERN_SEQUENCE,
        strategyId: "S-03",
        slotValues: {
          firstLetterOut: contentValue.value,
          secondLetter: indicatorValue.value,
          collapsedChar: char,
        },
      };

      const assignment: MechanismAssignment = {
        scope: "individual",
        target: char,
        modality: "physical",
        mechanisms: [...existingMechs, newRef],
        source: "user",
      };

      recordAssignments([...rest, assignment]);
    }

    // Clear the boxes either way — Apply always leaves them ready for the
    // next sequence, whether or not this one was a new addition.
    setContent("");
    setIndicator("");
  }, [currentChar, canApply, content, indicator, sessionAssignments, recordAssignments, seqIndicatorResolveOptions]);

  // ---------------------------------------------------------------------------
  // Remove a single recorded sequence (by its index within
  // existingSequenceMechanisms) — drops just that ref from currentChar's
  // assignment. Removing the LAST recorded sequence removes the assignment
  // entirely (the char goes back to having no recorded sequence, matching
  // canGoNext's gate and unflagCharForSequence's own strip-the-assignment
  // semantics).
  // ---------------------------------------------------------------------------

  const handleRemoveSequence = useCallback(
    (idx: number) => {
      if (currentChar === null) return;
      const nextMechs = existingSequenceMechanisms.filter((_, i) => i !== idx);

      const { rest } = partitionSequenceAssignment(sessionAssignments, currentChar);

      if (nextMechs.length === 0) {
        recordAssignments(rest);
        return;
      }

      const assignment: MechanismAssignment = {
        scope: "individual",
        target: currentChar,
        modality: "physical",
        mechanisms: nextMechs,
        source: "user",
      };
      recordAssignments([...rest, assignment]);
    },
    [currentChar, existingSequenceMechanisms, sessionAssignments, recordAssignments],
  );

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
        <Trans id="editor.sequences.heading">Sequence Gallery</Trans>
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
        {t({ id: "editor.assignLoop.modality.desktop", message: "Desktop" })}
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
            <Trans id="editor.sequences.noFlaggedChars">
              No characters flagged for sequences. Flag characters in the
              Mechanism Gallery to define their sequences here.
            </Trans>
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
              <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
            </button>
          ) : (
            <span />
          )}
          {onComplete !== undefined && (
            <button
              type="button"
              data-testid="sequences-continue"
              onClick={onComplete}
              aria-label={t({ id: "editor.sequences.continueAriaLabel", message: "Continue (sequence gallery)" })}
              style={forwardBtnStyle}
            >
              <Trans id="editor.sequences.continueButton">Continue &rarr;</Trans>
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
              <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
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
              <Trans id="editor.assignLoop.noBaseKeyboardSelected">
                No base keyboard selected. Go back to choose a starting point.
              </Trans>
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

  const canGoNext = currentChar !== null && existingSequenceMechanisms.length > 0;

  const forwardLabel = hasAnotherCharAfterCurrent
    ? t({ id: "editor.assignLoop.nextCharacterButton", message: "Next character →" })
    : t({ id: "editor.assignLoop.doneButton", message: "Done" });
  const forwardAriaLabel = hasAnotherCharAfterCurrent
    ? t({ id: "editor.assignLoop.nextCharacterAriaLabel", message: "Next character" })
    : t({ id: "editor.sequences.continueAriaLabel", message: "Continue (sequence gallery)" });

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
        aria-label={t({
          id: "editor.sequences.coverageAriaLabel",
          message: `${{ current: currentIdx + 1 }} of ${{ total: sequenceFlaggedChars.length }}`,
        })}
        style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}
      >
        <Trans id="editor.sequences.coverageLine">
          {currentIdx + 1} of {sequenceFlaggedChars.length}
        </Trans>
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
            <Trans id="editor.assignLoop.backButton">&larr; Back</Trans>
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
            aria-label={t({ id: "editor.assignLoop.previousCharacterAriaLabel", message: "Previous character" })}
            style={{
              ...ghostBtn,
              fontSize: 13,
              ...(currentIdx <= 0
                ? { color: TEXT_DIM, opacity: 0.5, cursor: "not-allowed" }
                : {}),
            }}
          >
            <Trans id="editor.assignLoop.previousCharacterButton">&laquo; Previous character</Trans>
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
              <Trans id="editor.sequences.defineSequenceEyebrow">Define a sequence</Trans>
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
              <Trans id="editor.sequences.contentLabel">Content</Trans>
            </label>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              <Trans id="editor.sequences.contentHint">
                The characters that come first — what you type before the indicator.
              </Trans>
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
              <Trans id="editor.sequences.indicatorLabel">Indicator</Trans>
            </label>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
              <Trans id="editor.sequences.indicatorHint">
                The single character that triggers the combination — typing it after the
                content produces {currentChar}.
              </Trans>
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
                <Trans id="editor.sequences.indicatorUnresolvableWarning">
                  '{indicatorResolved.ok ? indicatorResolved.value : ""}' isn't a key on
                  this layout — pick a character that maps to a physical key.
                </Trans>
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
              {content !== "" ? content : t({ id: "editor.sequences.contentPlaceholder", message: "[content]" })}
              {" + "}
              {indicator !== "" ? indicator : t({ id: "editor.sequences.indicatorPlaceholder", message: "[indicator]" })}
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
              aria-label={t({
                id: "editor.sequences.applyAriaLabel",
                message: `Apply sequence for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
              })}
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
              <Trans id="editor.sequences.applyButton">Apply</Trans>
            </button>
            <button
              type="button"
              data-testid="sequences-skip"
              onClick={handleNext}
              aria-label={t({
                id: "editor.assignLoop.skipCharacterAriaLabel",
                message: `Skip this character (${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }})`,
              })}
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
              <Trans id="editor.assignLoop.skipCharacterButton">Skip this character</Trans>
            </button>
            {existingSequenceMechanisms.length > 0 && (
              <span
                role="status"
                aria-live="polite"
                style={{ fontSize: 12, color: "#56d364", fontFamily: FONT }}
              >
                {t({
                  id: "editor.sequences.recordedCount",
                  message: plural(existingSequenceMechanisms.length, {
                    one: "Sequence recorded",
                    other: "# sequences recorded",
                  }),
                })}
              </span>
            )}
          </div>

          {/* Recorded sequences list — every PATTERN_SEQUENCE ref already
              applied for currentChar (a character may hold several). Apply
              always ADDS to this list (see handleApply); Remove drops just
              that one entry, and dropping the last one clears currentChar's
              assignment entirely (see handleRemoveSequence). */}
          {existingSequenceMechanisms.length > 0 && (
            <div
              style={{
                background: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                padding: "10px 14px",
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
                <Trans id="editor.sequences.recordedSequencesHeading">Recorded sequences</Trans>
              </p>
              {existingSequenceMechanisms.map((m, idx) => {
                const seqContent = m.slotValues?.["firstLetterOut"] ?? "";
                const seqIndicator = m.slotValues?.["secondLetter"] ?? "";
                return (
                  <div
                    key={`${seqContent}\0${seqIndicator}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      fontSize: 13,
                      fontFamily: FONT,
                    }}
                  >
                    <span style={{ color: TEXT_MAIN }}>
                      {seqContent}
                      {" + "}
                      {seqIndicator}
                      {" "}
                      &rarr;{" "}
                      <span style={{ fontFamily: "monospace", fontSize: 15 }}>
                        {currentChar}
                      </span>
                    </span>
                    <button
                      type="button"
                      data-testid={`sequences-remove-${idx}`}
                      onClick={() => handleRemoveSequence(idx)}
                      aria-label={t({
                        id: "editor.sequences.removeSequenceAriaLabel",
                        message: `Remove sequence ${{ content: seqContent }} + ${{ indicator: seqIndicator }} for ${{ notation: toUPlusNotation(currentChar) }} ${{ char: currentChar }}`,
                      })}
                      style={{
                        background: "transparent",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 6,
                        color: TEXT_DIM,
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: FONT,
                        padding: "3px 8px",
                      }}
                    >
                      <Trans id="editor.sequences.removeButton">Remove</Trans>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
          <Trans id="editor.assignLoop.patternLoadError">
            Pattern load error — preview transform may be incomplete.
          </Trans>
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
              heading={t({ id: "editor.assignLoop.preview.heading", message: "Live preview" })}
              warningLabel={t({ id: "editor.assignLoop.preview.applyWarnings", message: "Apply warnings:" })}
            />
          ) : patternsLoading ? (
            <p style={{ color: TEXT_DIM, fontSize: 13, fontFamily: FONT }}>
              <Trans id="editor.assignLoop.loadingPatterns">Loading patterns...</Trans>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
