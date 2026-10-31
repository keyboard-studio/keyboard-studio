// touchSeedSourceContinue -- what the touch_seed_source step decides and does,
// apart from rendering: the platform sniff of the copied keyboard's shipped
// touch layout, the default pick (research R4), the seed preview derivation,
// and the confirm's draft clearing.
//
// Lifted out of TouchSeedSourcePanel so a headless caller takes the default and
// confirms through the same code the Confirm button runs. The panel calls
// these; it holds no second copy.

import type { KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { emitTouchLayout } from "@keyboard-studio/engine";
import type { DesktopModifications } from "@keyboard-studio/engine";
import { deriveSeedLayout } from "../../lib/buildTouchLayoutJson.ts";
import { resolveStartTouchJson } from "../../lib/resolveStartTouchJson.ts";
import { resolveTouchSeedSource } from "../../lib/touchEmission.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { TouchSeedSource } from "../../stores/surveySessionStore.ts";

// ---------------------------------------------------------------------------
// Raw `.keyman-touch-layout` metadata parsing -- for the advisory notes only
// (which platforms the base ships, whether the JSON is malformed). The actual
// keycap rendering is the real OSK, so this only needs the platform id list.
//
// Deliberately NOT the engine's parseTouchLayout (engine/src/codec/parse-touch.ts)
// -- this is a lightweight shape sniff for the advisory text, not a full parse.
// ---------------------------------------------------------------------------

interface RawPreviewPlatform {
  layer?: unknown[];
}
type RawPreviewTouchLayout = Record<string, RawPreviewPlatform | undefined>;

function isRawPlatform(v: unknown): v is RawPreviewPlatform {
  return typeof v === "object" && v !== null && Array.isArray((v as RawPreviewPlatform).layer);
}

/** Preference order for which platform's layers to preview when several ship. */
const PREVIEW_PLATFORM_ORDER = ["phone", "tablet", "desktop"] as const;

function pickPreviewPlatformId(platformIds: readonly string[]): string | undefined {
  return PREVIEW_PLATFORM_ORDER.find((id) => platformIds.includes(id)) ?? platformIds[0];
}

export interface StartTouchLayoutSummary {
  /** Platform ids the source layout ships, e.g. ["phone", "tablet"]. */
  platformIds: string[];
  /** The platform id preferred for display, per {@link PREVIEW_PLATFORM_ORDER}. */
  previewPlatformId: string;
}

/**
 * Parse a base's raw `.keyman-touch-layout` JSON string into a lightweight
 * platform-id summary. Returns null for absent or malformed input -- both are
 * treated as "no usable base layout" by the caller (R4): the malformed case is
 * reported with a distinct note, but neither case blocks either choice.
 */
export function parseBaseTouchPreview(json: string | undefined): StartTouchLayoutSummary | null {
  if (json === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as RawPreviewTouchLayout;
  const platformIds = Object.keys(obj).filter((id) => isRawPlatform(obj[id]));
  if (platformIds.length === 0) return null;

  const previewPlatformId = pickPreviewPlatformId(platformIds) ?? platformIds[0]!;
  return { platformIds, previewPlatformId };
}

/**
 * Whether the copied keyboard ships a usable touch layout: its touch JSON
 * resolves and parses to at least one platform with layers. Absent, malformed,
 * and platform-less JSON all read as not usable (R4).
 */
export function startShipsUsableTouch(startVfs: VirtualFS | null): boolean {
  return parseBaseTouchPreview(resolveStartTouchJson(startVfs)) !== null;
}

/**
 * The choice the chooser starts on: the recorded one on re-entry, else Import &
 * adapt when the copied keyboard ships a usable touch layout, else Reseed (R4).
 */
export function defaultTouchSeedSource(
  startVfs: VirtualFS | null,
  stored: TouchSeedSource | null,
): TouchSeedSource {
  return resolveTouchSeedSource(stored, startShipsUsableTouch(startVfs));
}

/**
 * The seed the live preview shows for one card: the derived layout emitted as
 * touch-layout JSON, with the characters it could not place. Null when the
 * derivation throws (logged), as the preview's graceful-fallback note expects.
 */
export function deriveSeedPreview(
  startIr: KeyboardIR,
  rawJson: string | undefined,
  selected: TouchSeedSource,
  mods: DesktopModifications,
): { json: string; unplacedChars: string[] } | null {
  try {
    const baseTouchJson = selected === "reseed-from-desktop" ? undefined : rawJson;
    const { layout, unplacedChars } = deriveSeedLayout(startIr, {
      ...(baseTouchJson !== undefined ? { baseTouchJson } : {}),
      mods,
      seedSource: selected,
    });
    return { json: emitTouchLayout(layout), unplacedChars };
  } catch (err) {
    // A genuine derivation failure has no other signal -- the fallback note
    // still renders, but this is otherwise silent, so log it for devtools.
    devLog.error("[TouchSeedSourcePanel] seed preview derivation failed:", err);
    return null;
  }
}

/**
 * The Confirm click's working-copy effect: recording a DIFFERENT seed value
 * clears the touch draft here, at the decision's writer, because its charTouch
 * entries reference host keys of the other seed and would half-apply. A no-op
 * re-confirm of the same value leaves it untouched. The decision record itself
 * is the gallery host's (onChange).
 */
export function clearTouchDraftOnSeedChange(
  selected: TouchSeedSource,
  stored: TouchSeedSource | null,
): void {
  if (selected !== stored) {
    useWorkingCopyStore.getState().setTouchDraft(null);
  }
}
