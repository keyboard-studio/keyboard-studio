// openApply touchReseed -- "Reseed touch from desktop" on an opened keyboard
// (spec 111 FR-017, FR-009, FR-045; phase 16, owner rulings 2026-11-14).
//
// The layout is built exactly as Copy builds it (`buildTouchLayoutJson`, the
// reseed seed source, no desktop mods and no assignments, then the shared text
// steps in `lib/touchLayoutText.ts`) so the same keyboard gets the same file in
// either track. It is one `files` change that replaces the touch file, or creates
// it when the keyboard has none, and it asks the author first: the change carries
// a summary of what will change (`askFirst`), which the consent dialog shows. One
// undo record. A touch layout only compiles when the `.kmn` names it
// (`&LAYOUTFILE`) and only ships when the package lists the compiled `.js`, so the
// same change adds those two lines where they are missing, as precise text
// inserts (everything else in those files is untouched). Nothing here writes a
// file or holds a timer; the seam is the only writer.

import { ruleContextElements, type KeyboardIR, type TouchAssignment } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { type DesktopModifications } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { buildTouchLayoutJson } from "../buildTouchLayoutJson.ts";
import { findTouchLayoutPath } from "../findTouchLayoutPath.ts";
import { withLayoutFileStore, withScriptFileEntry } from "../layoutFileStore.ts";
import { capsHandlingFromDecisions } from "../projectionInput.ts";
import { getDecisionSnapshot } from "../../stores/decisionStore.ts";
import { tabulateTouchLayoutJson } from "../projectWorkingCopyVfs.ts";
import { buildTouchLayoutText } from "../touchLayoutText.ts";
import { readVfsText } from "../vfsText.ts";
import type { OpenChange, TouchReplacementSummary } from "./types.ts";

const NO_MODS: DesktopModifications = { removals: [], placements: [] };
const BOM_RE = /^\uFEFF/;

interface Counted {
  layers: Set<string>;
  keys: number;
  /** Every key id (keys, sub-keys, flicks, multitaps), upper case. */
  ids: Set<string>;
}

function collectIds(key: unknown, ids: Set<string>): void {
  if (key === null || typeof key !== "object") return;
  const k = key as Record<string, unknown>;
  if (typeof k["id"] === "string") ids.add(k["id"].toUpperCase());
  for (const sub of Array.isArray(k["sk"]) ? (k["sk"] as unknown[]) : []) collectIds(sub, ids);
  for (const sub of Array.isArray(k["multitap"]) ? (k["multitap"] as unknown[]) : []) collectIds(sub, ids);
  const flick = k["flick"];
  if (flick !== null && typeof flick === "object") for (const sub of Object.values(flick)) collectIds(sub, ids);
}

/** Layer ids (across platforms), the number of keys and every key id in a raw touch layout text; undefined when unreadable. */
function count(text: string): Counted | undefined {
  try {
    const raw = JSON.parse(text.replace(BOM_RE, "")) as unknown;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const layers = new Set<string>();
    const ids = new Set<string>();
    let keys = 0;
    for (const platform of Object.values(raw)) {
      const list = (platform as { layer?: unknown } | null)?.layer;
      if (!Array.isArray(list)) continue;
      for (const layer of list as { id?: unknown; row?: unknown }[]) {
        if (typeof layer.id === "string") layers.add(layer.id);
        if (!Array.isArray(layer.row)) continue;
        for (const row of layer.row as { key?: unknown }[]) {
          if (!Array.isArray(row.key)) continue;
          keys += row.key.length;
          for (const key of row.key) collectIds(key, ids);
        }
      }
    }
    return { layers, keys, ids };
  } catch {
    return undefined;
  }
}

/** What the replacement touches beyond the layout's own keys. */
export interface TouchReplacementRefs {
  ir: KeyboardIR | null;
  draft: ReadonlyArray<readonly [string, TouchAssignment]> | null;
  /** Other files the same change writes (the `.kmn`, the `.kps`). */
  alsoWrites?: readonly string[];
}

