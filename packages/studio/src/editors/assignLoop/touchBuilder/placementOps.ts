// placementOps — pure planner for the placement bar's drop modal.
//
// Given a dropped letter, the target key, and the user's modal choice, this
// builds the `PendingKeyEditOperation` sequence the pane commits (one undo
// batch via sequential `commitKeyEdit` calls, slice-spec §4). Pure and
// unit-tested; the pane owns drag state, the modal, and the tray.
//
// Slot semantics:
// - surface: the key's face — `set` text+output to the letter, so the key
//   produces it. A displaced surface glyph can be demoted to a longpress or
//   sent back to the placement tray.
// - longpress: append a longpress subkey (never replaces).
// - flick: upsert the direction slot; a displaced flick glyph can be demoted
//   or sent back like a surface.
// - multitap: 2x = the letter on double-tap (multitap[0]), 3x = triple-tap
//   (multitap[1]). The contract has no reorder op, so this removes the
//   existing multitap entries and re-adds them in the new order — nothing is
//   displaced, only reordered.
import type { TouchKeyIR } from "@keyboard-studio/contracts";
import type { PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";
import type { FlickDirection } from "./touchBuilderModel.ts";

/** Key class union, mirroring the engine's `EditableKeySp`. */
type KeySp = 0 | 1 | 2 | 8 | 9 | 10;

/** What the placement modal resolved to. */
export type PlacementChoice =
  | { slot: "surface"; displaced: "demote" | "sendBack" | null }
  | { slot: "longpress" }
  | { slot: "flick"; direction: FlickDirection; displaced: "demote" | "sendBack" | null }
  | { slot: "multitap"; tap: 2 | 3 };

export interface PlacementOpPlan {
  readonly ops: PendingKeyEditOperation[];
  /** Displaced glyph the user sent back to the placement tray. */
  readonly displacedBackToTray: string | null;
}

/**
 * True when the text is a real glyph worth preserving on displace — not
 * empty and not a `*Special*` key alias.
 */
export function isPreservableText(text: string | undefined): boolean {
  return text !== undefined && text !== "" && !/^\*[^*]+\*$/.test(text);
}

/**
 * The glyph currently occupying the choice's slot, when one is worth
 * preserving (null when the slot is empty or holds a special alias).
 */
export function placementOccupant(
  targetKey: TouchKeyIR,
  choice: PlacementChoice,
): string | null {
  if (choice.slot === "surface") {
    return isPreservableText(targetKey.text) ? targetKey.text! : null;
  }
  if (choice.slot === "flick") {
    const text = targetKey.flick?.[choice.direction]?.text;
    return isPreservableText(text) ? text! : null;
  }
  return null;
}

/**
 * Build the op sequence for a placement. `freshId` is the one minted
 * subkey id this plan may consume (every branch needs at most one).
 */
export function buildPlacementOps(
  address: string,
  targetKey: TouchKeyIR,
  letter: string,
  choice: PlacementChoice,
  freshId: string,
): PlacementOpPlan {
  const ops: PendingKeyEditOperation[] = [];
  let displacedBackToTray: string | null = null;

  const demoteToLongpress = (text: string): void => {
    ops.push({
      address,
      kind: "setSubKey",
      sub: { kind: "sk", id: freshId },
      fields: { id: freshId, text, sp: 0 },
    });
  };

  const handleDisplaced = (
    displaced: "demote" | "sendBack" | null,
    occupant: string | null,
  ): void => {
    if (occupant === null) return;
    if (displaced === "demote") demoteToLongpress(occupant);
    else if (displaced === "sendBack") displacedBackToTray = occupant;
  };

  switch (choice.slot) {
    case "surface": {
      // text is the face; output follows so the key produces the letter even
      // when the key previously carried a divergent explicit output.
      ops.push({ address, kind: "set", fields: { text: letter, output: letter } });
      handleDisplaced(choice.displaced, placementOccupant(targetKey, choice));
      break;
    }
    case "longpress": {
      ops.push({
        address,
        kind: "setSubKey",
        sub: { kind: "sk", id: freshId },
        fields: { id: freshId, text: letter, sp: 0 },
      });
      break;
    }
    case "flick": {
      ops.push({
        address,
        kind: "setSubKey",
        sub: { kind: "flick", id: choice.direction },
        fields: { id: choice.direction, text: letter, sp: 0 },
      });
      handleDisplaced(choice.displaced, placementOccupant(targetKey, choice));
      break;
    }
    case "multitap": {
      const existing = targetKey.multitap ?? [];
      const ordered: { id: string; text: string; sp: KeySp; output?: string }[] =
        existing.map((s) => ({
          id: s.id,
          text: s.text ?? "",
          sp: (s.sp ?? 0) as KeySp,
          ...(s.output !== undefined ? { output: s.output } : {}),
        }));
      const newcomer = { id: freshId, text: letter, sp: 0 as KeySp };
      if (choice.tap === 2) ordered.unshift(newcomer);
      else ordered.splice(1, 0, newcomer);
      for (const s of existing) {
        ops.push({ address, kind: "removeSubKey", sub: { kind: "multitap", id: s.id } });
      }
      for (const s of ordered) {
        ops.push({
          address,
          kind: "setSubKey",
          sub: { kind: "multitap", id: s.id },
          fields: {
            id: s.id,
            text: s.text,
            sp: s.sp,
            ...(s.output !== undefined ? { output: s.output } : {}),
          },
        });
      }
      break;
    }
  }
  return { ops, displacedBackToTray };
}

/** Touch-drag disambiguation for a tray chip (HTML5 DnD never fires on touch). */
export type TouchGestureIntent = "undecided" | "scroll" | "drag";

/**
 * Classify a touch pointer's displacement from its down point. Below the
 * slop the gesture is undecided (a tap in the making); beyond it, the
 * dominant axis wins — horizontal means the tray scrolls (the browser keeps
 * the gesture), vertical means a drag starts immediately, no longpress.
 */
export function touchGestureIntent(
  dx: number,
  dy: number,
  slop = 10,
): TouchGestureIntent {
  if (Math.hypot(dx, dy) < slop) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "scroll" : "drag";
}

// ---------------------------------------------------------------------------
// Panel drops — tray letters straight onto the subkey areas, and subkey
// chips dragged between areas (reorder / flick moves). Same pure-planner
// shape as the modal: op sequences the pane commits as one undo batch.
// ---------------------------------------------------------------------------



/** A drop zone inside the subkey panel. */
export type PanelDropSpec =
  | { area: "lp"; beforeId?: string }
  | { area: "flick"; direction: FlickDirection }
  | { area: "mt"; index?: number };

/** What a tray letter can land on: a board key or a panel area. */
export type TrayDropTarget =
  | { kind: "key"; address: string }
  | { kind: "panel"; spec: PanelDropSpec };

/** A dragged subkey chip. */
export type SubkeyDragPayload =
  | { kind: "sk"; id: string }
  | { kind: "flick"; direction: FlickDirection }
  | { kind: "multitap"; index: number };

/** Serialize a panel drop spec for data-panel-drop attributes. */
export function serializePanelDropSpec(spec: PanelDropSpec): string {
  if (spec.area === "lp") return spec.beforeId !== undefined ? `lp:${spec.beforeId}` : "lp";
  if (spec.area === "flick") return `flick:${spec.direction}`;
  return spec.index !== undefined ? `mt:${spec.index}` : "mt";
}

/** Parse a data-panel-drop attribute back into a spec (null when malformed). */
export function parsePanelDropSpec(raw: string | null | undefined): PanelDropSpec | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw === "lp") return { area: "lp" };
  if (raw === "mt") return { area: "mt" };
  const lp = /^lp:(.+)$/.exec(raw);
  if (lp !== null && lp[1] !== undefined) return { area: "lp", beforeId: lp[1] };
  const flick = /^flick:(nw|n|ne|w|e|sw|s|se)$/.exec(raw);
  if (flick !== null && flick[1] !== undefined)
    return { area: "flick", direction: flick[1] as FlickDirection };
  const mt = /^mt:(\d+)$/.exec(raw);
  if (mt !== null && mt[1] !== undefined) return { area: "mt", index: Number(mt[1]) };
  return null;
}

