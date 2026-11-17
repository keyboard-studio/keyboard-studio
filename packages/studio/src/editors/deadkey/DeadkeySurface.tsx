// DeadkeySurface — the spec-083 Deadkeys step surface.
//
// Tab/mode state: inventory | define | edit. Reads the working IR from the
// working-copy store and commits every lifecycle mutation through
// setWorkingIR (overlay-preserving) via the deadkeyWrite mutate seam —
// never ad hoc KMN text (§5a: IR pipeline only).
//
// NOTE (architecture, honest): the working IR is not itself emitted into
// the preview/download artifacts — projectWorkingCopyVfs projects from
// startIr + overlays/assignments. Lifecycle edits land in the working copy
// (the current mutation API's contract); making them reach the compiled
// artifact is Phase 4's projection seam. This surface does not pretend
// otherwise.

import { useCallback, useState, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { KeyboardIR, DeadkeyInfo } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isLiveOpen } from "../../lib/openMode.ts";
import { applyPatchToWorkingCopy } from "../../lib/applyPatchToWorkingCopy.ts";
import { DEADKEY_WRITES } from "../../steps/editorMutate.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { TEXT_MAIN, TEXT_DIM, FONT } from "../../lib/galleryTheme.ts";
import { FullStepPage } from "../../components/FullStepPage.tsx";
import { phaseHeading, leadParagraph } from "../../survey/surveyStyles.ts";
import type { DeadkeyOperation } from "../../lib/deadkeyOps.ts";
import { DeadkeyInventory } from "./DeadkeyInventory.tsx";
import { DeadkeyDefineForm } from "./DeadkeyDefineForm.tsx";
import { DeadkeyDetailEditor } from "./DeadkeyDetailEditor.tsx";

const tabsStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  marginBottom: 16,
  borderBottom: "1px solid var(--app-border)",
};

const tabBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 13.5,
  color: TEXT_DIM,
  fontFamily: FONT,
};

const tabActiveStyle: CSSProperties = {
  ...tabBtnStyle,
  color: TEXT_MAIN,
  borderBottom: "2px solid var(--app-accent)",
  fontWeight: 700,
};

const emptyStyle: CSSProperties = {
  fontSize: 13.5,
  color: TEXT_DIM,
  fontFamily: FONT,
  padding: "24px 0",
};

type Mode =
  | { tab: "inventory" }
  | { tab: "define" }
  | { tab: "edit"; id: number | null; name?: string };

export interface DeadkeySurfaceProps {
  /** Advance to the next step — lifecycle edits already saved immediately. */
  onComplete: () => void;
  onBack?: () => void;
}

