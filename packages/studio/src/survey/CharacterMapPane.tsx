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
//
// This file is data-fetch + top-level composition; the five self-contained
// UI concerns it used to host directly now live under ./characterMap/:
//   - the raw U+XXXX escape hatch (rawCodepointEntry.ts, RawCodepointEntry.tsx)
//   - the zoom toolbar (zoomControl.ts, useZoomControl.ts, ZoomControl.tsx)
//   - the "Search filters" popover (useSearchFiltersPopover.ts, SearchFiltersPopover.tsx)
//   - the PUA role prompt (PuaRolePrompt.tsx)
//   - the per-group render loop (groupKey.ts, CharacterMapGroupSection.tsx)

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { buildProducedSet, scriptSubtagOf, toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { characterMapGroups, type CharacterMapGroup } from "../lib/services.ts";
import { casePairOf, isFoldedUppercase } from "./charNormUtils.ts";
import { isPrivateUseCodePoint, glyphCategory } from "@keyboard-studio/engine";
import { isCombining, prefixCombiningMark } from "../lib/irToCarveNodes.ts";
import { matchesQuery } from "./characterSearch.ts";
import { Checkbox } from "../ui/index.ts";
import { useGlyphFontStack } from "./useGlyphFontStack.ts";
import { useFontSupportChecker } from "./useFontSupportChecker.ts";
import { ACCENT, TEXT_DIM, mutedNote, visuallyHidden } from "./surveyStyles.ts";
import { groupKey } from "./characterMap/groupKey.ts";
import { BASE_OUTPUT_BORDER } from "./characterMap/constants.ts";
import type { CharacterMapCell } from "./characterMap/types.ts";
import { parseCodepointInput } from "./characterMap/rawCodepointEntry.ts";
import { RawCodepointEntry } from "./characterMap/RawCodepointEntry.tsx";
import { PuaRolePrompt } from "./characterMap/PuaRolePrompt.tsx";
import { useZoomControl } from "./characterMap/useZoomControl.ts";
import { ZoomControl } from "./characterMap/ZoomControl.tsx";
import { useSearchFiltersPopover } from "./characterMap/useSearchFiltersPopover.ts";
import { SearchFiltersPopover } from "./characterMap/SearchFiltersPopover.tsx";
import { CharacterMapGroupSection } from "./characterMap/CharacterMapGroupSection.tsx";
import { mergeBlocksAcrossTiers } from "./characterMap/mergeBlocks.ts";

// Re-exported so CharacterMapPane.test.tsx's zoom-control block (which derives
// expected boundary percentages/iteration counts from these constants rather
// than hardcoding them) keeps importing from this module — the constants
// themselves now live in ./characterMap/zoomControl.ts alongside the zoom
// toolbar they drive.
export { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, zoomPercent } from "./characterMap/zoomControl.ts";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; groups: CharacterMapGroup[] }
  | { status: "error" };

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
export const MAX_CELLS_PER_GROUP = 3000;

interface CharacterMapPaneProps {
  // Per-group render cap. Defaults to MAX_CELLS_PER_GROUP; overridable only so
  // tests can exercise the exact slice/"Showing N of M" logic with a small cap
  // instead of rendering thousands of DOM chips (which flakes past the timeout
  // under full-suite parallel load). Production always uses the default.
  maxCellsPerGroup?: number;
  // Which category slice of the map this pane offers (the two dedicated pages
  // split the categories between them — see filteredGroups):
  //   "alphabet"    — letters, numerals, and marks (the Phase B build-list
  //                   screen). DEFAULT.
  //   "punctuation" — punctuation only (the punctuation step between marks
  //                   and convenience).
  // Both scopes toggle the SAME shared phaseBDraftStore draft.
  scope?: "alphabet" | "punctuation";
}

