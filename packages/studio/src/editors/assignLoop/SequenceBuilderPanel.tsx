// SequenceBuilderPanel — S-03 multi-key sequence builder.
//
// Renders in the Mechanism Gallery's RIGHT pane, in place of the live OSK
// preview, whenever the author selects the "sequence" method for the current
// character (the trigger is the method-card click itself, not a later
// Apply — see MechanismGallery's rightContent conditional). Formerly the
// standalone Sequence Gallery (a full-screen step between Mechanisms and the
// touch fork); that step is retired — this panel is the same builder core,
// scoped to ONE character (the mechanism loop's own currentChar) instead of
// its own multi-char worklist. The old gallery's own coverage line and
// Previous/Next-across-flagged-chars toolbar are dropped as redundant: the
// Mechanism Gallery's own per-character loop already handles navigation.
//
// A flagged character may hold MULTIPLE sequences (e.g. "á" reachable via
// both "a"+"´" and "a"+"s"). Representation, unchanged from the retired
// gallery: ONE `scope:"individual"` MechanismAssignment per character, whose
// `mechanisms` array holds MULTIPLE `multi_char_sequence` MechanismRefs — one
// per distinct (content, indicator) pair, each with its own
// `{ firstLetterOut, secondLetter, collapsedChar }` slotValues. This is
// permitted by the contract (`MechanismAssignment.mechanisms` is documented
// many-to-many — see packages/contracts/src/assignmentMap.ts) and requires no
// engine changes: `applyAssignments` already flattens every assignment's
// mechanisms and deduplicates by (patternId, serialized slotValues).
//
// Content is the character(s) already typed that the sequence builds on
// (`firstLetterOut`); Indicator is the single key typed right after the
// content that triggers the collapse (`secondLetter`) — it must resolve to a
// PHYSICAL key on the base layout (checked via charToVkey, the same lookup
// MechanismGallery's trigger/swap/ralt key pickers use), since the emitted
// rule is a `using keys` group whose rightmost item is the Indicator; the
// character being defined is the collapse target (`collapsedChar`).
//
// Apply/Cancel both return control to the preview (per the user-approved
// trigger rule): a successful Apply calls `onApplied` after recording the new
// sequence via `recordAssignments`; Cancel calls `onCancel` and records
// nothing. Either way the caller (MechanismGallery) is expected to switch its
// `method` state away from "sequence", which swaps this panel back out for
// the live preview — mirroring exactly how every other method's Apply already
// resets method state via resetMethodState.
//
// Deferred (explicitly out of scope for this pass — carried over unchanged
// from the retired gallery): rule-order/shadowing enforcement, indicator<->
// deadkey-trigger collision detection, multi-codepoint-output smart-backspace
// companion rule, RTL box mirroring, double-diacritic chaining, prefix
// (deadkey-first) direction. Not an oversight of the multi-sequence model
// above: two sequences for the SAME output char whose Content differs in
// length but shares an Indicator (e.g. "a"+"´"->"á" vs "ba"+"´"->"bá") can
// shadow order-dependently at emit time — backstopped by the WASM oracle
// (Layer A Check #11), not enforced here.

