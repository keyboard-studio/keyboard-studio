// OpenToolsMenu — the menu entries for the optional tools on Open (spec 111).
//
// On Open the remove tool and the feature galleries are not in the walk (their
// screens are gated off, survey/questions/registry.ts `openHiddenScreens`); this
// disclosure reaches each one on demand. It renders only while the authoring
// track is "adapt" (the internal value Open keeps).

import { useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { navigateTo } from "../lib/navigate.ts";
import { openMenuScreens } from "../survey/questions/registry.ts";
import { useDismissablePopover } from "../ui/useDismissablePopover.ts";
import type { ActiveStepId } from "../stores/surveySessionStore.ts";

/** Open the screen `screenId` on demand: a forward push, so Back returns to where the author was. */
export function openToolScreen(screenId: string): void {
  useSurveySessionStore.getState().advance(screenId as ActiveStepId);
  navigateTo("survey");
}

export function OpenToolsMenu(): React.JSX.Element | null {
  const { t } = useLingui();
  const isOpen = useDecisionStore((s) => s.decisions["authoring-track"]?.value === "adapt");
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useDismissablePopover(expanded, { containerRef, onClose: () => setExpanded(false) });
  if (!isOpen) return null;

  const labels: Readonly<Record<string, string>> = {
    carve: t({ id: "open.menu.carve", message: "Remove characters" }),
    marks: t({ id: "open.menu.marks", message: "Marks" }),
    punctuation: t({ id: "open.menu.punctuation", message: "Punctuation" }),
    invisibles: t({ id: "open.menu.invisibles", message: "Invisible characters" }),
    convenience: t({ id: "open.menu.convenience", message: "Convenience letters" }),
    deadkeys: t({ id: "open.menu.deadkeys", message: "Dead keys" }),
    rules: t({ id: "open.menu.rules", message: "Rules" }),
    mechanisms: t({ id: "open.menu.mechanisms", message: "Input methods" }),
    touch: t({ id: "open.menu.touch", message: "Touch layout" }),
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="open-tools-list"
        className="ks-focus-ring"
        onClick={() => setExpanded((v) => !v)}
        style={{
          padding: "4px 10px",
          fontSize: 12.5,
          fontFamily: "var(--app-font)",
          color: "var(--app-text)",
          background: "transparent",
          border: "1px solid var(--app-border, currentColor)",
          borderRadius: 6,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {t({ id: "open.menu.button", message: "Tools" })}
      </button>
      {expanded && (
        <ul
          id="open-tools-list"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 20,
            margin: 0,
            padding: 4,
            listStyle: "none",
            minWidth: 180,
            background: "var(--app-bg)",
            border: "1px solid var(--app-border, currentColor)",
            borderRadius: 6,
          }}
        >
          {openMenuScreens.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="ks-focus-ring"
                onClick={() => {
                  setExpanded(false);
                  openToolScreen(id);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "6px 10px",
                  textAlign: "left",
                  fontSize: 13,
                  fontFamily: "var(--app-font)",
                  color: "var(--app-text)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {labels[id] ?? id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