export function CharacterMapPane({
  maxCellsPerGroup = MAX_CELLS_PER_GROUP,
  scope = "alphabet",
}: CharacterMapPaneProps = {}) {
  const { t } = useLingui();
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const bcp47 = surveyContext.bcp47_tag;
  const languageName = surveyContext.language_name;

  const chars = usePhaseBDraftStore((s) => s.chars);
  const addChar = usePhaseBDraftStore((s) => s.add);
  const removeChar = usePhaseBDraftStore((s) => s.remove);
  const glyphFontStack = useGlyphFontStack();
  const isGlyphSupported = useFontSupportChecker(glyphFontStack);

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [blocksOnly, setBlocksOnly] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  // Per-group "Hide" toggle (deliberately distinct from `blocksOnly` above):
  // this NEVER removes a group from `filteredGroups` — it only collapses that
  // group's cell grid in place, so the section heading stays present and one
  // click on "Show" restores it. Keyed by groupKey() (tier-script-block), the
  // same stable identity the list key uses. Transient view state, like
  // `blocksOnly` — reset on language change below, never persisted.
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  // Private-use pick awaiting its role answer (spec 046 FR-004): no linguistic
  // data exists for PUA characters, so the designer says letter-or-mark AT the
  // point of picking — the character is not added to any list until answered.
  const [pendingPuaChar, setPendingPuaChar] = useState<string | null>(null);

  // "Search filters" disclosure state/handlers — see useSearchFiltersPopover.ts.
  const searchFiltersPopover = useSearchFiltersPopover(setAnnouncement);
  const { searchFilters } = searchFiltersPopover;

  // Zoom factor for the chip grid — see useZoomControl.ts.
  const { zoom, zoomOutButtonRef, zoomInButtonRef, handleZoom } = useZoomControl(setAnnouncement);

  // No base IR / no BCP47 yet — short-circuit BEFORE the fetch, mirroring
  // SuggestionPanel's own `!bcp47 || baseIr === null` guard (PhaseB.tsx). Without
  // this, characterMapGroups(...) was called unconditionally and always showed
  // the generic "No characters available" empty state instead of a message that
  // tells the author WHY (and what to do instead).
  const noBaseOrLanguage = baseIr === null || !bcp47;
  const displayName =
    languageName ?? bcp47 ?? t({ id: "survey.characterMapPane.genericLanguage", message: "this language" });

  // The base keyboard's own script(s) — its primary `script` field plus any
  // script subtag parsed out of its `.kps` `languages` list (e.g.
  // "lif-Deva" -> "Deva"). Forwarded to buildCharacterMap's opts.baseScripts
  // so the base keyboard's script(s) are enumerated alongside the target
  // script — this only drives WHICH groups are built, not the "blocks my
  // keyboard uses" filter below (that filter narrows by usedByBase instead).
  const baseScripts = useMemo<string[]>(() => {
    const set = new Set<string>();
    if (baseKeyboard?.script) set.add(baseKeyboard.script);
    for (const tag of baseKeyboard?.languages ?? []) {
      const script = scriptSubtagOf(tag);
      if (script !== undefined) set.add(script);
    }
    return [...set];
  }, [baseKeyboard]);

  // Fetch the character map whenever the base IR, base keyboard, or language
  // identity changes.
  useEffect(() => {
    // A stale search/error/announcement from the previous language must not
    // persist across a language/base change — reset the transient UI state
    // before the new fetch starts.
    setQuery("");
    searchFiltersPopover.reset();
    setRawInput("");
    setRawError(null);
    setAnnouncement("");
    setHiddenGroups(new Set());
    if (noBaseOrLanguage) {
      return;
    }
    let cancelled = false;
    setLoadState({ status: "loading" });
    characterMapGroups(baseIr, bcp47, languageName, baseScripts)
      .then((groups) => {
        if (!cancelled) setLoadState({ status: "done", groups });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [noBaseOrLanguage, baseIr, bcp47, languageName, baseKeyboard, baseScripts, searchFiltersPopover.reset]);

  // Whether the loaded groups actually carry a known produced set — the
  // engine only sets `usedByBase: true` on any group when it had a baseIr to
  // derive producedGlyphs() from (see buildCharacterMap). Without at least
  // one usedByBase group the "blocks my keyboard uses" filter is meaningless,
  // so it stays hidden and every group shows regardless of `blocksOnly`.
  const hasKnownBlocks = useMemo(
    () => loadState.status === "done" && loadState.groups.some((g) => g.usedByBase),
    [loadState],
  );

  // Every glyph the base keyboard already produces (NFC). Cells for these are
  // tinted yellow in the grid UNTIL the author selects them into the alphabet —
  // a "your base already types this" affordance. Browser-safe, memoized on the
  // base IR (no I/O). Empty set when there is no base IR.
  const baseProduced = useMemo<Set<string>>(
    () => (baseIr !== null ? buildProducedSet(baseIr) : new Set<string>()),
    [baseIr],
  );


  // Client-side filter — plain array filter, no timer of any kind. Search is
  // ALWAYS whole-set: when a query is present it searches every loaded group
  // regardless of the "blocks my keyboard uses" checkbox, so a query can
  // surface a character from a currently-hidden block. Only when there's no
  // query does the checkbox narrow the grid — and only when we actually know
  // which blocks the base keyboard uses (hasKnownBlocks). A block already
  // represented in the author's accumulating alphabet (`chars`, from
  // phaseBDraftStore) is also allowed even if the base doesn't produce it —
  // this is the auto-unhide mechanism: adding a character from a hidden block
  // (via search, or the raw code point field) unhides that block, even while
  // the checkbox stays checked.
  const filteredGroups = useMemo(() => {
    if (loadState.status !== "done") return [];
    // Per-scope cell fold applied before search/blocks filtering (spec 047):
    //
    // "alphabet" (the Phase B build-list screen):
    //   1. Cased-script fold — drop the uppercase of a case pair so the map
    //      offers only the lowercase (its uppercase joins the alphabet on
    //      select and is recorded on Done).
    //   2. Shows only LETTERS, NUMERALS, and MARKS. Numerals are kept because
    //      some languages use digits word-formingly. Punctuation, symbols,
    //      separators, and control/format characters move to the dedicated
    //      punctuation page.
    //
    // "punctuation" (the punctuation step): PUNCTUATION only — no case fold
    //   (punctuation is caseless) and no letters/numerals/marks.
    const byTier = loadState.groups
      .map((g) => ({
        ...g,
        cells: g.cells.filter((c) => {
          const nfc = c.char.normalize("NFC");
          if (scope === "punctuation") {
            return !c.isCombiningMark && glyphCategory(nfc) === "punctuation";
          }
          if (isFoldedUppercase(nfc, bcp47)) return false;
          if (c.isCombiningMark) return true; // marks (\p{M}) — glyphCategory folds these to "control"
          const cat = glyphCategory(nfc);
          return cat === "letter" || cat === "number";
        }),
      }))
      .filter((g) => g.cells.length > 0);
    // One section per Unicode block, cells in codepoint order — see
    // mergeBlocks.ts. Without this the exemplar tiers emit duplicate stub
    // sections ("Latin Extended-B — main" holding only the five selected
    // exemplar characters) ahead of the full block further down, instead of
    // those characters sitting highlighted in place inside it.
    const cased = mergeBlocksAcrossTiers(byTier);
    const q = query.trim();
    if (q !== "") {
      return cased
        .map((g) => ({ ...g, cells: g.cells.filter((c) => matchesQuery(c, q, searchFilters)) }))
        .filter((g) => g.cells.length > 0);
    }
    if (blocksOnly && hasKnownBlocks) {
      return cased.filter(
        (g) => g.usedByBase || g.cells.some((c) => chars.includes(c.char.normalize("NFC"))),
      );
    }
    return cased;
  }, [loadState, query, searchFilters, blocksOnly, hasKnownBlocks, chars, bcp47, scope]);

  // Visible decomposition at the point of picking (spec 046 US5/FR-003): a
  // whole-grapheme pick contributes its base to Letters and its mark(s) to
  // Marks; the announcement narrates that three-way update so the pick itself
  // is the teaching moment — no interrupting question.
  function describeContribution(char: string): string {
    const lastPick = usePhaseBDraftStore.getState().lastPick;
    if (lastPick === null || lastPick.grapheme !== char.normalize("NFC")) return "";
    const parts: string[] = [];
    if (lastPick.addedBases.length > 0) {
      parts.push(`${lastPick.addedBases.join(", ")} added to Letters`);
    }
    if (lastPick.addedMarks.length > 0) {
      parts.push(
        `${lastPick.addedMarks.map((m) => prefixCombiningMark(m, true)).join(", ")} added to Marks`,
      );
    }
    if (lastPick.addedStack !== null && parts.length > 0) {
      parts.push("combination recorded");
    }
    return parts.length > 0 ? ` — ${parts.join(", ")}` : "";
  }

  function handleToggle(cell: CharacterMapCell): void {
    const nfc = cell.char.normalize("NFC");
    const wasSelected = chars.includes(nfc);
    // Selecting a cased letter adds BOTH cases (its uppercase is hidden in the
    // map but joins the alphabet); deselecting removes both. "Your alphabet"
    // mirrors this — removing a letter there removes both cases too.
    const pair = casePairOf(nfc, bcp47);
    if (wasSelected) {
      for (const p of pair) if (chars.includes(p)) removeChar(p);
    } else {
      // Add the counterpart(s) first, then the clicked char, so lastPick (used
      // by the visible-decomposition announcement) reflects the clicked char.
      for (const p of pair.slice(1)) addChar(p);
      addChar(cell.char);
    }
    const actionWord = wasSelected
      ? t({ id: "survey.characterMapPane.announce.removed", message: "Removed" })
      : t({ id: "survey.characterMapPane.announce.added", message: "Added" });
    // A bare combining mark in this aria-live string has nothing to attach
    // to (unlike the visible grid cell, which is prefixed via `display`) —
    // dotted-circle it here too so the screen-reader announcement isn't a
    // silently-dropped or garbled zero-width character.
    const announcedChar = prefixCombiningMark(cell.char, cell.isCombiningMark);
    setAnnouncement(
      `${actionWord} ${announcedChar} (${toUPlusNotation(cell.char)})${
        wasSelected ? "" : describeContribution(cell.char)
      }`,
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
      setRawError(
        t({
          id: "survey.characterMapPane.rawInput.invalidCodepoint",
          message:
            "Enter a valid code point: U+ followed by 4-6 hex digits (e.g. U+1E900). Surrogate halves and Unicode noncharacters aren't allowed.",
        }),
      );
      return;
    }
    const char = result.char.normalize("NFC");
    // FR-004: a private-use character has no data to infer a role from — ask
    // letter-or-mark BEFORE adding it to any inventory list.
    const cp = char.codePointAt(0);
    if (cp !== undefined && isPrivateUseCodePoint(cp)) {
      setPendingPuaChar(char);
      setRawInput("");
      setRawError(null);
      return;
    }
    // NOTE: the raw code-point field is a deliberate "add ANY exact character"
    // power tool — it does NOT fold uppercase to lowercase (unlike the main
    // "Type your alphabet" box), so an author can still reach a specific scalar
    // value here when they mean it.
    addChar(char);
    const addedLabel = t({ id: "survey.characterMapPane.announce.added", message: "Added" });
    // Same bare-combining-mark concern as handleToggle's announcement — the
    // U+XXXX escape hatch can add a standalone mark directly.
    const announcedChar = prefixCombiningMark(char, isCombining(char));
    setAnnouncement(`${addedLabel} ${announcedChar} (${toUPlusNotation(char)})${describeContribution(char)}`);
    setRawInput("");
    setRawError(null);
  }

  // Resolve the pending PUA pick with the designer's declared role — recorded
  // permanently on the draft (classifiers read it first; FR-004).
  function handlePuaRole(role: "letter" | "mark"): void {
    if (pendingPuaChar === null) return;
    addChar(pendingPuaChar, { role });
    setAnnouncement(
      `Added ${pendingPuaChar} (${toUPlusNotation(pendingPuaChar)}) as a ${
        role === "mark" ? "mark" : "letter"
      }`,
    );
    setPendingPuaChar(null);
  }

  // Toggles the "blocks my keyboard uses" filter — reuses the existing
  // announcement live region rather than adding a second one.
  function handleToggleBlocksOnly(next: boolean): void {
    setBlocksOnly(next);
    setAnnouncement(
      next
        ? t({
            id: "survey.characterMapPane.blocksOnly.announceOn",
            message: "Showing only blocks your keyboard uses",
          })
        : t({
            id: "survey.characterMapPane.blocksOnly.announceOff",
            message: "Showing all blocks",
          }),
    );
  }

  // Per-group Hide/Show toggle — collapses/restores ONE group's cell grid
  // in place (never removes it from `filteredGroups`; see the hiddenGroups
  // state comment above). Reuses the existing announcement live region,
  // same as handleToggleBlocksOnly, rather than adding a second one.
  function handleToggleGroupHidden(group: CharacterMapGroup, hidden: boolean): void {
    const key = groupKey(group);
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(key);
      else next.delete(key);
      return next;
    });
    setAnnouncement(
      hidden
        ? t({
            id: "survey.characterMapPane.group.announceHidden",
            message: `Hidden ${{ block: group.block }}`,
          })
        : t({
            id: "survey.characterMapPane.group.announceShown",
            message: `Showing ${{ block: group.block }}`,
          }),
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: ACCENT }}>
        <Trans id="survey.characterMapPane.title">Character map</Trans>
      </h2>
      <p style={{ margin: 0, fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 }}>
        {scope === "punctuation" ? (
          <Trans id="survey.characterMapPane.subtitlePunctuation">
            Browse and click to toggle punctuation into your list — the same
            list you're building on the left.
          </Trans>
        ) : (
          <Trans id="survey.characterMapPane.subtitle">
            Browse and click to toggle characters into your alphabet — the same
            list you're building on the left.
          </Trans>
        )}
      </p>
      {baseProduced.size > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: BASE_OUTPUT_BORDER, lineHeight: 1.5 }}>
          <Trans id="survey.characterMapPane.baseOutputNote">
            Note: Characters outlined in yellow are available in your chosen base keyboard.
          </Trans>
        </p>
      )}
      <RawCodepointEntry
        value={rawInput}
        onChange={(value) => {
          setRawInput(value);
          if (rawError !== null) setRawError(null);
        }}
        onSubmit={handleRawSubmit}
        error={rawError}
      />
      {pendingPuaChar !== null && (
        <PuaRolePrompt
          char={pendingPuaChar}
          onChooseRole={handlePuaRole}
          onCancel={() => setPendingPuaChar(null)}
        />
      )}
      <SearchFiltersPopover
        query={query}
        onQueryChange={setQuery}
        filtersOpen={searchFiltersPopover.filtersOpen}
        filtersContainerRef={searchFiltersPopover.filtersContainerRef}
        filtersTriggerRef={searchFiltersPopover.filtersTriggerRef}
        onToggleFiltersOpen={searchFiltersPopover.toggleFiltersOpen}
        onFiltersKeyDown={searchFiltersPopover.handleFiltersKeyDown}
        searchFilters={searchFilters}
        onToggleSearchFilter={searchFiltersPopover.handleToggleSearchFilter}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!noBaseOrLanguage && hasKnownBlocks && (
          <label
            className="ks-hit-target"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: TEXT_DIM,
            }}
          >
            <Checkbox
              checked={blocksOnly}
              onChange={(e) => handleToggleBlocksOnly(e.target.checked)}
              aria-label={t({
                id: "survey.characterMapPane.blocksOnly.ariaLabel",
                message: "Show only blocks my keyboard uses",
              })}
            />
            <Trans id="survey.characterMapPane.blocksOnly.label">
              Show only blocks my keyboard uses
            </Trans>
          </label>
        )}
        <ZoomControl
          zoom={zoom}
          zoomOutButtonRef={zoomOutButtonRef}
          zoomInButtonRef={zoomInButtonRef}
          onZoom={handleZoom}
        />
      </div>
      {/* Screen-reader announcer for toggle actions — visually hidden. */}
      <div aria-live="polite" style={visuallyHidden}>
        {announcement}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {noBaseOrLanguage ? (
          <div style={mutedNote}>
            <Trans id="survey.characterMapPane.noVerifiedList">
              No verified character list for {displayName} — type your alphabet
              in the left panel.
            </Trans>
          </div>
        ) : loadState.status === "idle" || loadState.status === "loading" ? (
          <div style={mutedNote}><Trans id="survey.characterMapPane.loading">Loading the character map…</Trans></div>
        ) : loadState.status === "error" ? (
          <div style={mutedNote}><Trans id="survey.characterMapPane.loadError">Could not load the character map.</Trans></div>
        ) : filteredGroups.length === 0 ? (
          <div style={mutedNote}>
            {query.trim() === "" ? (
              <Trans id="survey.characterMapPane.noneAvailable">No characters available for this language yet.</Trans>
            ) : (
              <Trans id="survey.characterMapPane.noMatch">No characters match "{query.trim()}".</Trans>
            )}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <CharacterMapGroupSection
              key={groupKey(group)}
              group={group}
              maxCellsPerGroup={maxCellsPerGroup}
              query={query}
              hiddenGroups={hiddenGroups}
              chars={chars}
              baseProduced={baseProduced}
              zoom={zoom}
              glyphFontStack={glyphFontStack}
              isGlyphSupported={isGlyphSupported}
              onToggleCell={handleToggle}
              onToggleHidden={handleToggleGroupHidden}
            />
          ))
        )}
      </div>
    </div>
  );
}
