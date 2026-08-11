// FindPanel — a find-BY-VALUE path to selection for the touch key grid
// (spec 058 T071; FR-020e, FR-020i). "Not spatial navigation alone": an
// author who knows *"the key that types `ɛ`"* or *"`T_0300`"* should not
// have to arrow to it across a layout that can run to several hundred keys
// over dozens of layers (FR-020e's own worked numbers).
//
// Three modes, all first-class (none is an afterthought — the task brief is
// explicit that the "no assigned output" filter, which IS the US2 worklist,
// gets the same standing as the other two):
//
//   1. **By id** — substring match on `TouchKeyIR.id`, e.g. "T_0300".
//   2. **By character** — reuses `enumerateTouchMethodsForChar` (already
//      exported by `@keyboard-studio/engine`) rather than re-deriving the
//      character -> key lookup, per FR-020e's own instruction.
//   3. **No assigned output** — the US2 worklist: every non-spacer key whose
//      `producedChars` is empty, across every platform/layer.
//
// ## Why this searches the WHOLE layout, not just the currently-shown layer
//
// FR-020e's worked example is explicitly cross-layer ("on a layout with
// several hundred keys across many layers, an author who knows... must not
// have to arrow to it"). `KeyGrid` only ever renders ONE (platform, layer)
// at a time (see `keyGridViewModel.ts`'s own module doc), so a find result
// may live on a DIFFERENT platform/layer than what is currently on screen.
// This component does not itself switch the grid's active platform/layer —
// see `onJumpToResult`'s own doc comment for why that composition is left to
// the caller.
//
// ## Result ordering respects direction (FR-020i) — by NOT re-sorting
//
// `KeyGrid.tsx`'s own module doc ("T066 RTL") establishes the load-bearing
// fact this component leans on: array order over `row.keys` IS reading
// order in BOTH directions, because the grid never reverses the DOM for
// RTL — only the CSS `dir` mirror flips the VISUAL position. Every result
// list below is built by walking `layout.platforms` -> `.layers` ->
// `.rows` -> `.keys` in plain array order (or, for the character-search
// path, by trusting `enumerateTouchMethodsForChar`'s own identical
// traversal) and is never re-sorted by any other key (not alphabetically,
// not by produced character) — so a caller viewing results for an RTL layer
// sees them in the SAME reading-order sequence the grid itself would render
// them in, without this component needing to know which layers are RTL at
// all. Re-sorting results by, say, keycap or "visual" position would be the
// bug FR-020i is naming — deliberately avoided here, see
// `FindPanelDirectionOrder.test.tsx` for the regression this guards.
//
// ## Seams left for later tasks
//
// - **Composition into TouchGallery.tsx is NOT this task's job.** Confirmed
//   by search before writing this file: `TouchGallery.tsx` does not yet
//   mount `KeyGrid`, `KeyInspector`, or this component. `onJumpToResult`'s
//   `FindPanelResult` carries `platform`/`layerId`/`keyId`/`address` so a
//   future composing task can switch the grid's active platform/layer (if
//   different from what's shown) and then select `address` there.
// - **Editing** (assigning a character to a "no output" result, renaming an
//   id) is Phase 6-8's job — this panel only jumps selection, never mutates
//   the layout.

