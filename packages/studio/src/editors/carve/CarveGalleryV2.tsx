// CarveGalleryV2 — character-first carve gallery, rendered by carveAdapter.tsx.
// It replaced the former rule/node "Rail" view (v1), which has been removed.
//
// Shows every character the keyboard can type in one panel; the author
// discards CHARACTERS, not rules. Toggling a character resolves its
// contributors (irToCharacterView.ts, built on collectCharContributors) and
// cascades through the shared workingCopyStore actions
// (cascadeDelete/cascadeRestore) — no gallery-specific write path.

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Trans, useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore, bulkDispositionDefault } from '../../stores/workingCopyStore.ts';
import { recommendedRemovalChars, displayChar, isSparseLatinOverlayTarget } from '../../lib/irToCarveNodes.ts';
import type { CarveDispositionProvenance, CarveDispositionValue } from '@keyboard-studio/contracts';
import type { RecommendedRemovalChar } from '../../lib/irToCarveNodes.ts';
import {
  irToCharacterView, groupCharacterCells, characterCellIds, characterCellIsToggleable,
  characterDisplayName, SOURCE_DETAIL_LABEL, classifyCharacterCategory,
} from '../../lib/irToCharacterView.ts';
import type { CharacterCell, CharacterGroup } from '../../lib/irToCharacterView.ts';
import { codepointLabel } from '../../survey/codepointLabel.ts';
import type { CharContributors } from '@keyboard-studio/engine';
import { KeySeq } from '../assignLoop/parts/KeySeq.tsx';
import { DiscardIcon, ChevronIcon } from '../assignLoop/parts/carveShared.tsx';
import { RemovedDropdown } from '../assignLoop/parts/StatusBar.tsx';
import type { RemovedItem } from '../assignLoop/parts/StatusBar.tsx';
import { useCarveNeededSet } from '../../hooks/useCarveNeededSet.ts';
import { usePublishStepNav } from '../../hooks/usePublishStepNav.ts';
import { LayoutFamilyQuestion } from './LayoutFamilyQuestion.tsx';
import { ReviewRemovedKeysDialog, resolveCarvedCombos } from './ReviewRemovedKeys.tsx';
import { DISPOSITION_COPY } from "./carveDispositionCopy.ts";
import { CarvedHostConsequences } from "./CarvedHostConsequences.tsx";

interface CarveGalleryV2Props {
  onComplete: () => void;
  onBack?: (() => void) | undefined;
}

type GroupBy = 'category' | 'source';

/** Names the scrollable character-details region (see the aside below). */
const DETAILS_HEADING_ID = 'carve-details-heading';

const GROUP_HINTS: Record<string, string> = {
  'basic-letter': 'Plain A-Z letters, typed directly.',
  'special-letter': 'Extra letters for this script, often reached via AltGr or a special layer.',
  'accented-letter': 'Letters built from a base letter plus a diacritic mark.',
  digit: 'Numbers and numerals.',
  'punctuation-symbol': 'Punctuation, currency, and other symbols.',
  'direct-key': 'Typed with a single key press.',
  'deadkey-sequence': 'Typed by pressing a dead key, then a base letter.',
  store: 'Lives in an internal list rather than a single key.',
  'advanced-rule': 'Produced by an advanced rule kept verbatim — the keystroke can\'t be shown.',
  // spec §8 / #1606. These characters ARE produced, and are still discardable
  // like any other rule-backed character — the set exists so they are not
  // filed under "typed with a single key press" when no desktop key types
  // them at all.
  'touch-only-key': 'Typed only from the on-screen touch keyboard — no desktop key produces it.',
};

// Decorative category-distinguishing dots — no --app-* semantic token exists
// for these hues (they aren't status colors); mapped to the nearest SIL brand
// tint (epic #533). Mirrors KindBadge.tsx's KIND_COLOR palette family.
const GROUP_DOT: Record<string, string> = {
  'basic-letter': 'var(--app-accent)',
  'special-letter': 'var(--sil-orange)',
  'accented-letter': 'var(--sil-violet)',
  digit: 'var(--sil-light-blue)',
  'punctuation-symbol': 'var(--app-text-subtle)',
  'direct-key': 'var(--app-accent)',
  'deadkey-sequence': 'var(--sil-violet)',
  store: 'var(--sil-orange)',
  'advanced-rule': 'var(--app-text-subtle)',
  'touch-only-key': 'var(--sil-light-blue)',
  'blocked-candidate': 'var(--app-text-subtle)',
};

// Code-point notation comes from the sanctioned `survey/codepointLabel.ts`
// helper rather than a local `codePointAt(0)` read: a base-plus-mark character
// that has no precomposed form stays multi-code-point through NFC, and naming
// only the first would label a blocked Devanagari consonant-plus-matra
// identically to the bare consonant. `.title` is the full space-separated
// stack; `base`/`extras` are the compact chip split.

// A block-candidate row (reason: 'blocked-combination') names a character
// that is, by definition, never actually produced — that's what "blocked"
// means — so it has no entry in cellsByCh (built from the IR's REAL
// producers, irToCharacterView.ts). Synthesizing a minimal cell from the
// row itself is what makes such a recommendation visible, hoverable, and
// actionable at all; `ch` is re-normalized to NFC here to match every other
// CharacterCell.ch producer's contract (irToCharacterView.ts), since a row's
// `ch` may still be in `carveNormalizationForm` (NFD on base-plus-mark
// keyboards).
function synthesizeFallbackCell(ch: string, contributors: CharContributors): CharacterCell {
  const normalized = ch.normalize('NFC');
  return {
    ch: normalized,
    keys: [],
    waysToType: [],
    category: classifyCharacterCategory(normalized),
    // Not 'advanced-rule'. This character is never produced at all, so
    // borrowing that source would tell the author "Produced by an advanced
    // rule kept verbatim" about a combination the keyboard specifically
    // blocks — a false statement on the one row this fallback exists to show.
    source: 'blocked-candidate',
    inAlpha: false,
    reco: true,
    contributors,
  };
}

/** True when every contributor id for this cell is currently deleted (or the cell has no toggleable ids at all — never "discarded", always kept). */
function isCellDiscarded(cell: CharacterCell, isItemDeleted: (id: string) => boolean): boolean {
  const ids = characterCellIds(cell);
  if (ids.length === 0) return false;
  return ids.every((id) => isItemDeleted(id));
}

// ---------------------------------------------------------------------------
// Suggested-to-discard groups (§7.2 handoff option 1b) — recommendedRemovalChars()
// rows rendered as the first group(s) of the gallery instead of a standing
// banner. A RecommendedRemovalChar row's `contributors` is ALREADY the
// case-group-merged set (see recommendedRemovalChars's doc — a folded
// case-pair row's contributors cascade BOTH members), which is why these
// cards toggle off `row.contributors` rather than the plain per-character
// CharacterCell.contributors a normal grid cell toggles off of — using the
// row keeps a paired proposal ("c"/"C") a single atomic discard/restore
// action, matching the recommender's own semantics.
// ---------------------------------------------------------------------------

function recommendedRowIds(row: RecommendedRemovalChar): string[] {
  return [...row.contributors.ruleNodeIds, ...row.contributors.storeSlotIds];
}

/** Mirrors isCellDiscarded, but over a recommendation row's (possibly case-group-merged) ids. */
function isRowDiscarded(row: RecommendedRemovalChar, isItemDeleted: (id: string) => boolean): boolean {
  const ids = recommendedRowIds(row);
  if (ids.length === 0) return false;
  return ids.every((id) => isItemDeleted(id));
}

