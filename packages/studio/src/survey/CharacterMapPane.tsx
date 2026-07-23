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

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { parseUPlusNotation, scriptSubtagOf, toUPlusNotation } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";
import { characterMapGroups, type CharacterMapGroup } from "../lib/services.ts";
import { isPrivateUseCodePoint, caseCounterpart } from "@keyboard-studio/engine";
import { isCombining, prefixCombiningMark } from "../lib/irToCarveNodes.ts";
import { ALL_FILTERS, matchesQuery, type SearchFilters } from "./characterSearch.ts";
import { TextField, Checkbox } from "../ui/index.ts";
import { TriangleIcon } from "../editors/assignLoop/parts/carveShared.tsx";
import { useGlyphFontStack } from "./useGlyphFontStack.ts";
import { useFontSupportChecker } from "./useFontSupportChecker.ts";
import {
  ACCENT,
  BG_PAGE,
  BORDER,
  ERROR_RED,
  TEXT_DIM,
  mutedNote,
  sectionHeading,
  charChip,
  chipGlyph,
  chipGlyphMissingBox,
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
// (the engine's General_Category Mn/Mc/Me test) rather than computing its own.
//
// Every listed character must render even when the selected Phase B font
// can't draw its glyph — rather than trusting the OS's inconsistent tofu
// (some systems draw a blank instead of a box), an unsupported glyph is
// swapped for a deterministic bordered box (chipGlyphMissingBox,
// surveyStyles.ts) via useFontSupportChecker (fontSupport.ts). The U+
// codepoint label always stays, regardless of glyph-vs-box.

// tierLabel is defined INSIDE CharacterMapPane (below), closing over the
// component's own `t` from useLingui() directly, rather than taking `t` as a
// parameter — the lingui macro transform tracks a specific variable BINDING
// (see @lingui/babel-plugin-lingui-macro's getBinding().referencePaths), so a
// `t` re-bound as a plain function parameter in a module-level helper is a
// distinct binding the extractor does not follow (confirmed empirically:
// editors/assignLoop/parts/Inspector.tsx's ruleDetailLabel/storeBlurb helpers
// used to take this shape and their ids did NOT appear in
// locales/en/messages.json even after extraction, until fixed to take an
// optional `i18n` and resolve via msg()/resolveMessage() instead — do not
// copy the broken bare-`t`-parameter shape here).

// Stable identity for a group — used as the React list key. Includes `script`
// because the multi-script grid can carry several groups that share a generic
// fallback block name (e.g. several scripts share the "Digits", "Punctuation",
// or "Combining marks" fallback labels; the letter fallback is script-qualified
// like "Latin letters"); without the script the key collides across scripts and
// React drops/merges same-key sections.
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

// ---------------------------------------------------------------------------
// Zoom — scales the rendered chip glyphs (and the chip cells around them) so
// characters are easier to distinguish/read. Threaded into charChip/chipGlyph/
// chipGlyphMissingBox/chipCodepoint via their `scale` parameter (surveyStyles.ts)
// rather than a CSS `transform: scale()` on the grid container, which would
// break the flex-wrap grid's reflow/overflow/scroll behavior. Synchronous UI
// state — no debounce timer (D3 scope guard: the studio's one 300ms cycle
// belongs to the validator/WASM oracle, not a viewing preference like this).
// ---------------------------------------------------------------------------

export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 2.5;
// Exported (alongside ZOOM_MIN/ZOOM_MAX/zoomPercent below) so tests derive
// expected boundary percentages/iteration counts from these constants rather
// than hardcoding them — see CharacterMapPane.test.tsx's zoom-control block.
export const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1;

/** Clamp a zoom factor into [ZOOM_MIN, ZOOM_MAX] — guards both +/- steps. */
function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/** Round-trip-safe percent label for a zoom factor (1 -> 100, 1.25 -> 125). */
export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

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
  const isGlyphSupported = useFontSupportChecker(glyphFontStack);

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [query, setQuery] = useState("");
  // "Search by:" field filters for the search box above — all-true by
  // default (search every field). Deliberately independent of `blocksOnly`
  // below: these narrow WHICH FIELDS a query matches against, not which
  // groups are in scope. See characterSearch.ts's SearchFilters doc comment
  // for the mode mapping.
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(ALL_FILTERS);
  // "Search filters" disclosure — the three checkboxes above live inside a
  // popover anchored to a trigger button right of the search box, closed by
  // default. Local open/closed state only; no timer of any kind (D3 scope
  // guard — same as the search filter itself).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersContainerRef = useRef<HTMLDivElement>(null);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
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
  // Zoom factor for the chip grid (glyph size, box fallback, and codepoint
  // label all scale proportionally — see the surveyStyles.ts `scale` params
  // above). Deliberately LEFT UNRESET across language/base changes (unlike
  // `query`/`hiddenGroups` below) — it's a viewing preference, not
  // language-specific data, so switching languages shouldn't discard it.
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  // Refs to the zoom −/+ buttons themselves — used ONLY so handleZoom can
  // shift focus to the OTHER (still-enabled) button when a click lands
  // exactly on a clamp bound and disables the button that was just clicked.
  // Without this, a disabled button drops focus to <body> in most browsers,
  // which is bad for keyboard/screen-reader users repeatedly zooming to an
  // edge (see the handleZoom comment below).
  const zoomOutButtonRef = useRef<HTMLButtonElement>(null);
  const zoomInButtonRef = useRef<HTMLButtonElement>(null);

  // Close the "Search filters" popover on outside-click (pointerdown outside
  // both the trigger and the panel — both live inside filtersContainerRef).
  // Only attached while open, same idiom as ui/SelectMenu.tsx's own
  // click-outside effect. Escape-close is handled inline (handleFiltersKeyDown
  // below) since it also needs to refocus the trigger, which a document
  // listener can't do symmetrically with the outside-click case.
  useEffect(() => {
    if (!filtersOpen) return;
    const handlePointerDown = (e: PointerEvent): void => {
      if (!filtersContainerRef.current?.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [filtersOpen]);

  function closeFiltersAndRefocusTrigger(): void {
    setFiltersOpen(false);
    filtersTriggerRef.current?.focus();
  }

  function handleFiltersKeyDown(e: KeyboardEvent): void {
    // Only handle Escape while the panel is open — otherwise a stray Escape on
    // the focused trigger would swallow its default action (e.g. dismissing a
    // parent overlay) for no visible effect.
    if (e.key === "Escape" && filtersOpen) {
      e.preventDefault();
      closeFiltersAndRefocusTrigger();
    }
  }

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
    setSearchFilters(ALL_FILTERS);
    setFiltersOpen(false);
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
    // Cased-script fold: drop uppercase letters that have a lowercase
    // counterpart, so the map offers only the lowercase of each pair (spec 047
    // refinement). The uppercase is still recorded on Done. usedByBase is
    // preserved; a group whose cells were all uppercase drops out.
    const cased = loadState.groups
      .map((g) => ({
        ...g,
        cells: g.cells.filter(
          (c) => caseCounterpart(c.char.normalize("NFC"), bcp47)?.direction !== "toLower",
        ),
      }))
      .filter((g) => g.cells.length > 0);
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
  }, [loadState, query, searchFilters, blocksOnly, hasKnownBlocks, chars, bcp47]);

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

  // Toggles one of the "Search by:" field filters — reuses the existing
  // announcement live region, same as handleToggleBlocksOnly, rather than
  // adding a second one.
  //
  // P0 FIX (reported regression: "the search bar does nothing"): matchesQuery
  // treats an all-false SearchFilters as a valid, deliberate "match nothing"
  // state (characterSearch.ts's documented WYSIWYG contract, unit-tested in
  // characterSearch.test.ts) — but reaching that state via these three
  // checkboxes gave NO indication that search was now fully disabled, so a
  // user unchecking all three (there is nothing that visually distinguishes
  // "0 fields selected" from any other combination) would see every
  // subsequent query return zero results, indistinguishable from the search
  // box being broken. Refuse the toggle when it would leave every field
  // unchecked, rather than silently landing in that state — the pure
  // predicate's own all-false contract is untouched (still reachable/tested
  // at the matchesQuery level), only the UI's affordance for reaching it is
  // removed.
  function handleToggleSearchFilter(field: keyof SearchFilters, next: boolean): void {
    if (!next) {
      const anyOtherFieldStillChecked = (Object.keys(searchFilters) as (keyof SearchFilters)[]).some(
        (key) => key !== field && searchFilters[key],
      );
      if (!anyOtherFieldStillChecked) {
        setAnnouncement(
          t({
            id: "survey.characterMapPane.searchFilter.announceAtLeastOne",
            message: "At least one search field must stay selected.",
          }),
        );
        return;
      }
    }
    setSearchFilters((prev) => ({ ...prev, [field]: next }));
    const fieldLabel =
      field === "character"
        ? t({ id: "survey.characterMapPane.searchFilter.character", message: "Character" })
        : field === "name"
          ? t({ id: "survey.characterMapPane.searchFilter.name", message: "Name" })
          : t({ id: "survey.characterMapPane.searchFilter.unicode", message: "Unicode value" });
    setAnnouncement(
      next
        ? t({
            id: "survey.characterMapPane.searchFilter.announceOn",
            message: `Now searching by ${{ field: fieldLabel }}`,
          })
        : t({
            id: "survey.characterMapPane.searchFilter.announceOff",
            message: `No longer searching by ${{ field: fieldLabel }}`,
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

  // Zoom the chip grid in/out one step, clamped to [ZOOM_MIN, ZOOM_MAX], and
  // announce the new level via the shared aria-live region (same pattern as
  // handleToggleBlocksOnly/handleToggleGroupHidden — never a second live
  // region). Computed directly from the current `zoom` (rather than the
  // `setZoom(prev => ...)` updater form) so the just-clicked-a-bound check
  // below can run synchronously in the same handler, right after `setZoom` —
  // the button that was clicked is disabled at the clamp (see the render
  // below), so this handler only ever fires here from an enabled button, and
  // React doesn't batch multiple clicks into one handler call.
  //
  // Clamp-boundary focus fix: when `next` lands exactly on ZOOM_MIN or
  // ZOOM_MAX, the button just clicked is about to become `disabled` on the
  // next render. A focused button that becomes disabled drops focus to
  // <body> in most browsers — bad for keyboard/screen-reader users who keep
  // pressing toward an edge. Shift focus to the OTHER zoom button (the one
  // that stays enabled) right here, before that re-render lands.
  function handleZoom(direction: 1 | -1): void {
    const next = clampZoom(zoom + direction * ZOOM_STEP);
    if (next === zoom) return;
    setZoom(next);
    setAnnouncement(
      t({
        id: "survey.characterMapPane.zoom.announceZoom",
        message: `Zoom ${{ percent: zoomPercent(next) }}%`,
      }),
    );
    if (next === ZOOM_MIN) {
      zoomInButtonRef.current?.focus();
    } else if (next === ZOOM_MAX) {
      zoomOutButtonRef.current?.focus();
    }
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
      {/* Search row: the query TextField grows to fill the row; the "Search
          filters" disclosure trigger sits to its right, collapsed by
          default. Reusing the style idiom of the raw-codepoint <form> row
          above (flex row, gap 8, aligned controls) rather than inventing a
          new one. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t({ id: "survey.characterMapPane.search.placeholder", message: "Search characters" })}
          aria-label={t({ id: "survey.characterMapPane.search.ariaLabel", message: "Search the character map" })}
          style={{ flex: 1 }}
        />
        <div ref={filtersContainerRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            ref={filtersTriggerRef}
            onClick={() => setFiltersOpen((prev) => !prev)}
            onKeyDown={handleFiltersKeyDown}
            aria-haspopup="true"
            aria-expanded={filtersOpen}
            aria-controls="char-map-search-filters-panel"
            aria-label={t({
              id: "survey.characterMapPane.searchFilter.trigger.ariaLabel",
              message: "Search filters",
            })}
            style={{ ...secondaryButton, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}
          >
            <Trans id="survey.characterMapPane.searchFilter.trigger">Search filters</Trans>
            <span aria-hidden="true">▾</span>
          </button>
          {filtersOpen && (
            <div
              id="char-map-search-filters-panel"
              role="group"
              aria-label={t({
                id: "survey.characterMapPane.searchFilter.label",
                message: "Search by:",
              })}
              onKeyDown={handleFiltersKeyDown}
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 20,
                marginTop: 4,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                whiteSpace: "nowrap",
                background: BG_PAGE,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
                fontSize: 12,
                color: TEXT_DIM,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                <Trans id="survey.characterMapPane.searchFilter.label">Search by:</Trans>
              </span>
              <label className="ks-hit-target" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Checkbox
                  checked={searchFilters.character}
                  onChange={(e) => handleToggleSearchFilter("character", e.target.checked)}
                  aria-label={t({
                    id: "survey.characterMapPane.searchFilter.character.ariaLabel",
                    message: "Search by character",
                  })}
                />
                <Trans id="survey.characterMapPane.searchFilter.character">Character</Trans>
              </label>
              <label className="ks-hit-target" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Checkbox
                  checked={searchFilters.name}
                  onChange={(e) => handleToggleSearchFilter("name", e.target.checked)}
                  aria-label={t({
                    id: "survey.characterMapPane.searchFilter.name.ariaLabel",
                    message: "Search by name",
                  })}
                />
                <Trans id="survey.characterMapPane.searchFilter.name">Name</Trans>
              </label>
              <label className="ks-hit-target" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Checkbox
                  checked={searchFilters.codepoint}
                  onChange={(e) => handleToggleSearchFilter("codepoint", e.target.checked)}
                  aria-label={t({
                    id: "survey.characterMapPane.searchFilter.unicode.ariaLabel",
                    message: "Search by Unicode value",
                  })}
                />
                <Trans id="survey.characterMapPane.searchFilter.unicode">Unicode value</Trans>
              </label>
            </div>
          )}
        </div>
      </div>
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
        {/* Zoom control — a fixed toolbar in the header area (stays put while
            the grid below scrolls). Scales the chip glyphs/cells via the
            `scale` param on charChip/chipGlyph/chipGlyphMissingBox/chipCodepoint
            (surveyStyles.ts) rather than a CSS transform on the scroll
            container, so the flex-wrap grid keeps reflowing correctly.
            `marginLeft: "auto"` pushes it to the right corner whether or not
            the checkbox above is rendered — do not rely on the row's
            `justify-content` for this, it would mis-center when the
            checkbox is absent. */}
        <div
          role="group"
          aria-label={t({ id: "survey.characterMapPane.zoom.groupAriaLabel", message: "Zoom the character map" })}
          style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}
        >
          <button
            ref={zoomOutButtonRef}
            type="button"
            onClick={() => handleZoom(-1)}
            disabled={zoom <= ZOOM_MIN}
            aria-label={t({ id: "survey.characterMapPane.zoom.zoomOut", message: "Zoom out" })}
            style={{
              ...secondaryButton,
              padding: "2px 10px",
              fontSize: 13,
              ...(zoom <= ZOOM_MIN ? { opacity: 0.4, cursor: "not-allowed" } : {}),
            }}
          >
            −
          </button>
          <span
            data-testid="char-map-zoom-level"
            style={{ fontSize: 12, color: TEXT_DIM, minWidth: 40, textAlign: "center" }}
          >
            <Trans id="survey.characterMapPane.zoom.level">{zoomPercent(zoom)}%</Trans>
          </span>
          <button
            ref={zoomInButtonRef}
            type="button"
            onClick={() => handleZoom(1)}
            disabled={zoom >= ZOOM_MAX}
            aria-label={t({ id: "survey.characterMapPane.zoom.zoomIn", message: "Zoom in" })}
            style={{
              ...secondaryButton,
              padding: "2px 10px",
              fontSize: 13,
              ...(zoom >= ZOOM_MAX ? { opacity: 0.4, cursor: "not-allowed" } : {}),
            }}
          >
            +
          </button>
        </div>
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
                  {/* flex: "0 0 auto" (no grow, no shrink) overrides the flex
                      default flex-shrink:1 — without it, when the block name
                      + tier label is too wide for the remaining row space,
                      Chrome/Firefox force this h3 to wrap onto two lines AND
                      expand to fill the row's full remaining width (the
                      "shrink-to-fit" fallback stops applying once wrapping
                      is needed), pushing the Hide/Show button far past the
                      end of the visible first line. Pinning the basis to the
                      heading's own content keeps it single-line-sized so the
                      button sits flush after it. */}
                  <h3 style={{ ...sectionHeading, flex: "0 0 auto" }}>
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
                    style={{
                      ...secondaryButton,
                      padding: "2px 8px",
                      fontSize: 11,
                      lineHeight: 1,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {/* Disclosure triangle — visual only, via the shared
                        TriangleIcon (editors/assignLoop/parts/carveShared.tsx),
                        the same module ChevronIcon lives in, following the
                        same rotate-on-toggle idiom. A plain SVG <path> with no
                        <title> adds no accessible text of its own, so the
                        button's accessible name stays entirely on aria-label
                        above. Pointing right (unrotated) = collapsed/hidden;
                        rotated 90deg to point down = open/visible. */}
                    <TriangleIcon open={!isHidden} size={11} />
                  </button>
                </div>
                {isHidden ? (
                  <div id={gridId} style={{ ...mutedNote, marginTop: 6 }}>
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
                        // Font-support box fallback (Requirement 1): every listed
                        // character must render, even ones the selected font
                        // can't draw — a deterministic bordered box stands in
                        // for the glyph rather than trusting the OS's own
                        // (inconsistent) missing-glyph rendering. The U+
                        // codepoint label below always renders regardless.
                        //
                        // Combining marks are EXCLUDED from the box path
                        // (cell.isCombiningMark gate below), never routed through
                        // isGlyphSupported at all. Root cause of the regression
                        // this guards against: a standalone combining mark has
                        // ~zero advance width of its own (that's how combining
                        // characters work — they don't move the cursor), so the
                        // Canvas measureText heuristic in fontSupport.ts ends up
                        // comparing the DOTTED-CIRCLE PREFIX's width against
                        // itself across font stacks (the mark contributes
                        // nothing to the measured width), which trivially
                        // matches a generic-family baseline and misclassifies
                        // the cell as "unsupported" even when the font can draw
                        // the mark fine. A standalone mark must always show the
                        // dotted circle, never a box.
                        const glyphRenders = cell.isCombiningMark || isGlyphSupported(display);
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
                            style={charChip(selected, zoom)}
                          >
                            {glyphRenders ? (
                              <span style={chipGlyph(selected, glyphFontStack, zoom)}>{display}</span>
                            ) : (
                              <span style={chipGlyphMissingBox(selected, zoom)} aria-hidden="true" />
                            )}
                            <span style={chipCodepoint(zoom)}>{cp}</span>
                            {/* Non-color selected indicator (colorblind-safe) — shared
                                helper with SuggestionChip's "[x]"/"+" pattern in
                                PhaseB.tsx (surveyStyles.ts's chipIndicator*). */}
                            <span style={chipIndicator(chipIndicatorColor(selected), zoom)}>
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
