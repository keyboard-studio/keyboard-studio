// addPhysicalAdapter — wraps MechanismGallery as an EditorStep (P4a, T011).
//
// MechanismGallery requires selectedStartKeyboard from the working-copy store.
// The adapter reads it directly from the store so the step contract stays
// (onComplete, onBack, ctx) and the manifest (P4b) need not thread it through.
//
// Spec 090 T041: completing the step also records the `physical-layout`
// decision — the current assignment list (the gallery's own working
// set) as one value (the editor-step precedent: editor steps record
// their own decision; ratified by D-090-31) — and fires the step's
// completion effects (lockDesktop + repropagate, re-homed from the
// reducer's retired R1 hook to lib/assignLoopCompletion.ts,
// D-090-38). The decision module's renderer
// (survey/assignLoop/PhysicalLayoutDecisionRenderer) is the same
// gallery hosted by the decision host: it reports the value through
// onChange on completion instead of recording directly.
//
// Assign / Code tabs: the Code tab hosts KmnCodePane (Monaco over the .kmn
// source), lazy-loaded so Monaco never lands in the main chunk. The tabs
// live here — not in MechanismGallery — so the 4k-line gallery is
// untouched ("view swap, not a fork").

import { lazy, Suspense, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePlacementPriors } from "../../hooks/usePlacementPriors.ts";
import { completePhysicalLayoutStep } from "../../lib/mechanismStepCompletion.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { MechanismGallery } from "../assignLoop/MechanismGallery.tsx";

// Lazy-loaded so the Monaco bundle never lands in the main chunk (same
// discipline as TouchCodePane).
const KmnCodePane = lazy(() =>
  import("../assignLoop/KmnCodePane.tsx").then((m) => ({
    default: m.KmnCodePane,
  })),
);

/**
 * EditorStep adapter for the Mechanism Gallery (Phase C — desktop key
 * assignment loop). Satisfies React.ComponentType<EditorStepProps>.
 *
 * T010 (spec 028 Stage 5): self-sources placementMap via usePlacementPriors()
 * so the host does not need to thread gallery-specific props (FR-007).
 */
export function AddPhysicalAdapter({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  // FR-007: placement priors loaded here (moved from SurveyView.corpusPlacementMap).
  const placementMap = usePlacementPriors();
  const [activeTab, setActiveTab] = useState<"assign" | "code">("assign");

  function handleComplete() {
    completePhysicalLayoutStep();
    onComplete(undefined);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--app-border)",
        }}
        role="tablist"
        aria-label={t({
          id: "editor.assignLoop.mechanisms.viewTabsLabel",
          message: "Editor view",
        })}
      >
        {(["assign", "code"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${activeTab === tab ? "var(--app-accent)" : "var(--app-border)"}`,
              background:
                activeTab === tab ? "var(--app-accent-bg)" : "var(--app-surface)",
              color: "var(--app-text)",
              cursor: "pointer",
            }}
          >
            {tab === "assign"
              ? t({ id: "editor.assignLoop.mechanisms.tabAssign", message: "Assign" })
              : t({ id: "editor.assignLoop.mechanisms.tabCode", message: "Code" })}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {activeTab === "code" && (
          <Suspense
            fallback={
              <div style={{ padding: 24, color: "var(--app-text-muted)" }}>
                {t({
                  id: "editor.assignLoop.mechanisms.code.loading",
                  message: "Loading code editor…",
                })}
              </div>
            }
          >
            <KmnCodePane />
          </Suspense>
        )}
        {/* Stays mounted (hidden) on the Code tab: the gallery publishes the
            step's footer Back/Continue, with their completion gating, and
            unmounting it stranded the author without navigation. */}
        <div
          hidden={activeTab === "code"}
          style={{
            flex: 1,
            minHeight: 0,
            display: activeTab === "code" ? "none" : "flex",
            flexDirection: "column",
          }}
        >
          <MechanismGallery
            selectedStartKeyboard={startKeyboard}
            onComplete={handleComplete}
            {...(placementMap ? { placementMap } : {})}
            {...(onBack ? { onBack } : {})}
          />
        </div>
      </div>
    </div>
  );
}