type CellFlag = 'discarded' | 'suggested' | 'yours' | null;

interface CharacterCellButtonProps {
  cell: CharacterCell;
  discarded: boolean;
  isSelected: boolean;
  flag: CellFlag;
  onSelect: () => void;
  onToggle: () => void;
}

/**
 * THE single character-cell renderer (#1399 report / this task's handoff) —
 * shared by the normal grouped grid AND the suggested-to-discard groups
 * above it, so a character never looks different depending on which group
 * it's drawn from. Discard state is communicated with opacity ALONE, never
 * opacity plus a text recolor (see this task's styling constraints).
 *
 * Deliberately glyph + codepoint only — no keystroke sequence. That lives in
 * the details rail ("How it's typed") for the hovered/selected cell; drawing
 * it under every glyph duplicated the rail and, because sequences differ in
 * length, gave the grid ragged, uneven cells.
 */
function CharacterCellButton({ cell, discarded, isSelected, flag, onSelect, onToggle }: CharacterCellButtonProps) {
  return (
    <button
      type="button"
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onToggle}
      aria-pressed={discarded}
      aria-label={`${displayChar(cell.ch)} — ${codepointLabel(cell.ch).title}${discarded ? ', discarded' : ''}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '10px 4px 8px', borderRadius: 8, cursor: 'pointer',
        background: isSelected ? 'var(--app-accent-subtle)' : (discarded ? 'var(--app-surface-2)' : 'var(--app-surface)'),
        border: `1px solid ${isSelected ? 'var(--app-accent)' : 'var(--app-border)'}`,
      }}
    >
      {/* Opacity moved OFF the button and onto the glyph alone (was on the
          whole button, epic #533 axe gate). Whole-button opacity blends BOTH
          the codepoint text and its own cell background toward the same page
          background, which converges them toward each other — the two
          similar near-white/near-navy tones lose their differentiation from
          one another regardless of the opacity value chosen, so no number
          fixes it (measured: text-vs-cell-background contrast stays ~2.1-2.7
          at every opacity from .55 to .7). The glyph is the one element where
          "fading toward invisible" is the correct signal; the codepoint is
          the one WCAG guidance elsewhere in this app (docs/accessibility.md)
          says must stay a legible, reliable identifier even when the glyph
          itself has no font coverage — it should never be the thing that
          fades. */}
      <span style={{ font: "400 22px/1 var(--app-font-glyph)", color: 'var(--app-text)', opacity: discarded ? 0.55 : 1 }}>
        {displayChar(cell.ch)}
      </span>
      {/* --app-text-muted, not --app-text-subtle. Subtle measures only 4.51:1
          on navy against this cell's OWN background (--app-surface) — passing
          by a margin too thin to trust — and drops further on the discarded
          cell's --app-surface-2. Muted clears 5.38-7.24:1 across every
          theme/background combination this cell can render. No opacity here:
          per the comment above, this text must stay legible in the discarded
          state, not fade with the glyph. */}
      {/* base + "[+marks]" rather than the full stack: a multi-code-point
          character would otherwise widen this 9.5px chip past its grid cell.
          The complete notation stays reachable on hover (title) and in the
          button's aria-label above. Mirrors PhaseB's CpLabel. */}
      <span
        style={{ fontSize: 9.5, fontFamily: 'var(--app-font-mono)', color: 'var(--app-text-muted)' }}
        title={codepointLabel(cell.ch).title}
      >
        {codepointLabel(cell.ch).base}
        {codepointLabel(cell.ch).extras !== '' && (
          <span style={{ color: 'var(--app-accent-text)', fontWeight: 700 }}>
            {`[+${codepointLabel(cell.ch).extras}]`}
          </span>
        )}
      </span>
      {/* No keystroke sequence here on purpose. The details rail already shows
          "How it's typed" for the hovered/selected cell, so repeating it under
          every glyph was redundant — and because sequences vary in length
          (one key vs. "acute then a"), it made the cells ragged and uneven.
          The codepoint above stays: it is fixed-width and identifies the
          character even when the glyph has no font coverage. `cell.keys` is
          still searchable (see the filter below). */}
      {flag !== null && (
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
          // Semantic -text tokens, not raw brand ramp values. At 8.5px this is
          // normal-size text needing 4.5:1, and the raw values fail on light:
          //   --sil-green #509E2F on a white cell -> 3.35:1
          // The -text variants exist for exactly this (they resolve to the
          // -dark shade on light and the -60 tint on navy).
          // "discarded" uses --app-text-muted, not --app-text-subtle: subtle
          // measures only 3.88:1 on navy against this cell's --app-surface-2
          // background (this label only ever renders on an already-discarded,
          // surface-2 cell) — a real failure, not a thin-margin pass. Muted
          // clears every theme/background combination this cell can render.
          color:
            flag === 'discarded'
              ? 'var(--app-text-muted)'
              : flag === 'suggested'
                ? 'var(--app-warning-text)'
                : 'var(--app-success-text)',
        }}>
          {flag}
        </span>
      )}
    </button>
  );
}

interface RecommendedGroupCardProps {
  testId: string;
  toggleAllTestId: string;
  regionAriaLabel: string;
  topBorderColor: string;
  chipBackground: string;
  chipColor: string;
  heading: ReactNode;
  body: ReactNode;
  rows: RecommendedRemovalChar[];
  cellsByCh: ReadonlyMap<string, CharacterCell>;
  isItemDeleted: (id: string) => boolean;
  onToggleRow: (row: RecommendedRemovalChar) => void;
  onBulkToggle: (discard: boolean) => void;
  discardAllLabel: (count: number) => string;
  restoreAllLabel: string;
  selectedCh: string | undefined;
  onSelectCh: (ch: string) => void;
  /** Renders a leading disclosure control (chevron) wrapping heading+chip+count as one toggle button — used by the secondary (optional Latin) card only. */
  collapsible?: { open: boolean; onToggleOpen: () => void } | undefined;
  /**
   * Renders the header bulk-toggle button as a red destructive action while it
   * still reads "Discard all N" — used by the primary "Suggested to discard"
   * card only (the secondary, optional "Latin alphabet" card keeps the neutral
   * treatment: removing Latin is not the destructive default the way the
   * suggested-discard set is). Once everything is discarded and the button
   * flips to "Restore all", that state is NEVER red — restoring is not a
   * destructive action — and falls back to the same neutral surface treatment
   * regardless of this flag.
   */
  destructiveBulkButton?: boolean;
  /**
   * 076 FR-022 (T016): the FR-005 `sparseLatinOverlay` input for disposition
   * pre-fill — forwarded to each row's DispositionControl so the bulk-default
   * preview matches what the store's pre-fill writes.
   */
  sparseLatinOverlay: boolean;
  /**
   * Rule nodeIds whose rules carry deadkey context. The ruling forbids host
   * fallback for deadkey carves ("deadkey carves never fall through"), so
   * rows touching these combos offer no Allow option (see DispositionControl)
   * and pre-fill to `block` with `deadkey-requirement` provenance.
   */
  deadkeyComboIds: ReadonlySet<string>;
}

/**
 * One "first group of the gallery" card (design handoff option 1b) — pinned
 * above the normal grouped grid, rendering the SAME CharacterCellButton the
 * grid below uses. Two instances mount side by side in the tree (never
 * merged into one): the primary "Suggested to discard" group, and the
 * secondary, optional "Latin alphabet (optional)" group for
 * `reason: 'cross-script-latin'` rows (post-#526 split, inherited from the v1
 * gallery's removal banner, this card's predecessor).
 */
function RecommendedGroupCard({
  testId, toggleAllTestId, regionAriaLabel, topBorderColor, chipBackground, chipColor, heading, body,
  rows, cellsByCh, isItemDeleted, onToggleRow, onBulkToggle, discardAllLabel, restoreAllLabel,
  selectedCh, onSelectCh, collapsible, destructiveBulkButton, sparseLatinOverlay, deadkeyComboIds,
}: RecommendedGroupCardProps) {
  if (rows.length === 0) return null;
  const allDiscarded = rows.every((r) => isRowDiscarded(r, isItemDeleted));
  const bulkLabel = allDiscarded ? restoreAllLabel : discardAllLabel(rows.length);
  const showBody = collapsible === undefined || collapsible.open;
  // Red destructive fill only while offering to DISCARD (never while offering
  // to RESTORE — restoring is not a destructive action, so it always gets the
  // neutral surface treatment below, regardless of destructiveBulkButton).
  const bulkButtonStyle = destructiveBulkButton === true && !allDiscarded
    ? {
        font: '600 12.5px var(--app-font)', cursor: 'pointer',
        // NOT --app-text-on-accent: that token flips per theme to pair with
        // --app-accent (dark text on navy's light-blue accent, white text on
        // light's dark-blue accent) — --sil-red-dark is a fixed dark red in
        // BOTH themes (brand.css has no navy override for it), so pairing it
        // with the flipping token gives navy theme dark-on-dark (#18243f on
        // #a6121f, 2:1) while looking fine in light theme, which is exactly
        // how this shipped unnoticed. White is correct against this fixed
        // dark fill in either theme.
        color: 'var(--sil-white)', background: 'var(--sil-red-dark)',
        border: 'none', borderRadius: 8, padding: '9px 16px',
      }
    : destructiveBulkButton === true
      ? {
          font: '600 12.5px var(--app-font)', cursor: 'pointer',
          color: 'var(--app-text-muted)', background: 'var(--app-surface-2)',
          border: 'none', borderRadius: 8, padding: '9px 16px',
        }
      : {
          font: '600 12.5px var(--app-font)', cursor: 'pointer',
          color: 'var(--app-accent-text)', background: 'transparent',
          border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '6px 12px',
        };

  const chip = (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: chipBackground, color: chipColor,
      }}
    >
      <DiscardIcon size={14} />
    </span>
  );

  const headingRow = collapsible === undefined
    ? (
      <>
        {chip}
        <span style={{ font: '600 14px var(--app-font)', color: 'var(--app-text)' }}>{heading}</span>
        <span style={{ fontSize: 12, color: 'var(--app-text-subtle)' }}>({rows.length})</span>
      </>
    )
    : (
      <button
        type="button"
        onClick={collapsible.onToggleOpen}
        aria-expanded={collapsible.open}
        aria-controls={`${testId}-body`}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          font: '600 14px var(--app-font)', color: 'var(--app-text)',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <span style={{ display: 'inline-flex', flexShrink: 0 }}><ChevronIcon open={collapsible.open} size={13} /></span>
        {chip}
        <span>{heading}</span>
        <span style={{ fontSize: 12, color: 'var(--app-text-subtle)', fontWeight: 600 }}>({rows.length})</span>
      </button>
    );

  return (
    <div
      data-testid={testId}
      role="region"
      aria-label={regionAriaLabel}
      style={{
        border: '1px solid var(--app-border)',
        borderTop: `3px solid ${topBorderColor}`,
        background: 'var(--app-surface)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 26,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {headingRow}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          data-testid={toggleAllTestId}
          onClick={() => onBulkToggle(!allDiscarded)}
          style={bulkButtonStyle}
        >
          {bulkLabel}
        </button>
      </div>

      {showBody && (
        <>
          <p style={{ margin: '10px 0 12px', fontSize: 12.5, color: 'var(--app-text-muted)', maxWidth: 640, lineHeight: 1.5 }}>
            {body}
          </p>
          <div id={`${testId}-body`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8 }}>
            {rows.map((row) => {
              // cellsByCh is pre-augmented (see its useMemo below) with a
              // synthesizeFallbackCell entry for every recommended row absent
              // from the IR's real producers, so this get() always resolves —
              // the ?? fallback here is belt-and-suspenders, not the fix.
              const cell = cellsByCh.get(row.ch.normalize('NFC')) ?? synthesizeFallbackCell(row.ch, row.contributors);
              const discarded = isRowDiscarded(row, isItemDeleted);
              return (
                <div key={row.ch} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <CharacterCellButton
                    cell={cell}
                    discarded={discarded}
                    isSelected={selectedCh === cell.ch}
                    flag={discarded ? 'discarded' : 'suggested'}
                    onSelect={() => onSelectCh(cell.ch)}
                    onToggle={() => onToggleRow(row)}
                  />
                  {/* 076 FR-022 (T016): per-row allow/block disposition, always
                      visible — never silent. Structurally separate from the
                      gallery-level layout_family question (T025) above. */}
                  <DispositionControl comboIds={recommendedRowIds(row)} sparseLatinOverlay={sparseLatinOverlay} deadkeyComboIds={deadkeyComboIds} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-row Allow/Block disposition control (076 FR-022, issue #1802 T016,
// amendments A1/A2).
//
// Every recommended (carve-candidate) row visibly exposes the allow/block
// choice — the two-tier choice architecture's per-carve tier (the
// closed-keyboard card is the bulk tier). The control reads the row's
// dispositions from the working-copy store — pre-filled from the
// closed-keyboard card / FR-005 proposal with provenance, never re-prompted
// on recompile — and flips them in place; the store stamps `author-override`
// provenance on flips.
//
// A row's contributors (rule nodeIds + store slot ids) are disposed as one
// atomic unit: the row is already the atomic discard/restore unit (see
// toggleRecommendedRow), so the disposition follows the same granularity.
// Pre-fill and flips both write the full id set together, which is why mixed
// per-combo values cannot arise through this UI; if they ever do (an
// external write), the control falls back to the bulk-default display.
// ---------------------------------------------------------------------------

/**
 * A1 required copy — symmetric risk statements, one per option. Each option
 * states its OWN risk; the retired one-sided allow/block slogan (the version
 * that framed Allow as unpredictable and Block as predictable) must never
 * appear — a T016 test asserts its absence from the rendered gallery and
 * this block. Defined in ./carveDispositionCopy.ts and re-exported here so
 * existing imports keep working; T019's expanded row imports it from there.
 */
export { DISPOSITION_COPY } from "./carveDispositionCopy.ts";

function DispositionControl({ comboIds, sparseLatinOverlay, deadkeyComboIds }: { comboIds: string[]; sparseLatinOverlay: boolean; deadkeyComboIds: ReadonlySet<string> }) {
  const carveDispositions = useWorkingCopyStore((s) => s.carveDispositions);
  const closedKeyboardCard = useWorkingCopyStore((s) => s.closedKeyboardCard);
  const setCarveDisposition = useWorkingCopyStore((s) => s.setCarveDisposition);

  // Ruling (A1–A3): deadkey carves never fall through. A row whose carved
  // combinations include a deadkey-context rule offers NO Allow option — the
  // choice is not the author's to make, and the control says so plainly
  // rather than silently coercing. The engine enforces the same rule as a
  // backstop for stale/external metadata (see carveSuppression.ts).
  const deadkeyLocked = comboIds.some((id) => deadkeyComboIds.has(id));

  // The same bulk default the store's pre-fill writes — used as the display
  // fallback before pre-fill lands (first render) and for genuinely new
  // combos, so the preview never disagrees with the stored value.
  // Deadkey-locked rows always resolve to block (matching the pre-fill's
  // `deadkey-requirement` provenance).
  const bulkDefault = useMemo(
    () => deadkeyLocked
      ? { disposition: "block", provenance: "deadkey-requirement" } as const
      : bulkDispositionDefault(closedKeyboardCard, sparseLatinOverlay),
    [closedKeyboardCard, sparseLatinOverlay, deadkeyLocked],
  );

  const records = comboIds.map((id) => carveDispositions.find((d) => d.comboId === id));
  const values = records.map((r) => r?.disposition);
  const unanimous = values.length > 0 && values.every((v) => v !== undefined && v === values[0]);
  const value: CarveDispositionValue = deadkeyLocked
    ? "block"
    : unanimous
      ? (values[0] as CarveDispositionValue)
      : bulkDefault.disposition;
  const provenance: CarveDispositionProvenance = deadkeyLocked
    ? "deadkey-requirement"
    : unanimous
      ? (records[0] as { provenance: CarveDispositionProvenance }).provenance
      : bulkDefault.provenance;

  const flip = (next: CarveDispositionValue) => {
    // Deadkey-locked rows cannot be flipped to allow-host — the Allow button
    // is disabled, but guard anyway (e.g. keyboard activation).
    if (deadkeyLocked && next === "allow-host") return;
    // Clicking the already-selected option is a no-op: it must not rewrite
    // provenance to author-override when nothing changed.
    if (unanimous && next === value) return;
    for (const id of comboIds) setCarveDisposition(id, next);
  };

  const risk = value === 'allow-host' ? DISPOSITION_COPY.allowRisk : DISPOSITION_COPY.blockRisk;

  return (
    <div
      data-testid="carve-disposition-control"
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '7px 8px', borderRadius: 8,
        background: 'var(--app-surface-2)', border: '1px solid var(--app-border)',
      }}
    >
      <div style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--app-text-muted)' }}>
        {DISPOSITION_COPY.prompt}
      </div>
      <div style={{ display: 'flex', gap: 4 }} role="group" aria-label={DISPOSITION_COPY.prompt}>
        {(['allow-host', 'block'] as const).map((v) => {
          const selected = value === v;
          // Deadkey-locked rows: Allow is not offered at all (ruling: deadkey
          // carves never fall through). Rendered visibly disabled with the
          // reason, never silently hidden.
          const disabled = deadkeyLocked && v === 'allow-host';
          const label = v === 'allow-host' ? DISPOSITION_COPY.allowLabel : DISPOSITION_COPY.blockLabel;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={selected}
              aria-disabled={disabled}
              disabled={disabled}
              title={disabled ? DISPOSITION_COPY.deadkeyNote : undefined}
              onClick={() => flip(v)}
              className="ks-focus-ring"
              style={{
                flex: 1, font: '600 11px var(--app-font)', cursor: disabled ? 'not-allowed' : 'pointer',
                padding: '4px 6px', borderRadius: 6,
                opacity: disabled ? 0.45 : 1,
                // --app-text-on-accent pairs with --app-accent by design (that
                // token exists for this pairing); both flip per theme together.
                color: selected ? 'var(--app-text-on-accent)' : 'var(--app-text-muted)',
                background: selected ? 'var(--app-accent)' : 'transparent',
                border: `1px solid ${selected ? 'var(--app-accent)' : 'var(--app-border-strong)'}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--app-text-subtle)' }}>
        {risk}
      </div>
      {deadkeyLocked && (
        <div style={{ fontSize: 10, lineHeight: 1.35, color: 'var(--app-text-subtle)' }}>
          {DISPOSITION_COPY.deadkeyNote}
        </div>
      )}
      <div style={{ fontSize: 9.5, fontStyle: 'italic', color: 'var(--app-text-subtle)' }}>
        {DISPOSITION_COPY.provenanceLabel[provenance]}
      </div>
    </div>
  );
}