interface SubkeySnapshot {
  readonly id: string;
  readonly text: string;
  readonly sp: KeySp;
  readonly output?: string;
}

function snapshotSubkey(sub: TouchKeyIR): SubkeySnapshot {
  return {
    id: sub.id,
    text: sub.text ?? "",
    sp: (sub.sp ?? 0) as KeySp,
    ...(sub.output !== undefined ? { output: sub.output } : {}),
  };
}

/**
 * Remove-all + re-add of one subkey family in a new order. The contract has
 * no reorder op. NOTE: the longpress `default` flag is contract-read-only
 * and cannot round-trip through remove+re-add — reordering a
 * default-flagged longpress drops the flag. The studio never authors it,
 * so this only bites hand-maintained keyboards that set it.
 */
function reorderFamilyOps(
  address: string,
  kind: "sk" | "multitap",
  list: readonly TouchKeyIR[],
  newOrderIds: readonly string[],
): PendingKeyEditOperation[] {
  const ids = [...newOrderIds];
  for (const s of list) {
    if (!ids.includes(s.id)) ids.push(s.id); // never drop an entry
  }
  const byId = new Map(list.map((s) => [s.id, s]));
  const ops: PendingKeyEditOperation[] = [];
  for (const s of list) {
    ops.push({ address, kind: "removeSubKey", sub: { kind, id: s.id } });
  }
  for (const id of ids) {
    const s = byId.get(id);
    if (s === undefined) continue;
    const snap = snapshotSubkey(s);
    ops.push({
      address,
      kind: "setSubKey",
      sub: { kind, id },
      fields: {
        id: snap.id,
        text: snap.text,
        sp: snap.sp,
        ...(snap.output !== undefined ? { output: snap.output } : {}),
      },
    });
  }
  return ops;
}

