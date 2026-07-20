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

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { parseUPlusNotation, toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { characterMapGroups, type CharacterMapGroup } from "../lib/services.ts";
import {
  BG_PAGE,
  BORDER,
  ACCENT,
  ERROR_RED,
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
  primaryButton,
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
  if (tier === "digits") return "Digits & numerals";
  if (tier === "punctuation") return "Punctuation & symbols";
  return null;
}

// ---------------------------------------------------------------------------
// Raw U+XXXX entry — the "all options" escape hatch. The browse grid only
// ever shows what buildCharacterMap decided was relevant to the language; this
// field lets the author add ANY scalar value directly (Common punctuation,
// PUA, or an out-of-script character the grid doesn't list), by code point.
//
// Accepted formats: "U+1E900", "u+1e900", bare "1E900" (4-6 hex digits) — the
// same set parseUPlusNotation itself accepts. A bare "0x1E900" 0x-prefix
// form is NOT accepted (dropped rather than kept as a second parser).
// ---------------------------------------------------------------------------

type CodepointParseResult =
  | { ok: true; char: string }
  | { ok: false; message: string };

/**
 * Parse a free-typed code point string into a validated Unicode character.
 * Delegates the actual hex-parse / surrogate / range / noncharacter checks to
 * the canonical `parseUPlusNotation` (@keyboard-studio/contracts) rather than
 * re-implementing them — this function's only job is to turn that parser's
 * bare `null` into a human-readable message. PUA code points (e.g. U+E000)
 * pass through unchanged: that is the escape hatch's whole point.
 */
function parseCodepointInput(raw: string): CodepointParseResult {
  const trimmed = raw.trim();
  const resolved = parseUPlusNotation(trimmed);
  if (resolved === null) {
    return {
      ok: false,
      message:
        "Enter a valid code point: U+ followed by 4-6 hex digits (e.g. U+1E900). Surrogate halves and Unicode noncharacters aren't allowed.",
    };
  }
  return { ok: true, char: resolved };
}

// Rendering safety net for very large script blocks: cap what's actually
// drawn per group so the pane stays responsive. This is NOT a data
// restriction — the author can still reach any cell via the search filter
// (which narrows a group before this cap applies) or the U+XXXX field above.
// Real virtualization (windowed rendering) would remove the need for this
// cap entirely; flagged as a follow-up rather than built here.
//
// 3000 (raised from an earlier 500) is sized so a script like Yi — one
// unbroken "main" tier group of ~1,165 letters — renders in full rather than
// being truncated. The genuinely huge blocks (CJK Unified Ideographs,
// Hangul syllables) are routed to the three-group-routing "not yet
// supported" stub well before reaching this pane, so they never hit this cap.
const MAX_CELLS_PER_GROUP = 3000;

export function CharacterMapPane() {
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const bcp47 = surveyContext.bcp47_tag;
  const languageName = surveyContext.language_name;

  const chars = usePhaseBDraftStore((s) => s.chars);
  const toggle = usePhaseBDraftStore((s) => s.toggle);
  const addChar = usePhaseBDraftStore((s) => s.add);

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);

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

  // "All options" escape hatch: add a character by raw code point, bypassing
  // the browse grid entirely. Always add-if-absent (not toggle) — this is an
  // explicit "put this in my alphabet" action, not a click-to-flip cell.
  function handleRawSubmit(e: FormEvent): void {
    e.preventDefault();
    const trimmed = rawInput.trim();
    if (trimmed === "") return;
    const result = parseCodepointInput(trimmed);
    if (!result.ok) {
      setRawError(result.message);
      return;
    }
    const char = result.char.normalize("NFC");
    addChar(char);
    setAnnouncement(`Added ${char} (${toUPlusNotation(char)})`);
    setRawInput("");
    setRawError(null);
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
      <form
        onSubmit={handleRawSubmit}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
          <label htmlFor="char-map-raw-codepoint" style={{ fontSize: 11, color: TEXT_DIM }}>
            Add any character by code point
          </label>
          <input
            id="char-map-raw-codepoint"
            type="text"
            value={rawInput}
            onChange={(e) => {
              setRawInput(e.target.value);
              if (rawError !== null) setRawError(null);
            }}
            placeholder="U+1E900"
            aria-label="Add a character by Unicode code point"
            aria-describedby={rawError !== null ? "char-map-raw-codepoint-error" : undefined}
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
        </div>
        <button type="submit" disabled={rawInput.trim() === ""} style={primaryButton(rawInput.trim() === "")}>
          Add
        </button>
      </form>
      {rawError !== null && (
        <div id="char-map-raw-codepoint-error" role="alert" style={{ fontSize: 12, color: ERROR_RED }}>
          {rawError}
        </div>
      )}
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
            // Rendering safety net for very large blocks (Hangul ~11k, Yi
            // ~1.1k) — cap what's drawn, not what's reachable (search above
            // narrows `group.cells` before this slice runs, and the U+XXXX
            // field reaches anything regardless of this cap).
            const visibleCells = group.cells.slice(0, MAX_CELLS_PER_GROUP);
            const hiddenCount = group.cells.length - visibleCells.length;
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
                  {visibleCells.map((cell) => {
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
                {hiddenCount > 0 && (
                  <div style={{ ...mutedNote, marginTop: 6 }}>
                    Showing {visibleCells.length} of {group.cells.length} characters — use search
                    or "Add any character by code point" above to find a specific one.
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