/** What replacing `before` (the file's text; undefined when there is no file) with `after` changes. */
export function summarizeTouchReplacement(
  path: string,
  before: string | undefined,
  after: string,
  refs: TouchReplacementRefs = { ir: null, draft: null },
): TouchReplacementSummary {
  const was = before === undefined ? undefined : count(before);
  const will = count(after);
  const wasLayers = was?.layers ?? new Set<string>();
  const willLayers = will?.layers ?? new Set<string>();
  // Rules and drafts that name a key the file has now and the new layout lacks.
  const gone = (id: string): boolean => {
    const up = id.toUpperCase();
    return was !== undefined && will !== undefined && was.ids.has(up) && !will.ids.has(up);
  };
  let orphanedRules = 0;
  for (const g of refs.ir?.groups ?? []) {
    for (const r of g.rules) {
      if (ruleContextElements(r).some((el) => el.kind === "vkey" && gone(el.name))) orphanedRules += 1;
    }
  }
  let orphanedDrafts = 0;
  for (const [, a] of refs.draft ?? []) {
    const hosts = a.mechanisms.map((m) => m.slotValues?.["hostKey"]);
    if (hosts.some((h) => typeof h === "string" && h !== "" && gone(h))) orphanedDrafts += 1;
  }
  return {
    path,
    creating: before === undefined,
    unreadable: (before !== undefined && was === undefined) || will === undefined,
    layersAdded: [...willLayers].filter((l) => !wasLayers.has(l)),
    layersRemoved: [...wasLayers].filter((l) => !willLayers.has(l)),
    keysBefore: was?.keys ?? 0,
    keysAfter: will?.keys ?? 0,
    orphanedRules,
    orphanedDrafts,
    alsoWrites: [...(refs.alsoWrites ?? [])],
  };
}

/**
 * The change that reseeds the touch layout from the desktop keys, as Copy does.
 * `ok: false` when no keyboard is open or the layout could not be built (nothing
 * is written then, and the caller says so).
 */
export function buildTouchReseedChange(
  label: string,
): { ok: true; change: Extract<OpenChange, { kind: "files" }> } | { ok: false; reason: string } {
  const { startIr, startVfs, startKeyboard, identity, touchDraft } = useWorkingCopyStore.getState();
  if (startIr === null || startVfs === null || startKeyboard === null) {
    return { ok: false, reason: "No keyboard is open." };
  }
  const built = buildTouchLayoutJson(startIr, [], { mods: NO_MODS, seedSource: "reseed-from-desktop" });
  if (built.json === null) return { ok: false, reason: built.warnings.join("; ") };
  // The file Copy downloads for the same layout (one implementation of the text steps).
  const caps = capsHandlingFromDecisions(getDecisionSnapshot(), { askedOnly: true });
  const text = buildTouchLayoutText({
    json: tabulateTouchLayoutJson(built.json),
    ir: startIr,
    casedKeysCaps: caps?.mode === "cased-keys",
    bcp47: identity?.bcp47 !== undefined && identity.bcp47 !== "" ? identity.bcp47 : undefined,
    onWarn: (message, err) => devLog.warn(`[touch-reseed] ${message}:`, err),
  });
  if (count(text) === undefined) return { ok: false, reason: "The built touch layout cannot be read back." };

  const id = startKeyboard.id;
  const existing = findTouchLayoutPath(startVfs);
  const path = existing ?? `source/${id}.keyman-touch-layout`;
  const before = existing === undefined ? undefined : readVfsText(startVfs, existing);
  const files: Record<string, string | null> = { [path]: text };

  // The `.kmn` names the layout and the package lists what compiles from it.
  const kmnPath = `source/${id}.kmn`;
  const kmn = readVfsText(startVfs, kmnPath);
  const alsoWrites: string[] = [];
  let kmnAfter = kmn;
  if (kmn !== undefined) {
    const named = withLayoutFileStore(kmn, path.slice(path.lastIndexOf("/") + 1), id);
    if (named !== undefined) {
      kmnAfter = named;
      files[kmnPath] = named;
      alsoWrites.push(kmnPath);
    }
  }
  const kpsPath = `source/${id}.kps`;
  const kps = readVfsText(startVfs, kpsPath);
  if (kps !== undefined && kmnAfter !== undefined) {
    const listed = withScriptFileEntry(kps, kmnAfter, id);
    if (listed !== undefined) {
      files[kpsPath] = listed;
      alsoWrites.push(kpsPath);
    }
  }
  return {
    ok: true,
    change: {
      kind: "files",
      files,
      label,
      askFirst: summarizeTouchReplacement(path, before, text, {
        ir: startIr,
        draft: touchDraft?.charTouchEntries ?? null,
        alsoWrites,
      }),
    },
  };
}
