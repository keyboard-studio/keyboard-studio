// CarveGalleryV2 — character-first carve gallery (#1399), rendered when the
// VITE_CARVE_V2 / ?carvev2=1 flag is set (default OFF — carveAdapter otherwise
// renders the rule/node "Rail" view, CarveGallery.tsx, which is untouched).
// Making V2 the default is deferred to its own change against #1399.
//
// Shows every character the keyboard can type in one panel; the author
// discards CHARACTERS, not rules. Toggling a character resolves its
// contributors (irToCharacterView.ts, built on collectCharContributors) and
// cascades through the SAME workingCopyStore actions CarveGallery already
// uses (cascadeDelete/cascadeRestore) — no new write path.

import { useState, useMemo, useCallback } from 'react';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { recommendedRemovalChars, displayChar } from '../../lib/irToCarveNodes.ts';
import {
  irToCharacterView, groupCharacterCells, characterCellIds, characterCellIsToggleable,
  characterDisplayName, SOURCE_DETAIL_LABEL,
} from '../../lib/irToCharacterView.ts';
import type { CharacterCell, CharacterGroup } from '../../lib/irToCharacterView.ts';
import { RemovalBanner } from '../assignLoop/parts/RemovalBanner.tsx';
import { KeySeq } from '../assignLoop/parts/KeySeq.tsx';
import { UndoIcon } from '../assignLoop/parts/carveShared.tsx';
import { useCarveNeededSet } from '../../hooks/useCarveNeededSet.ts';

interface CarveGalleryV2Props {
  onComplete: () => void;
  onBack?: (() => void) | undefined;
}

type GroupBy = 'category' | 'source';

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
};

const GROUP_DOT: Record<string, string> = {
  'basic-letter': 'var(--app-accent)',
  'special-letter': '#f18407',
  'accented-letter': '#8b5cc4',
  digit: '#6fbbd4',
  'punctuation-symbol': 'var(--app-text-subtle)',
  'direct-key': 'var(--app-accent)',
  'deadkey-sequence': '#8b5cc4',
  store: '#f18407',
  'advanced-rule': 'var(--app-text-subtle)',
};