function setSubKeyOp(
  address: string,
  sub: { kind: "sk" | "flick" | "multitap"; id: string },
  snap: SubkeySnapshot,
): PendingKeyEditOperation {
  return {
    address,
    kind: "setSubKey",
    sub,
    fields: {
      id: snap.id,
      text: snap.text,
      sp: snap.sp,
      ...(snap.output !== undefined ? { output: snap.output } : {}),
    },
  };
}

/**
 * A tray letter dropped straight onto a subkey-panel area — no modal.
 * Longpress appends, or inserts before the chipped target; a flick upserts
 * its direction slot (the displaced glyph goes back to the tray, never
 * silently demoted); multitap appends while a tap is free, else replaces
 * the 3x entry.
 */
export function buildPanelDropOps(
  address: string,
  targetKey: TouchKeyIR,
  letter: string,
  spec: PanelDropSpec,
  freshId: string,
): PlacementOpPlan {
  const ops: PendingKeyEditOperation[] = [];
  let displacedBackToTray: string | null = null;

  if (spec.area === "lp") {
    const list = targetKey.sk ?? [];
    const newcomer: SubkeySnapshot = { id: freshId, text: letter, sp: 0 };
    const at = spec.beforeId !== undefined ? list.findIndex((s) => s.id === spec.beforeId) : -1;
    if (at < 0) {
      // Append — the common case; no existing entries are touched.
      ops.push(setSubKeyOp(address, { kind: "sk", id: freshId }, newcomer));
      return { ops, displacedBackToTray };
    }
    // Dropped on a chip: insert before it (remove-all + re-add in the new
    // order — the longpress `default` flag cannot round-trip this, see
    // reorderFamilyOps).
    const ordered: SubkeySnapshot[] = list.map((s) => snapshotSubkey(s));
    ordered.splice(at, 0, newcomer);
    for (const s of list) {
      ops.push({ address, kind: "removeSubKey", sub: { kind: "sk", id: s.id } });
    }
    for (const s of ordered) {
      ops.push(setSubKeyOp(address, { kind: "sk", id: s.id }, s));
    }
    return { ops, displacedBackToTray };
  }

  if (spec.area === "flick") {
    const oldText = targetKey.flick?.[spec.direction]?.text;
    ops.push(
      setSubKeyOp(
        address,
        { kind: "flick", id: spec.direction },
        { id: spec.direction, text: letter, sp: 0 },
      ),
    );
    if (isPreservableText(oldText) && oldText !== letter) displacedBackToTray = oldText!;
    return { ops, displacedBackToTray };
  }

  // mt — multitap[0] is 2x, multitap[1] is 3x.
  const existing = targetKey.multitap ?? [];
  const rewrite = (ordered: readonly SubkeySnapshot[]): void => {
    for (const s of existing) {
      ops.push({ address, kind: "removeSubKey", sub: { kind: "multitap", id: s.id } });
    }
    for (const s of ordered) {
      ops.push(setSubKeyOp(address, { kind: "multitap", id: s.id }, s));
    }
  };
  if (spec.index === undefined) {
    if (existing.length < 2) {
      ops.push(
        setSubKeyOp(address, { kind: "multitap", id: freshId }, { id: freshId, text: letter, sp: 0 }),
      );
      return { ops, displacedBackToTray };
    }
    // Full: replace the 3x entry; the displaced glyph goes back to the tray.
    const old = snapshotSubkey(existing[1]!);
    rewrite([snapshotSubkey(existing[0]!), { id: freshId, text: letter, sp: 0 }]);
    if (isPreservableText(old.text)) displacedBackToTray = old.text;
    return { ops, displacedBackToTray };
  }
  if (spec.index < 0 || spec.index >= existing.length) return { ops, displacedBackToTray };
  const old = snapshotSubkey(existing[spec.index]!);
  const ordered = existing.map((s) => snapshotSubkey(s));
  ordered[spec.index] = { id: freshId, text: letter, sp: 0 };
  rewrite(ordered);
  if (isPreservableText(old.text)) displacedBackToTray = old.text;
  return { ops, displacedBackToTray };
}

