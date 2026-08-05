// MarkDemoWidget — the operable option demonstration (spec 052 US2).
//
// Prose has already failed once at explaining these options, so each option
// carries a two-or-three-key demonstration the author can press before
// selecting anything (FR-010). The keys are the author's OWN confirmed letters
// and marks, and what lands in the output box is exactly the text that option
// would produce on the finished keyboard.
//
// The load-bearing case is the mark-before-character option. On a real keyboard
// the first press produces nothing visible, so a demonstration that only showed
// the output box would appear to have done nothing — the author would conclude
// the option is broken. FR-011 therefore requires the intermediate state to be
// shown on screen AND announced to assistive technology, which is what
// `demo-pending` (role="status", aria-live="polite") does. SC-006 asserts there
// is no press after which the demonstration appears inert.
//
// Three prohibitions, all from FR-012/FR-013:
//   - no timer and no autoplay — the demo advances only on author action;
//   - no working-copy write — the widget holds its own React state and is given
//     no store handle;
//   - no diagnostic — this is a local text transform, not a validation surface,
//     so it introduces no second debounce cycle (constitution Article IV / D3).

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MarkInputOrder } from "@keyboard-studio/contracts";
import type { MarkTreatment } from "@keyboard-studio/engine";
import { prefixCombiningMark } from "../../lib/irToCarveNodes.ts";
import { BORDER, TEXT_DIM, TEXT_MAIN, mutedParaFlush } from "../surveyStyles.ts";

export interface MarkDemoWidgetProps {
  /** `data-testid` of the demo container — `demo-<classId>-<optionValue>`. */
  testId: string;
  /** Which option this demonstrates. */
  option: MarkTreatment;
  /** The recorded input order — only meaningful for the `own-key` option. */
  inputOrder: MarkInputOrder;
  /** A base letter from the author's own confirmed alphabet. */
  letter: string;
  /** A mark from the class being demonstrated. */
  mark: string;
}

/** One demo key: what it looks like on the cap, and what pressing it does. */
interface DemoKey {
  cap: string;
  /** `"mark"` presses are the ones that can leave a pending state. */
  kind: "letter" | "mark" | "composed";
  /** The character this key contributes. */
  emits: string;
}

/**
 * The keys for one option — two or three, drawn from the author's own letters
 * and marks (FR-010).
 *
 * - `own-key` + `prefix`: the mark key first, then the letter. The first press
 *   leaves the pending state.
 * - `own-key` + `postfix`: the letter first, then the mark key. The first press
 *   shows the bare letter — the side-by-side contrast with pending (US2 AC3).
 * - `composed`: a plain letter key beside a marked-character key, each one press
 *   producing one whole character. Nothing is ever pending, which is the point.
 */
function keysFor(option: MarkTreatment, inputOrder: MarkInputOrder, letter: string, mark: string): DemoKey[] {
  const composed = (letter + mark).normalize("NFC");
  if (option === "composed") {
    return [
      { cap: letter, kind: "letter", emits: letter },
      { cap: composed, kind: "composed", emits: composed },
    ];
  }
  const markKey: DemoKey = { cap: prefixCombiningMark(mark, true), kind: "mark", emits: mark };
  const letterKey: DemoKey = { cap: letter, kind: "letter", emits: letter };
  return inputOrder === "prefix" ? [markKey, letterKey] : [letterKey, markKey];
}

const keyCapStyle: React.CSSProperties = {
  minWidth: 34,
  padding: "6px 8px",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: "transparent",
  color: TEXT_MAIN,
  fontSize: 16,
  cursor: "pointer",
};

export function MarkDemoWidget({
  testId,
  option,
  inputOrder,
  letter,
  mark,
}: MarkDemoWidgetProps) {
  const { t } = useLingui();
  const keys = keysFor(option, inputOrder, letter, mark);

  // `output` is what has landed in the text so far; `pendingMark` is a mark
  // press that has not yet found a character to attach to. Local state only —
  // nothing here reaches the working copy (FR-012).
  const [output, setOutput] = useState("");
  const [pendingMark, setPendingMark] = useState<string | null>(null);

  function press(key: DemoKey): void {
    if (key.kind === "mark") {
      if (option === "own-key" && inputOrder === "prefix") {
        // The mark waits for a character. Nothing appears in the text yet —
        // which is exactly why the pending state must be visible (FR-011).
        setPendingMark(key.emits);
        return;
      }
      // Postfix: the mark attaches to the character already typed.
      setOutput((prev) => (prev + key.emits).normalize("NFC"));
      return;
    }
    if (pendingMark !== null) {
      setOutput((prev) => (prev + key.emits + pendingMark).normalize("NFC"));
      setPendingMark(null);
      return;
    }
    setOutput((prev) => (prev + key.emits).normalize("NFC"));
  }

  function reset(): void {
    setOutput("");
    setPendingMark(null);
  }

  return (
    <div
      data-testid={testId}
      style={{
        marginTop: 6,
        marginLeft: 26,
        padding: "8px 10px",
        border: `1px dashed ${BORDER}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <p style={{ ...mutedParaFlush, margin: 0, fontSize: 11 }}>
        <Trans id="survey.marks.demo.intro">Press these to see what you would get.</Trans>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {keys.map((key, i) => (
          <button
            key={`${key.kind}-${i}`}
            type="button"
            data-testid={`demo-key-${i + 1}`}
            onClick={() => press(key)}
            style={keyCapStyle}
            aria-label={t({
              id: "survey.marks.demo.keyAriaLabel",
              message: `Press the ${{ cap: key.cap }} key`,
            })}
          >
            {key.cap}
          </button>
        ))}
        <span style={{ color: TEXT_DIM, fontSize: 12 }}>→</span>
        <output
          data-testid="demo-output"
          style={{
            minWidth: 48,
            minHeight: 24,
            padding: "2px 6px",
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            fontSize: 18,
            color: TEXT_MAIN,
          }}
        >
          {output}
        </output>
        <button
          type="button"
          data-testid="demo-reset"
          onClick={reset}
          style={{ ...keyCapStyle, fontSize: 11, minWidth: 0 }}
        >
          <Trans id="survey.marks.demo.resetButton">Start over</Trans>
        </button>
      </div>
      {pendingMark !== null && (
        <p
          data-testid="demo-pending"
          role="status"
          aria-live="polite"
          style={{ margin: 0, fontSize: 12, color: TEXT_MAIN }}
        >
          {prefixCombiningMark(pendingMark, true)}{" "}
          <Trans id="survey.marks.demo.pendingNote">
            is waiting for the next character to attach to — nothing shows in the text yet.
          </Trans>
        </p>
      )}
    </div>
  );
}