export function CarveGalleryV2({ onComplete, onBack }: CarveGalleryV2Props) {
  const { t } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const removalCapabilities = useWorkingCopyStore((s) => s.removalCapabilities);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  // Target-language display name (e.g. "Russian"), sourced the same way Phase A's
  // identity resolution already populates it — used only for the optional
  // cross-script-Latin group's "...for a {name}-only keyboard" copy.
  const identityDisplayName = useWorkingCopyStore((s) => s.identity?.displayName);
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  // Subscribed PURELY to force a re-render when the set mutates —
  // isItemDeleted above is a stable `(id) => get().deletedItemIds.has(id)`
  // reference, so Zustand's Object.is comparison never re-renders on its
  // own.
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const cascadeDelete = useWorkingCopyStore((s) => s.cascadeDelete);
  const carveDispositions = useWorkingCopyStore((s) => s.carveDispositions);
  const cascadeRestore = useWorkingCopyStore((s) => s.cascadeRestore);
  const restoreAll = useWorkingCopyStore((s) => s.restoreAll);
  const keepAll = useWorkingCopyStore((s) => s.keepAll);

  // irToCharacterView's `confirmedInventory` param drives ONLY the "in your
  // alphabet" (inAlpha) flag and is documented NFC-normalized regardless of
  // the marks-series output form (see that function's doc comment) — a
  // different concern from the needed-set derivation below, which DOES need
  // form-awareness, so this NFC normalization is intentional, not the bug
  // the needed-set machinery below was.
  const confirmedInventorySet = useMemo(
    () => new Set(confirmedInventory.map((ch) => ch.normalize('NFC'))),
    [confirmedInventory],
  );

  // Shared needed-set derivation — the SAME hook the pre-carve convenience
  // question uses, so the two surfaces never compute a different "needed"
  // answer for the same working copy. See useCarveNeededSet's header doc for
  // the full rationale.
  const {
    neededSet: orthographyNeededSet,
    form: carveNormalizationForm,
    bcp47: identityBcp47,
    hasSignal,
    blockCandidateChars,
  } = useCarveNeededSet();

  // Base characters the author chose to KEEP at the pre-carve convenience
  // question — letters their orthography does not use but they still need for
  // borrowed words, email addresses, and web addresses. They are not part of
  // the orthography (deliberately absent from confirmedInventory, see
  // SurveyPhaseResult.retainedConvenienceChars), but for carve's purposes they
  // are needed: shielding them here is the whole point of having asked.
  // useCarveNeededSet deliberately excludes these (see its header doc), so the
  // gallery unions them on top at this call site.
  const retainedConvenienceChars = useWorkingCopyStore((s) => s.session.retainedConvenienceChars);
  const retainedSet = useMemo(
    () => new Set((retainedConvenienceChars ?? []).map((ch) => ch.normalize(carveNormalizationForm))),
    [retainedConvenienceChars, carveNormalizationForm],
  );
  const neededSet = useMemo(
    () => (retainedSet.size === 0
      ? orthographyNeededSet
      : new Set([...orthographyNeededSet, ...retainedSet])),
    [orthographyNeededSet, retainedSet],
  );

  const recommended = useMemo(
    () => (instantiationMode !== null && hasSignal && ir
      ? recommendedRemovalChars({
        ir,
        needed: neededSet,
        bcp47: identityBcp47,
        form: carveNormalizationForm,
        blockCandidateChars,
      })
      : []),
    [ir, instantiationMode, hasSignal, neededSet, identityBcp47, carveNormalizationForm, blockCandidateChars],
  );
  // irToCharacterView's internal lookup key is always NFC-normalized
  // (irToCharacterView.ts) — recommended[].ch is normalized to `form` (NFD on
  // base-plus-mark output), so this set must be re-normalized to NFC or the
  // membership test there silently never matches on NFD keyboards.
  const recommendedCharSet = useMemo(() => new Set(recommended.map((r) => r.ch.normalize('NFC'))), [recommended]);

  const cells = useMemo(
    () => (ir ? irToCharacterView(ir, removalCapabilities, confirmedInventorySet, recommendedCharSet) : []),
    [ir, removalCapabilities, confirmedInventorySet, recommendedCharSet],
  );

  // Lookup from NFC-normalized character to its CharacterCell — the suggested
  // groups render THE SAME cell shape (glyph + codepoint) the groups below
  // render, keyed by the recommendation row's own `ch` (which is normalized
  // to `carveNormalizationForm`, hence the NFC re-normalize here, mirroring
  // recommendedCharSet above). Also backfilled with a synthesizeFallbackCell
  // entry for every recommended row absent from `cells` (block-candidate
  // characters, never actually produced) — this map is the SAME map
  // RecommendedGroupCard and selectedCell below both read, so hovering or
  // selecting a candidate cell resolves its own details rather than
  // silently falling back to an unrelated character.
  const cellsByCh = useMemo(() => {
    const map = new Map(cells.map((c) => [c.ch, c]));
    for (const row of recommended) {
      const key = row.ch.normalize('NFC');
      if (!map.has(key)) map.set(key, synthesizeFallbackCell(row.ch, row.contributors));
    }
    return map;
  }, [cells, recommended]);

  // Post-#526 split (inherited from the v1 removal banner): cross-script-Latin
  // rows never drive the primary "Suggested to discard" group — they get their
  // own optional, low-priority group instead of being suppressed or mixed in.
  const primaryRows = useMemo(() => recommended.filter((r) => r.reason !== 'cross-script-latin'), [recommended]);
  const optionalLatinRows = useMemo(() => recommended.filter((r) => r.reason === 'cross-script-latin'), [recommended]);

  // 076 FR-022 (T016): the FR-005 `sparseLatinOverlay` input for disposition
  // pre-fill — the target script is the only signal the gallery can read at
  // carve time (see isSparseLatinOverlayTarget's doc).
  const sparseLatinOverlay = isSparseLatinOverlayTarget(identityBcp47);
  // Ruling (A1–A3): deadkey carves never fall through — rule nodeIds whose
  // rules carry deadkey context. Rows touching these combos offer no Allow
  // option and pre-fill to `block` with `deadkey-requirement` provenance.
  const deadkeyComboIds = useMemo(() => {
    const ids = new Set<string>();
    if (!ir) return ids;
    for (const group of ir.groups ?? []) {
      for (const rule of group.rules ?? []) {
        if (rule.context?.some((el) => el.kind === "deadkey")) ids.add(rule.nodeId);
      }
    }
    return ids;
  }, [ir]);
  const prefillCarveDispositions = useWorkingCopyStore((s) => s.prefillCarveDispositions);
  const closedKeyboardCard = useWorkingCopyStore((s) => s.closedKeyboardCard);
  const recommendedComboIds = useMemo(() => recommended.flatMap(recommendedRowIds), [recommended]);
  // Pre-fill per-carve dispositions for every carve-candidate row from the
  // bulk default (closed-keyboard card / FR-005 proposal). The store writes
  // ONLY for combos without an existing disposition, so re-running when the
  // card is answered later fills genuinely new combos without ever
  // re-prompting (FR-022: recompile never re-prompts).
  useEffect(() => {
    if (recommendedComboIds.length === 0) return;
    prefillCarveDispositions(recommendedComboIds, { sparseLatinOverlay, deadkeyComboIds });
  }, [recommendedComboIds, sparseLatinOverlay, deadkeyComboIds, closedKeyboardCard, prefillCarveDispositions]);

  // "...for a {descriptor} keyboard" — descriptor is the display name +
  // "-only" when available (e.g. "Russian-only"), else the neutral
  // "single-script" fallback.
  const keyboardDescriptor = identityDisplayName !== undefined && identityDisplayName.length > 0
    ? `${identityDisplayName}-only`
    : 'single-script';

  const toggleRecommendedRow = useCallback((row: RecommendedRemovalChar) => {
    const ids = recommendedRowIds(row);
    if (ids.length === 0) return;
    if (isRowDiscarded(row, isItemDeleted)) {
      cascadeRestore(ids);
    } else {
      cascadeDelete(row.contributors.ruleNodeIds, row.contributors.storeSlotIds);
    }
  }, [isItemDeleted, cascadeDelete, cascadeRestore]);

  const toggleRecommendedRows = useCallback((rows: RecommendedRemovalChar[], discard: boolean) => {
    if (discard) {
      const ruleNodeIds: string[] = [];
      const storeSlotIds: string[] = [];
      for (const row of rows) {
        ruleNodeIds.push(...row.contributors.ruleNodeIds);
        storeSlotIds.push(...row.contributors.storeSlotIds);
      }
      if (ruleNodeIds.length === 0 && storeSlotIds.length === 0) return;
      cascadeDelete(ruleNodeIds, storeSlotIds);
    } else {
      const ids = rows.flatMap(recommendedRowIds);
      if (ids.length === 0) return;
      cascadeRestore(ids);
    }
  }, [cascadeDelete, cascadeRestore]);

  const [selectedCh, setSelectedCh] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  // Optional-Latin card starts collapsed, since it is deliberately
  // lower-priority than the primary suggested-to-discard card above it.
  const [latinOpen, setLatinOpen] = useState(false);
  // "Review removed keys" panel (T017, spec 076 FR-023): every carved
  // combination with its disposition and cross-host consequence.
  const [reviewOpen, setReviewOpen] = useState(false);
  const carvedCombos = useMemo(
    () => (ir ? resolveCarvedCombos(ir, carveDispositions) : []),
    [ir, carveDispositions],
  );

  const toggleCell = useCallback((cell: CharacterCell) => {
    if (!characterCellIsToggleable(cell)) return;
    if (isCellDiscarded(cell, isItemDeleted)) {
      cascadeRestore(characterCellIds(cell));
    } else {
      cascadeDelete(cell.contributors.ruleNodeIds, cell.contributors.storeSlotIds);
    }
  }, [isItemDeleted, cascadeDelete, cascadeRestore]);

  const toggleGroup = useCallback((groupCells: CharacterCell[], discard: boolean) => {
    const ruleNodeIds: string[] = [];
    const storeSlotIds: string[] = [];
    const restoreIds: string[] = [];
    for (const cell of groupCells) {
      if (!characterCellIsToggleable(cell)) continue;
      if (discard) {
        ruleNodeIds.push(...cell.contributors.ruleNodeIds);
        storeSlotIds.push(...cell.contributors.storeSlotIds);
      } else {
        restoreIds.push(...characterCellIds(cell));
      }
    }
    if (discard) cascadeDelete(ruleNodeIds, storeSlotIds);
    else cascadeRestore(restoreIds);
  }, [cascadeDelete, cascadeRestore]);

  // Kept / total / removed counts over EVERY cell.
  const { kept, total } = useMemo(() => {
    let k = 0;
    for (const cell of cells) {
      if (!isCellDiscarded(cell, isItemDeleted)) k += 1;
    }
    return { kept: k, total: cells.length };
  }, [cells, isItemDeleted, deletedItemIds]);
  const removedCount = total - kept;

  // Recommended characters (cell.reco) live in the suggested groups above the
  // grid, not here too — no character should appear twice.
  const filteredCells = useMemo(() => cells.filter((cell) => !cell.reco), [cells]);

  const groups: CharacterGroup[] = useMemo(
    () => groupCharacterCells(filteredCells, groupBy),
    [filteredCells, groupBy],
  );

  // Removed-characters dropdown (#1619 AC1) — every currently discarded
  // character, individually restorable, mirroring the rule/node Rail view's
  // RemovedDropdown (StatusBar.tsx). Built from `cells` (the IR's real
  // producers), the SAME source kept/total above counts over, so this list
  // and the "N discarded" text never disagree.
  const removedList = useMemo<RemovedItem[]>(
    () => cells
      .filter((cell) => isCellDiscarded(cell, isItemDeleted))
      .map((cell) => ({ type: 'item', id: cell.ch, ch: cell.ch, keys: cell.keys })),
    [cells, isItemDeleted, deletedItemIds],
  );
  const restoreRemovedItem = useCallback((item: RemovedItem) => {
    if (item.type !== 'item') return;
    const cell = cellsByCh.get(item.ch);
    if (cell === undefined) return;
    cascadeRestore(characterCellIds(cell));
  }, [cellsByCh, cascadeRestore]);

  // cellsByCh (not cells) is the lookup here: selectedCh may be a
  // block-candidate character that's absent from cells but present in
  // cellsByCh via synthesizeFallbackCell — see that memo's comment above.
  const selectedCell = useMemo<CharacterCell | undefined>(
    () => (selectedCh !== null ? cellsByCh.get(selectedCh) : undefined) ?? cells[0],
    [cellsByCh, cells, selectedCh],
  );

  // Back / Skip / Continue live in the footer (spec 081). Publish
  // unconditionally, before the `!ir` loading return below. Back is offered in
  // the loading state too (FR-015): the author reached it by moving forward.
  // Skip and Continue wait for the IR — there is nothing to keep or carve yet.
  // The nav ids are the ones Carve v1 used, restored so their existing
  // translations come back (FR-044).
  const backAction =
    onBack !== undefined
      ? {
          back: {
            label: t({ id: 'editor.carve.backButton', message: '← Back' }),
            onClick: onBack,
            testId: 'carve-back',
          },
        }
      : {};
  usePublishStepNav(
    !ir
      ? backAction
      : {
          ...backAction,
          secondary: {
            label: t({ id: 'editor.carve.skipButton', message: 'Skip' }),
            onClick: () => { keepAll(); onComplete(); },
            testId: 'carve-skip',
          },
          forward: {
            label: t({ id: 'editor.carve.continueButton', message: 'Continue →' }),
            onClick: onComplete,
            testId: 'carve-continue',
          },
        },
  );

  if (!ir) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
        <p style={{ fontSize: 14, color: 'var(--app-text-muted)' }}>
          {t({ id: 'editor.carve.loadingKeyboard', message: 'Loading keyboard…' })}
        </p>
      </div>
    );
  }

  return (
    // v2 adopts v1's e2e testid contract ("carve-gallery" / "carve-continue")
    // now that v2 is the sole live carve gallery — keeps pass-through e2e
    // specs green with zero edits.
    <div data-testid="carve-gallery" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, font: "500 23px/1.1 'Playfair Display', serif", color: 'var(--app-text)' }}>
            Everything this keyboard can type
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--app-text-muted)', maxWidth: 620, lineHeight: 1.5 }}>
            Every printable character your base keyboard can produce, in one panel. Click any character to discard it — nothing is deleted until you continue.
          </p>
        </div>
      </div>

      {/* Status strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '12px 22px', borderBottom: '1px solid var(--app-border)', background: 'var(--app-surface)' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>
            <b style={{ color: 'var(--app-accent-text)', fontSize: 18 }}>{kept}</b> of {total} characters kept
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--app-text-subtle)', marginTop: 2 }}>
            {removedCount} discarded · reversible until you continue
          </div>
        </div>
        {/* Grouping toggle — native fieldset/radio group so "Group by" is a
            real programmatic label and the two options are keyboard-operable
            and screen-reader-announced without any custom ARIA state.
            Deliberately a raw fieldset rather than the ui/RadioGroup.tsx
            primitive: RadioGroup's OPTION_ROW_STYLE stacks options vertically
            with a 44px touch hit-target and per-row margin, which would blow
            out this compact inline status-strip layout (radios sit inline,
            side by side, next to the removed-characters dropdown below).
            The two radios still carry ks-focus-ring below, so this call site
            matches the app-wide focus treatment without the primitive. */}
        <fieldset
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, margin: '0 0 0 auto', padding: '5px 10px',
            border: '1px solid var(--app-border-strong)', borderRadius: 8, background: 'var(--app-surface-2)',
          }}
        >
          <legend style={{ font: '600 10.5px var(--app-font)', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--app-text-muted)', padding: '0 6px 0 0' }}>
            Group by
          </legend>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 12px var(--app-font)', color: groupBy === 'category' ? 'var(--app-accent-text)' : 'var(--app-text-muted)', cursor: 'pointer' }}>
            <input
              type="radio"
              className="ks-focus-ring"
              name="carve-v2-group-by"
              value="category"
              checked={groupBy === 'category'}
              onChange={() => setGroupBy('category')}
            />
            Category
          </label>
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 12px var(--app-font)', color: groupBy === 'source' ? 'var(--app-accent-text)' : 'var(--app-text-muted)', cursor: 'pointer' }}
          >
            <input
              type="radio"
              className="ks-focus-ring"
              name="carve-v2-group-by"
              value="source"
              checked={groupBy === 'source'}
              onChange={() => setGroupBy('source')}
            />
            Source
          </label>
        </fieldset>
        <RemovedDropdown list={removedList} onRestore={restoreRemovedItem} onRestoreAll={restoreAll} />
        {/* T017: opens the "Review removed keys" panel — every carved
            combination with its Allow/Block disposition and the cross-host
            consequence table. Disabled until something is carved. */}
        <button
          type="button"
          data-testid="carve-review-removed-keys"
          disabled={carvedCombos.length === 0}
          onClick={() => setReviewOpen(true)}
          className="ks-focus-ring"
          style={{
            font: '600 12.5px var(--app-font)', cursor: carvedCombos.length === 0 ? 'default' : 'pointer',
            color: 'var(--app-accent-text)', background: 'transparent',
            border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '6px 12px',
            opacity: carvedCombos.length === 0 ? 0.5 : 1,
          }}
        >
          Review removed keys ({carvedCombos.length})
        </button>
      </div>

      {/* layout_family question — T025 (spec 076 FR-023, amendment A3.1).
          Gallery-level setting driving likely-host resolution; structurally
          separate from the per-row disposition controls (T016, later). */}
      <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--app-border)', background: 'var(--app-surface)', flexShrink: 0 }}>
        <LayoutFamilyQuestion bcp47={identityBcp47} />
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left aside — Character details.
            role="region" + tabIndex={0}: this panel is a SCROLL CONTAINER
            (overflowY: auto) whose content is read-only (#1619 AC2: no
            discard/restore control lives here), so it has no focusable
            descendant a keyboard user could Tab to and then scroll from.
            Whenever the details overflow the pane (a short viewport, a
            taller top bar, a character with several ways to type it) it was
            reachable by pointer only: WCAG 2.1.1, axe's
            `scrollable-region-focusable`. Same fix as KmnSourceView.tsx: a
            named region a keyboard user deliberately enters to scroll. The
            name comes from the panel's own visible heading (aria-labelledby,
            so Label in Name holds), and that heading is now in the lingui
            catalog. ks-focus-ring gives the tab stop the app-wide visible
            focus treatment.
            `jsx-a11y/no-noninteractive-tabindex` is a heuristic about
            interactive widgets with no notion of scroll containers; it and
            the WCAG requirement genuinely disagree here, hence the scoped
            disable (block form: the rule reports on the tabIndex attribute
            line, which a next-line directive above the tag does not reach). */}
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
        <div
          role="region"
          aria-labelledby={DETAILS_HEADING_ID}
          tabIndex={0}
          className="ks-focus-ring"
          data-testid="carve-details"
          style={{ width: 290, flexShrink: 0, borderRight: '1px solid var(--app-border)', padding: 18, overflowY: 'auto' }}
        >
          {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
          <div id={DETAILS_HEADING_ID} style={{ font: '600 10.5px/1 var(--app-font)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--app-text-subtle)', marginBottom: 12 }}>
            <Trans id="carve.details.heading">Character details</Trans>
          </div>
          {selectedCell === undefined ? (
            <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>No characters to show.</p>
          ) : (() => {
            const cell = selectedCell;
            const discarded = isCellDiscarded(cell, isItemDeleted);
            return (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: 88, borderRadius: 12, marginBottom: 12,
                  background: 'var(--app-surface-2)', border: '1px solid var(--app-border-strong)',
                }}>
                  <span style={{ font: "400 44px/1 var(--app-font-glyph)", color: discarded ? 'var(--app-text-subtle)' : 'var(--app-text)' }}>
                    {displayChar(cell.ch)}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontFamily: 'var(--app-font-mono)', color: 'var(--app-text-subtle)', marginBottom: 4 }}>
                  {codepointLabel(cell.ch).title}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--app-text)', marginBottom: 14 }}>
                  {characterDisplayName(cell.ch)}
                </div>

                <div style={{ marginBottom: 12 }}>
                  {(() => {
                    // TOTAL FLOOR (#1399 follow-on): a producer is renderable
                    // only when it has faithful STEPS or a resolvable
                    // TRIGGER-KEY FLOOR (CharProducer.triggerFloor, computed
                    // by charProducers). A producer with neither is dropped
                    // entirely — the two former placeholder phrases ("Not
                    // tied to a single key" / "Not shown — context-dependent")
                    // have NO render path anywhere below.
                    const ways = cell.waysToType.filter((w) => w.steps.length > 0 || w.triggerFloor !== undefined);
                    const label = (
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--app-text-subtle)', marginBottom: 6 }}>
                        How it's typed
                      </div>
                    );
                    const renderWay = (way: CharacterCell['waysToType'][number]) => (
                      way.steps.length > 0
                        ? <KeySeq keys={way.steps} joiner="then" />
                        : <span style={{ fontSize: 12.5, color: 'var(--app-text-subtle)' }}>Typed with {way.triggerFloor}</span>
                    );

                    if (ways.length === 0) {
                      // No renderable producer at all. Three sources get their
                      // own honest message (none a banned phrase); every
                      // other zero-producer character shows no "way" line
                      // whatsoever.
                      //
                      // touch-only-key reaches here for the same reason it
                      // exists (spec §8): its only producer is a
                      // T_xxxx-triggered rule, which charProducers drops
                      // rather than leak a touch id as a desktop keystroke —
                      // so ways is empty and, without this branch, the
                      // character would render with no explanation of why no
                      // keys are shown.
                      if (cell.source === 'touch-only-key') {
                        return (
                          <>
                            {label}
                            <span style={{ fontSize: 12.5, color: 'var(--app-text-subtle)' }}>
                              Only on the touch keyboard — no desktop key types it
                            </span>
                          </>
                        );
                      }
                      if (cell.source === 'blocked-candidate') {
                        return (
                          <>
                            {label}
                            <span style={{ fontSize: 12.5, color: 'var(--app-text-subtle)' }}>
                              This keyboard blocks this combination — nothing types it
                            </span>
                          </>
                        );
                      }
                      if (cell.source !== 'advanced-rule') return null;
                      return (
                        <>
                          {label}
                          <span style={{ fontSize: 12.5, color: 'var(--app-text-subtle)' }}>
                            Produced by an advanced rule — the keystroke can't be shown
                          </span>
                        </>
                      );
                    }

                    // Single-line (unchanged feel) unless there's more than one
                    // renderable producer OR the one producer carries a
                    // condition to explain (#1399) — a plain unconditional
                    // single producer stays exactly as before, no "1 way"
                    // label clutter.
                    const showList = ways.length > 1 || (ways.length === 1 && ways[0]?.condition !== undefined);

                    if (!showList) {
                      return (
                        <>
                          {label}
                          {renderWay(ways[0]!)}
                        </>
                      );
                    }

                    return (
                      <>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--app-text-subtle)', marginBottom: 6 }}>
                          How it's typed · {ways.length} {ways.length === 1 ? 'way' : 'ways'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {ways.map((way, i) => (
                            <div key={i} style={{ padding: '6px 8px', borderRadius: 7, background: 'var(--app-surface-2)', border: '1px solid var(--app-border)' }}>
                              {renderWay(way)}
                              {way.condition !== undefined && (
                                <div style={{ fontSize: 11, color: 'var(--app-text-subtle)', marginTop: 4, fontStyle: 'italic' }}>
                                  {way.condition}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--app-text-subtle)', marginBottom: 6 }}>
                    Comes from
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    font: '600 11.5px var(--app-font)', padding: '3px 9px', borderRadius: 999,
                    color: 'var(--app-accent-text)', background: 'var(--app-accent-subtle)',
                    border: '1px solid var(--app-border-strong)', marginRight: 6,
                  }}>
                    {SOURCE_DETAIL_LABEL[cell.source]}
                  </span>
                  {cell.strategy !== undefined && (
                    <span style={{
                      display: 'inline-flex', font: '600 11px/1 var(--app-font-mono)',
                      padding: '3px 8px', borderRadius: 999, color: 'var(--app-text-subtle)',
                      border: '1px solid var(--app-border-strong)',
                    }}>
                      {cell.strategy}
                    </span>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--app-text-subtle)', marginBottom: 6 }}>
                    In your alphabet
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', font: '600 11.5px var(--app-font)',
                    padding: '3px 9px', borderRadius: 999,
                    // NOT --app-text-on-accent: that token flips per theme to pair
                    // with --app-accent, but --sil-green is a fixed fill in both
                    // themes (brand.css has no navy override for it) — the same
                    // shape as --sil-red-dark above. White (light theme's
                    // on-accent value) only reaches 3.35:1 against this green,
                    // below the 4.5:1 AA minimum for this normal-size bold text.
                    // --sil-black passes at 6.27:1 in both themes since the fill
                    // itself never changes.
                    color: cell.inAlpha ? 'var(--sil-black)' : 'var(--app-text-muted)',
                    background: cell.inAlpha ? 'var(--sil-green)' : 'var(--app-surface-2)',
                    border: cell.inAlpha ? 'none' : '1px solid var(--app-border-strong)',
                  }}>
                    {cell.inAlpha ? 'Yes' : 'No'}
                  </span>
                </div>

                {/* T019 (076 FR-023): expanded host-consequence row for the
                    selected carved combination — per-likely-host consequence
                    table, HOST_GUESS_CAPTION, the expectation prompt, and
                    each option's own risk (DISPOSITION_COPY). A combo exists
                    in carvedCombos only while it has a disposition, and
                    dispositions are created on carve and deleted on un-carve,
                    so a non-empty match means this character is carved.
                    Read-only: the Allow/Block control itself lives on the
                    gallery row (T016). */}
                {(() => {
                  const ids = new Set(characterCellIds(cell));
                  const combos = carvedCombos.filter((c) => ids.has(c.comboId));
                  if (combos.length === 0) return null;
                  return (
                    <>
                      {combos.map((combo) => (
                        <CarvedHostConsequences key={combo.comboId} combo={combo} bcp47={identityBcp47} />
                      ))}
                    </>
                  );
                })()}

                {/* Read-only from here down (#1619 AC2) — no discard/restore
                    control in this panel. Toggling a character happens only
                    by clicking its grid cell, a suggested-group card, or the
                    removed-characters dropdown above. */}
                <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--app-text-subtle)' }}>
                  Discarding a character removes the rules that produce it. If a rule also produces a character you kept, that rule stays.
                </p>
              </div>
            );
          })()}
        </div>

        {/* Right main — grouped character grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Suggested-to-discard groups (design handoff option 1b) — the
              FIRST thing in this scrolling panel, ahead of every normal
              category/source group. filteredCells excludes reco cells (see
              that memo's comment) so a character never appears here AND in a
              normal group below. */}
          <>
              <RecommendedGroupCard
                testId="carve-v2-suggested-group"
                toggleAllTestId="carve-v2-suggested-toggle-all"
                regionAriaLabel={t({ id: "carve.suggested.regionAriaLabel", message: "Suggested to discard" })}
                topBorderColor="var(--sil-red)"
                chipBackground="color-mix(in srgb, var(--sil-red) 14%, var(--app-surface-2))"
                chipColor="var(--app-danger-text-on-surface-2)"
                heading={<Trans id="carve.suggested.heading">Suggested to discard</Trans>}
                body={<Trans id="carve.suggested.body">Your base keyboard can type these characters, but nothing in your confirmed alphabet uses them. Click any character below to keep it instead — nothing is removed until you continue.</Trans>}
                rows={primaryRows}
                cellsByCh={cellsByCh}
                isItemDeleted={isItemDeleted}
                onToggleRow={toggleRecommendedRow}
                onBulkToggle={(discard) => toggleRecommendedRows(primaryRows, discard)}
                discardAllLabel={(count) => t({ id: "carve.recommended.discardAll", message: `Discard all ${count}` })}
                restoreAllLabel={t({ id: "carve.recommended.restoreAll", message: "Restore all" })}
                selectedCh={selectedCell?.ch}
                onSelectCh={setSelectedCh}
                destructiveBulkButton
                sparseLatinOverlay={sparseLatinOverlay}
                deadkeyComboIds={deadkeyComboIds}
              />
              <RecommendedGroupCard
                testId="carve-v2-optional-latin-group"
                toggleAllTestId="carve-v2-optional-latin-toggle-all"
                regionAriaLabel={t({ id: "editor.assignLoop.removalBanner.latinOptionalGroupAriaLabel", message: "Latin alphabet, optional removal" })}
                topBorderColor="var(--app-border-strong)"
                chipBackground="var(--app-surface-2)"
                chipColor="var(--app-text-subtle)"
                heading={<Trans id="editor.assignLoop.removalBanner.latinOptionalHeading">Latin alphabet (optional)</Trans>}
                body={t({
                  id: "editor.assignLoop.removalBanner.latinOptionalBody",
                  message: `Keep these for URLs, code, and English words — or remove them for a ${{ descriptor: keyboardDescriptor }} keyboard.`,
                })}
                rows={optionalLatinRows}
                cellsByCh={cellsByCh}
                isItemDeleted={isItemDeleted}
                onToggleRow={toggleRecommendedRow}
                onBulkToggle={(discard) => toggleRecommendedRows(optionalLatinRows, discard)}
                discardAllLabel={(count) => t({ id: "carve.recommended.discardAll", message: `Discard all ${count}` })}
                restoreAllLabel={t({ id: "carve.recommended.restoreAll", message: "Restore all" })}
                selectedCh={selectedCell?.ch}
                onSelectCh={setSelectedCh}
                collapsible={{ open: latinOpen, onToggleOpen: () => setLatinOpen((v) => !v) }}
                sparseLatinOverlay={sparseLatinOverlay}
                deadkeyComboIds={deadkeyComboIds}
              />
          </>

          {groups.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>No characters to show.</p>
          )}
          {groups.map((group) => {
            const allDiscarded = group.cells.every((c) => isCellDiscarded(c, isItemDeleted));
            return (
              <section key={group.key} aria-label={group.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: GROUP_DOT[group.key] ?? 'var(--app-text-subtle)', flexShrink: 0 }} />
                  <h2 style={{ margin: 0, font: '600 14px var(--app-font)', color: 'var(--app-text)' }}>{group.label}</h2>
                  <span style={{ fontSize: 12, color: 'var(--app-text-subtle)' }}>({group.cells.length})</span>
                  <button
                    onClick={() => toggleGroup(group.cells, !allDiscarded)}
                    style={{
                      marginLeft: 'auto', font: '600 11.5px var(--app-font)', cursor: 'pointer',
                      color: 'var(--app-text-muted)', background: 'transparent',
                      border: '1px solid var(--app-border-strong)', borderRadius: 7, padding: '4px 10px',
                    }}
                  >
                    {allDiscarded ? 'Restore all' : 'Discard all'}
                  </button>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--app-text-subtle)' }}>
                  {GROUP_HINTS[group.key] ?? ''}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 8 }}>
                  {group.cells.map((cell) => {
                    const discarded = isCellDiscarded(cell, isItemDeleted);
                    const flag: CellFlag = discarded ? 'discarded' : cell.reco ? 'suggested' : cell.inAlpha ? 'yours' : null;
                    const isSelected = selectedCell?.ch === cell.ch;
                    return (
                      <CharacterCellButton
                        key={cell.ch}
                        cell={cell}
                        discarded={discarded}
                        isSelected={isSelected}
                        flag={flag}
                        onSelect={() => setSelectedCh(cell.ch)}
                        onToggle={() => toggleCell(cell)}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {/* T017 review panel — fixed overlay dialog, mounted at the gallery root. */}
      {reviewOpen && (
        <ReviewRemovedKeysDialog
          combos={carvedCombos}
          bcp47={identityBcp47}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}
