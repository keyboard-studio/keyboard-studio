/**
 * Touch-layout template cleanup as a TouchLayoutIR mutation (#313 goal 3).
 *
 * This is the IR-native form of the cleanup the scaffolder used to perform as
 * a raw `JSON.parse` → mutate → `JSON.stringify` operation on the shipped
 * `.keyman-touch-layout` file. The conversion is possible — and behaviour-
 * preserving — only because the full-fidelity codec (#2083) round-trips the
 * modelled Keyman surface losslessly. It is deliberately scoped to this
 * wholesale-rewrite operation: the spec 035 R9 Case B splice appliers in
 * `../pattern-apply/` still operate on raw JSON by design (they preserve a
 * shipped file verbatim outside edited keys), and this module does not amend
 * R9 for them.
 *
 * What the mutation does — the manual template-making recipe in
 * `docs/archive/making-a-template.md`, in the raw operation's exact order:
 *
 *   1. Delete the `phone` platform (the studio's derived keyboards are
 *      tablet-shaped; the inherited phone layout is discarded, not adapted).
 *      Desktop passes through untouched.
 *   2. On tablet, BEFORE any defaulting: if a `shift` layer exists and no
 *      `caps` layer does, append a deep clone of shift renamed `caps`; same
 *      for `rightalt-shift` → `rightalt-caps`. (Pairs with the KMN-side
 *      cleanup: touch has no implicit caps derivation, so caps-lock state
 *      needs a real layer to display.)
 *   3. On tablet layers that are neither `default` nor `*caps*`: for each
 *      top-level row key lacking `nextlayer`, set `nextlayer: "default"` —
 *      except frame/modifier/deadkey/blank/spacer keys (see the `sp`
 *      exclusion below). Cloned caps layers are skipped by this pass, so
 *      they keep shift's pre-defaulting state.
 *
 * The `sp` exclusion reads the normalised numeric `sp` — the key's class,
 * not its source encoding. The pre-conversion raw operation tested the raw
 * JSON value with strict equality, so a string-encoded `"1"` (a special/
 * frame key in the legacy encoding) did NOT match the numeric exclusion set
 * and DID gain `nextlayer: "default"`, while numeric `1` did not. This
 * conversion originally replicated that wire behaviour to stay a pure
 * refactor; the #2215 ruling then adopted numeric semantics as the
 * permanent rule: `sp` is an integer enum in the Keyman format, the string
 * form is a deprecated legacy spelling of the same value, and every Keyman
 * consumer normalises before interpreting — so the exemption follows the
 * value, not the spelling. (The `spWire` hint still preserves the source
 * encoding at emit time; it is a fidelity record, not a semantic input.)
 *
 * IR bookkeeping: cloned keys are re-minted fresh `nodeId`s (recursively,
 * including `sk`/`multitap`/`flick` children) continuing the layout's
 * existing `touchKey#<n>` sequence, and the `nodeIds` address index is
 * rebuilt from the mutated tree with the parser's own builders — so the
 * returned IR is internally consistent (no stale `phone:` entries, no
 * duplicated nodeIds from the clone) for any caller that keeps it, even
 * though the scaffolder's own use is parse → mutate → emit → discard.
 *
 * Known tolerance trade (accepted in the #313 ruling): routing through the
 * IR narrows the input surface from "any JSON object" to the modelled
 * Keyman schema surface. Unknown members, non-platform top-level keys,
 * platforms without a `layer` array, string row ids, empty `sk`/`multitap`
 * arrays and empty-string display fields are dropped or normalised by the
 * parser before this mutation ever sees them — see the ruling note in
 * `queue-313-ruling.md` and the PR body for the full list.
 */

import type { IRNodeRef, TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  createKeyOccurrenceCounter,
  touchKeyAddress,
  touchSubKeyAddress,
} from "@keyboard-studio/contracts";

type PlatformIR = TouchLayoutIR["platforms"][number];
type LayerIR = PlatformIR["layers"][number];

/**
 * `sp` codes that must NOT get `nextlayer` defaulted: 1=special,
 * 2=specialActive, 3=customSpecial, 4=customSpecialActive (frame/modifier
 * keys), 8=deadkey, 9=blank, 10=spacer. Only sp=0/absent (a normal character
 * key) — or a value outside this set — defaults.
 */
const SP_NO_DEFAULT: ReadonlySet<number> = new Set([1, 2, 3, 4, 8, 9, 10]);

/** True when the key's `sp` class exempts it from nextlayer defaulting. */
function spExemptsFromDefault(key: TouchKeyIR): boolean {
  // Numeric semantics (#2215): the parser has already normalised both
  // source encodings to `key.sp`, and the exclusion tests that value.
  // `spWire` is deliberately NOT consulted — it records how the source
  // spelled the value for byte-faithful re-emission, and a legacy string
  // spelling must not change the key's behaviour.
  return key.sp !== undefined && SP_NO_DEFAULT.has(key.sp);
}

