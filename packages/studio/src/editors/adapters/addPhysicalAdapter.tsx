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
// Assign / Code / Layout tabs: the Code tab hosts KmnCodePane (Monaco over the
// .kmn source), lazy-loaded so Monaco never lands in the main chunk; the
// Layout tab hosts the desktop layout pane. The tabs live here — not in
// MechanismGallery — so the 4k-line gallery is untouched ("view swap, not a
// fork").
//
// The tab bar is an ARIA APG tablist (automatic activation, roving tabindex,
// Arrow/Home/End), the same model as the touch gallery's mode tabs. Assign and
// Code mount only while active, as before (their state lives in the working
// copy). Layout mounts on first visit and then stays mounted, hidden, so its
// selection and open editors survive a trip to another tab.
//
// "View in code": the Layout panel is handed `onViewInCode(nodeId)`, which
// switches to the Code tab and passes the node id to KmnCodePane as
// `revealNodeId`. A callback prop (not a context) because the Layout panel
// is the only caller and sits one level below this component. Picking a tab
// by hand clears the pending id so a later visit to Code does not re-scroll.

import { lazy, Suspense, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePlacementPriors } from "../../hooks/usePlacementPriors.ts";
import { completePhysicalLayoutStep } from "../../lib/mechanismStepCompletion.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import { MechanismGallery } from "../assignLoop/MechanismGallery.tsx";
import { CodeReviewList, useCodeReviewFlags } from "../assignLoop/CodeReviewList.tsx";
import { FallbackPolicySection } from "../fallback/FallbackPolicySection.tsx";

// Lazy-loaded so the Monaco bundle never lands in the main chunk (same
// discipline as TouchCodePane).
const KmnCodePane = lazy(() =>
  import("../assignLoop/KmnCodePane.tsx").then((m) => ({
    default: m.KmnCodePane,
  })),
);

// Lazy-loaded like KmnCodePane: the Layout pane pulls in the attribution engine and the
// reference base-keyboard tables, none of which the Assign tab needs.
const LayoutPane = lazy(() =>
  import("../layout/LayoutPane.tsx").then((m) => ({
    default: m.LayoutPane,
  })),
);

type EditorTab = "assign" | "code" | "layout";

const TAB_ORDER: readonly EditorTab[] = ["assign", "code", "layout"];

export type { LayoutPanelProps } from "../layout/layoutPanelProps.ts";

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
  const [activeTab, setActiveTab] = useState<EditorTab>("assign");
  const [layoutVisited, setLayoutVisited] = useState(false);
  const [revealNodeId, setRevealNodeId] = useState<string | undefined>(undefined);
  // Review flags on Code-tab edits (spec 113 US8): the count rides on the tab so it is announced
  // as part of the tab's name. Flags never gate completion or download.
  const codeReview = useCodeReviewFlags();
  const tabIdBase = useId();
  const tabRefs = useRef<Map<EditorTab, HTMLButtonElement>>(new Map());
  const tabId = (tab: EditorTab) => `${tabIdBase}-tab-${tab}`;
  const panelId = (tab: EditorTab) => `${tabIdBase}-panel-${tab}`;

  function selectTab(tab: EditorTab) {
    setRevealNodeId(undefined);
    setActiveTab(tab);
    if (tab === "layout") setLayoutVisited(true);
  }

  function handleViewInCode(nodeId: string | undefined) {
    setRevealNodeId(nodeId);
    setActiveTab("code");
  }

  function handleTabsKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const activeIndex = TAB_ORDER.indexOf(activeTab);
    let nextIndex: number;
    switch (e.key) {
      case "ArrowRight":
        nextIndex = (activeIndex + 1) % TAB_ORDER.length;
        break;
      case "ArrowLeft":
        nextIndex = (activeIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = TAB_ORDER[nextIndex];
    if (next === undefined) return;
    selectTab(next);
    tabRefs.current.get(next)?.focus();
  }

  const flagCount = codeReview.flags.length;
  const tabLabels: Readonly<Record<EditorTab, string>> = {
    assign: t({ id: "editor.assignLoop.mechanisms.tabAssign", message: "Assign" }),
    code:
      flagCount === 0
        ? t({ id: "editor.assignLoop.mechanisms.tabCode", message: "Code" })
        : t({ id: "editor.assignLoop.mechanisms.tabCodeFlagged", message: `Code (${{ count: flagCount }})` }),
    layout: t({ id: "editor.assignLoop.mechanisms.tabLayout", message: "Layout" }),
  };

  function handleComplete() {
    completePhysicalLayoutStep();
    onComplete(undefined);
  }

  // Interim host for the keyboard-wide fallback policy (the Behaviours step
  // that will own it has not landed): a collapsed section below the gallery.
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- roving-tabindex model: DOM focus lives on the individual role="tab" buttons (tabIndex 0 for the active tab, -1 for the rest), never on this container, which intentionally has no tabIndex. */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--app-border)",
        }}
        role="tablist"
        data-testid="editor-view-tabs"
        aria-label={t({
          id: "editor.assignLoop.mechanisms.viewTabsLabel",
          message: "Editor view",
        })}
        onKeyDown={handleTabsKeyDown}
      >
        {TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              id={tabId(tab)}
              ref={(el) => {
                if (el) tabRefs.current.set(tab, el);
                else tabRefs.current.delete(tab);
              }}
              aria-selected={isActive}
              aria-controls={panelId(tab)}
              tabIndex={isActive ? 0 : -1}
              data-testid={`editor-view-tab-${tab}`}
              onClick={() => selectTab(tab)}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${isActive ? "var(--app-accent)" : "var(--app-border)"}`,
                background: isActive ? "var(--app-accent-bg)" : "var(--app-surface)",
                color: "var(--app-text)",
                cursor: "pointer",
              }}
            >
              {tabLabels[tab]}
            </button>
          );
        })}
      </div>
      {TAB_ORDER.map((tab) => {
        const isActive = activeTab === tab;
        return (
          <div
            key={tab}
            role="tabpanel"
            id={panelId(tab)}
            aria-labelledby={tabId(tab)}
            hidden={!isActive}
            data-testid={`editor-view-panel-${tab}`}
            style={{
              flex: 1,
              minHeight: 0,
              display: isActive ? "flex" : "none",
              flexDirection: "column",
            }}
          >
            {tab === "assign" && isActive && (
              <MechanismGallery
                selectedStartKeyboard={startKeyboard}
                onComplete={handleComplete}
                {...(placementMap ? { placementMap } : {})}
                {...(onBack ? { onBack } : {})}
              />
            )}
            {tab === "code" && isActive && (
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
                <CodeReviewList
                  flags={codeReview.flags}
                  value={codeReview.value}
                  onViewInCode={handleViewInCode}
                />
                <KmnCodePane {...(revealNodeId !== undefined ? { revealNodeId } : {})} />
              </Suspense>
            )}
            {tab === "layout" && layoutVisited && (
              <Suspense
                fallback={
                  <div style={{ padding: 24, color: "var(--app-text-muted)" }}>
                    {t({
                      id: "editor.layout.pane.loading",
                      message: "Loading layout view…",
                    })}
                  </div>
                }
              >
                <LayoutPane onViewInCode={handleViewInCode} />
              </Suspense>
            )}
          </div>
        );
      })}
      <FallbackPolicySection />
    </div>
  );
}
