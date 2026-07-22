import { useState, useMemo, useCallback, useEffect } from 'react';
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { toRailNodes, nodeState, buildCharWeb, annotateRemovalRecommendations, recommendedRemovalChars, coordinatedCollateralForSlots } from '../../lib/irToCarveNodes.ts';
import type { CarveNode, CharLocation, RecommendedRemovalChar, CoordinatedCollateralChar } from '../../lib/irToCarveNodes.ts';
import { KIND_COLOR } from '../assignLoop/parts/KindBadge.tsx';
import { StatusBar } from '../assignLoop/parts/StatusBar.tsx';
import type { RemovedItem } from '../assignLoop/parts/StatusBar.tsx';
import { DepBanner } from '../assignLoop/parts/DepBanner.tsx';
import type { DepNode } from '../assignLoop/parts/DepBanner.tsx';
import { RemovalBanner } from '../assignLoop/parts/RemovalBanner.tsx';
import { Rail } from '../assignLoop/parts/Rail.tsx';
import { Inspector } from '../assignLoop/parts/Inspector.tsx';
import { InfoView, capabilityHint } from '../assignLoop/parts/InfoView.tsx';
import { InfoIcon } from '../assignLoop/parts/carveShared.tsx';
import { ConfirmDialog } from '../assignLoop/parts/ConfirmDialog.tsx';
import { useHoverInfoStore } from '../../stores/hoverInfoStore.ts';
import { collectCharContributors, analyzeStores } from '@keyboard-studio/engine';
import type { CharContributors, StoreAnalysis } from '@keyboard-studio/engine';
import type { KeyboardIR, RemovalCapability } from '@keyboard-studio/contracts';
import { neededCharsForLanguage } from '../../lib/services.ts';

/** Pending cascade state — set when the user clicks a cross-wired chip. */
interface PendingCascade {
  gid: string;
  targetChar: string;
  /** 'remove' when clicking a live chip; 'restore' when clicking an already-removed one. */
  mode: 'remove' | 'restore';
  /** How many contributors will actually change (removable to remove, or restorable to restore). */
  actionCount: number;
  /** restore mode: the item-channel ids to un-delete. */
  restoreIds: string[];
  /** contributors.ruleNodeIds is the REMOVABLE set only; blocked carries the warnings (remove mode). */
  contributors: CharContributors;
  /**
   * Remove mode only (always `[]` for restore) — coordinated-drop collateral
   * this removal will ALSO cause in a PAIRED store, via
   * classifyStoreSlotEdit's `coordinatedWith` (see coordinatedCollateralForSlots).
   * Never silent: any non-empty collateral routes the click through this
   * dialog even when the clicked chip is otherwise its char's sole producer.
   */
  collateral: CoordinatedCollateralChar[];
}

/**
 * Pending BULK-removal cascade state — set when a store-card master toggle
 * (Rail's whole-store ToggleBox, or StoreDetail's "select all" toggle, both
 * routed through handleSetManyGlyphs) would ALSO drop a coordinated
 * collateral character from a paired store. A bulk removal is MORE likely to
 * hit a coordinated pair than a single chip (it can span every slot in a
 * store at once), so it gets the same "remove everywhere" awareness a single
 * chip gets via PendingCascade — one dialog for the whole batch, not one per
 * gid (see handleSetManyGlyphs below).
 */
interface PendingBulkCascade {
  /** The full batch of ids the caller asked to remove (glyph gids and/or store slot ids). */
  gids: string[];
  /** Coordinated-drop collateral aggregated across the WHOLE batch (deduped by partner slot id). */
  collateral: CoordinatedCollateralChar[];
}

interface BuildPendingCascadeArgs {
  ir: KeyboardIR | null;
  gid: string;
  targetChar: string;
  /** The clicked chip's own removal capability; undefined when the caller has none (store chips). */
  clickedCapability?: RemovalCapability | undefined;
  /** The clicked chip's card name, used only in the not-removable-clicked-chip warning. */
  clickedLabel: string;
  isItemDeleted: (id: string) => boolean;
  removalCapabilities: Map<string, RemovalCapability>;
  nodes: CarveNode[];
  /** Confirmed-inventory ∪ CLDR needed-set — threaded into coordinatedCollateralForSlots
   *  so a collateral partner char can be flagged "needed" in the confirm dialog. */
  needed: ReadonlySet<string>;
  /** Target language, for the Turkic-aware case fold in isCharCoveredForLocale. */
  bcp47?: string | null | undefined;
  /**
   * Precomputed engine analyzeStores(ir) result, hoisted ONCE per `ir` by the
   * caller (see the `storeAnalysis` memo below) and threaded through to
   * coordinatedCollateralForSlots — classifyStoreSlotEdit/describeStorePairing
   * scan every rule in the IR, so recomputing this per chip click would
   * re-scan the whole IR on every 300ms-cycle-adjacent click (#931 perf).
   * Undefined only when `ir` itself is null (buildPendingCascade bails before
   * using it in that case).
   */
  analysis: StoreAnalysis | undefined;
  /** From the caller's useLingui() — passed through to capabilityHint() and the "an advanced rule" fallback label below. */
  t: (descriptor: { id: string; message: string }) => string;
  i18n: import('@lingui/core').I18n;
}

/**
 * Pure resolver shared by the glyph-chip (handleCascadeDelete) and store-chip
 * (handleStoreChipCascade) cascade handlers. Runs collectCharContributors for
 * targetChar and decides whether the click should plain-toggle (returns null)
 * or open the cascade ConfirmDialog (returns a PendingCascade). Only the
 * caller-resolved clickedCapability/clickedLabel differ between callers —
 * store chips carry no per-rule capability, so they pass undefined / 'this character'.
 *
 * Manual-carve safety (#525/#931 follow-up): remove-mode ALWAYS resolves
 * coordinatedCollateralForSlots over the store slots this removal will
 * actually drop. Any non-empty collateral forces the ConfirmDialog open —
 * even for what would otherwise be a "sole producer" plain toggle — because
 * a coordinated drop can silently take a PAIRED store's aligned character
 * (e.g. a deadkey's composed output) along with it. Awareness, not
 * prevention: the user can still confirm and remove.
 */
