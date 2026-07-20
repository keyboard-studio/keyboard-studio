// CharacterMapPane — Phase B right-pane interactive character map.
//
// Renders ONLY for the Phase B build-list screen: StudioShell's SurveyView
// swaps the right pane's live OSK preview for this component when the active
// step declares rightPane:"character-map" (steps/manifest.ts, the "characters"
// step) AND discoveryMethod === "build-list" (stores/surveySessionStore.ts —
// the IntroChooser and the manual step-by-step path keep the OSK preview).
//
// Clicking a cell toggles it into the SAME accumulating alphabet the center
// pane's BuildListView builds (SuggestionPanel ticks + CharChipEditor type-in),
// via the shared stores/phaseBDraftStore.ts — both panes read/write one list.
//
// Data source: buildCharacterMap (engine, a parallel-track character-discovery
// deliverable) via lib/services.ts's characterMapGroups wrapper. baseIr comes
// from workingCopyStore; bcp47/languageName come from the same
// surveySessionStore.surveyContext PhaseB itself reads (context.bcp47_tag /
// context.language_name) — no new plumbing invented for this pane.
//
// Search filters client-side with a plain array filter — NOT a debounce timer
// (D3 scope guard: the studio's one 300ms cycle belongs to the validator/WASM
// oracle; this is a synchronous UI filter over already-loaded data).

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { characterMapGroups, type CharacterMapGroup } from "../lib/services.ts";
import {
  BG_PAGE,
  BORDER,
  ACCENT,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  mutedNote,
  sectionHeading,
  charChip,
  chipGlyph,
  chipCodepoint,
  chipIndicator,
  chipIndicatorText,
  chipIndicatorColor,
} from "./surveyStyles.ts";

// A single cell within a CharacterMapGroup — derived rather than imported by
// name so this file depends on exactly one (not-yet-landed) engine symbol,
// CharacterMapGroup, via services.ts's re-export.
type CharacterMapCell = CharacterMapGroup["cells"][number];

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; groups: CharacterMapGroup[] }
  | { status: "error" };

// Combining marks render over a dotted circle so the mark is visible standalone
// (Unicode's standard convention for showing a combining mark in isolation).
const DOTTED_CIRCLE = "◌";

// Visually-hidden but screen-reader-visible — standard clip-rect pattern.
const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function tierLabel(tier: CharacterMapGroup["tier"]): string | null {
  if (tier === "main") return "main";
  if (tier === "auxiliary") return "loanwords";
  return null;
}

export function CharacterMapPane() {
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const bcp47 = surveyContext.bcp47_tag;
  const languageName = surveyContext.language_name;

  const chars = usePhaseBDraftStore((s) => s.chars);
  const toggle = usePhaseBDraftStore((s) => s.toggle);

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");

  // No base IR / no BCP47 yet — short-circuit BEFORE the fetch, mirroring
  // SuggestionPanel's own `!bcp47 || baseIr === null` guard (PhaseB.tsx). Without
  // this, characterMapGroups(...) was called unconditionally and always showed
  // the generic "No characters available" empty state instead of a message that
  // tells the author WHY (and what to do instead).
  const noBaseOrLanguage = baseIr === null || !bcp47;
  const displayName = languageName ?? bcp47 ?? "this language";

  // Fetch the character map whenever the base IR or language identity changes.
  useEffect(() => {
    if (noBaseOrLanguage) {
      return;
    }
    let cancelled = false;
    setLoadState({ status: "loading" });
    characterMapGroups(baseIr, bcp47, languageName)
      .then((groups) => {
        if (!cancelled) setLoadState({ status: "done", groups });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [noBaseOrLanguage, baseIr, bcp47, languageName]);

  // Client-side filter — plain array filter, no timer of any kind.
  const filteredGroups = useMemo(() => {
    if (loadState.status !== "done") return [];
    const q = query.trim();
    if (q === "") return loadState.groups;
    return loadState.groups
      .map((g) => ({ ...g, cells: g.cells.filter((c) => c.char.includes(q)) }))
      .filter((g) => g.cells.length > 0);
  }, [loadState, query]);

  function handleToggle(cell: CharacterMapCell): void {
    const nfc = cell.char.normalize("NFC");
    const wasSelected = chars.includes(nfc);
    toggle(cell.char);
    setAnnouncement(
      `${wasSelected ? "Removed" : "Added"} ${cell.char} (${toUPlusNotation(cell.char)})`,
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: ACCENT }}>
        Character map
      </h2>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
        Browse and click to toggle characters into your alphabet — the same
        list you're building on the left.
      </p>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search characters"
        aria-label="Search the character map"
        style={{
          background: BG_PAGE,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          color: TEXT_MAIN,
          fontSize: 14,
          fontFamily: FONT,
          padding: "8px 12px",
          boxSizing: "border-box",
        }}
      />
      {/* Screen-reader announcer for toggle actions — visually hidden. */}
      <div aria-live="polite" style={visuallyHidden}>
        {announcement}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {noBaseOrLanguage ? (
          <div style={mutedNote}>
            No verified character list for {displayName} — type your alphabet
            in the left panel.
          </div>
        ) : loadState.status === "idle" || loadState.status === "loading" ? (
          <div style={mutedNote}>Loading the character map…</div>
        ) : loadState.status === "error" ? (
          <div style={mutedNote}>Could not load the character map.</div>
        ) : filteredGroups.length === 0 ? (
          <div style={mutedNote}>
            {query.trim() === ""
              ? "No characters available for this language yet."
              : `No characters match "${query.trim()}".`}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const label = tierLabel(group.tier);
            return (
              <section
                key={`${group.tier}-${group.block}`}
                aria-label={`${group.block} characters${label !== null ? ` (${label})` : ""}`}
              >
                <h3 style={sectionHeading}>
                  {group.block}
                  {label !== null && (
                    <span style={{ fontWeight: 400, color: TEXT_DIM, fontSize: 11 }}>
                      {" "}
                      — {label}
                    </span>
                  )}
                </h3>
                <div
                  role="group"
                  aria-label={`${group.block} characters — click to toggle`}
                  style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                >
                  {group.cells.map((cell) => {
                    const selected = chars.includes(cell.char.normalize("NFC"));
                    const cp = toUPlusNotation(cell.char);
                    const display = cell.isCombiningMark ? `${DOTTED_CIRCLE}${cell.char}` : cell.char;
                    return (
                      <button
                        key={cell.char}
                        type="button"
                        onClick={() => handleToggle(cell)}
                        aria-pressed={selected}
                        aria-label={`${selected ? "Remove" : "Add"} ${cell.char} (${cp})`}
                        style={charChip(selected)}
                      >
                        <span style={chipGlyph(selected)}>{display}</span>
                        <span style={chipCodepoint}>{cp}</span>
                        {/* Non-color selected indicator (colorblind-safe) — shared
                            helper with SuggestionChip's "[x]"/"+" pattern in
                            PhaseB.tsx (surveyStyles.ts's chipIndicator*). */}
                        <span style={chipIndicator(chipIndicatorColor(selected))}>
                          {chipIndicatorText(selected)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