import { useId, useMemo, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import {
  createKeyOccurrenceCounter,
  isSpacerKeyClass,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  enumerateTouchMethodsForChar,
  parseTouchKeyAddress,
  touchKeyAddress,
  type TouchMethodDescriptor,
} from "@keyboard-studio/engine";
import { RadioGroup, type RadioOption } from "../../../ui/RadioGroup.tsx";
import { codepointLabel } from "../../../survey/codepointLabel.ts";
import { BG_CARD, BG_PAGE, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { FONT_MONO } from "../../../ui/theme.ts";
import { buildKeyGridViewModel } from "./keyGridViewModel.ts";

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type FindPanelMode = "id" | "char" | "no-output";

export interface FindPanelResult {
  /**
   * The JUMPABLE cell's stable `touchKeyAddress` — always a MAIN key address
   * (never a sub-key/flick address a grid cell couldn't select), matching
   * `KeyGridCellViewModel.address` exactly so a caller can pass this
   * straight into `onSelectCell` once the right platform/layer is active.
   */
  readonly address: string;
  readonly platform: string;
  readonly layerId: string;
  readonly keyId: string;
  /** The host key's keycap, when it has one worth showing (see `hostLabel` below for why this can be empty). */
  readonly keycap: string;
  /**
   * Present only for a character-search match — carries `kind`/`direction`/
   * `deletable` etc. for a richer result row. Opaque to a caller that only
   * wants to jump; this component itself uses it to build the row's label.
   */
  readonly matchDetail?: TouchMethodDescriptor;
}

export interface FindPanelProps {
  /**
   * The EFFECTIVE (already overlay-folded) touch layout to search across —
   * ALL platforms/layers, not just whichever one `KeyGrid` currently shows.
   * See this file's module doc, "Why this searches the whole layout".
   */
  layout: TouchLayoutIR;
  /**
   * From `buildTouchKeyRuleIndex(ir)` (built once by the caller, not here) —
   * feeds the "no assigned output" mode's `producedChars` computation, via
   * `buildKeyGridViewModel` (reused per platform/layer, never re-derived).
   */
  ruleIndex: TouchKeyRuleIndex;
  /**
   * Fired when the author commits to a result (Enter, or a click). See this
   * file's module doc, "Seams left for later tasks", for why switching the
   * grid's active platform/layer is the CALLER's job, not this component's.
   */
  onJumpToResult: (result: FindPanelResult) => void;
  /** Localized panel accessible name override. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Per-mode result collection — each walks in plain array order (see this
// file's module doc, "Result ordering respects direction")
// ---------------------------------------------------------------------------

function hostAddressOf(descriptor: TouchMethodDescriptor): string {
  if (descriptor.kind === "tap") return descriptor.id;
  // A longpress/multitap/flick descriptor's `id` is a SUB-entry address
  // (`touchSubKeyAddress`/`touchFlickAddress`) — not something a grid cell
  // can select directly. Its HOST key's address is what `KeyGrid` can jump
  // to; `parseTouchKeyAddress` + `touchKeyAddress` (both already-exported,
  // already-stable — never re-derived here) recover it.
  const parts = parseTouchKeyAddress(descriptor.id);
  if (parts === undefined) return descriptor.id; // defensive; never expected for a well-formed descriptor
  return touchKeyAddress(parts.platform, parts.layerId, parts.keyId, parts.occurrence);
}

/** Substring match (case-insensitive) on every main key's `id`, across every platform/layer. */
function collectIdResults(layout: TouchLayoutIR, query: string): FindPanelResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];
  const out: FindPanelResult[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      // Occurrence-aware, so a hit on the ninth `T_BLANK` jumps to the ninth
      // rather than to the first.
      const nextOccurrence = createKeyOccurrenceCounter();
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const address = touchKeyAddress(platform.id, layer.id, key.id, nextOccurrence(key.id));
          if (!key.id.toLowerCase().includes(needle)) continue;
          out.push({
            address,
            platform: platform.id,
            layerId: layer.id,
            keyId: key.id,
            keycap: key.text ?? "",
          });
        }
      }
    }
  }
  return out;
}

/** Reuses `enumerateTouchMethodsForChar` (FR-020e's own instruction) rather than re-deriving the character -> key lookup. */
function collectCharResults(layout: TouchLayoutIR, query: string): FindPanelResult[] {
  const char = query.trim();
  if (char.length === 0) return [];
  return enumerateTouchMethodsForChar(layout, char).map((descriptor) => {
    const parts = parseTouchKeyAddress(descriptor.id);
    return {
      address: hostAddressOf(descriptor),
      platform: descriptor.platform,
      layerId: descriptor.layer,
      keyId: parts?.keyId ?? descriptor.id,
      keycap: descriptor.host ?? "",
      matchDetail: descriptor,
    };
  });
}

/**
 * The US2 worklist: every non-spacer key across every platform/layer whose
 * `producedChars` is empty. Reuses `buildKeyGridViewModel` per (platform,
 * layer) pair rather than re-deriving `producedChars`'s own decode/rule-join
 * logic (`keyGridViewModel.ts` owns that; this only calls its public API).
 */