function buildPendingCascade({
  ir, gid, targetChar, clickedCapability, clickedLabel, isItemDeleted, removalCapabilities, nodes, needed, bcp47, analysis, t, i18n,
}: BuildPendingCascadeArgs): PendingCascade | null {
  // No IR to analyse → plain single-chip toggle.
  if (ir == null) return null;

  const found: CharContributors = collectCharContributors(ir, targetChar);
  const isNotRemovable = (id: string) => (removalCapabilities.get(id) ?? '').startsWith('not-removable:');
  const clickedIsNotRemovable = (clickedCapability ?? '').startsWith('not-removable:');

  // --- RESTORE: the clicked chip is currently removed ---
  if (isItemDeleted(gid)) {
    const restoreIds = [...found.ruleNodeIds, ...found.storeSlotIds].filter((id) => isItemDeleted(id));
    if (!restoreIds.includes(gid)) restoreIds.push(gid);
    if (restoreIds.length <= 1) return null;
    return {
      gid, targetChar, mode: 'restore', actionCount: restoreIds.length, restoreIds,
      contributors: { ...found, blocked: [] },
      collateral: [],
    };
  }

  // --- REMOVE: the clicked chip is live ---
  const removableRuleIds = found.ruleNodeIds.filter((id) => !isNotRemovable(id));
  const blockedRuleIds = found.ruleNodeIds.filter(isNotRemovable);
  const ruleLabel = (id: string): string => {
    for (const node of nodes) if (node.glyphs?.some((g) => g.gid === id)) return node.name;
    return t({ id: 'editor.carve.advancedRuleFallbackLabel', message: 'an advanced rule' });
  };
  const blocked = [
    ...found.blocked,
    ...blockedRuleIds.map((id) => ({ label: ruleLabel(id), reason: capabilityHint(removalCapabilities.get(id) ?? 'not-removable:unknown', i18n) })),
  ];
  // The clicked "!" chip is often NOT a plain single-char producer, so it never
  // lands in found.ruleNodeIds/blockedRuleIds — add it explicitly so the warning
  // box always names the not-removable chip the user actually clicked.
  if (clickedIsNotRemovable && !blockedRuleIds.includes(gid)) {
    blocked.push({ label: clickedLabel, reason: capabilityHint(clickedCapability ?? 'not-removable:unknown', i18n) });
  }

  const removableCount = removableRuleIds.length + found.storeSlotIds.length;

  // Coordinated collateral — resolved over the store slots that will ACTUALLY
  // be dropped (classifyStoreSlotEdit inside the helper already filters to
  // mode 'drop' only, so a slot classifyStoreSlotEdit would block is never
  // reported as collateral here either). Threads the precomputed `analysis`
  // through so this doesn't re-scan the whole IR on every chip click (#931 perf).
  const collateral = coordinatedCollateralForSlots(found.storeSlotIds, ir, needed, bcp47, analysis);

  // Plain toggle (no dialog) ONLY for a removable chip that is its char's sole
  // producer, nothing blocked, AND no coordinated collateral. A not-removable
  // chip, or ANY collateral (even for a sole producer), ALWAYS opens the dialog.
  if (!clickedIsNotRemovable && removableCount <= 1 && blocked.length === 0 && collateral.length === 0) return null;

  return {
    gid, targetChar, mode: 'remove', actionCount: removableCount, restoreIds: [],
    contributors: { ...found, ruleNodeIds: removableRuleIds, blocked },
    collateral,
  };
}

/**
 * Coordinated-removal collateral warning box — shared markup for both the
 * single-cascade dialog (one clicked chip) and the bulk-cascade dialog (a
 * whole batch), which previously duplicated this `role="alert"` block
 * near-verbatim (#525/#931 follow-up review fix — dedup). Only the
 * anyNeeded lead-in copy differs between the two callers (singular chip vs
 * plural batch), switched via `plural`; the non-anyNeeded copy was already
 * identical in both.
 */
function CollateralWarning({ collateral, plural }: { collateral: CoordinatedCollateralChar[]; plural: boolean }) {
  const anyNeeded = collateral.some((c) => c.isNeeded);
  return (
    <div
      role="alert"
      style={{
        marginTop: 8,
        padding: '8px 12px',
        borderRadius: 8,
        background: 'color-mix(in srgb, var(--sil-orange) 10%, var(--app-surface))',
        border: anyNeeded
          ? '1px solid var(--sil-orange)'
          : '1px solid color-mix(in srgb, var(--sil-orange) 40%, transparent)',
        fontSize: 12,
        color: 'var(--sil-orange-dark)',
      }}
    >
      <b>
        {anyNeeded
          ? plural
            ? '⚠ This will also remove characters you need, from paired stores:'
            : '⚠ This will also remove a character you need, from a paired store:'
          : 'Removing this will also remove from paired stores:'}
      </b>{' '}
      {collateral.map((c, i) => (
        <span key={i}>
          &quot;{c.ch}&quot; from {c.storeName}
          {c.isNeeded ? <b> — needed for your language</b> : null}
          {i < collateral.length - 1 ? ', ' : ''}
        </span>
      ))}
    </div>
  );
}

interface CarveGalleryProps {
  onComplete: () => void;
  onBack?: (() => void) | undefined;
}

