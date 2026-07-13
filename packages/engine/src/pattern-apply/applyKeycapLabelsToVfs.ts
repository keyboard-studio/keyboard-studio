// Keycap-label patcher: updates `.kvks` and `.keyman-touch-layout` VFS entries
// so the OSK preview shows the correct characters on the keycaps after
// S-01 (direct-key swap) and S-08 (AltGr/RightAlt) mechanism assignments.
//
// The VirtualFS is mutated in-place; the studio never writes to host disk
// during authoring (spec §11).
//
// Mapping of strategy → layer ids (GATE-confirmed):
//   S-01 unshifted        → kvks shift="" / touch layer "default"
//   S-01 shift            → kvks shift="S" / touch layer "shift"
//   S-08 (modifier_as_layer_switch, arbitrary combo up to 4 tokens) → see
//     modifierCombos.ts's comboToKvksShiftToken / comboToTouchLayerId. RALT
//     alone and SHIFT+RALT ("RA"/"SRA", "rightalt"/"rightalt-shift") are the
//     two combos previously hard-coded here; any other combo now routes
//     through the same lookup. Combos containing CAPS/NCAPS have no kvks
//     token (comboToKvksShiftToken returns null — `.kvks` has no caps-lock
//     layer) and are skipped for THAT surface only; they still get a real
//     `.keyman-touch-layout` layer (comboToTouchLayerId never returns null —
//     touch has its own genuine caps-lock-state layers) — never an error,
//     and never silently folded into another layer.
//
// S-01's `kmnRules` slot value may hold MULTIPLE newline-separated rule
// lines (e.g. a CAPS-handling case-pair quad — see shiftRules.ts's
// buildCasePairRuleLines). Each line is parsed independently: its modifiers
// decide whether it targets the base or shift keycap, and CAPS-state lines
// (modifiers containing `CAPS`, as opposed to `NCAPS`) are skipped entirely
// since they describe the caps-lock-on view, not a distinct OSK keycap.