function collectNoOutputResults(
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
): FindPanelResult[] {
  const out: FindPanelResult[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const vm = buildKeyGridViewModel({
        layout,
        ruleIndex,
        platform: platform.id,
        layerId: layer.id,
      });
      if (vm === undefined) continue;
      for (const row of vm.rows) {
        for (const cell of row.keys) {
          if (isSpacerKeyClass(cell.sp)) continue;
          if (cell.producedChars.length > 0) continue;
          out.push({
            address: cell.address,
            platform: platform.id,
            layerId: layer.id,
            keyId: cell.id,
            keycap: cell.keycap,
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export function FindPanel({ layout, ruleIndex, onJumpToResult, label }: FindPanelProps) {
  const { t } = useLingui();
  const uid = useId();
  const [mode, setMode] = useState<FindPanelMode>("id");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const modeOptions: RadioOption[] = [
    {
      value: "id",
      label: t({ id: "editor.assignLoop.keyGrid.findPanel.modeId", message: "By key id" }),
    },
    {
      value: "char",
      label: t({ id: "editor.assignLoop.keyGrid.findPanel.modeChar", message: "By character" }),
    },
    {
      value: "no-output",
      label: t({
        id: "editor.assignLoop.keyGrid.findPanel.modeNoOutput",
        message: "Keys with no output",
      }),
    },
  ];

  const results = useMemo(() => {
    if (mode === "id") return collectIdResults(layout, query);
    if (mode === "char") return collectCharResults(layout, query);
    return collectNoOutputResults(layout, ruleIndex);
  }, [mode, query, layout, ruleIndex]);

  const safeActiveIndex = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1);

  function changeMode(next: string): void {
    setMode(next as FindPanelMode);
    setQuery("");
    setActiveIndex(0);
  }

  function commit(result: FindPanelResult): void {
    onJumpToResult(result);
  }

  /** Shared ArrowUp/Down/Home/End/Enter handling — used by BOTH the query input (id/char modes) and the results listbox itself (no-output mode, which has no input). */
  function handleResultsKeyDown(event: ReactKeyboardEvent): void {
    // Never hijack IME candidate confirmation (mirrors BaseKeyboardPicker.tsx's own guard).
    if (event.nativeEvent.isComposing) return;
    if (results.length === 0 && event.key !== "Enter") return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(results.length - 1);
        break;
      case "Enter": {
        const result = safeActiveIndex >= 0 ? results[safeActiveIndex] : undefined;
        if (result !== undefined) {
          event.preventDefault();
          commit(result);
        }
        break;
      }
      default:
        break;
    }
  }

  const listboxId = `${uid}-listbox`;
  const activeOptionId =
    safeActiveIndex >= 0 ? `${uid}-option-${safeActiveIndex}` : undefined;
  const panelLabel =
    label ?? t({ id: "editor.assignLoop.keyGrid.findPanel.ariaLabel", message: "Find a key" });
  const inputId = `${uid}-query`;

  return (
    <div
      role="search"
      aria-label={panelLabel}
      data-testid="find-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: FONT,
      }}
    >
      <RadioGroup
        name={`${uid}-mode`}
        value={mode}
        options={modeOptions}
        onChange={changeMode}
      />

      {mode !== "no-output" && (
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-label={
            mode === "id"
              ? t({
                  id: "editor.assignLoop.keyGrid.findPanel.idInputLabel",
                  message: "Find by key id",
                })
              : t({
                  id: "editor.assignLoop.keyGrid.findPanel.charInputLabel",
                  message: "Find by character",
                })
          }
          autoComplete="off"
          placeholder={
            mode === "id"
              ? t({
                  id: "editor.assignLoop.keyGrid.findPanel.idInputPlaceholder",
                  message: "e.g. T_0300",
                })
              : t({
                  id: "editor.assignLoop.keyGrid.findPanel.charInputPlaceholder",
                  message: "Type a character, e.g. ɛ",
                })
          }
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleResultsKeyDown}
          style={{
            background: BG_PAGE,
            color: TEXT_MAIN,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
            fontFamily: FONT,
            outline: "none",
          }}
        />
      )}

      {/* APG listbox pattern: for the no-output mode (no input to host aria-activedescendant navigation) the listbox itself is the focusable, arrow-navigable surface, matching ui/SelectMenu.tsx's own portalled <ul role="listbox" tabIndex={-1}> precedent (focusable container, not a Tab stop of its own — reached via Tab from whatever precedes it in this panel). For id/char mode the query input above already hosts the same navigation, so this list is not independently focusable there (no tabIndex), matching BaseKeyboardPicker.tsx's combobox+popup-listbox precedent. */}
      <ul
        id={listboxId}
        role="listbox"
        aria-label={t({
          id: "editor.assignLoop.keyGrid.findPanel.resultsAriaLabel",
          message: "Search results",
        })}
        tabIndex={mode === "no-output" ? 0 : undefined}
        onKeyDown={mode === "no-output" ? handleResultsKeyDown : undefined}
        data-testid="find-panel-results"
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          maxHeight: 220,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {results.map((result, i) => {
          const isActive = i === safeActiveIndex;
          return (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- APG listbox pattern: keyboard selection happens on the input/listbox (handleResultsKeyDown), never on the individual option; onClick is the redundant pointer affordance (same precedent as BaseKeyboardPicker.tsx / ui/SelectMenu.tsx)
            <li
              key={result.address + (result.matchDetail?.id ?? "")}
              id={`${uid}-option-${i}`}
              role="option"
              aria-selected={isActive}
              data-testid={`find-panel-result-${i}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(result)}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "6px 8px",
                borderRadius: 4,
                cursor: "pointer",
                background: isActive ? "#0d2840" : "transparent",
                border: `1px solid ${isActive ? ACCENT : "transparent"}`,
              }}
            >
              <ResultLabel result={result} mode={mode} />
            </li>
          );
        })}
      </ul>

      {/* Visually-hidden live region for result count — mirrors BaseKeyboardPicker.tsx's own combobox convention. */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
        }}
      >
        {t({
          id: "editor.assignLoop.keyGrid.findPanel.liveRegion.resultCount",
          message: plural(results.length, {
            one: "# result found.",
            other: "# results found.",
          }),
        })}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-result label
// ---------------------------------------------------------------------------

/** Localized where the host key's kind/direction/layer wording is opaque data from `matchDetail` — no English prose crosses the engine boundary, only structured fields (kind/direction/platform/layer), matching `enumerateTouchMethodsForChar`'s own doc comment. */
function ResultLabel({ result, mode }: { result: FindPanelResult; mode: FindPanelMode }) {
  const { t } = useLingui();

  const keycapLabel =
    result.keycap.length > 0
      ? `${result.keycap} (${codepointLabel(result.keycap).title})`
      : t({ id: "editor.assignLoop.keyGrid.findPanel.result.noKeycap", message: "(no keycap)" });

  const kindLabel = (() => {
    const detail = result.matchDetail;
    if (detail === undefined) return undefined;
    switch (detail.kind) {
      case "tap":
        return t({ id: "editor.assignLoop.keyGrid.findPanel.result.kindTap", message: "main key" });
      case "longpress":
        return t({
          id: "editor.assignLoop.keyGrid.findPanel.result.kindLongpress",
          message: "longpress",
        });
      case "multitap":
        return t({
          id: "editor.assignLoop.keyGrid.findPanel.result.kindMultitap",
          message: "multitap",
        });
      case "flick":
        return t({
          id: "editor.assignLoop.keyGrid.findPanel.result.kindFlick",
          message: `flick ${{ direction: detail.direction ?? "" }}`,
        });
      default:
        return undefined;
    }
  })();

  return (
    <>
      <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: TEXT_MAIN }}>{keycapLabel}</span>
      <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: FONT }}>
        {mode === "no-output"
          ? t({
              id: "editor.assignLoop.keyGrid.findPanel.result.noOutputSummary",
              message: `${{ id: result.keyId }} — ${{ layer: result.layerId }} layer — no output`,
            })
          : kindLabel !== undefined
            ? t({
                id: "editor.assignLoop.keyGrid.findPanel.result.charSummary",
                message: `${{ id: result.keyId }} — ${{ kind: kindLabel }} — ${{ layer: result.layerId }} layer`,
              })
            : t({
                id: "editor.assignLoop.keyGrid.findPanel.result.idSummary",
                message: `${{ id: result.keyId }} — ${{ layer: result.layerId }} layer`,
              })}
      </span>
    </>
  );
}
