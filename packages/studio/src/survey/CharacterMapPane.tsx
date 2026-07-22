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

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { parseUPlusNotation, scriptSubtagOf, toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { characterMapGroups, type CharacterMapGroup } from "../lib/services.ts";
import { isPrivateUseCodePoint } from "@keyboard-studio/engine";
import { prefixCombiningMark } from "../lib/irToCarveNodes.ts";
import { matchesQuery } from "./characterSearch.ts";
import { TextField, Checkbox } from "../ui/index.ts";
import { useGlyphFontStack } from "./useGlyphFontStack.ts";
import {
  ACCENT,
  ERROR_RED,
  TEXT_DIM,
  mutedNote,
  sectionHeading,
  charChip,
  chipGlyph,
  chipCodepoint,
  chipIndicator,
  chipIndicatorText,
  chipIndicatorColor,
  primaryButton,
  secondaryButton,
  visuallyHidden,
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
// (Unicode's standard convention). The U+25CC prefixing is the shared
// prefixCombiningMark() helper (irToCarveNodes.ts) — same formatter the carve
// GlyphCell/InfoView/etc. use — parameterized here on cell.isCombiningMark
// (Mn-or-Mc) rather than that helper's default Mn-only isCombining() test.

// tierLabel is defined INSIDE CharacterMapPane (below), closing over the
// component's own `t` from useLingui() directly, rather than taking `t` as a
// parameter — the lingui macro transform tracks a specific variable BINDING
// (see @lingui/babel-plugin-lingui-macro's getBinding().referencePaths), so a
// `t` re-bound as a plain function parameter in a module-level helper is a
// distinct binding the extractor does not follow (confirmed empirically:
// editors/assignLoop/parts/Inspector.tsx's ruleDetailLabel(r, t) helper takes
// this shape and its ids do NOT appear in locales/en/messages.json even after
// extraction — do not copy that shape here).

// Stable identity for a group — used as the React list key. Includes `script`
// because the multi-script grid can carry several groups that share a generic
// fallback block name (e.g. uncurated scripts all label their letter block
// "Letters", digits "Digits", punctuation "Punctuation"); without the script
// the key collides across scripts and React drops/merges same-key sections.
function groupKey(group: CharacterMapGroup): string {
  return `${group.tier}-${group.script}-${group.block}`;
}

// DOM-id-safe derivation of groupKey() — used to pair the per-group Hide/Show
// button's aria-controls with the cell-grid div's id. groupKey() can contain
// spaces/punctuation (block names like "Combining Diacritical Marks"), which
// are legal in an HTML id but awkward; collapse anything outside
// [A-Za-z0-9_-] to a single hyphen so the id stays a plain token.
function groupGridId(key: string): string {
  return `char-map-group-grid-${key.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
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
  | { ok: false };

/**
 * Parse a free-typed code point string into a validated Unicode character.
 * Delegates the actual hex-parse / surrogate / range / noncharacter checks to
 * the canonical `parseUPlusNotation` (@keyboard-studio/contracts) rather than
 * re-implementing them. Returns a stable ok/not-ok result only — CharacterMapPane
 * (below) turns a `false` result into the translated error message, since it
 * (not this pure helper) holds the live `t` binding the extractor tracks.
 * PUA code points (e.g. U+E000) pass through unchanged: that is the escape
 * hatch's whole point.
 */
function parseCodepointInput(raw: string): CodepointParseResult {
  const trimmed = raw.trim();
  const resolved = parseUPlusNotation(trimmed);
  if (resolved === null) return { ok: false };
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
export const MAX_CELLS_PER_GROUP = 3000;

interface CharacterMapPaneProps {
  // Per-group render cap. Defaults to MAX_CELLS_PER_GROUP; overridable only so
  // tests can exercise the exact slice/"Showing N of M" logic with a small cap
  // instead of rendering thousands of DOM chips (which flakes past the timeout
  // under full-suite parallel load). Production always uses the default.
  maxCellsPerGroup?: number;
}

export function CharacterMapPane({
  maxCellsPerGroup = MAX_CELLS_PER_GROUP,
}: CharacterMapPaneProps = {}) {
  const { t } = useLingui();
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);
  const bcp47 = surveyContext.bcp47_tag;
  const languageName = surveyContext.language_name;

  const chars = usePhaseBDraftStore((s) => s.chars);
  const toggle = usePhaseBDraftStore((s) => s.toggle);
  const addChar = usePhaseBDraftStore((s) => s.add);
  const glyphFontStack = useGlyphFontStack();

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
  }, [noBaseOrLanguage, baseIr, bcp47, languageName, baseKeyboard, baseScripts]);

  // Whether the loaded groups actually carry a known produced set — the
  // engine only sets `usedByBase: true` on any group when it had a baseIr to
  // derive producedGlyphs() from (see buildCharacterMap). Without at least
  // one usedByBase group the "blocks my keyboard uses" filter is meaningless,
  // so it stays hidden and every group shows regardless of `blocksOnly`.
  const hasKnownBlocks = useMemo(
    () => loadState.status === "done" && loadState.groups.some((g) => g.usedByBase),
    [loadState],
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
    const q = query.trim();
    if (q !== "") {
      return loadState.groups
        .map((g) => ({ ...g, cells: g.cells.filter((c) => matchesQuery(c, q)) }))
        .filter((g) => g.cells.length > 0);
    }
    if (blocksOnly && hasKnownBlocks) {
      return loadState.groups.filter(
        (g) => g.usedByBase || g.cells.some((c) => chars.includes(c.char.normalize("NFC"))),
      );
    }
    return loadState.groups;
  }, [loadState, query, blocksOnly, hasKnownBlocks, chars]);

  // Defined here (not at module scope) so its `t()` calls close over this
  // component's own `t` binding directly — see the note above CodepointParseResult.
  function tierLabel(tier: CharacterMapGroup["tier"]): string | null {
    if (tier === "main") return t({ id: "survey.characterMapPane.tier.main", message: "main" });
    if (tier === "auxiliary") return t({ id: "survey.characterMapPane.tier.auxiliary", message: "loanwords" });
    if (tier === "digits") return t({ id: "survey.characterMapPane.tier.digits", message: "Digits & numerals" });
    if (tier === "punctuation") return t({ id: "survey.characterMapPane.tier.punctuation", message: "Punctuation & symbols" });
    return null;
  }

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
    toggle(cell.char);
    const actionWord = wasSelected
      ? t({ id: "survey.characterMapPane.announce.removed", message: "Removed" })
      : t({ id: "survey.characterMapPane.announce.added", message: "Added" });
    setAnnouncement(
      `${actionWord} ${cell.char} (${toUPlusNotation(cell.char)})${
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
    addChar(char);
    const addedLabel = t({ id: "survey.characterMapPane.announce.added", message: "Added" });
    setAnnouncement(`${addedLabel} ${char} (${toUPlusNotation(char)})${describeContribution(char)}`);
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
        <Trans id="survey.characterMapPane.subtitle">
          Browse and click to toggle characters into your alphabet — the same
          list you're building on the left.
        </Trans>
      </p>
      <form
        onSubmit={handleRawSubmit}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 160px" }}>
          <label htmlFor="char-map-raw-codepoint" style={{ fontSize: 11, color: TEXT_DIM }}>
            <Trans id="survey.characterMapPane.rawInput.label">Add any character by code point</Trans>
          </label>
          <TextField
            id="char-map-raw-codepoint"
            value={rawInput}
            onChange={(e) => {
              setRawInput(e.target.value);
              if (rawError !== null) setRawError(null);
            }}
            placeholder="U+1E900"
            aria-label={t({
              id: "survey.characterMapPane.rawInput.ariaLabel",
              message: "Add a character by Unicode code point",
            })}
            aria-describedby={rawError !== null ? "char-map-raw-codepoint-error" : undefined}
          />
        </div>
        <button type="submit" disabled={rawInput.trim() === ""} style={primaryButton(rawInput.trim() === "")}>
          <Trans id="survey.characterMapPane.rawInput.addButton">Add</Trans>
        </button>
      </form>
      {rawError !== null && (
        <div id="char-map-raw-codepoint-error" role="alert" style={{ fontSize: 12, color: ERROR_RED }}>
          {rawError}
        </div>
      )}
      {pendingPuaChar !== null && (
        <div
          data-testid="pua-role-prompt"
          role="group"
          aria-label={`Is ${pendingPuaChar} a letter or a mark?`}
          style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: TEXT_DIM }}
        >
          <span>
            {pendingPuaChar} ({toUPlusNotation(pendingPuaChar)}) is a private-use
            character, so there is no data to say what it is. Is it a letter of
            your alphabet, or a mark that attaches to a letter?
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              data-testid="pua-role-letter"
              onClick={() => handlePuaRole("letter")}
              style={primaryButton(false)}
            >
              A letter
            </button>
            <button
              type="button"
              data-testid="pua-role-mark"
              onClick={() => handlePuaRole("mark")}
              style={primaryButton(false)}
            >
              A mark
            </button>
            <button type="button" onClick={() => setPendingPuaChar(null)} style={{ fontSize: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <TextField
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t({ id: "survey.characterMapPane.search.placeholder", message: "Search characters" })}
        aria-label={t({ id: "survey.characterMapPane.search.ariaLabel", message: "Search the character map" })}
      />
      {!noBaseOrLanguage && hasKnownBlocks && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: TEXT_DIM,
            alignSelf: "flex-start",
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
          filteredGroups.map((group) => {
            const label = tierLabel(group.tier);
            // Rendering safety net for very large blocks (Hangul ~11k, Yi
            // ~1.1k) — cap what's drawn, not what's reachable (search above
            // narrows `group.cells` before this slice runs, and the U+XXXX
            // field reaches anything regardless of this cap).
            const visibleCells = group.cells.slice(0, maxCellsPerGroup);
            const hiddenCount = group.cells.length - visibleCells.length;
            const groupAriaLabel =
              label !== null
                ? t({
                    id: "survey.characterMapPane.group.ariaLabelWithTier",
                    message: `${{ block: group.block }} characters (${{ tier: label }})`,
                  })
                : t({
                    id: "survey.characterMapPane.group.ariaLabel",
                    message: `${{ block: group.block }} characters`,
                  });
            const key = groupKey(group);
            const gridId = groupGridId(key);
            // Search is ALWAYS whole-set (see the filteredGroups comment
            // above): while a query is active, `group.cells` here is already
            // the query-filtered survivors, so a hidden group must still
            // render them rather than showing the "N hidden" collapse note —
            // otherwise a match inside a hidden group would be invisible.
            // hiddenGroups itself is left untouched, so clearing the query
            // returns the group to its collapsed state.
            const hasActiveQuery = query.trim() !== "";
            const isHidden = !hasActiveQuery && hiddenGroups.has(key);
            const hideShowAriaLabel = isHidden
              ? t({
                  id: "survey.characterMapPane.group.showAction",
                  message: `Show ${{ block: group.block }}`,
                })
              : t({
                  id: "survey.characterMapPane.group.hideAction",
                  message: `Hide ${{ block: group.block }}`,
                });
            return (
              <section
                key={key}
                aria-label={groupAriaLabel}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 style={sectionHeading}>
                    {group.block}
                    {label !== null && (
                      <span style={{ fontWeight: 400, color: TEXT_DIM, fontSize: 11 }}>
                        {" "}
                        — {label}
                      </span>
                    )}
                  </h3>
                  {/* Per-group hide toggle — collapses ONLY this group's cell
                      grid in place; the group stays in `filteredGroups` and this
                      heading stays rendered either way (contrast with the
                      "blocks my keyboard uses" checkbox above, which drops
                      non-used groups from the data entirely). */}
                  <button
                    type="button"
                    onClick={() => handleToggleGroupHidden(group, !isHidden)}
                    aria-expanded={!isHidden}
                    aria-controls={gridId}
                    aria-label={hideShowAriaLabel}
                    style={{ ...secondaryButton, padding: "2px 10px", fontSize: 11, flexShrink: 0 }}
                  >
                    {isHidden ? (
                      <Trans id="survey.characterMapPane.group.showButton">Show</Trans>
                    ) : (
                      <Trans id="survey.characterMapPane.group.hideButton">Hide</Trans>
                    )}
                  </button>
                </div>
                {isHidden ? (
                  <div style={{ ...mutedNote, marginTop: 6 }}>
                    <Trans id="survey.characterMapPane.group.hiddenNote">
                      {group.cells.length} characters hidden.
                    </Trans>
                  </div>
                ) : (
                  <>
                    <div
                      id={gridId}
                      role="group"
                      aria-label={t({
                        id: "survey.characterMapPane.group.clickToToggleAriaLabel",
                        message: `${{ block: group.block }} characters — click to toggle`,
                      })}
                      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                    >
                      {visibleCells.map((cell) => {
                        const selected = chars.includes(cell.char.normalize("NFC"));
                        const cp = toUPlusNotation(cell.char);
                        const display = prefixCombiningMark(cell.char, cell.isCombiningMark);
                        const actionLabel = selected
                          ? t({ id: "survey.characterMapPane.cell.removeAction", message: "Remove" })
                          : t({ id: "survey.characterMapPane.cell.addAction", message: "Add" });
                        return (
                          <button
                            key={cell.char}
                            type="button"
                            onClick={() => handleToggle(cell)}
                            aria-pressed={selected}
                            aria-label={`${actionLabel} ${cell.char} (${cp})`}
                            style={charChip(selected)}
                          >
                            <span style={chipGlyph(selected, glyphFontStack)}>{display}</span>
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
                        <Trans id="survey.characterMapPane.group.hiddenCount">
                          Showing {visibleCells.length} of {group.cells.length} characters — use search
                          or "Add any character by code point" above to find a specific one.
                        </Trans>
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