/**
 * A subkey chip dropped onto a panel target: reorder within longpress /
 * multitap, move a flick between directions (swap when occupied), or move
 * BETWEEN families (#2596 item 3) — longpress ↔ flick ↔ multitap.
 *
 * Cross-kind moves remove the entry from its source family and upsert it
 * into the target, carrying `text`/`sp`/`output` with it; the id follows
 * the target family's convention (a flick slot's id IS its direction; a
 * longpress/multitap entry keeps its id where it can, else takes
 * `freshId`). A displaced occupant — a flick direction already taken, or a
 * full multitap's 3x entry — goes back to the tray, never silently
 * demoted (the tray-drop pattern). The longpress `default` flag cannot
 * round-trip a remove+re-add (see `reorderFamilyOps`) and is meaningless
 * outside `sk`, so a moved default-flagged longpress loses it.
 *
 * `freshId` is the one minted id this plan may consume (flick-source moves
 * need one: a flick entry's id is its direction, which cannot travel).
 */
export function buildSubkeyMoveOps(
  address: string,
  targetKey: TouchKeyIR,
  source: SubkeyDragPayload,
  target: PanelDropSpec,
  freshId: string,
): PlacementOpPlan {
  const ops: PendingKeyEditOperation[] = [];
  let displacedBackToTray: string | null = null;

  // Rewrite one multitap list in a new order (remove-all + re-add — the
  // contract has no reorder op). Shared by the mt-source and mt-target
  // branches below.
  const rewriteMultitap = (
    ordered: readonly SubkeySnapshot[],
  ): PendingKeyEditOperation[] => {
    const existing = targetKey.multitap ?? [];
    const rewrite: PendingKeyEditOperation[] = [];
    for (const s of existing) {
      rewrite.push({ address, kind: "removeSubKey", sub: { kind: "multitap", id: s.id } });
    }
    for (const s of ordered) {
      rewrite.push(setSubKeyOp(address, { kind: "multitap", id: s.id }, s));
    }
    return rewrite;
  };

  // Land a snapshot in a multitap list: append while a tap is free, else
  // replace the 3x entry (index given = replace that entry instead). The
  // displaced glyph goes back to the tray.
  const landInMultitap = (
    snap: SubkeySnapshot,
    index: number | undefined,
  ): PendingKeyEditOperation[] => {
    const existing = targetKey.multitap ?? [];
    if (index !== undefined) {
      if (index < 0 || index >= existing.length) return [];
      const old = snapshotSubkey(existing[index]!);
      const ordered = existing.map((s) => snapshotSubkey(s));
      ordered[index] = snap;
      if (isPreservableText(old.text) && old.text !== snap.text) {
        displacedBackToTray = old.text;
      }
      return rewriteMultitap(ordered);
    }
    if (existing.length < 2) {
      return [setSubKeyOp(address, { kind: "multitap", id: snap.id }, snap)];
    }
    const old = snapshotSubkey(existing[1]!);
    if (isPreservableText(old.text) && old.text !== snap.text) {
      displacedBackToTray = old.text;
    }
    return rewriteMultitap([snapshotSubkey(existing[0]!), snap]);
  };

  // Land a snapshot in a flick direction slot (upsert). A displaced
  // occupant goes back to the tray.
  const landInFlick = (
    snap: SubkeySnapshot,
    direction: FlickDirection,
  ): PendingKeyEditOperation[] => {
    const occupant = targetKey.flick?.[direction];
    if (occupant !== undefined) {
      const old = snapshotSubkey(occupant);
      if (isPreservableText(old.text) && old.text !== snap.text) {
        displacedBackToTray = old.text;
      }
    }
    return [setSubKeyOp(address, { kind: "flick", id: direction }, { ...snap, id: direction })];
  };

  if (source.kind === "sk" && target.area === "lp") {
    const list = targetKey.sk ?? [];
    if (!list.some((s) => s.id === source.id)) return { ops, displacedBackToTray: null };
    const ids = list.map((s) => s.id).filter((id) => id !== source.id);
    const at = target.beforeId !== undefined ? ids.indexOf(target.beforeId) : -1;
    if (at >= 0) ids.splice(at, 0, source.id);
    else ids.push(source.id);
    ops.push(...reorderFamilyOps(address, "sk", list, ids));
    return { ops, displacedBackToTray: null };
  }

  if (source.kind === "multitap" && target.area === "mt") {
    const list = targetKey.multitap ?? [];
    if (source.index < 0 || source.index >= list.length) return { ops, displacedBackToTray: null };
    const movingId = list[source.index]!.id;
    const ids = list.map((s) => s.id).filter((id) => id !== movingId);
    const at = target.index !== undefined ? Math.min(target.index, ids.length) : ids.length;
    ids.splice(at, 0, movingId);
    ops.push(...reorderFamilyOps(address, "multitap", list, ids));
    return { ops, displacedBackToTray: null };
  }

  if (source.kind === "flick" && target.area === "flick") {
    const from = source.direction;
    const to = target.direction;
    if (from === to) return { ops, displacedBackToTray: null };
    const moving = targetKey.flick?.[from];
    if (moving === undefined) return { ops, displacedBackToTray: null };
    const occupant = targetKey.flick?.[to];
    ops.push({ address, kind: "removeSubKey", sub: { kind: "flick", id: from } });
    if (occupant !== undefined) {
      ops.push({ address, kind: "removeSubKey", sub: { kind: "flick", id: to } });
    }
    const m = snapshotSubkey(moving);
    ops.push(
      setSubKeyOp(address, { kind: "flick", id: to }, { ...m, id: to }),
    );
    if (occupant !== undefined) {
      const o = snapshotSubkey(occupant);
      ops.push(
        setSubKeyOp(address, { kind: "flick", id: from }, { ...o, id: from }),
      );
    }
    return { ops, displacedBackToTray: null };
  }

  // --- cross-kind moves (#2596 item 3) -------------------------------------
  // Longpress → flick: the flick slot takes the entry (id = direction).
  if (source.kind === "sk" && target.area === "flick") {
    const entry = (targetKey.sk ?? []).find((s) => s.id === source.id);
    if (entry === undefined) return { ops, displacedBackToTray: null };
    ops.push({ address, kind: "removeSubKey", sub: { kind: "sk", id: source.id } });
    ops.push(...landInFlick(snapshotSubkey(entry), target.direction));
    return { ops, displacedBackToTray };
  }

  // Longpress → multitap: keeps its id unless a multitap entry already
  // carries it (hand-maintained ids can repeat across families), in which
  // case the fresh id stands in.
  if (source.kind === "sk" && target.area === "mt") {
    const entry = (targetKey.sk ?? []).find((s) => s.id === source.id);
    if (entry === undefined) return { ops, displacedBackToTray: null };
    // Validate the landing slot BEFORE removing the entry — a bad index
    // must leave the key untouched, not strand the entry nowhere.
    if (
      target.index !== undefined &&
      (target.index < 0 || target.index >= (targetKey.multitap ?? []).length)
    ) {
      return { ops, displacedBackToTray: null };
    }
    const snap = snapshotSubkey(entry);
    const idTaken = (targetKey.multitap ?? []).some((s) => s.id === snap.id);
    const landed: SubkeySnapshot = idTaken ? { ...snap, id: freshId } : snap;
    ops.push({ address, kind: "removeSubKey", sub: { kind: "sk", id: source.id } });
    ops.push(...landInMultitap(landed, target.index));
    return { ops, displacedBackToTray };
  }

  // Flick → longpress: a flick entry's id is its direction, so the fresh id
  // becomes the longpress id.
  if (source.kind === "flick" && target.area === "lp") {
    const entry = targetKey.flick?.[source.direction];
    if (entry === undefined) return { ops, displacedBackToTray: null };
    const snap = snapshotSubkey(entry);
    ops.push({ address, kind: "removeSubKey", sub: { kind: "flick", id: source.direction } });
    ops.push(
      setSubKeyOp(address, { kind: "sk", id: freshId }, { ...snap, id: freshId }),
    );
    return { ops, displacedBackToTray: null };
  }

  // Flick → multitap: fresh id, append-or-replace-3x like a tray drop.
  if (source.kind === "flick" && target.area === "mt") {
    const entry = targetKey.flick?.[source.direction];
    if (entry === undefined) return { ops, displacedBackToTray: null };
    // Validate the landing slot BEFORE removing the entry — see sk → mt.
    if (
      target.index !== undefined &&
      (target.index < 0 || target.index >= (targetKey.multitap ?? []).length)
    ) {
      return { ops, displacedBackToTray: null };
    }
    const snap = snapshotSubkey(entry);
    ops.push({ address, kind: "removeSubKey", sub: { kind: "flick", id: source.direction } });
    ops.push(...landInMultitap({ ...snap, id: freshId }, target.index));
    return { ops, displacedBackToTray };
  }

  // Multitap → longpress: keeps its id unless a longpress entry already
  // carries it, in which case the fresh id stands in.
  if (source.kind === "multitap" && target.area === "lp") {
    const list = targetKey.multitap ?? [];
    if (source.index < 0 || source.index >= list.length) {
      return { ops, displacedBackToTray: null };
    }
    const moving = list[source.index]!;
    const snap = snapshotSubkey(moving);
    const idTaken = (targetKey.sk ?? []).some((s) => s.id === snap.id);
    const landed: SubkeySnapshot = idTaken ? { ...snap, id: freshId } : snap;
    const remaining = list
      .filter((_, i) => i !== source.index)
      .map((s) => snapshotSubkey(s));
    ops.push(...rewriteMultitap(remaining));
    ops.push(setSubKeyOp(address, { kind: "sk", id: landed.id }, landed));
    return { ops, displacedBackToTray: null };
  }

  // Multitap → flick: the flick slot takes the entry (id = direction).
  if (source.kind === "multitap" && target.area === "flick") {
    const list = targetKey.multitap ?? [];
    if (source.index < 0 || source.index >= list.length) {
      return { ops, displacedBackToTray: null };
    }
    const moving = list[source.index]!;
    const snap = snapshotSubkey(moving);
    const remaining = list
      .filter((_, i) => i !== source.index)
      .map((s) => snapshotSubkey(s));
    ops.push(...rewriteMultitap(remaining));
    ops.push(...landInFlick(snap, target.direction));
    return { ops, displacedBackToTray };
  }

  return { ops, displacedBackToTray: null };
}