function codepointLabel(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** True when every contributor id for this cell is currently deleted (or the cell has no toggleable ids at all — never "discarded", always kept). */
function isCellDiscarded(cell: CharacterCell, isItemDeleted: (id: string) => boolean): boolean {
  const ids = characterCellIds(cell);
  if (ids.length === 0) return false;
  return ids.every((id) => isItemDeleted(id));
}

export function CarveGalleryV2({ onComplete, onBack }: CarveGalleryV2Props) {
  const ir = useWorkingCopyStore((s) => s.ir);
  const removalCapabilities = useWorkingCopyStore((s) => s.removalCapabilities);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  // Target-language display name (e.g. "Russian"), sourced the same way Phase A's
  // identity resolution already populates it — used only for the optional
  // cross-script-Latin group's "...for a {name}-only keyboard" copy (RemovalBanner).
  const identityDisplayName = useWorkingCopyStore((s) => s.identity?.displayName);
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  // Subscribed PURELY to force a re-render when the set mutates —
  // isItemDeleted above is a stable `(id) => get().deletedItemIds.has(id)`
  // reference, so Zustand's Object.is comparison never re-renders on its
  // own. Mirrors CarveGallery.tsx's identical subscription.
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const cascadeDelete = useWorkingCopyStore((s) => s.cascadeDelete);
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

  // Shared needed-set derivation — the SAME hook and call-site
  // shape as CarveGallery.tsx (the rule/node Rail view), so the two carve
  // surfaces never compute a different "needed" answer for the same working
  // copy. See useCarveNeededSet's header doc for the full rationale.
  const {
    neededSet: orthographyNeededSet,
    form: carveNormalizationForm,
    bcp47: identityBcp47,
    hasSignal,
    blockCandidateChars,
  } = useCarveNeededSet();

  // Base characters the author chose to KEEP at the pre-carve convenience
  // question — mirrors CarveGallery.tsx's identical retainedSet union (see
  // that file's comment for the full rationale). useCarveNeededSet
  // deliberately excludes these (see its header doc), so the gallery unions
  // them on top at this call site, same as CarveGallery does.
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

  const handleRemoveSelectedRecommended = useCallback((selected: typeof recommended) => {
    const ruleNodeIds: string[] = [];
    const storeSlotIds: string[] = [];
    for (const { contributors } of selected) {
      ruleNodeIds.push(...contributors.ruleNodeIds);
      storeSlotIds.push(...contributors.storeSlotIds);
    }
    if (ruleNodeIds.length === 0 && storeSlotIds.length === 0) return;
    cascadeDelete(ruleNodeIds, storeSlotIds);
  }, [cascadeDelete]);

  const [selectedCh, setSelectedCh] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('category');

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

  // Kept / total / removed counts over EVERY cell (unfiltered by search).
  const { kept, total } = useMemo(() => {
    let k = 0;
    for (const cell of cells) {
      if (!isCellDiscarded(cell, isItemDeleted)) k += 1;
    }
    return { kept: k, total: cells.length };
  }, [cells, isItemDeleted, deletedItemIds]);
  const removedCount = total - kept;

  const filteredCells = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cells;
    return cells.filter((cell) => {
      if (cell.ch.toLowerCase().includes(q)) return true;
      if (codepointLabel(cell.ch).toLowerCase().includes(q)) return true;
      return cell.keys.some((k) => k.toLowerCase().includes(q));
    });
  }, [cells, search]);

  const groups: CharacterGroup[] = useMemo(
    () => groupCharacterCells(filteredCells, groupBy),
    [filteredCells, groupBy],
  );

  const selectedCell = useMemo<CharacterCell | undefined>(
    () => cells.find((c) => c.ch === selectedCh) ?? cells[0],
    [cells, selectedCh],
  );

  if (!ir) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
        <p style={{ fontSize: 14, color: 'var(--app-text-muted)' }}>Loading keyboard…</p>
      </div>
    );
  }

  return (
    <div data-testid="carve-gallery-v2" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}>
        {onBack !== undefined && (
          <button
            onClick={onBack}
            style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: 'none', padding: '4px 0', whiteSpace: 'nowrap' }}
          >
            ← Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 10.5px/1 var(--app-font)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--app-text-subtle)' }}>
            Phase D · Discard
          </div>
          <h1 style={{ margin: '6px 0 0', font: "500 23px/1.1 'Playfair Display', serif", color: 'var(--app-text)' }}>
            Everything this keyboard can type
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--app-text-muted)', maxWidth: 620, lineHeight: 1.5 }}>
            Every printable character your base keyboard can produce, in one panel. Click any character to discard it — nothing is deleted until you continue.
          </p>
        </div>
        <button
          onClick={() => { keepAll(); onComplete(); }}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '7px 13px', whiteSpace: 'nowrap', marginRight: 6 }}
        >
          Skip
        </button>
        <button
          data-testid="carve-v2-continue"
          onClick={onComplete}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: '#fff', background: 'var(--app-accent)', border: 'none', borderRadius: 8, padding: '9px 18px' }}
        >
          Continue →
        </button>
      </div>

      {/* Removal-recommendation banner — reused as-is */}
      <RemovalBanner
        recommended={recommended}
        languageLabel={identityBcp47 ?? 'your target language'}
        languageDisplayName={identityDisplayName}
        onRemoveSelected={handleRemoveSelectedRecommended}
      />

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
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a character or code point…"
          aria-label="Search a character or code point"
          style={{
            marginLeft: 'auto', minWidth: 240, font: '13px var(--app-font)', color: 'var(--app-text)',
            background: 'var(--app-surface-2)', border: '1px solid var(--app-border-strong)', borderRadius: 8,
            padding: '7px 11px',
          }}
        />
        {/* Grouping toggle — native fieldset/radio group so "Group by" is a
            real programmatic label and the two options are keyboard-operable
            and screen-reader-announced without any custom ARIA state.
            Deliberately a raw fieldset rather than the ui/RadioGroup.tsx
            primitive: RadioGroup's OPTION_ROW_STYLE stacks options vertically
            with a 44px touch hit-target and per-row margin, which would blow
            out this compact inline status-strip layout (radios sit inline,
            side by side, next to the search box and Restore-all button).
            The two radios still carry ks-focus-ring below, so this call site
            matches the app-wide focus treatment without the primitive. */}
        <fieldset
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, margin: 0, padding: '5px 10px',
            border: '1px solid var(--app-border-strong)', borderRadius: 8, background: 'var(--app-surface-2)',
          }}
        >
          <legend style={{ font: '600 10.5px var(--app-font)', letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--app-text-subtle)', padding: '0 6px 0 0' }}>
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
        <button
          onClick={restoreAll}
          disabled={removedCount === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, font: '600 12.5px var(--app-font)',
            cursor: removedCount === 0 ? 'default' : 'pointer', color: removedCount === 0 ? 'var(--app-text-subtle)' : 'var(--app-accent-text)',
            background: 'transparent', border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '7px 13px',
            opacity: removedCount === 0 ? 0.6 : 1,
          }}
        >
          <UndoIcon size={13} />
          Restore all
        </button>
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left aside — Character details */}
        <div style={{ width: 290, flexShrink: 0, borderRight: '1px solid var(--app-border)', padding: 18, overflowY: 'auto' }}>
          <div style={{ font: '600 10.5px/1 var(--app-font)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--app-text-subtle)', marginBottom: 12 }}>
            Character details
          </div>
          {selectedCell === undefined ? (
            <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>No characters to show.</p>
          ) : (() => {
            const cell = selectedCell;
            const discarded = isCellDiscarded(cell, isItemDeleted);
            const toggleable = characterCellIsToggleable(cell);
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
                  {codepointLabel(cell.ch)}
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
                      // No renderable producer at all. `advanced-rule` gets
                      // its own honest codec-limit message (not a banned
                      // phrase); every other zero-producer character shows
                      // no "way" line whatsoever.
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
                    color: cell.inAlpha ? '#fff' : 'var(--app-text-subtle)',
                    background: cell.inAlpha ? 'var(--sil-green)' : 'var(--app-surface-2)',
                    border: cell.inAlpha ? 'none' : '1px solid var(--app-border-strong)',
                  }}>
                    {cell.inAlpha ? 'Yes' : 'No'}
                  </span>
                </div>

                <button
                  onClick={() => toggleCell(cell)}
                  disabled={!toggleable}
                  aria-pressed={discarded}
                  style={{
                    width: '100%', font: '600 13px var(--app-font)', cursor: toggleable ? 'pointer' : 'default',
                    padding: '9px 14px', borderRadius: 8, opacity: toggleable ? 1 : 0.5,
                    color: discarded ? '#fff' : 'var(--app-danger)',
                    background: discarded ? 'var(--sil-green)' : 'transparent',
                    border: discarded ? 'none' : '1px solid var(--app-danger)',
                  }}
                >
                  {discarded ? 'Restore this character' : 'Discard this character'}
                </button>
                <p style={{ margin: '10px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--app-text-subtle)' }}>
                  Discarding a character removes the rules that produce it. If a rule also produces a character you kept, that rule stays.
                </p>
              </div>
            );
          })()}
        </div>

        {/* Right main — grouped character grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {groups.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>No characters match your search.</p>
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
                    const flag = discarded ? 'discarded' : cell.reco ? 'suggested' : cell.inAlpha ? 'yours' : null;
                    const isSelected = selectedCell?.ch === cell.ch;
                    return (
                      <button
                        key={cell.ch}
                        type="button"
                        onMouseEnter={() => setSelectedCh(cell.ch)}
                        onFocus={() => setSelectedCh(cell.ch)}
                        onClick={() => toggleCell(cell)}
                        aria-pressed={discarded}
                        aria-label={`${displayChar(cell.ch)} — ${codepointLabel(cell.ch)}${discarded ? ', discarded' : ''}`}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          padding: '10px 4px 8px', borderRadius: 8, cursor: 'pointer',
                          background: isSelected ? 'var(--app-accent-subtle)' : (discarded ? 'var(--app-surface-2)' : 'var(--app-surface)'),
                          border: `1px solid ${isSelected ? 'var(--app-accent)' : 'var(--app-border)'}`,
                          opacity: discarded ? 0.55 : 1,
                        }}
                      >
                        <span style={{ font: "400 22px/1 var(--app-font-glyph)", color: 'var(--app-text)' }}>
                          {displayChar(cell.ch)}
                        </span>
                        <span style={{ fontSize: 9.5, fontFamily: 'var(--app-font-mono)', color: 'var(--app-text-subtle)' }}>
                          {codepointLabel(cell.ch)}
                        </span>
                        {cell.keys.length > 0 && <KeySeq keys={cell.keys} joiner="then" />}
                        {flag !== null && (
                          <span style={{
                            fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
                            color: flag === 'discarded' ? 'var(--app-text-subtle)' : flag === 'suggested' ? 'var(--sil-orange-dark)' : 'var(--sil-green)',
                          }}>
                            {flag}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
