// AttachmentStation — S1 of the marks series (spec 046, FR-006/007/008/009).
//
// One row per mark, asking which of the confirmed base letters may carry it:
// attested bases come PRE-CHECKED, plausible bases (mark-class heuristics)
// come proposed-but-unchecked, everything else unchecked — and unchecked MEANS
// blocked on the finished keyboard, stated in the row's help text (FR-007).
// A mark with exactly one attested base and no plausible additions renders as
// an already-confirmed summary the designer can open and edit (FR-008).
// Case pairs are derived from the alphabet's case data, never asked (FR-009).

import type { AttachmentProposal } from "@keyboard-studio/engine";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { prefixCombiningMark } from "../../lib/irToCarveNodes.ts";
import {
  ACCENT,
  BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  mutedParaFlush,
  sectionHeading,
} from "../surveyStyles.ts";

export interface AttachmentStationProps {
  proposals: AttachmentProposal[];
  /** Confirmed base letters, in inventory order. */
  bases: string[];
  /** Current designer state: checked = the base may carry the mark. */
  checked: Record<string, Record<string, boolean>>;
  onToggle: (mark: string, base: string, next: boolean) => void;
  /** Count of derived capital/lowercase pairs (FR-009) — display-only. */
  casePairCount: number;
}

function markLabel(mark: string): string {
  return `${prefixCombiningMark(mark, true)} (${toUPlusNotation(mark)})`;
}

function AttachmentRow({
  proposal,
  bases,
  checked,
  onToggle,
}: {
  proposal: AttachmentProposal;
  bases: string[];
  checked: Record<string, boolean>;
  onToggle: (base: string, next: boolean) => void;
}) {
  const checkedBases = bases.filter((b) => checked[b] === true);
  const body = (
    <>
      <p style={{ ...mutedParaFlush, margin: "6px 0" }}>
        Tick every letter this mark can sit on. Letters left unticked will not
        take this mark on your finished keyboard.
      </p>
      <div role="group" aria-label={`Letters that can carry ${markLabel(proposal.mark)}`} style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {bases.map((base) => {
          const state = proposal.states[base] ?? "blocked";
          const isChecked = checked[base] === true;
          return (
            <label
              key={base}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                border: `1px solid ${state === "plausible" && !isChecked ? ACCENT : BORDER}`,
                borderStyle: state === "plausible" && !isChecked ? "dashed" : "solid",
                borderRadius: 6,
                fontSize: 14,
                color: TEXT_MAIN,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => onToggle(base, e.target.checked)}
                aria-label={`${base} can carry ${markLabel(proposal.mark)}`}
              />
              <span>{(base + proposal.mark).normalize("NFC")}</span>
              {state === "plausible" && !isChecked && (
                <span style={{ fontSize: 10, color: ACCENT }}>suggested</span>
              )}
            </label>
          );
        })}
      </div>
    </>
  );

  if (proposal.autoConfirmed) {
    // FR-008: already-confirmed summary — no action required, still editable.
    return (
      <details data-testid={`attachment-row-${toUPlusNotation(proposal.mark)}`}>
        <summary style={{ fontSize: 14, color: TEXT_MAIN, cursor: "pointer" }}>
          {markLabel(proposal.mark)} — confirmed on{" "}
          <strong>{checkedBases.map((b) => (b + proposal.mark).normalize("NFC")).join(", ")}</strong>{" "}
          <span style={{ color: TEXT_DIM, fontSize: 12 }}>(open to edit)</span>
        </summary>
        {body}
      </details>
    );
  }

  return (
    <div data-testid={`attachment-row-${toUPlusNotation(proposal.mark)}`}>
      <p style={{ margin: "0 0 2px 0", fontSize: 14, fontWeight: 600, color: TEXT_MAIN }}>
        {markLabel(proposal.mark)}
      </p>
      {body}
    </div>
  );
}

export function AttachmentStation({
  proposals,
  bases,
  checked,
  onToggle,
  casePairCount,
}: AttachmentStationProps) {
  return (
    <section data-testid="marks-attachment" aria-label="Which letters carry each mark">
      <h3 style={sectionHeading}>Which letters take each mark?</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {proposals.map((proposal) => (
          <AttachmentRow
            key={proposal.mark}
            proposal={proposal}
            bases={bases}
            checked={checked[proposal.mark] ?? {}}
            onToggle={(base, next) => onToggle(proposal.mark, base, next)}
          />
        ))}
      </div>
      {casePairCount > 0 && (
        <p style={{ ...mutedParaFlush, marginTop: 12, fontSize: 12 }}>
          Capital letters follow automatically — {casePairCount} capital/lowercase
          pair{casePairCount === 1 ? "" : "s"} in your alphabet carry the same marks.
        </p>
      )}
    </section>
  );
}