export function DeadkeySurface({ onComplete, onBack }: DeadkeySurfaceProps) {
  const ir = useWorkingCopyStore((s) => s.ir);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const setWorkingIR = useWorkingCopyStore((s) => s.setWorkingIR);
  const live = useWorkingCopyStore((s) => isLiveOpen(s));
  const [mode, setMode] = useState<Mode>({ tab: "inventory" });
  const { t } = useLingui();

  // Spec 081: Back / Continue live in the footer, not the step body. Published
  // before the early return so the no-working-copy state keeps them too.
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.deadkey.backButton", message: "Back" }),
            onClick: onBack,
            testId: "deadkeys-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "editor.deadkey.continueButton", message: "Continue →" }),
      onClick: onComplete,
      testId: "deadkeys-continue",
    },
  });

  // On Open the editors work from the file's own parse: every edit is written
  // into the files when it is made, so `startIr` is always current.
  const workingIr: KeyboardIR | null = (live ? (startIr ?? ir) : (ir ?? startIr)) ?? null;

  const onCommitIr = useCallback(
    (nextIr: KeyboardIR, ops: DeadkeyOperation[]): boolean | "pending" => {
      // On Copy, lifecycle edits land in the working IR (s.ir) via the overlay-
      // preserving seam and are saved immediately (F-10). They reach
      // preview/download through the deadkey overlay, not the working IR:
      // each Deadkeys-step commit also appends its DeadkeyOperation to
      // s.deadkeyOverlay.ops, and projectWorkingCopyVfs replays that log at
      // step 1.8 (see ./deadkeyOps.ts and the useWorkingCopyTransform /
      // serializeWorkingCopy wiring). The working IR itself is never
      // emitted into artifacts. On Open the edit goes into the files instead
      // (below); the op log is then only the record the `deadkeys-defined`
      // decision is read from, and no projection step replays it
      // (lib/projectionSteps).
      if (live) {
        // Open (spec 111 FR-041): the edit is written into the files now,
        // through the apply seam, with an undo record. The op log is the
        // `deadkeys-defined` decision's RECORD on Open (Article III: decisions
        // are a record); nothing replays it, and a log entry is made only for
        // an op that is in the files: now when written, on agreement when the
        // author is asked first, never on a refusal or a decline.
        const result = applyPatchToWorkingCopy(
          { ir: { groups: nextIr.groups, stores: nextIr.stores, raw: nextIr.raw } },
          DEADKEY_WRITES,
          {
            decisionIds: [],
            onApplied: () => {
              for (const op of ops) useWorkingCopyStore.getState().commitDeadkeyOp(op);
            },
          },
        );
        if (result?.status === "applied" || result?.status === "unchanged") return true;
        return result?.status === "needs-consent" || result?.status === "failed" ? "pending" : false;
      }
      setWorkingIR(nextIr);
      return true;
    },
    [live, setWorkingIR],
  );

  const openEdit = useCallback((info: DeadkeyInfo) => {
    setMode({ tab: "edit", id: info.id, ...(info.name !== undefined ? { name: info.name } : {}) });
  }, []);

  const heading = (
    <>
      <h2 style={phaseHeading}>
        <Trans id="deadkey.step.heading">Deadkeys</Trans>
      </h2>
      <p style={leadParagraph}>
        <Trans id="deadkey.step.lede">
          A deadkey types nothing by itself — it changes what the next key produces. Review the
          deadkeys this keyboard already has, fix the ones that need repair, or define new ones.
        </Trans>
      </p>
    </>
  );

  if (workingIr === null) {
    return (
      <FullStepPage testId="deadkey-step">
        {heading}
        <div style={emptyStyle}>
          <Trans id="deadkey.surface.noStartingKeyboard">
            Choose a starting keyboard first — deadkeys are defined against the working copy.
          </Trans>
        </div>
      </FullStepPage>
    );
  }

  const tabs: Array<{ key: "inventory" | "define"; label: string }> = [
    {
      key: "inventory",
      label: t({ id: "deadkey.surface.tabInventory", message: "Inventory" }),
    },
    {
      key: "define",
      label: t({ id: "deadkey.surface.tabDefine", message: "Define new deadkey" }),
    },
  ];

  return (
    <FullStepPage testId="deadkey-step">
      {heading}
      <div style={tabsStyle} role="tablist" aria-label={t({ id: "deadkey.surface.tabsAriaLabel", message: "Deadkey lifecycle" })}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className="ks-focus-ring ks-hit-target"
            aria-selected={mode.tab === t.key || (t.key === "inventory" && mode.tab === "edit")}
            style={
              mode.tab === t.key || (t.key === "inventory" && mode.tab === "edit")
                ? tabActiveStyle
                : tabBtnStyle
            }
            onClick={() => setMode({ tab: t.key })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode.tab === "inventory" && (
        <DeadkeyInventory
          ir={workingIr}
          onDefine={() => setMode({ tab: "define" })}
          onEdit={openEdit}
          onCommitRepair={onCommitIr}
        />
      )}

      {mode.tab === "define" && (
        <DeadkeyDefineForm
          ir={workingIr}
          onCommitIr={onCommitIr}
          onAdoptExisting={(id) => setMode({ tab: "edit", id })}
          onDefined={(id) => setMode({ tab: "edit", id })}
          onCancel={() => setMode({ tab: "inventory" })}
        />
      )}

      {mode.tab === "edit" && (
        <DeadkeyDetailEditor
          ir={workingIr}
          deadkeyId={mode.id}
          {...(mode.name !== undefined ? { deadkeyName: mode.name } : {})}
          onCommitIr={onCommitIr}
          onRenamed={(newId) => setMode({ tab: "edit", id: newId })}
          onAdoptExisting={(id) => setMode({ tab: "edit", id })}
          onDeleted={() => setMode({ tab: "inventory" })}
          onClose={() => setMode({ tab: "inventory" })}
        />
      )}
    </FullStepPage>
  );
}
