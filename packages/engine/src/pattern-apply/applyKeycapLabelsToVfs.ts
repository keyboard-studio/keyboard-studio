// Keycap-label patcher: updates `.kvks` and `.keyman-touch-layout` VFS entries
// so the OSK preview shows the correct characters on the keycaps after
// S-01 (direct-key swap) and S-08 (AltGr/RightAlt) mechanism assignments.
//
// The VirtualFS is mutated in-place; the studio never writes to host disk
// during authoring (spec §11).
//
// Mapping of strategy → layer ids (GATE-confirmed):
//   S-01 unshifted  → kvks shift="" / touch layer "default"
//   S-08 AltGr      → kvks shift="RA" / touch layer "rightalt"

import type { MechanismAssignment, VirtualFS } from "@keyboard-studio/contracts";
import { parseKmnHeaderStores } from "../compiler/parseKmnHeaderStores.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single keycap label substitution to apply across both asset files. */
interface KeycapTarget {
  /** Virtual key identifier, e.g. "K_A". */
  vkey: string;
  /** The new character to display on the keycap. */
  char: string;
  /** `.kvks` shift attribute value: "" | "S" | "RA". */
  kvksLayer: string;
  /** `.keyman-touch-layout` layer id: "default" | "rightalt". */
  touchLayer: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Patch `.kvks` and `.keyman-touch-layout` VFS entries so the OSK preview
 * shows swapped characters on keycaps for S-01 and S-08 mechanism assignments.
 *
 * For S-01 assignments the unshifted layer is patched; for S-08 (AltGr/RightAlt)
 * assignments the AltGr layer is patched. Only `modality === "physical"` entries
 * are processed — touch-layout and kvks are both driven from the physical side.
 *
 * @param vfs         The in-memory virtual filesystem for the keyboard project.
 * @param keyboardId  The keyboard identifier (used to derive default asset paths).
 * @param assignments Flat list of mechanism assignments (all modalities/scopes).
 * @returns `{ warnings }` — diagnostic messages for any non-fatal issues.
 */
export function applyKeycapLabelsToVfs(
  vfs: VirtualFS,
  keyboardId: string,
  assignments: ReadonlyArray<MechanismAssignment>,
): { warnings: string[] } {
  const warnings: string[] = [];

  // -------------------------------------------------------------------------
  // Step 1 — collect swap-keycap targets from physical assignments.
  // -------------------------------------------------------------------------
  const targets: KeycapTarget[] = [];

  for (const assignment of assignments) {
    if (assignment.modality !== "physical") continue;

    const char = assignment.target;
    if (!char) continue;

    for (const mechanism of assignment.mechanisms) {
      const { strategyId, slotValues } = mechanism;

      if (strategyId === "S-01") {
        // kmnRules slot example: "+ [K_A] > U+0041"
        const kmnRules = slotValues?.["kmnRules"] ?? "";
        const vkey = parseLastTokenFromBracket(kmnRules);
        if (vkey) {
          targets.push({ vkey, char, kvksLayer: "", touchLayer: "default" });
        }
      } else if (strategyId === "S-08") {
        // altgrKeyList slot example: "[RALT K_A]"
        const altgrKeyList = slotValues?.["altgrKeyList"] ?? "";
        const vkey = parseLastTokenFromBracket(altgrKeyList);
        if (vkey) {
          targets.push({ vkey, char, kvksLayer: "RA", touchLayer: "rightalt" });
        }
      }
    }
  }

  // Nothing to patch — return immediately.
  if (targets.length === 0) {
    return { warnings };
  }

  // -------------------------------------------------------------------------
  // Step 2 — locate asset paths from the .kmn header stores (with fallback).
  // -------------------------------------------------------------------------
  const kmnPath = `source/${keyboardId}.kmn`;
  const kmnEntry = vfs.get(kmnPath);
  let kmnText = "";
  if (kmnEntry !== undefined && !kmnEntry.isBinary) {
    kmnText =
      typeof kmnEntry.content === "string"
        ? kmnEntry.content
        : new TextDecoder().decode(kmnEntry.content as Uint8Array);
  }

  const headerStores = kmnText ? parseKmnHeaderStores(kmnText) : [];

  const kvksPath = resolveAssetPath(
    headerStores,
    "VISUALKEYBOARD",
    keyboardId,
    ".kvks",
  );
  const touchPath = resolveAssetPath(
    headerStores,
    "LAYOUTFILE",
    keyboardId,
    ".keyman-touch-layout",
  );

  // -------------------------------------------------------------------------
  // Step 3 — patch .kvks (text splice via regex).
  // -------------------------------------------------------------------------
  patchKvks(vfs, kvksPath, keyboardId, targets, warnings);

  // -------------------------------------------------------------------------
  // Step 4 — patch .keyman-touch-layout (JSON round-trip).
  // -------------------------------------------------------------------------
  patchTouchLayout(vfs, touchPath, targets);

  return { warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse the last space-separated token from inside the first `[…]` bracket
 * group in `text`.  Returns `""` when no bracket is found or it is empty.
 *
 * Examples:
 *   "+ [K_A] > U+0041"  → "K_A"
 *   "[RALT K_A]"        → "K_A"
 */
function parseLastTokenFromBracket(text: string): string {
  const m = /\[([^\]]+)\]/.exec(text);
  if (!m) return "";
  const tokens = (m[1] ?? "").trim().split(/\s+/);
  return tokens[tokens.length - 1] ?? "";
}

/**
 * Resolve the VFS path for a sibling asset file.
 *
 * 1. Look for the store in parsed header stores and return `source/<path>`.
 * 2. Fall back to `source/<keyboardId><extension>`.
 */
function resolveAssetPath(
  stores: ReturnType<typeof parseKmnHeaderStores>,
  storeName: string,
  keyboardId: string,
  extension: string,
): string {
  const store = stores.find((s) => s.storeName === storeName);
  if (store?.path) {
    // Paths in .kmn headers are relative to source/
    return `source/${store.path}`;
  }
  return `source/${keyboardId}${extension}`;
}

/**
 * XML-escape a character for insertion into `.kvks` text content.
 */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Patch the `.kvks` file in the VFS for all keycap targets.
 *
 * Uses regex-based text splicing so that:
 *   - Existing `<key vkey="K_X">…</key>` elements get their text replaced.
 *   - Missing keys are appended just before `</layer>`.
 */
function patchKvks(
  vfs: VirtualFS,
  kvksPath: string,
  keyboardId: string,
  targets: KeycapTarget[],
  warnings: string[],
): void {
  const entry = vfs.get(kvksPath);
  if (entry === undefined) {
    warnings.push(
      `[applyKeycapLabels] no .kvks found for ${keyboardId}, desktop keycap labels not updated`,
    );
    return;
  }
  if (entry.isBinary) {
    warnings.push(
      `[applyKeycapLabels] .kvks at "${kvksPath}" is marked binary — cannot apply text patches`,
    );
    return;
  }

  let xml =
    typeof entry.content === "string"
      ? entry.content
      : new TextDecoder().decode(entry.content as Uint8Array);

  for (const { vkey, char, kvksLayer } of targets) {
    const escaped = xmlEscape(char);

    // Match the <layer shift="…">…</layer> block for this layer.
    // The shift attribute value is either "" (empty string) or a non-empty token.
    const layerPattern = new RegExp(
      `(<layer\\b[^>]*\\bshift="${escapeRegExp(kvksLayer)}"[^>]*>)([\\s\\S]*?)(</layer>)`,
      "i",
    );
    const layerMatch = layerPattern.exec(xml);
    if (!layerMatch) {
      // Layer not present — for AltGr (kvksLayer === "RA") we synthesize a minimal
      // new layer so the swapped keycap is visible when the user switches to the
      // AltGr view. For other missing layers we skip silently.
      if (kvksLayer === "RA") {
        xml = synthesizeKvksLayer(xml, vkey, escaped);
      }
      continue;
    }

    const layerOpen = layerMatch[1] ?? "";
    let layerBody = layerMatch[2] ?? "";
    const layerClose = layerMatch[3] ?? "";

    // Try to find and replace an existing <key vkey="K_X">…</key> element.
    const keyPattern = new RegExp(
      `(<key\\b[^>]*\\bvkey="${escapeRegExp(vkey)}"[^>]*>)([^<]*)(</key>)`,
      "i",
    );

    if (keyPattern.test(layerBody)) {
      layerBody = layerBody.replace(keyPattern, `$1${escaped}$3`);
    } else {
      // Key not present — append before </layer>.
      layerBody = `${layerBody}<key vkey="${vkey}">${escaped}</key>`;
    }

    // Splice the patched layer body back into the full XML string.
    const fullLayerReplacement = layerOpen + layerBody + layerClose;
    xml = xml.replace(layerPattern, fullLayerReplacement);
  }

  vfs.set(kvksPath, xml, false);
}

/**
 * Patch the `.keyman-touch-layout` JSON file in the VFS for all keycap targets.
 *
 * Walks `platforms → layers → rows → keys` and sets `key.text` for any key
 * whose `id` matches the target vkey on the target layer.  Missing keys are
 * silently skipped (they may not exist in every touch layout).
 */
function patchTouchLayout(
  vfs: VirtualFS,
  touchPath: string,
  targets: KeycapTarget[],
): void {
  const entry = vfs.get(touchPath);
  // Touch layout is optional — skip silently when absent or binary.
  if (entry === undefined || entry.isBinary) return;

  const raw =
    typeof entry.content === "string"
      ? entry.content
      : new TextDecoder().decode(entry.content as Uint8Array);

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Malformed JSON — skip silently.
    return;
  }

  if (!data || typeof data !== "object") return;

  // Build a lookup: touchLayer → vkey → char
  const patchMap = new Map<string, Map<string, string>>();
  for (const { vkey, char, touchLayer } of targets) {
    if (!patchMap.has(touchLayer)) patchMap.set(touchLayer, new Map());
    patchMap.get(touchLayer)!.set(vkey, char);
  }

  // Touch layout shape: { platforms: { <platform>: { layer: [...] } } }
  // `platforms` may be the top-level object itself or nested under a key.
  const topObj = data as Record<string, unknown>;

  // Collect all objects that have a `layer` array — these are platform objects.
  const platformObjects: Record<string, unknown>[] = [];

  for (const val of Object.values(topObj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const maybeP = val as Record<string, unknown>;
      if (Array.isArray(maybeP["layer"])) {
        platformObjects.push(maybeP);
      }
    }
  }

  if (platformObjects.length === 0) {
    // Try the top-level object itself in case the file IS the platform object.
    if (Array.isArray(topObj["layer"])) {
      platformObjects.push(topObj);
    }
  }

  for (const platform of platformObjects) {
    const layers = platform["layer"] as unknown[];
    for (const layer of layers) {
      if (!layer || typeof layer !== "object") continue;
      const layerObj = layer as Record<string, unknown>;
      const layerId = layerObj["id"];
      if (typeof layerId !== "string") continue;

      const vkeyMap = patchMap.get(layerId);
      if (!vkeyMap) continue;

      const rows = layerObj["row"];
      if (!Array.isArray(rows)) continue;

      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const rowObj = row as Record<string, unknown>;
        const keys = rowObj["key"];
        if (!Array.isArray(keys)) continue;

        for (const key of keys) {
          if (!key || typeof key !== "object") continue;
          const keyObj = key as Record<string, unknown>;
          const keyId = keyObj["id"];
          if (typeof keyId !== "string") continue;

          const newChar = vkeyMap.get(keyId);
          if (newChar !== undefined) {
            keyObj["text"] = newChar;
          }
        }
      }
    }
  }