/** Largest `touchKey#<n>` suffix in the tree, or -1 when none parse. */
function maxNodeSeq(ir: TouchLayoutIR): number {
  let max = -1;
  const visit = (key: TouchKeyIR): void => {
    const m = /^touchKey#(\d+)$/.exec(key.nodeId);
    if (m) max = Math.max(max, Number(m[1]));
    for (const child of key.sk ?? []) visit(child);
    for (const child of key.multitap ?? []) visit(child);
    for (const child of Object.values(key.flick ?? {})) {
      if (child !== undefined) visit(child);
    }
  };
  for (const platform of ir.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) visit(key);
      }
    }
  }
  return max;
}

/** Deep-clone a key, re-minting `nodeId` on it and every nested child. */
function cloneKeyWithFreshIds(key: TouchKeyIR, mint: () => string): TouchKeyIR {
  const copy: TouchKeyIR = { ...key, nodeId: mint() };
  if (key.sk !== undefined) copy.sk = key.sk.map((k) => cloneKeyWithFreshIds(k, mint));
  if (key.multitap !== undefined) {
    copy.multitap = key.multitap.map((k) => cloneKeyWithFreshIds(k, mint));
  }
  if (key.flick !== undefined) {
    const flick: NonNullable<TouchKeyIR["flick"]> = {};
    for (const [dir, fkey] of Object.entries(key.flick)) {
      if (fkey !== undefined) {
        flick[dir as keyof NonNullable<TouchKeyIR["flick"]>] = cloneKeyWithFreshIds(fkey, mint);
      }
    }
    copy.flick = flick;
  }
  return copy;
}

function cloneLayerWithFreshIds(layer: LayerIR, newId: string, mint: () => string): LayerIR {
  return {
    id: newId,
    rows: layer.rows.map((row) => ({
      ...(row.id !== undefined ? { id: row.id } : {}),
      keys: row.keys.map((k) => cloneKeyWithFreshIds(k, mint)),
    })),
  };
}

/**
 * Rebuild the `nodeIds` address index from the (mutated) tree, replicating
 * the canonical parser's indexing exactly: per-layer occurrence counter in
 * row-major order, top-level keys plus their direct `sk` sub-keys.
 */
function rebuildNodeIds(ir: TouchLayoutIR): Array<[string, IRNodeRef]> {
  const nodeIds: Array<[string, IRNodeRef]> = [];
  for (const platform of ir.platforms) {
    for (const layer of platform.layers) {
      const nextOccurrence = createKeyOccurrenceCounter();
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const occurrence = nextOccurrence(key.id);
          nodeIds.push([
            touchKeyAddress(platform.id, layer.id, key.id, occurrence),
            { kind: "touchKey", nodeId: key.nodeId },
          ]);
          if (key.sk) {
            for (const sk of key.sk) {
              nodeIds.push([
                touchSubKeyAddress(platform.id, layer.id, key.id, "sk", sk.id, occurrence),
                { kind: "touchKey", nodeId: sk.nodeId },
              ]);
            }
          }
        }
      }
    }
  }
  return nodeIds;
}

/**
 * Apply the template cleanup to a parsed touch layout, in place.
 *
 * See the module header for the recipe, the deliberate `spWire` semantics,
 * and the accepted tolerance trade.
 */
export function mutateCleanTouchLayout(ir: TouchLayoutIR): void {
  let seq = maxNodeSeq(ir);
  const mint = (): string => `touchKey#${++seq}`;

  // 1. Delete the phone platform, whatever it contained.
  ir.platforms = ir.platforms.filter((p) => p.id !== "phone");

  const tablet = ir.platforms.find((p) => p.id === "tablet");
  if (tablet !== undefined) {
    const layers = tablet.layers;

    // 2. Caps synthesis — BEFORE defaulting, appended at the end, first
    //    match only (mirroring the raw operation's `find`).
    if (
      layers.some((l) => l.id === "shift") &&
      !layers.some((l) => l.id === "caps")
    ) {
      const shift = layers.find((l) => l.id === "shift")!;
      layers.push(cloneLayerWithFreshIds(shift, "caps", mint));
    }
    if (
      layers.some((l) => l.id === "rightalt-shift") &&
      !layers.some((l) => l.id === "rightalt-caps")
    ) {
      const rightaltShift = layers.find((l) => l.id === "rightalt-shift")!;
      layers.push(cloneLayerWithFreshIds(rightaltShift, "rightalt-caps", mint));
    }

    // 3. nextlayer defaulting — top-level row keys only (no recursion into
    //    sk/flick/multitap), skipping the default layer and every *caps*
    //    layer (including the clones just appended).
    for (const layer of layers) {
      if (layer.id === "default" || layer.id.includes("caps")) continue;
      for (const row of layer.rows) {
        for (const key of row.keys) {
          // The parser can carry a JSON `null` nextlayer through despite
          // the string type; the raw operation's loose `== null` treated
          // absent and null alike, and so does this check.
          if ((key.nextlayer as string | null | undefined) == null && !spExemptsFromDefault(key)) {
            key.nextlayer = "default";
          }
        }
      }
    }
  }

  ir.nodeIds = rebuildNodeIds(ir);
}