import type { MechanismAssignment, VirtualFS } from "@keyboard-studio/contracts";
import {
  escapeRegExp,
  readVfsText,
  resolveOskAssetPaths,
  xmlEscape,
} from "./oskAssetShared.js";
import {
  comboToKvksShiftToken,
  comboToTouchLayerId,
  parseKeySpec,
  type ModifierToken,
} from "./modifierCombos.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single keycap label substitution to apply across both asset files. */
interface KeycapTarget {
  /** Virtual key identifier, e.g. "K_A". */
  vkey: string;
  /** The new character to display on the keycap. */
  char: string;
  /**
   * `.kvks` shift attribute value, e.g. "" | "S" | "RA" | "SRA" | "C" | ...
   * `null` when the combo carries CAPS/NCAPS — no distinct kvks layer exists
   * for a caps-lock state, so this surface is skipped for that target.
   */
  kvksLayer: string | null;
  /**
   * `.keyman-touch-layout` layer id, e.g. "default" | "shift" | "rightalt" | ...
   * In practice this is never actually `null` for any target this module
   * constructs — `parseS01RuleLine` only ever sets `"shift"`/`"default"`
   * literals, and `comboToTouchLayerId` (S-08 path) no longer returns `null`
   * for any combo, including CAPS/NCAPS-bearing ones (real shipped
   * `.keyman-touch-layout` files ship genuine `caps`/`rightalt-caps` layers —
   * touch has its own caps-lock-state layer, unlike `.kvks`). The field stays
   * `string | null` defensively since `comboToTouchLayerId`'s own return type
   * is still `string | null`.
   */
  touchLayer: string | null;
  /**
   * The S-08 combo tokens, present only for modifier_as_layer_switch
   * targets. Drives (a) whether a missing kvks layer may be synthesized —
   * S-01 targets (undefined here) never synthesize, matching pre-existing
   * behavior — and (b) whether the synthesized layer needs `<usealtgr/>`
   * (only combos containing RALT need it).
   */
  combo?: readonly ModifierToken[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Patch `.kvks` and `.keyman-touch-layout` VFS entries so the OSK preview
 * shows swapped characters on keycaps for S-01 and S-08 mechanism assignments.
 *
 * For S-01 assignments each `kmnRules` line routes to its own keycap — base
 * or shift, per that line's modifiers (a CAPS-handling case-pair quad
 * therefore patches both the base and shift keycaps from a single
 * assignment); for S-08 (AltGr/RightAlt) assignments the AltGr layer is
 * patched. Only `modality === "physical"` entries are processed —
 * touch-layout and kvks are both driven from the physical side.
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
        // kmnRules slot may hold multiple newline-separated rule lines, e.g.
        // a CAPS-handling case-pair quad:
        //   "+ [NCAPS K_E] > U+03B8\n+ [NCAPS SHIFT K_E] > U+0398\n
        //    + [CAPS K_E] > U+0398\n+ [CAPS SHIFT K_E] > U+03B8"
        // Parse each line independently so a base assignment and its
        // shift-layer companion land on distinct keycaps instead of the
        // companion's target overwriting the base keycap.
        const kmnRules = slotValues?.["kmnRules"] ?? "";
        for (const line of kmnRules.split("\n")) {
          const target = parseS01RuleLine(line, char);
          if (target) targets.push(target);
        }
      } else if (strategyId === "S-08") {
        // altgrKeyList slot example: "[RALT K_A]", "[SHIFT RALT K_A]", or any
        // other combo of up to 4 tokens per modifierCombos.ts's exclusion
        // matrix (e.g. "[CTRL ALT K_A]").
        const altgrKeyList = slotValues?.["altgrKeyList"] ?? "";
        const parsed = parseKeySpec(altgrKeyList);
        if (parsed && parsed.vkey) {
          targets.push({
            vkey: parsed.vkey,
            char,
            kvksLayer: comboToKvksShiftToken(parsed.tokens),
            touchLayer: comboToTouchLayerId(parsed.tokens),
            combo: parsed.tokens,
          });
        }
      }
    }
  }

  // De-duplicate targets that collapse to the same (vkey, kvksLayer, char) —
  // cheap guard against redundant writes if rule-line parsing ever produces
  // overlapping entries (e.g. a base-only line alongside an NCAPS base line
  // with identical output, which buildBaseRuleLines never actually emits
  // together, but the guard costs nothing).
  const seen = new Set<string>();
  const dedupedTargets = targets.filter((t) => {
    const key = JSON.stringify([t.vkey, t.kvksLayer, t.char]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Nothing to patch — return immediately.
  if (dedupedTargets.length === 0) {
    return { warnings };
  }

  // -------------------------------------------------------------------------
  // Step 2 — locate asset paths from the .kmn header stores (with fallback).
  // -------------------------------------------------------------------------
  const { kvksPath, touchPath } = resolveOskAssetPaths(vfs, keyboardId);

  // -------------------------------------------------------------------------
  // Step 3 — patch .kvks (text splice via regex).
  // -------------------------------------------------------------------------
  patchKvks(vfs, kvksPath, keyboardId, dedupedTargets, warnings);

  // -------------------------------------------------------------------------
  // Step 4 — patch .keyman-touch-layout (JSON round-trip).
  // -------------------------------------------------------------------------
  patchTouchLayout(vfs, touchPath, dedupedTargets);

  return { warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single S-01 `.kmn` rule line — `+ [<modifiers> VKEY] > <rhs>` —
 * into a {@link KeycapTarget}, or `undefined` when the line should not
 * produce a keycap (no bracket, or an explicit-CAPS-state modifier).
 *
 * - Lines whose modifiers include `CAPS` (the caps-lock-ON state, distinct
 *   from `NCAPS`) are skipped: the OSK keycap always shows the caps-off
 *   view, so a `[CAPS K_X]` line describes a state with no keycap of its
 *   own.
 * - Modifiers including `SHIFT` route to the shift keycap (`kvksLayer: "S"`,
 *   `touchLayer: "shift"`); otherwise the base keycap (`kvksLayer: ""`,
 *   `touchLayer: "default"`).
 * - The display char is decoded from the RHS (`U+XXXX` codepoint tokens,
 *   concatenated; a quoted literal is used as-is) so a companion's shifted
 *   output doesn't require the caller to have passed the right `char` in —
 *   `fallbackChar` (the assignment's `target`) is only used when the RHS
 *   can't be decoded, for backward compatibility with pre-existing simple
 *   single-rule callers.
 */
function parseS01RuleLine(line: string, fallbackChar: string): KeycapTarget | undefined {
  const bracketMatch = /\[([^\]]+)\]/.exec(line);
  if (!bracketMatch) return undefined;

  const tokens = (bracketMatch[1] ?? "").trim().split(/\s+/);
  const vkey = tokens[tokens.length - 1] ?? "";
  if (!vkey) return undefined;

  const modifiers = tokens.slice(0, -1);
  // Explicit caps-lock-ON state — not a distinct OSK keycap. NCAPS is fine.
  if (modifiers.includes("CAPS")) return undefined;

  const isShift = modifiers.includes("SHIFT");

  const rhs = line.split(">")[1]?.trim() ?? "";
  const char = decodeRhsChar(rhs) ?? fallbackChar;
  if (!char) return undefined;

  return isShift
    ? { vkey, char, kvksLayer: "S", touchLayer: "shift" }
    : { vkey, char, kvksLayer: "", touchLayer: "default" };
}

/**
 * Decode a `.kmn` rule RHS into its display string.
 *
 * Handles one or more whitespace-separated `U+XXXX` codepoint tokens
 * (concatenated — this is how a multi-codepoint grapheme is expressed) and
 * single-quoted literals (`'x'`). Returns `undefined` when the RHS matches
 * neither shape, so the caller can fall back to the assignment's `target`.
 */
function decodeRhsChar(rhs: string): string | undefined {
  if (rhs === "") return undefined;

  const quoted = /^'(.*)'$/.exec(rhs);
  if (quoted) return quoted[1] ?? "";

  const cpTokens = rhs.trim().split(/\s+/);
  let decoded = "";
  for (const token of cpTokens) {
    const cpMatch = /^U\+([0-9A-Fa-f]+)$/.exec(token);
    if (!cpMatch) return undefined;
    decoded += String.fromCodePoint(parseInt(cpMatch[1] ?? "0", 16));
  }
  return decoded || undefined;
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
  const originalXml = xml;

  for (const { vkey, char, kvksLayer, combo } of targets) {
    // CAPS/NCAPS combos have no kvks layer at all — skip this surface, not an error.
    if (kvksLayer === null) continue;

    const escaped = xmlEscape(char);

    // Match the <layer shift="…">…</layer> block for this layer.
    // The shift attribute value is either "" (empty string) or a non-empty token.
    const layerPattern = new RegExp(
      `(<layer\\b[^>]*\\bshift="${escapeRegExp(kvksLayer)}"[^>]*>)([\\s\\S]*?)(</layer>)`,
      "i",
    );
    const layerMatch = layerPattern.exec(xml);
    if (!layerMatch) {
      // Layer not present — for an S-08 (modifier_as_layer_switch) target we
      // synthesize a minimal new layer so the swapped keycap is visible when
      // the user switches to that combo's view. S-01 targets (`combo`
      // undefined) never synthesize, matching pre-existing behavior for the
      // base/shift layers, which are assumed to already exist.
      if (combo !== undefined) {
        const needsUseAltGr = combo.includes("RALT");
        xml = synthesizeKvksLayer(xml, vkey, escaped, kvksLayer, needsUseAltGr);
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

  // Write back only when a target actually changed the XML — mirrors
  // applyCarveKeycapRemovalsToVfs, which gates its vfs.set on a `changed` flag.
  // An unconditional set would churn the VFS (and any downstream mtime/dirty
  // tracking) even when no keycap matched.
  if (xml !== originalXml) {
    vfs.set(kvksPath, xml, false);
  }
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
  // Touch layout is optional — skip silently when absent or binary.
  const raw = readVfsText(vfs, touchPath);
  if (raw === undefined) return;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Malformed JSON — skip silently.
    return;
  }

  if (!data || typeof data !== "object") return;

  // Build a lookup: touchLayer → vkey → char
  // touchLayer is never actually null for a target this module constructs
  // (see KeycapTarget.touchLayer's doc — touch has its own caps-lock-state
  // layer, unlike .kvks) — this guard is kept purely defensively since the
  // field's declared type is still `string | null`.
  const patchMap = new Map<string, Map<string, string>>();
  for (const { vkey, char, touchLayer } of targets) {
    if (touchLayer === null) continue;
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

  let changed = false;
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
          if (newChar !== undefined && keyObj["text"] !== newChar) {
            keyObj["text"] = newChar;
            changed = true;
          }
        }
      }
    }
  }

  // Write back only when a keycap text actually changed — mirrors patchKvks and
  // applyCarveKeycapRemovalsToVfs. A no-op re-serialize would also needlessly
  // reformat the JSON (2-space) even when nothing matched.
  if (changed) {
    vfs.set(touchPath, JSON.stringify(data, null, 2), false);
  }
}

/**
 * Synthesize a minimal `<layer shift="...">` block (e.g. `"RA"`, `"SRA"`, or
 * any other combo's kvks token — see modifierCombos.ts's
 * `comboToKvksShiftToken`) in the kvks XML for an S-08
 * (modifier_as_layer_switch) assignment when the base keyboard has no
 * existing layer for that shift state.
 *
 * Inserts before `</encoding>` (or before `</visualkeyboard>` as fallback).
 * When `needsUseAltGr` is set (the combo contains RALT), also adds
 * `<usealtgr/>` to the header flags block if not already present, so KMW
 * exposes the AltGr layer in the desktop OSK. Combos without RALT (e.g. a
 * plain CTRL or ALT layer switch) have no equivalent KMW flag, so none is added.
 */
function synthesizeKvksLayer(
  xml: string,
  vkey: string,
  escapedChar: string,
  kvksLayer: string,
  needsUseAltGr: boolean,
): string {
  const newLayer = `\n<layer shift="${kvksLayer}">\n<key vkey="${vkey}">${escapedChar}</key>\n</layer>`;

  // Insert before </encoding> if present, else before </visualkeyboard>.
  let patched = xml.replace(/(<\/encoding>)/i, `${newLayer}\n$1`);
  if (patched === xml) {
    patched = xml.replace(/(<\/visualkeyboard>)/i, `${newLayer}\n$1`);
  }

  if (!needsUseAltGr) return patched;

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
