// TouchKeyIdentityList — spec 104 T015/T016: the per-key repair list at the
// touch step (the owning step for touch key findings, FR-015 / #2145), plus
// the answered identity-decision rows for the same step, and the Output
// step's unapplied-repairs listing (UnappliedRepairList below).
//
// Row pattern generalised from DocumentationFixProposals: a row appears
// while its finding is live, the criteria default is preselected, the
// author's answer is recorded on the decision spine BEFORE the fix is
// applied (data-model.md §4), and the row STAYS visible-and-answered after
// answering. Declining applies nothing — identity and rules stay
// byte-identical (SC-004) — and the recorded decline suppresses
// re-presentation until the underlying state changes (FR-017): the row set
// is re-derived from the working IR + layout on every render, never stored.
//
// Copy: every string is a Lingui descriptor in the en/fr catalogue
// (FR-026); the contracts §6 consequence lines are used verbatim.

import { useEffect, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type {
  KeyboardIR,
  RepairAction,
  TouchLayoutIR,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type {
  PendingKeyEditOperation,
  TouchKeyIdentityRecords,
} from "../stores/workingCopyStore.ts";
import {
  appendRepairProposal,
  deriveRepairRows,
  liveRecords,
  mintRecordId,
  mintRuleForRepair,
  recordsOrEmpty,
  repairApplyOps,
  repairOutcomeFor,
  type DeadKeyRepairRow,
} from "../lib/touchKeyIdentity.ts";

const rowStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 4,
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const buttonRowStyle: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };

export interface TouchKeyIdentityListProps {
  /** The working IR (rules side of the derivation). */
  ir: KeyboardIR | null;
  /** The effective touch layout (with overlay edits applied). */
  layout: TouchLayoutIR | null;
  /** Commit key-edit ops through the host's single-writer chain. */
  onCommitOps: (ops: readonly PendingKeyEditOperation[]) => void;
  /** Install an IR produced by a mint-and-rule repair. */
  onInstallIr: (nextIr: KeyboardIR) => void;
}

export function TouchKeyIdentityList(
  props: TouchKeyIdentityListProps,
): React.ReactElement | null {
  const { t } = useLingui();
  const records = useWorkingCopyStore((s) => s.touchKeyIdentity);
  const setRecords = useWorkingCopyStore((s) => s.setTouchKeyIdentity);
  const [selected, setSelected] = useState<ReadonlyMap<string, RepairAction>>(new Map());
  const [reopened, setReopened] = useState<ReadonlySet<string>>(new Set());
  const [mintBlocked, setMintBlocked] = useState<ReadonlySet<string>>(new Set());

  const { ir, layout } = props;
  const rows = useMemo(
    () => (ir !== null && layout !== null ? deriveRepairRows({ ir, layout, records }) : []),
    [ir, layout, records],
  );
  const decisions = useMemo(
    () => liveRecords(recordsOrEmpty(records).identityDecisions),
    [records],
  );

  if (ir === null || layout === null) return null;
  if (rows.length === 0 && decisions.length === 0) return null;

  const now = () => Date.now();

  const recordProposal = (
    row: DeadKeyRepairRow,
    outcome: "applied" | "changed" | "declined",
  ): TouchKeyIdentityRecords => {
    const next = appendRepairProposal(records, {
      recordId: mintRecordId(records, "repair", row.keyRef),
      keyRef: row.keyRef,
      defaultAction: row.defaultAction,
      options: [...row.options],
      outcome,
      recordedAt: now(),
    });
    setRecords(next);
    return next;
  };

  const applyRepair = (row: DeadKeyRepairRow, action: RepairAction): void => {
    if (action === "mint-and-rule") {
      const acknowledged = mintBlocked.has(row.keyRef);
      const outcome = mintRuleForRepair({ ir, row, opaqueAcknowledged: acknowledged });
      if (!outcome.ok) {
        // The opaque-fragment gate: nothing recorded, nothing applied —
        // the row stays pending with the acknowledge affordance showing.
        setMintBlocked((prev) => new Set(prev).add(row.keyRef));
        return;
      }
      recordProposal(row, action === row.defaultAction ? "applied" : "changed");
      props.onInstallIr(outcome.ir);
      return;
    }
    recordProposal(row, action === row.defaultAction ? "applied" : "changed");
    props.onCommitOps(repairApplyOps(row, action));
  };

  const declineRepair = (row: DeadKeyRepairRow): void => {
    recordProposal(row, "declined");
  };

  return (
    <section
      data-testid="touch-key-identity-list"
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
      aria-label={t({ id: "touch.keyIdentity.repairs.regionLabel", message: "Touch key identity" })}
    >
      {rows.length > 0 && (
        <strong style={{ fontSize: 13 }}>
          <Trans id="touch.keyIdentity.repairs.heading">Touch keys that type nothing</Trans>
        </strong>
      )}
      {rows.map((row) => {
        const outcome = repairOutcomeFor(records, row.keyRef);
        const answered = outcome !== undefined && outcome.outcome !== "unvisited";
        const showPrompt = !answered || reopened.has(row.keyRef);
        const chosen = selected.get(row.keyRef) ?? row.defaultAction;
        return (
          <div key={row.keyRef} style={rowStyle} data-testid="touch-key-repair-row">
            <strong>
              <Trans id="touch.keyIdentity.repair.title">This touch key types nothing</Trans>
            </strong>
            <span>
              <Trans id="touch.keyIdentity.repair.detail">
                Key {row.keyId} on the {row.layerId} layer. A touch key with its own name needs a
                rule or a Unicode name to type anything.
              </Trans>
            </span>
            {showPrompt ? (
              <>
                <div role="radiogroup" aria-label={row.keyId} style={buttonRowStyle}>
                  {row.options.map((option) => (
                    <label key={option}>
                      <input
                        type="radio"
                        name={`touch-repair-${row.keyRef}`}
                        checked={chosen === option}
                        onChange={() =>
                          setSelected((prev) => new Map(prev).set(row.keyRef, option))
                        }
                      />{" "}
                      {option === "convert-to-u" && (
                        <Trans id="touch.keyIdentity.repair.optionConvert">
                          Give it the Unicode name {row.convertToId ?? ""} — it will type{" "}
                          {row.evidenceChar ?? ""} on its own
                        </Trans>
                      )}
                      {option === "mint-and-rule" && (
                        <Trans id="touch.keyIdentity.repair.optionMint">
                          Add a rule so it types {row.evidenceChar ?? ""}
                        </Trans>
                      )}
                      {option === "blank" && (
                        <Trans id="touch.keyIdentity.repair.optionBlank">
                          Make it a blank spacer key
                        </Trans>
                      )}
                      {option === row.defaultAction && (
                        <>
                          {" "}
                          <Trans id="touch.keyIdentity.repair.recommended">(recommended)</Trans>
                        </>
                      )}
                    </label>
                  ))}
                </div>
                {mintBlocked.has(row.keyRef) && chosen === "mint-and-rule" && (
                  <span role="alert">
                    <Trans id="touch.keyIdentity.repair.opaqueBlocked">
                      Some of this keyboard's rules are in a form the studio can't safely edit
                      yet. You can still add the rule — check the keyboard carefully afterwards.
                    </Trans>
                  </span>
                )}
                <div style={buttonRowStyle}>
                  <button type="button" onClick={() => applyRepair(row, chosen)}>
                    {mintBlocked.has(row.keyRef) && chosen === "mint-and-rule" ? (
                      <Trans id="touch.keyIdentity.repair.applyAnyway">Add the rule anyway</Trans>
                    ) : (
                      <Trans id="touch.keyIdentity.repair.apply">Apply fix</Trans>
                    )}
                  </button>
                  <button type="button" onClick={() => declineRepair(row)}>
                    <Trans id="touch.keyIdentity.repair.decline">Leave as-is</Trans>
                  </button>
                </div>
              </>
            ) : (
              <div style={buttonRowStyle}>
                <span>
                  {outcome?.outcome === "applied" && (
                    <Trans id="touch.keyIdentity.repair.answeredApplied">
                      Fixed with the recommended repair.
                    </Trans>
                  )}
                  {outcome?.outcome === "changed" && (
                    <Trans id="touch.keyIdentity.repair.answeredChanged">
                      Fixed — you picked a different repair than the recommended one.
                    </Trans>
                  )}
                  {outcome?.outcome === "declined" && (
                    <Trans id="touch.keyIdentity.repair.answeredDeclined">
                      Left as-is — this key still types nothing.
                    </Trans>
                  )}
                </span>
                {outcome?.outcome === "declined" && (
                  <button
                    type="button"
                    onClick={() => setReopened((prev) => new Set(prev).add(row.keyRef))}
                  >
                    <Trans id="touch.keyIdentity.repair.changeAnswer">Change answer</Trans>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {decisions.map((decision) => (
        <div key={decision.recordId} style={rowStyle} data-testid="touch-key-decision-row">
          <span>
            {decision.action === "severed" && (
              <Trans id="touch.keyIdentity.decision.severed">
                {decision.keyRef} now stands on its own — its rules were copied over from the
                typing keyboard.
              </Trans>
            )}
            {decision.action === "kept-by-choice" && (
              <Trans id="touch.keyIdentity.decision.kept">
                Kept the link for {decision.keyRef} — the typing keyboard's rules for this key
                will keep applying to this touch key, including any changes made to them later.
              </Trans>
            )}
            {decision.action === "flagged-manual" && (
              <Trans id="touch.keyIdentity.decision.flagged">
                Flagged for manual definition — {decision.keyRef} needs its own rules written by
                hand; its rules couldn't be copied over automatically.
              </Trans>
            )}
            {decision.action === "relinked" && (
              <Trans id="touch.keyIdentity.decision.relinked">
                {decision.keyRef} follows the typing keyboard again — the copied rules were
                removed.
              </Trans>
            )}
            {(decision.action === "minted" ||
              decision.action === "kept" ||
              decision.action === "repaired" ||
              decision.action === "converted") && (
              <Trans id="touch.keyIdentity.decision.other">
                Key identity decision recorded for {decision.keyRef}.
              </Trans>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Output step — unapplied repairs (FR-015 ruling)
// ---------------------------------------------------------------------------

export interface UnappliedRepairListProps {
  /** The projected output VFS (the stage's), or null before it is ready. */
  vfs: VirtualFS | null;
  /** The keyboard id the VFS compiles under. */
  keyboardId: string | null;
}

/**
 * FR-015's unvisited path: a Copy whose repair list was never visited
 * downloads with the repairs UNAPPLIED; the unapplied repairs are recorded
 * on the project (a RepairProposal with outcome "unvisited" per key) and
 * listed here at the Output step. Preselection is not consent — reaching
 * this step never applies a repair.
 */
export function UnappliedRepairList(props: UnappliedRepairListProps): React.ReactElement | null {
  const records = useWorkingCopyStore((s) => s.touchKeyIdentity);
  const setRecords = useWorkingCopyStore((s) => s.setTouchKeyIdentity);

  const rows = useMemo(() => {
    if (props.vfs === null || props.keyboardId === null) return [];
    const kmnEntry = props.vfs
      .entries("source/")
      .find((e) => e.path.endsWith(".kmn"));
    const layoutEntry = props.vfs
      .entries("source/")
      .find((e) => e.path.endsWith(".keyman-touch-layout"));
    if (kmnEntry === undefined || layoutEntry === undefined) return [];
    const kmnText =
      typeof kmnEntry.content === "string"
        ? kmnEntry.content
        : new TextDecoder().decode(kmnEntry.content);
    const layoutText =
      typeof layoutEntry.content === "string"
        ? layoutEntry.content
        : new TextDecoder().decode(layoutEntry.content);
    try {
      const ir = parseKmn(kmnText, props.keyboardId).ir;
      const layout = parseTouchLayoutString(layoutText);
      return deriveRepairRows({ ir, layout, records });
    } catch {
      return [];
    }
  }, [props.vfs, props.keyboardId, records]);

  const unapplied = rows.filter((row) => {
    const outcome = repairOutcomeFor(records, row.keyRef);
    return outcome === undefined || outcome.outcome === "unvisited";
  });

  // Record the unvisited outcome for every unapplied row not yet recorded.
  const unrecordedRefs = unapplied
    .filter((row) => repairOutcomeFor(records, row.keyRef) === undefined)
    .map((row) => row.keyRef)
    .join("|");
  useEffect(() => {
    if (unrecordedRefs === "") return;
    let next: TouchKeyIdentityRecords | null = records;
    for (const row of unapplied) {
      if (repairOutcomeFor(next, row.keyRef) !== undefined) continue;
      next = appendRepairProposal(next, {
        recordId: mintRecordId(next, "repair", row.keyRef),
        keyRef: row.keyRef,
        defaultAction: row.defaultAction,
        options: [...row.options],
        outcome: "unvisited",
        recordedAt: Date.now(),
      });
    }
    if (next !== records) setRecords(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unrecordedRefs]);

  if (props.vfs === null || unapplied.length === 0) return null;

  return (
    <section data-testid="touch-key-unapplied-repairs" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <strong style={{ fontSize: 13 }}>
        <Trans id="touch.keyIdentity.output.heading">
          Touch keys that still type nothing in this download
        </Trans>
      </strong>
      <span>
        <Trans id="touch.keyIdentity.output.detail">
          These keys were never repaired, so the download keeps them as they are. You can fix them
          at the touch step.
        </Trans>
      </span>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {unapplied.map((row) => (
          <li key={row.keyRef}>
            <Trans id="touch.keyIdentity.output.row">
              Key {row.keyId} on the {row.layerId} layer
            </Trans>
          </li>
        ))}
      </ul>
    </section>
  );
}