import { useEffect, useMemo, useState, useCallback, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { MechanismAssignment, MechanismRef } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { displayChar } from "../../lib/irToCarveNodes.ts";
import {
  resolveCharInput, reflectCharInput, type ResolveCharInputOptions,
} from "../../lib/charInput.ts";
import { charToVkey } from "../../lib/keyOptions.ts";
import { PATTERN_SEQUENCE, isSequenceAssignmentForChar } from "./patternIds.ts";
import {
  BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
  galleryGhostBtn as ghostBtn,
  galleryInputStyle as inputStyle,
} from "../../lib/galleryTheme.ts";

// ---------------------------------------------------------------------------
// partitionSequenceAssignment — splits `sessionAssignments` into this char's
// recorded PATTERN_SEQUENCE mechanisms and everything else. The underlying
// "does this assignment belong to `char`'s PATTERN_SEQUENCE bucket?"
// predicate (scope:"individual" + target === char + at least one
// PATTERN_SEQUENCE mechanism) is NOT reimplemented here — it is hoisted to
// `isSequenceAssignmentForChar` in ./patternIds.ts, the single source of
// truth every read site (this panel's existing-sequences memo,
// MechanismGallery's canGoNext / "Sequence recorded" badge) and every write
// site (workingCopyStore's unflagCharForSequence, MechanismGallery's
// handleRemoveCovered) derives from, so a future predicate tweak can't miss
// a call site. This function just wraps that predicate into the two-way
// split callers here need: `mechs` (this char's PATTERN_SEQUENCE refs,
// already flattened out of whichever assignment held them) and `rest`
// (every other assignment, untouched) — write sites splice their own
// rebuilt assignment back into `rest`; a read site only needs `mechs`.
// ---------------------------------------------------------------------------

export function partitionSequenceAssignment(
  sessionAssignments: MechanismAssignment[],
  char: string,
): { mechs: MechanismRef[]; rest: MechanismAssignment[] } {
  const existing = sessionAssignments.find((a) => isSequenceAssignmentForChar(a, char));
  const mechs =
    existing?.mechanisms.filter((m) => m.patternId === PATTERN_SEQUENCE) ?? [];
  const rest = sessionAssignments.filter((a) => !isSequenceAssignmentForChar(a, char));

  return { mechs, rest };
}

/** True when `char` already has at least one recorded PATTERN_SEQUENCE mechanism. */
export function hasSequenceForChar(
  sessionAssignments: MechanismAssignment[],
  char: string,
): boolean {
  return partitionSequenceAssignment(sessionAssignments, char).mechs.length > 0;
}

// ---------------------------------------------------------------------------
// Char-box resolve options — reuses the shared resolveCharInput/
// reflectCharInput helper (packages/studio/src/lib/charInput.ts).
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

const cardStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export interface SequenceBuilderPanelProps {
  /** The single character the mechanism loop is currently on. */
  char: string;
  /** Phase C physical MechanismAssignments (same source MechanismGallery reads). */
  sessionAssignments: MechanismAssignment[];
  /** Commits a new assignments array — the same store action every method uses. */
  recordAssignments: (next: MechanismAssignment[]) => void;
  /** Called after a sequence is successfully recorded via Apply. */
  onApplied: () => void;
  /** Called when the author cancels without recording anything. */
  onCancel: () => void;
}

/**
 * SequenceBuilderPanel — the S-03 sequence builder, scoped to one character.
 * Occupies the Mechanism Gallery's right pane while method === "sequence".
 */
export function SequenceBuilderPanel({
  char,
  sessionAssignments,
  recordAssignments,
  onApplied,
  onCancel,
}: SequenceBuilderPanelProps) {
  const { t } = useLingui();
  const seqIndicatorResolveOptions = useMemo(() => buildSeqIndicatorResolveOptions(t), [t]);

  // Existing sequences already recorded for `char` — rendered as a removable
  // list below the boxes. Derived via partitionSequenceAssignment so this
  // memo can never disagree with the write sites about which assignment
  // belongs to `char`.
  const existingSequenceMechanisms = useMemo(
    () => partitionSequenceAssignment(sessionAssignments, char).mechs,
    [sessionAssignments, char],
  );

  // ---------------------------------------------------------------------------
  // Box state — Content ("seqFirst") / Indicator ("seqSecond"). Reset on
  // every char change (the mechanism loop advancing to a new character).
  // ---------------------------------------------------------------------------

  const [content, setContent] = useState("");
  const [indicator, setIndicator] = useState("");
  useEffect(() => {
    setContent("");
    setIndicator("");
  }, [char]);

  const contentResolved = resolveCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
  const indicatorResolved = resolveCharInput(indicator, seqIndicatorResolveOptions);
  const contentReflection = reflectCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
  const indicatorReflection = reflectCharInput(indicator, seqIndicatorResolveOptions);

  // Indicator vkey-resolvability — the emitted rule is a `using keys` group
  // whose rightmost item is the Indicator; kmcmplib requires that item
  // resolve to a PHYSICAL key on the base layout. Uses the SAME charToVkey
  // lookup MechanismGallery's trigger/swap/ralt key pickers resolve through,
  // deliberately reused rather than re-implemented.
  const indicatorVkey = indicatorResolved.ok ? charToVkey(indicatorResolved.value) : null;
  const indicatorUnresolvable = indicatorResolved.ok && indicatorVkey === null;

  const canApply = useMemo(
    () => contentResolved.ok && indicatorResolved.ok && indicatorVkey !== null,
    [contentResolved.ok, indicatorResolved.ok, indicatorVkey],
  );

  // ---------------------------------------------------------------------------
  // Apply — ADDS a new sequence to `char`'s multi_char_sequence
  // MechanismAssignment (creating the assignment on the first Apply). If an
  // identical (content, indicator) pair is already recorded, this is a no-op
  // (no duplicate ref is created). On success, hands control back to
  // MechanismGallery via onApplied, which switches method away from
  // "sequence" — the right pane reverts to the live preview, mirroring every
  // other method's Apply.
  // ---------------------------------------------------------------------------

  const handleApply = useCallback(() => {
    if (!canApply) return;
    const contentValue = resolveCharInput(content, SEQ_CONTENT_RESOLVE_OPTIONS);
    const indicatorValue = resolveCharInput(indicator, seqIndicatorResolveOptions);
    if (!contentValue.ok || !indicatorValue.ok) return;
    if (charToVkey(indicatorValue.value) === null) return;

    const { mechs: existingMechs, rest } = partitionSequenceAssignment(sessionAssignments, char);

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

    onApplied();
  }, [canApply, content, indicator, char, sessionAssignments, recordAssignments, onApplied, seqIndicatorResolveOptions]);

  // ---------------------------------------------------------------------------
  // Remove a single recorded sequence (by its index within
  // existingSequenceMechanisms) — drops just that ref from `char`'s
  // assignment. Removing the LAST recorded sequence removes the assignment
  // entirely. Stays open (does not call onApplied/onCancel) so the author can
  // keep reviewing/removing other entries.
  // ---------------------------------------------------------------------------

  const handleRemoveSequence = useCallback(
    (idx: number) => {
      const nextMechs = existingSequenceMechanisms.filter((_, i) => i !== idx);
      const { rest } = partitionSequenceAssignment(sessionAssignments, char);

      if (nextMechs.length === 0) {
        recordAssignments(rest);
        return;
      }

      const assignment: MechanismAssignment = {
        scope: "individual",
        target: char,
        modality: "physical",
        mechanisms: nextMechs,
        source: "user",
      };
      recordAssignments([...rest, assignment]);
    },
    [char, existingSequenceMechanisms, sessionAssignments, recordAssignments],
  );

  const currentCharDisplay = displayChar(char);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: ACCENT, fontFamily: FONT }}>
          <Trans id="editor.assignLoop.sequenceBuilder.heading">Build a sequence</Trans>
        </h2>
        <button
          type="button"
          data-testid="sequence-builder-cancel"
          onClick={onCancel}
          aria-label={t({
            id: "editor.assignLoop.sequenceBuilder.cancelAriaLabel",
            message: `Cancel sequence builder for ${{ notation: toUPlusNotation(char) }} ${{ char }}`,
          })}
          style={{ ...ghostBtn, fontSize: 12, padding: "5px 12px" }}
        >
          <Trans id="editor.assignLoop.sequenceBuilder.cancelButton">Cancel</Trans>
        </button>
      </div>

      <div style={cardStyle}>
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
            aria-label={`${toUPlusNotation(char)} ${char}`}
          >
            {currentCharDisplay}
          </span>
          <span style={{ fontSize: 13, color: TEXT_DIM }}>{toUPlusNotation(char)}</span>
        </div>
      </div>

      <div style={cardStyle}>
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

      <div style={cardStyle}>
        <label
          htmlFor="sequences-indicator-input"
          style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, fontFamily: FONT }}
        >
          <Trans id="editor.sequences.indicatorLabel">Indicator</Trans>
        </label>
        <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, fontFamily: FONT }}>
          <Trans id="editor.sequences.indicatorHint">
            The single character that triggers the combination — typing it after the
            content produces {currentCharDisplay}.
          </Trans>
        </p>
        <input
          id="sequences-indicator-input"
          type="text"
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
          data-testid="sequences-indicator"
          // maxLength 2 (not 1): one grapheme may be two UTF-16 code units
          // (surrogate pair / base+combining mark).
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
          {content !== "" ? displayChar(content) : t({ id: "editor.sequences.contentPlaceholder", message: "[content]" })}
          {" + "}
          {indicator !== "" ? displayChar(indicator) : t({ id: "editor.sequences.indicatorPlaceholder", message: "[indicator]" })}
          {" "}
          &rarr;{" "}
          <span style={{ color: TEXT_MAIN, fontFamily: "monospace", fontSize: 16 }}>
            {currentCharDisplay}
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
            message: `Apply sequence for ${{ notation: toUPlusNotation(char) }} ${{ char }}`,
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
        {existingSequenceMechanisms.length > 0 && (
          <span role="status" aria-live="polite" style={{ fontSize: 12, color: "#56d364", fontFamily: FONT }}>
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

      {existingSequenceMechanisms.length > 0 && (
        <div style={cardStyle}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: TEXT_DIM,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
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
                  {displayChar(seqContent)}
                  {" + "}
                  {displayChar(seqIndicator)}
                  {" "}
                  &rarr;{" "}
                  <span style={{ fontFamily: "monospace", fontSize: 15 }}>{currentCharDisplay}</span>
                </span>
                <button
                  type="button"
                  data-testid={`sequences-remove-${idx}`}
                  onClick={() => handleRemoveSequence(idx)}
                  aria-label={t({
                    id: "editor.sequences.removeSequenceAriaLabel",
                    message: `Remove sequence ${{ content: seqContent }} + ${{ indicator: seqIndicator }} for ${{ notation: toUPlusNotation(char) }} ${{ char }}`,
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
    </div>
  );
}
