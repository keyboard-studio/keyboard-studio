// DeadkeySurface — the spec-083 Deadkeys step surface.
//
// Tab/mode state: inventory | define | edit. Reads the working IR from the
// working-copy store and commits every lifecycle mutation through
// setWorkingIR (overlay-preserving) via the deadkeyWrite mutate seam —
// never ad hoc KMN text (§5a: IR pipeline only).
//
// NOTE (architecture, honest): the working IR is not itself emitted into
// the preview/download artifacts — projectWorkingCopyVfs projects from
// baseIr + overlays/assignments. Lifecycle edits land in the working copy
// (the current mutation API's contract); making them reach the compiled
// artifact is Phase 4's projection seam. This surface does not pretend
// otherwise.

import { useCallback, useState, type CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import type { KeyboardIR, DeadkeyInfo } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { BG_PAGE, TEXT_MAIN, TEXT_DIM, FONT } from "../../lib/galleryTheme.ts";
import { DeadkeyInventory } from "./DeadkeyInventory.tsx";
import { DeadkeyDefineForm } from "./DeadkeyDefineForm.tsx";
import { DeadkeyDetailEditor } from "./DeadkeyDetailEditor.tsx";

const pageStyle: CSSProperties = {
  background: BG_PAGE,
  minHeight: "100%",
  padding: "16px 20px",
  fontFamily: FONT,
};

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
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const setWorkingIR = useWorkingCopyStore((s) => s.setWorkingIR);
  const [mode, setMode] = useState<Mode>({ tab: "inventory" });
  const { t } = useLingui();

  // Spec 081: Back / Continue live in the footer, not the step body. Published
  // before the early return so the no-working-copy state keeps them too.
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.deadkey.backButton", message: "← Back" }),
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

  const workingIr: KeyboardIR | null = ir ?? baseIr ?? null;

  const onCommitIr = useCallback(
    (nextIr: KeyboardIR) => {
      // Lifecycle edits land in the working IR (s.ir) via the overlay-
      // preserving seam and are saved immediately (F-10). They reach
      // preview/download through the deadkey overlay, not the working IR:
      // each Deadkeys-step commit also appends its DeadkeyOperation to
      // s.deadkeyOverlay.ops, and projectWorkingCopyVfs replays that log at
      // step 1.8 (see ./deadkeyOps.ts and the useWorkingCopyTransform /
      // serializeWorkingCopy wiring). The working IR itself is never
      // emitted into artifacts.
      setWorkingIR(nextIr);
    },
    [setWorkingIR],
  );

  const openEdit = useCallback((info: DeadkeyInfo) => {
    setMode({ tab: "edit", id: info.id, ...(info.name !== undefined ? { name: info.name } : {}) });
  }, []);

  if (workingIr === null) {
    return (
      <div style={pageStyle}>
        <div style={emptyStyle}>
          Choose a base keyboard first — deadkeys are defined against the working copy.
        </div>
      </div>
    );
  }

  const tabs: Array<{ key: "inventory" | "define"; label: string }> = [
    { key: "inventory", label: "Inventory" },
    { key: "define", label: "Define new deadkey" },
  ];

  return (
    <div style={pageStyle}>
      <div style={tabsStyle} role="tablist" aria-label="Deadkey lifecycle">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
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
    </div>
  );
}