  vfs.set(touchPath, JSON.stringify(data, null, 2), false);
}

/**
 * Synthesize a minimal `<layer shift="RA">` block in the kvks XML for S-08
 * assignments when the base keyboard has no existing AltGr layer.
 *
 * Inserts before `</encoding>` (or before `</visualkeyboard>` as fallback).
 * Also adds `<usealtgr/>` to the header flags block if not already present,
 * so KMW exposes the AltGr layer in the desktop OSK.
 */
function synthesizeKvksLayer(xml: string, vkey: string, escapedChar: string): string {
  const newLayer = `\n<layer shift="RA">\n<key vkey="${vkey}">${escapedChar}</key>\n</layer>`;

  // Insert before </encoding> if present, else before </visualkeyboard>.
  let patched = xml.replace(/(<\/encoding>)/i, `${newLayer}\n$1`);
  if (patched === xml) {
    patched = xml.replace(/(<\/visualkeyboard>)/i, `${newLayer}\n$1`);
  }

  // Ensure <usealtgr/> is present in the header flags so KMW shows the AltGr view.
  if (!/<usealtgr\s*\/?>/i.test(patched)) {
    // Prefer inserting inside an existing <flags> block.
    const flagsInserted = patched.replace(/(<flags\b[^>]*>)/i, "$1\n<usealtgr/>");
    if (flagsInserted !== patched) {
      patched = flagsInserted;
    } else {
      // No <flags> block — insert a minimal one inside <header> (or as a sibling before </header>).
      patched = patched.replace(/(<\/header>)/i, "<flags>\n<usealtgr/>\n</flags>\n$1");
    }
  }

  return patched;
}

/**
 * Escape a string for safe use inside a `new RegExp(…)` pattern.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