export function CarveGallery({ onComplete, onBack }: CarveGalleryProps) {
  const { t, i18n } = useLingui();
  const ir = useWorkingCopyStore((s) => s.ir);
  const removalCapabilities = useWorkingCopyStore((s) => s.removalCapabilities);
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  // #525 FOUNDATION slice — the confirmed Phase B inventory drives removal
  // recommendations. session.confirmedInventory is a deduped, NFC-normalized
  // string[] union across survey phases (see contracts/src/surveySession.ts);
  // built into a Set here purely for annotateRemovalRecommendations() lookups.
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const confirmedInventorySet = useMemo(
    () => new Set(confirmedInventory.map((ch) => ch.normalize('NFC'))),
    [confirmedInventory],
  );

  // #525 items 2/4 — language-driven surplus signal. Resolved ASYNCHRONOUSLY
  // here (CLDR is a network fetch) and passed as an already-resolved Set into
  // the pure annotateRemovalRecommendations() pass below — that function never
  // does I/O itself. Null means "not yet resolved" or "CLDR unavailable for
  // this language" (und/script-only/private-use/un-narrowed macrolang/no CLDR
  // locale match) — annotateRemovalRecommendations treats null the same as
  // "not supplied," falling back to inventory-only behavior (item 5's
  // graceful-fallback requirement).
  const identityBcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const [neededChars, setNeededChars] = useState<Set<string> | null>(null);
  useEffect(() => {
    // Reset synchronously BEFORE kicking off the new fetch (or bailing when
    // there's no bcp47) — otherwise, while a fetch for the previous language
    // is still in flight, neededChars keeps holding that stale language's
    // set and surplus gets computed against the wrong language until the
    // new fetch resolves. Degrading to inventory-only for that pending
    // window is the safe fallback (same contract null already carries).
    setNeededChars(null);
    if (!identityBcp47) return;
    let cancelled = false;
    neededCharsForLanguage(identityBcp47)
      .then((result) => { if (!cancelled) setNeededChars(result); })
      .catch(() => { if (!cancelled) setNeededChars(null); });
    return () => { cancelled = true; };
  }, [identityBcp47]);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted);
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);
  const deleteItem = useWorkingCopyStore((s) => s.deleteItem);
  const restoreItem = useWorkingCopyStore((s) => s.restoreItem);
  const restoreAll = useWorkingCopyStore((s) => s.restoreAll);
  const keepAll = useWorkingCopyStore((s) => s.keepAll);

  const cascadeDelete = useWorkingCopyStore((s) => s.cascadeDelete);
  const cascadeRestore = useWorkingCopyStore((s) => s.cascadeRestore);

  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);

  // Clear stale hover info when CarveGallery unmounts (e.g. navigating away).
  useEffect(() => () => clearInfo(), [clearInfo]);

  const nodes = useMemo(() => (ir ? toRailNodes(ir, removalCapabilities) : []), [ir, removalCapabilities]);

  // Precomputed ONCE per `ir` (memoized on its reference) and threaded through
  // every buildPendingCascade() call and the bulk-toggle collateral check
  // below — classifyStoreSlotEdit/describeStorePairing scan every rule in the
  // IR, so recomputing this per chip click would re-scan the whole IR on
  // every click within the 300ms cycle (#931 perf; see the analysis field doc
  // on BuildPendingCascadeArgs above).
  const storeAnalysis = useMemo(() => (ir ? analyzeStores(ir) : undefined), [ir]);

  // #525 FOUNDATION slice + items 2/4 (language-driven surplus) — non-destructive
  // removal-recommendation annotation, kept as a SEPARATE pass over `nodes`
  // (toRailNodes stays pure/unchanged). Skipped entirely (nodes pass through
  // unannotated) when instantiationMode is null (working copy not yet
  // instantiated) or there is no signal at all — inventory empty AND no CLDR
  // needed-set resolved — both cases have no signal to recommend from.
  // TODO(#525): Track-1 default filtering hooks in here too — a Track 1
  // (new-from-base) author gets different defaults than Track 2 (adapt-existing).
  const recommendedNodes = useMemo(
    () => (instantiationMode !== null && (confirmedInventorySet.size > 0 || neededChars !== null) && ir
      ? annotateRemovalRecommendations(nodes, ir, confirmedInventorySet, neededChars, identityBcp47)
      : nodes),
    [nodes, ir, instantiationMode, confirmedInventorySet, neededChars, identityBcp47],
  );

  // #525 BANNER slice — character-level companion to recommendedNodes above,
  // driving the green removal-recommendation banner's flat checklist. `needed`
  // is the SAME neededChars ∪ confirmedInventory union annotateRemovalRecommendations
  // computes internally, pre-unioned here so recommendedRemovalChars (a pure
  // character-granularity pass) doesn't need to know about the two-signal shape.
  const neededSet = useMemo(
    () => (neededChars ? new Set([...neededChars, ...confirmedInventorySet]) : confirmedInventorySet),
    [neededChars, confirmedInventorySet],
  );
  const recommendedChars = useMemo(
    () => (instantiationMode !== null && (confirmedInventorySet.size > 0 || neededChars !== null) && ir
      ? recommendedRemovalChars({ ir, needed: neededSet, bcp47: identityBcp47 })
      : []),
    [ir, instantiationMode, confirmedInventorySet, neededChars, neededSet, identityBcp47],
  );

  // Bulk removal from the banner checklist deliberately skips the per-removal
  // ConfirmDialog that handleCascadeDelete/handleStoreChipCascade open below —
  // the checklist itself (every row pre-checked, individually uncheckable
  // before the author clicks "Remove all selected") IS the confirmation for
  // this batch, so a second per-character dialog would be redundant.
  const handleRemoveSelectedRecommended = useCallback((selected: RecommendedRemovalChar[]) => {
    const ruleNodeIds: string[] = [];
    const storeSlotIds: string[] = [];
    for (const { contributors } of selected) {
      ruleNodeIds.push(...contributors.ruleNodeIds);
      storeSlotIds.push(...contributors.storeSlotIds);
    }
    if (ruleNodeIds.length === 0 && storeSlotIds.length === 0) return;
    cascadeDelete(ruleNodeIds, storeSlotIds);
  }, [cascadeDelete]);

  // Cross-reference web: character → all the group/pattern/store cards it lives in.
  // Built ONCE per node set (not per glyph). Powers the summary tags on each card.
  const charWeb = useMemo(() => buildCharWeb(nodes), [nodes]);

  // Gate: show the "all clear" screen only when ALL of the following hold:
  //   1. Track 1 (adapting a base) — Track 2 authors know their own keyboard and want to review it.
  //   2. No recognised patterns, user stores, or raw fragments — nothing complex to carve.
  //   3. At most one plain group AND that group has ≤ 20 displayable glyphs — a truly small keyboard.
  //      Arabic / Ethiopic / CJK keyboards with hundreds of rules in "main" must go to the full carver.
  // TODO(#525): once removal recommendations are trustworthy enough, this gate should
  // also consider whether any 'high'-recommendation nodes exist ("Your rules look good"
  // is a poor message when the tool has active suggestions to show) — deferred out of
  // this FOUNDATION slice; do not change the gate predicate here yet.
  const isSimple = useMemo(() => {
    if (instantiationMode === 'adapt-existing') return false;
    if (nodes.some((n) => n.kind === 'pattern' || n.kind === 'store' || n.kind === 'raw')) return false;
    const groups = nodes.filter((n) => n.kind === 'group');
    if (groups.length > 1) return false;
    const totalGlyphs = groups.reduce((sum, g) => sum + (g.glyphs?.length ?? 0), 0);
    return totalGlyphs <= 20;
  }, [nodes, instantiationMode]);
  const [forceOpen, setForceOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(() => null);
  const selectedNode = useMemo<CarveNode | undefined>(
    () => recommendedNodes.find((n) => n.nodeId === selectedId) ?? recommendedNodes[0],
    [recommendedNodes, selectedId],
  );

  // -- Cascade-delete state ----------------------------------------------------
  const [pendingCascade, setPendingCascade] = useState<PendingCascade | null>(null);

  // -- Bulk cascade-delete state (P0 — store-card master toggle) ---------------
  const [pendingBulkCascade, setPendingBulkCascade] = useState<PendingBulkCascade | null>(null);

  // -- Cross-reference "web" popup (a character's other locations) --------------
  const [webPopup, setWebPopup] = useState<{ ch: string; locations: CharLocation[] } | null>(null);

  // Clicking a summary tag: exactly one other location → jump straight there;
  // more than one → open the popup list so the user can pick.
  const handleWebTag = useCallback((ch: string, locations: CharLocation[]) => {
    if (locations.length === 1) { setSelectedId(locations[0]!.nodeId); return; }
    if (locations.length > 1) { setWebPopup({ ch, locations }); }
  }, []);

  /**
   * Handler for Rail/Inspector bulk-toggle callbacks (a store card's master
   * toggle, or StoreDetail's "select all" toggle) — gids may be glyph gids,
   * store-slot ids, or a mix.
   *
   * Restore (off === false) never routes through the collateral guard —
   * restoring can't silently drop anything, only bring characters back.
   *
   * Remove (off === true): resolves coordinatedCollateralForSlots over the
   * WHOLE batch at once (P0 — a bulk removal is more likely than a single
   * chip to hit a coordinated pair, since it can touch every slot in a store
   * in one click — see Rail.tsx's whole-store ToggleBox). Any aggregated
   * collateral opens ONE confirm dialog for the batch (not one per gid); with
   * no collateral, the batch applies immediately (existing fast path,
   * unchanged for the common case).
   */
  const handleSetManyGlyphs = useCallback((gids: string[], off: boolean) => {
    if (!off) {
      gids.forEach((gid) => restoreItem(gid));
      return;
    }
    if (ir == null) {
      gids.forEach((gid) => deleteItem(gid));
      return;
    }
    const collateral = coordinatedCollateralForSlots(gids, ir, neededSet, identityBcp47, storeAnalysis);
    if (collateral.length === 0) {
      gids.forEach((gid) => deleteItem(gid));
      return;
    }
    setPendingBulkCascade({ gids, collateral });
  }, [ir, deleteItem, restoreItem, neededSet, identityBcp47, storeAnalysis]);

  const handleBulkCascadePrimary = useCallback(() => {
    if (!pendingBulkCascade) return;
    // Reuses cascadeDelete (the SAME persistence path as the single-chip
    // cascade's handleCascadePrimary below) so the batch AND the aggregated
    // collateral slot ids land in deletedItemIds together, as one undo entry.
    const collateralSlotIds = pendingBulkCascade.collateral.map((c) => c.slotId);
    // gids may mix glyph gids and store-slot ids; passed positionally into
    // storeSlotIds (not ruleNodeIds) is safe because cascadeDelete unions
    // both id params into one item-channel set (workingCopyStore.ts).
    cascadeDelete([], [...pendingBulkCascade.gids, ...collateralSlotIds]);
    setPendingBulkCascade(null);
  }, [pendingBulkCascade, cascadeDelete]);

  const handleBulkCascadeCancel = useCallback(() => {
    setPendingBulkCascade(null);
  }, []);

  const handleToggleNode = useCallback((nodeId: string, off: boolean) => {
    if (off) { deleteNode(nodeId); } else { restoreNode(nodeId); }
  }, [deleteNode, restoreNode]);

  const handleToggleGlyph = useCallback((gid: string) => {
    if (isItemDeleted(gid)) { restoreItem(gid); } else { deleteItem(gid); }
  }, [isItemDeleted, restoreItem, deleteItem]);

  /**
   * Chip-body click → cascade TOGGLE. Resolves every place the character is
   * produced (collectCharContributors), then branches on the clicked chip's state:
   *  - LIVE chip → remove. Sole removable producer with nothing blocked toggles
   *    plainly; otherwise a "remove everywhere" dialog opens. Not-removable ("!")
   *    pieces are split out of the delete set and shown as a warning, never swept.
   *  - Already-REMOVED chip → restore. Sole restorable producer toggles plainly;
   *    otherwise a "restore everywhere" dialog un-deletes every place it was cut.
   */
  const handleCascadeDelete = useCallback((gid: string) => {
    // Resolve the clicked glyph — output char, removal capability, and its card.
    let targetChar: string | undefined;
    let clickedCapability: RemovalCapability | undefined;
    let clickedLabel = t({ id: 'editor.carve.thisKeyFallbackLabel', message: 'this key' });
    for (const node of nodes) {
      if (!node.glyphs) continue;
      const glyph = node.glyphs.find((g) => g.gid === gid);
      if (glyph) { targetChar = glyph.ch; clickedCapability = glyph.capability; clickedLabel = node.name; break; }
    }

    // Glyph not found → do nothing rather than toggle an untracked id.
    if (targetChar === undefined) return;

    const pending = buildPendingCascade({
      ir, gid, targetChar, clickedCapability, clickedLabel, isItemDeleted, removalCapabilities, nodes,
      needed: neededSet, bcp47: identityBcp47, analysis: storeAnalysis, t, i18n,
    });
    if (pending === null) { handleToggleGlyph(gid); return; }
    setPendingCascade(pending);
  }, [nodes, ir, handleToggleGlyph, isItemDeleted, removalCapabilities, neededSet, identityBcp47, storeAnalysis, t, i18n]);

  /**
   * Store-chip cascade toggle — same "remove/restore everywhere" contract as
   * handleCascadeDelete, but for a StoreChip inside StoreDetail. Store chips
   * already know their character directly (StoreCharChip.ch), so there's no
   * nodes[].glyphs lookup and no per-chip removal capability to weigh — a
   * store slot's own removability is decided upstream by classifyStoreSlotEdit
   * (StoreChip never calls onToggle for a 'disabled' chip in the first place).
   */
  const handleStoreChipCascade = useCallback((chipId: string, ch: string) => {
    const pending = buildPendingCascade({
      ir, gid: chipId, targetChar: ch,
      clickedLabel: t({ id: 'editor.carve.thisCharacterFallbackLabel', message: 'this character' }),
      isItemDeleted, removalCapabilities, nodes,
      needed: neededSet, bcp47: identityBcp47, analysis: storeAnalysis, t, i18n,
    });
    if (pending === null) { handleToggleGlyph(chipId); return; }
    setPendingCascade(pending);
  }, [nodes, ir, handleToggleGlyph, isItemDeleted, removalCapabilities, neededSet, identityBcp47, storeAnalysis, t, i18n]);

  const handleCascadePrimary = useCallback(() => {
    if (!pendingCascade) return;
    if (pendingCascade.mode === 'restore') {
      cascadeRestore(pendingCascade.restoreIds);
    } else {
      // P1 fix: fold the CONFIRMED collateral partner slot ids into the same
      // cascadeDelete call so they land in deletedItemIds alongside the
      // primary removal. Without this, "Yes, remove everywhere" only marked
      // the directly-targeted slots as deleted — the Gallery kept showing
      // the collateral char as KEPT even though export-time
      // applyStoreSlotRemovals coordinately drops it regardless, a silent
      // divergence between the reviewed state and the exported .kmn.
      const collateralSlotIds = pendingCascade.collateral.map((c) => c.slotId);
      cascadeDelete(
        pendingCascade.contributors.ruleNodeIds,
        [...pendingCascade.contributors.storeSlotIds, ...collateralSlotIds],
      );
    }
    setPendingCascade(null);
  }, [pendingCascade, cascadeDelete, cascadeRestore]);

  const handleCascadeCancel = useCallback(() => {
    // Cancel — do nothing. Also the target for Escape / backdrop click, so a
    // dismissed dialog never leaves a half-cut character behind. Removing the
    // character from only one of its wired locations is intentionally NOT
    // offered: it would leave the broken cross-references this cascade exists
    // to prevent.
    setPendingCascade(null);
  }, []);

  // Kept / total counts
  const { kept, total } = useMemo(() => {
    let totalCount = 0, k = 0;
    nodes.forEach((node) => {
      if (node.glyphs) {
        totalCount += node.glyphs.length;
        k += node.glyphs.filter((g) => !isItemDeleted(g.gid)).length;
      }
    });
    return { kept: k, total: totalCount };
  }, [nodes, deletedItemIds, isItemDeleted]);

  // Removed list for StatusBar
  const removedList = useMemo<RemovedItem[]>(() => {
    const list: RemovedItem[] = [];
    const fullOffIds = new Set<string>();
    // Every item id already surfaced via a pattern/group glyph entry.
    // Output-store chip ids intentionally equal the S-02 fan-out glyph gids
    // (locked gid contract), so the store-chip pass below must skip these to
    // avoid listing the same removed character twice.
    const seenItemIds = new Set<string>();

    // Pattern/group nodes that are fully off
    for (const node of nodes) {
      if ((node.kind === 'pattern' || node.kind === 'group') && nodeState(node, isItemDeleted, isDeleted) === 'off') {
        fullOffIds.add(node.nodeId);
        list.push({ type: 'node', id: node.nodeId, kind: node.kind, label: node.name, count: node.glyphs?.length ?? 0, glyphIds: node.glyphs?.map((g) => g.gid) });
      } else if ((node.kind === 'store' || node.kind === 'raw') && isDeleted(node.nodeId)) {
        list.push({ type: 'node', id: node.nodeId, kind: node.kind, label: node.name, count: 1 });
      }
    }

    // Partially-removed glyphs from pattern/group nodes
    for (const node of nodes) {
      if (!node.glyphs || fullOffIds.has(node.nodeId)) continue;
      for (const glyph of node.glyphs) {
        if (deletedItemIds.has(glyph.gid)) {
          seenItemIds.add(glyph.gid);
          list.push({ type: 'item', id: glyph.gid, ch: glyph.ch, keys: glyph.keys, nodeName: node.name });
        }
      }
    }

    // Store per-character chips — skips whole-deleted stores and dedupes
    for (const node of nodes) {
      if (node.kind !== 'store' || !node.storeChips || isDeleted(node.nodeId)) continue;
      for (const chip of node.storeChips) {
        if (chip.action !== 'disabled' && deletedItemIds.has(chip.chipId) && !seenItemIds.has(chip.chipId)) {
          seenItemIds.add(chip.chipId);
          list.push({ type: 'item', id: chip.chipId, ch: chip.ch, keys: [], nodeName: node.name });
        }
      }
    }
    return list;
  }, [nodes, deletedItemIds, deletedNodeIds, isItemDeleted, isDeleted]);

  const handleRestore = useCallback((item: RemovedItem) => {
    if (item.type === 'item') { restoreItem(item.id); return; }
    item.glyphIds?.forEach((gid) => restoreItem(gid));
    restoreNode(item.id);
  }, [restoreItem, restoreNode]);

  // DepBanner — orphaned patterns + newly-unused stores
  const { orphanedNodes, unusedStoreNodes } = useMemo(() => {
    const orphaned: DepNode[] = [];
    const unusedStores: DepNode[] = [];

    for (const node of nodes) {
      const state = nodeState(node, isItemDeleted, isDeleted);

      // Orphaned pattern/group — all glyphs removed but node itself not deleted
      if ((node.kind === 'pattern' || node.kind === 'group') && !isDeleted(node.nodeId) && state === 'off') {
        orphaned.push({ nodeId: node.nodeId, name: node.name });
      }

      if (node.kind !== 'store' || isDeleted(node.nodeId)) continue;

      // S-02 output stores — unused when their parent pattern is fully off
      if (node.referencedByNodeId !== undefined) {
        const refNode = nodes.find((n) => n.nodeId === node.referencedByNodeId);
        if (refNode && nodeState(refNode, isItemDeleted, isDeleted) === 'off') {
          unusedStores.push({ nodeId: node.nodeId, name: node.name });
        }
        continue;
      }

      // any()/index() stores — unused when ALL consumers are off
      if (node.storeUsage && (node.storeUsage.patternRefs.length > 0 || node.storeUsage.groupRefs.length > 0)) {
        const allConsumersOff =
          node.storeUsage.patternRefs.every((r) => {
            const pNode = nodes.find((n) => n.nodeId === r.patternId);
            return pNode ? nodeState(pNode, isItemDeleted, isDeleted) === 'off' : isDeleted(r.patternId);
          }) &&
          node.storeUsage.groupRefs.every((r) => {
            const gNode = nodes.find((n) => n.nodeId === r.groupId);
            return gNode ? nodeState(gNode, isItemDeleted, isDeleted) === 'off' : isDeleted(r.groupId);
          });
        if (allConsumersOff) {
          unusedStores.push({ nodeId: node.nodeId, name: node.name });
        }
      }
    }
    return { orphanedNodes: orphaned, unusedStoreNodes: unusedStores };
  }, [nodes, deletedItemIds, deletedNodeIds, isItemDeleted, isDeleted]);

  if (!ir) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
        <p style={{ fontSize: 14, color: 'var(--app-text-muted)' }}>
          <Trans id="editor.carve.loadingKeyboard">Loading keyboard…</Trans>
        </p>
      </div>
    );
  }

  const hasRawFragments = ir.raw.length > 0;

  // Gate screen — shown for simple keyboards with nothing complex to carve.
  // No longer gated on hasRawFragments: isSimple already returns false whenever
  // any raw-kind node exists, so the gate screen is naturally suppressed for
  // fragment-bearing keyboards without a redundant guard here.
  if (isSimple && !forceOpen) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)', gap: 24, padding: '0 32px', textAlign: 'center' }}>
        <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={12} cy={12} r={10} />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <div>
          <h2 style={{ margin: '0 0 8px', font: "500 22px/1.15 'Playfair Display', serif", color: 'var(--app-text)' }}>
            <Trans id="editor.carve.rulesLookGood">Your rules look good</Trans>
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--app-text-muted)', maxWidth: 400, lineHeight: 1.6 }}>
            <Trans id="editor.carve.rulesLookGoodBody">
              This keyboard uses standard rules in a single group — there's nothing complex to review or remove.
            </Trans>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => {
              const mainGroup = nodes.find((n) => n.kind === 'group' && n.name === 'main')
                ?? nodes.find((n) => n.kind === 'group');
              if (mainGroup) setSelectedId(mainGroup.nodeId);
              setForceOpen(true);
            }}
            style={{ font: '600 13.5px var(--app-font)', cursor: 'pointer', color: 'var(--app-accent-text)', background: 'var(--app-surface-2)', border: '1px solid var(--app-border-strong)', borderRadius: 9, padding: '10px 20px' }}
          >
            <Trans id="editor.carve.openCarverAnyway">Open rule carver anyway</Trans>
          </button>
          <button
            onClick={() => { keepAll(); onComplete(); }}
            style={{ font: '600 13.5px var(--app-font)', cursor: 'pointer', color: '#fff', background: 'var(--app-accent)', border: 'none', borderRadius: 9, padding: '10px 22px' }}
          >
            <Trans id="editor.carve.skipCarverButton">Skip Rule Carver →</Trans>
          </button>
        </div>
        {onBack !== undefined && (
          <button onClick={onBack} style={{ font: '13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-subtle)', background: 'transparent', border: 'none', marginTop: 4 }}>
            <Trans id="editor.carve.backButton">← Back</Trans>
          </button>
        )}
      </div>
    );
  }

  return (
    <div data-testid="carve-gallery" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* Raw-fragment note — informational only; removals apply normally */}
      {hasRawFragments && (
        <div
          role="note"
          aria-label={t({ id: "editor.carve.rawFragmentsNoteAriaLabel", message: "Advanced rule blocks preserved" })}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 22px', background: 'var(--accent-bg)', borderBottom: '1px solid color-mix(in srgb, var(--app-accent) 35%, transparent)', fontSize: 13, color: 'var(--app-text-muted)', lineHeight: 1.5 }}
        >
          <span style={{ flexShrink: 0, marginTop: 1, color: 'var(--app-accent)', display: 'inline-flex' }}><InfoIcon size={14} /></span>
          <span>
            {t({
              id: "editor.carve.rawFragmentsNoteBody",
              message: plural(ir.raw.length, {
                one: "This keyboard contains # advanced rule block the editor preserves as-is. Removals you make here are applied normally — the preserved blocks are left unchanged.",
                other: "This keyboard contains # advanced rule blocks the editor preserves as-is. Removals you make here are applied normally — the preserved blocks are left unchanged.",
              }),
            })}
          </span>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}>
        {onBack !== undefined && (
          <button
            onClick={onBack}
            onMouseEnter={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.backHoverTitle", message: "Back" }), body: t({ id: "editor.carve.backHoverBody", message: "Return to the previous step." }) })}
            onFocus={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.backHoverTitle", message: "Back" }), body: t({ id: "editor.carve.backHoverBody", message: "Return to the previous step." }) })}
            onMouseLeave={clearInfo}
            onBlur={clearInfo}
            style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: 'none', padding: '4px 0', whiteSpace: 'nowrap' }}
          >
            <Trans id="editor.carve.backButton">← Back</Trans>
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 10.5px/1 var(--app-font)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--app-text-subtle)' }}>
            <Trans id="editor.carve.phaseDEyebrow">Phase D · Carve</Trans>
          </div>
          <h1 style={{ margin: '6px 0 0', font: "500 23px/1.1 'Playfair Display', serif", color: 'var(--app-text)' }}>
            <Trans id="editor.carve.heading">Review your keyboard's rules</Trans>
          </h1>
        </div>
        <button
          onClick={() => setInfoOpen((v) => { if (v) clearInfo(); return !v; })}
          aria-pressed={infoOpen}
          aria-label={infoOpen ? t({ id: "editor.carve.hideInfoPanel", message: "Hide info panel" }) : t({ id: "editor.carve.showInfoPanel", message: "Show info panel" })}
          onMouseEnter={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.infoPanelHoverTitle", message: "Info panel" }), body: t({ id: "editor.carve.infoPanelHoverBody", message: "Show or hide this panel. It describes whatever your cursor is over." }) })}
          onFocus={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.infoPanelHoverTitle", message: "Info panel" }), body: t({ id: "editor.carve.infoPanelHoverBody", message: "Show or hide this panel. It describes whatever your cursor is over." }) })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', borderRadius: 8, padding: '7px 13px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5, marginRight: 4, background: infoOpen ? 'var(--app-accent)' : 'transparent', color: infoOpen ? '#fff' : 'var(--app-text-muted)', border: infoOpen ? '1px solid var(--app-accent)' : '1px solid var(--app-border-strong)', fontWeight: infoOpen ? 700 : 600 }}
        >
          <InfoIcon size={14} />
          <Trans id="editor.carve.infoButton">Info</Trans>
        </button>
        <button
          onClick={() => { keepAll(); onComplete(); }}
          onMouseEnter={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.skipCarvingHoverTitle", message: "Skip carving" }), body: t({ id: "editor.carve.skipCarvingHoverBody", message: "Keep every rule and continue without removing anything." }) })}
          onFocus={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.skipCarvingHoverTitle", message: "Skip carving" }), body: t({ id: "editor.carve.skipCarvingHoverBody", message: "Keep every rule and continue without removing anything." }) })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '7px 13px', whiteSpace: 'nowrap', marginRight: 6 }}
        >
          <Trans id="editor.carve.skipButton">Skip</Trans>
        </button>
        <button
          data-testid="carve-continue"
          onClick={onComplete}
          onMouseEnter={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.continueHoverTitle", message: "Continue" }), body: t({ id: "editor.carve.continueHoverBody", message: "Save your changes and move to the next step." }) })}
          onFocus={() => setInfo({ kind: 'text', title: t({ id: "editor.carve.continueHoverTitle", message: "Continue" }), body: t({ id: "editor.carve.continueHoverBody", message: "Save your changes and move to the next step." }) })}
          onMouseLeave={clearInfo}
          onBlur={clearInfo}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: '#fff', background: 'var(--app-accent)', border: 'none', borderRadius: 8, padding: '9px 18px' }}
        >
          <Trans id="editor.carve.continueButton">Continue →</Trans>
        </button>
      </div>

      {/* Removal-recommendation banner (#525 BANNER slice) — the single surface
          for the character-level removal signal; replaces the old per-node
          "Suggested removal" Rail badge (see Rail.tsx). */}
      <RemovalBanner
        recommended={recommendedChars}
        languageLabel={identityBcp47 ?? t({ id: "editor.carve.yourTargetLanguageFallback", message: "your target language" })}
        onRemoveSelected={handleRemoveSelectedRecommended}
      />

      {/* Status bar */}
      <StatusBar
        kept={kept}
        total={total}
        removedList={removedList}
        onRestore={handleRestore}
        onRestoreAll={restoreAll}
      />

      {/* Dependency banner */}
      <DepBanner
        orphanedNodes={orphanedNodes}
        unusedStoreNodes={unusedStoreNodes}
        onRemoveNode={(nodeId) => handleToggleNode(nodeId, true)}
      />

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Rail
          nodes={recommendedNodes}
          selectedId={selectedNode?.nodeId ?? null}
          onSelect={setSelectedId}
          isItemDeleted={isItemDeleted}
          isDeleted={isDeleted}
          onSetManyGlyphs={handleSetManyGlyphs}
          onToggleNode={handleToggleNode}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Inspector
            node={selectedNode}
            nodes={recommendedNodes}
            isItemDeleted={isItemDeleted}
            onToggleGlyph={handleToggleGlyph}
            onSetManyGlyphs={handleSetManyGlyphs}
            isDeleted={isDeleted}
            onToggleNode={handleToggleNode}
            onSelectNode={setSelectedId}
            onCascadeDelete={handleCascadeDelete}
            onStoreCascade={handleStoreChipCascade}
            charWeb={charWeb}
            onWebTag={handleWebTag}
          />
          {infoOpen && <InfoView />}
        </div>
      </div>

      {/* Cascade-delete confirmation dialog */}
      {pendingCascade !== null && (() => {
        const isRestore = pendingCascade.mode === 'restore';
        const hasActions = pendingCascade.actionCount > 0;
        const title = isRestore
          ? t({ id: "editor.carve.cascade.restoreTitle", message: `Restore "${{ char: pendingCascade.targetChar }}" everywhere?` })
          : hasActions
            ? t({ id: "editor.carve.cascade.removeTitle", message: `Remove "${{ char: pendingCascade.targetChar }}" everywhere?` })
            : t({ id: "editor.carve.cascade.cannotFullyRemoveTitle", message: `"${{ char: pendingCascade.targetChar }}" can't be fully removed` });
        const message = isRestore
          ? t({ id: "editor.carve.cascade.restoreMessage", message: 'This character was removed from several places. Restore it everywhere it was removed?' })
          : hasActions
            ? t({ id: "editor.carve.cascade.removeMessage", message: 'This character appears in multiple places. Removing it everywhere keeps the keyboard consistent; removing it from just one place may leave broken references.' })
            : t({ id: "editor.carve.cascade.cannotFullyRemoveMessage", message: 'This character is produced by advanced rules that can\'t be removed automatically — see below.' });
        return (
        <ConfirmDialog
          open={true}
          title={title}
          body={
            <div>
              <p style={{ margin: '0 0 10px' }}>
                {message}
              </p>
              {!isRestore && pendingCascade.contributors.storeSlotIds.length > 0 && (
                <p style={{ margin: '0 0 10px' }}>
                  <Trans id="editor.carve.cascade.storeSlotNote">
                    Note: the key or sequence that triggers this character will still
                    exist, but will now produce nothing.
                  </Trans>
                </p>
              )}
              <ul
                aria-label={t({ id: "editor.carve.cascade.locationsAffectedAriaLabel", message: "Locations affected" })}
                style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13 }}
              >
                {(['group', 'pattern', 'store'] as const).map((kind) => {
                  const labels = pendingCascade.contributors.locations
                    .filter((l) => l.kind === kind)
                    .map((l) => l.label);
                  if (labels.length === 0) return null;
                  // Pluralize the kind label only when it has more than one entry.
                  // kind/kindLabel are the raw enum-ish kind string ("group" /
                  // "pattern" / "store"), left untranslated — same judgment call
                  // as GlyphCell's cross-reference tags (see report).
                  const kindLabel = labels.length > 1 ? `${kind}s` : kind;
                  return (
                    <li key={kind} style={{ marginBottom: 4 }}>
                      <b style={{ textTransform: 'capitalize' }}>{kindLabel}</b>
                      {': '}
                      <span style={{ fontFamily: 'var(--app-font-mono)' }}>{labels.join(', ')}</span>
                    </li>
                  );
                })}
              </ul>
              {/* Coordinated-removal collateral (#525/#931 follow-up) — a manual
                  removal that hits a PAIRED store also drops that store's
                  aligned partner character at the same position. Never
                  silent: shown for every collateral char, with a needed one
                  flagged prominently so the author can back out via Cancel. */}
              {!isRestore && pendingCascade.collateral.length > 0 && (
                <CollateralWarning collateral={pendingCascade.collateral} plural={false} />
              )}
              {pendingCascade.contributors.blocked.length > 0 && (
                <div
                  role="alert"
                  style={{
                    marginTop: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--sil-orange) 10%, var(--app-surface))',
                    border: '1px solid color-mix(in srgb, var(--sil-orange) 40%, transparent)',
                    fontSize: 12,
                    color: 'var(--sil-orange-dark)',
                  }}
                >
                  <b><Trans id="editor.carve.cascade.markedNotRemovable">⚠ Marked not-removable — these will stay:</Trans></b>{' '}
                  {pendingCascade.contributors.blocked.map((b, i) => (
                    <span key={i}>
                      {b.label} ({b.reason}){i < pendingCascade.contributors.blocked.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          }
          primaryLabel={
            isRestore
              ? t({ id: "editor.carve.cascade.restorePrimaryButton", message: "Yes, restore everywhere" })
              : hasActions
                ? t({ id: "editor.carve.cascade.removePrimaryButton", message: "Yes, remove everywhere" })
                : t({ id: "editor.carve.cascade.okButton", message: "OK" })
          }
          onPrimary={!isRestore && !hasActions ? handleCascadeCancel : handleCascadePrimary}
          {...(!isRestore && !hasActions ? {} : { secondaryLabel: t({ id: "editor.carve.cascade.cancelButton", message: "Cancel" }), onSecondary: handleCascadeCancel })}
        />);
      })()}

      {/* Bulk cascade-delete confirmation dialog (P0 — store-card master
          toggle). ONE dialog for the whole batch, aggregating the coordinated
          collateral across every slot the batch will drop — see
          handleSetManyGlyphs above. */}
      {pendingBulkCascade !== null && (() => {
        const n = pendingBulkCascade.gids.length;
        return (
          <ConfirmDialog
            open={true}
            title="Remove everywhere?"
            body={
              <div>
                <p style={{ margin: '0 0 10px' }}>
                  Removing {n} selected character{n !== 1 ? 's' : ''} will also drop the following
                  paired character{pendingBulkCascade.collateral.length !== 1 ? 's' : ''} from linked stores.
                </p>
                <CollateralWarning collateral={pendingBulkCascade.collateral} plural={true} />
              </div>
            }
            primaryLabel="Yes, remove everywhere"
            onPrimary={handleBulkCascadePrimary}
            secondaryLabel="Cancel"
            onSecondary={handleBulkCascadeCancel}
          />
        );
      })()}

      {/* Cross-reference web popup — the character's OTHER locations, each a link. */}
      {webPopup !== null && (
        <ConfirmDialog
          open={webPopup !== null}
          title={t({ id: "editor.carve.webPopup.title", message: `Where "${{ char: webPopup.ch }}" also appears` })}
          body={
            <div>
              <p style={{ margin: '0 0 12px' }}>
                <Trans id="editor.carve.webPopup.body">
                  This character also lives in these places — click one to jump to it in the rail.
                </Trans>
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {webPopup.locations.map((loc) => (
                  <li key={loc.kind + ':' + loc.nodeId}>
                    <button
                      type="button"
                      onClick={() => { setSelectedId(loc.nodeId); setWebPopup(null); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        background: 'var(--app-surface-2)', border: '1px solid var(--app-border)',
                        color: 'var(--app-text)', font: '500 13px var(--app-font)',
                      }}
                    >
                      <span style={{
                        font: '600 9px/1 var(--app-font-mono)', letterSpacing: '.04em', textTransform: 'uppercase',
                        padding: '2px 6px', borderRadius: 6, whiteSpace: 'nowrap',
                        color: KIND_COLOR[loc.kind],
                        background: `color-mix(in srgb, ${KIND_COLOR[loc.kind]} 15%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${KIND_COLOR[loc.kind]} 40%, transparent)`,
                      }}>
                        {loc.kind}
                      </span>
                      <span style={{ fontFamily: 'var(--app-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loc.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          }
          primaryLabel={t({ id: "editor.carve.webPopup.closeButton", message: "Close" })}
          onPrimary={() => setWebPopup(null)}
        />
      )}
    </div>
  );
}
