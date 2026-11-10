import type { IRStore, KeyboardIR, OutputElement } from "../keyboard-ir.js";
import { ruleConditions, ruleHasNulContext, ruleKeystroke, rulePreContext } from "../rule-shape.js";

/**
 * caseCounterpart — deterministic case-pair helper for the shift-layer
 * case-pair proposal (studio maps a lowercase key to θ, engine proposes Θ on
 * the shift layer).
 *
 * Distinct from suggestMissing.ts's isCovered()
 * -----------------------------------------------
 * `isCovered` (character-discovery/suggestMissing.ts) answers "is this
 * candidate character already produced by the base keyboard, treating case
 * as fungible?" — it is a coverage/dedup check consumed internally by the
 * missing-character survey, and it deliberately suppresses case-folding for
 * Latin-script Turkic locales (the dotted-I hazard) because a false "covered"
 * there would silently hide a needed character from the survey.
 *
 * `caseCounterpart` answers a different question: "given ONE character the
 * user has already assigned, what is its case counterpart, if any?" — it is
 * a proposal-generation helper for the studio's shift-layer UI, always
 * computes a candidate (there is no suppression list), and is bidirectional
 * (upper->lower as well as lower->upper). Do not merge the two: swapping
 * `isCovered`'s Turkic suppression into this function would incorrectly
 * refuse to propose "İ" for "i" under a "tr" tag, which is exactly the
 * proposal this function exists to make.
 *
 * Known limitation: Unicode-bicameral but orthographically-unicameral scripts
 * ---------------------------------------------------------------------------
 * The guards below are Unicode general-category tests (`\p{Ll}`/`\p{Lu}`),
 * not orthographic-convention tests. For most scripts that coincides with
 * "is this actually a Shift-key pairing an author would want" — but not
 * always. Georgian Mkhedruli is the sharp case: Unicode 11.0 gave Mkhedruli a
 * formal Mtavruli uppercase (ა U+10D0 -> Ⴀ U+1C90, ბ U+10D1 -> Ბ U+1C91), so
 * this function happily returns a counterpart for it, but standard Georgian
 * orthography does not case-alternate — Mtavruli is a headers/inscriptions
 * register, not the everyday companion of Mkhedruli. Cherokee (ꭰ U+AB70 <->
 * Ꭰ U+13A0) is nominally bicameral the same way. There is deliberately no
 * suppression list here for this class (see the "no suppression list"
 * paragraph above) — this primitive stays a pure Unicode fact, and the
 * orthographic-convention judgment call is made by the one caller that turns
 * a counterpart into an authored proposal: the studio's `propose()` in
 * `packages/studio/src/editors/assignLoop/casePairCompanion.ts` suppresses
 * Georgian specifically (corpus evidence: `basic_kbdgeo` maps every
 * `[SHIFT K_x]` to the identical codepoint as its base rule, and the facet
 * classifier independently labels it caseless). Cherokee and any other
 * Unicode-bicameral-but-arguably-unicameral script are NOT suppressed there
 * and remain a known, accepted v1 gap mitigated by propose-then-confirm.
 */

/**
 * Case-map `char` using the locale-sensitive `toLocale{Upper,Lower}Case`
 * when `bcp47` is supplied, falling back to the plain locale-insensitive
 * mapping when `bcp47` is malformed. Per ECMA-402, `toLocaleUpperCase` /
 * `toLocaleLowerCase` throw a `RangeError` for a tag that isn't a
 * structurally valid BCP47 string (e.g. "not a tag!!") — a caller-supplied
 * identity `bcp47` should degrade the proposal, not crash the studio.
 */
function localeCase(
  char: string,
  bcp47: string | undefined,
  direction: "toUpper" | "toLower",
): string {
  if (bcp47 === undefined) {
    return direction === "toUpper" ? char.toUpperCase() : char.toLowerCase();
  }
  try {
    return direction === "toUpper"
      ? char.toLocaleUpperCase(bcp47)
      : char.toLocaleLowerCase(bcp47);
  } catch (err) {
    if (err instanceof RangeError) {
      return direction === "toUpper" ? char.toUpperCase() : char.toLowerCase();
    }
    throw err;
  }
}

/**
 * Returns the case counterpart of a single character, or null when no
 * confident single-character counterpart exists.
 *
 * Guards (all must pass, else null):
 *   1. `char` is exactly one code point; combining marks (`\p{M}`) are rejected.
 *   2. `char` matches `\p{Ll}` (candidate = uppercase) or `\p{Lu}` (candidate =
 *      lowercase); any other general category (caseless scripts — Arabic,
 *      Devanagari, etc.) returns null.
 *   3. The candidate is computed via `toLocaleUpperCase(bcp47)` /
 *      `toLocaleLowerCase(bcp47)` when `bcp47` is supplied (plain
 *      `toUpperCase()` / `toLowerCase()` otherwise, and also as a fallback
 *      when `bcp47` is malformed — see {@link localeCase}), and must itself
 *      be exactly one code point, different from `char`, and match the
 *      expected general category (`\p{Lu}` for toUpper, `\p{Ll}` for toLower)
 *      — this rejects multi-character case expansions (ß -> SS, ﬃ -> FFI)
 *      and self-mapping letters (e.g. U+0138 LATIN SMALL LETTER KRA).
 *
 * @param char   Exactly one character (code point) to find the counterpart of.
 * @param bcp47  Optional BCP47 tag used for locale-sensitive case mapping
 *               (e.g. "tr" so "i" maps to "İ" rather than "I"). A malformed
 *               tag falls back to the locale-insensitive mapping rather than
 *               throwing — see {@link localeCase}.
 */
export function caseCounterpart(
  char: string,
  bcp47?: string,
): { counterpart: string; direction: "toUpper" | "toLower" } | null {
  if ([...char].length !== 1) return null;
  if (/^\p{M}$/u.test(char)) return null;

  let direction: "toUpper" | "toLower";

  if (/^\p{Ll}$/u.test(char)) {
    direction = "toUpper";
  } else if (/^\p{Lu}$/u.test(char)) {
    direction = "toLower";
  } else {
    return null;
  }

  const candidate = localeCase(char, bcp47, direction);

  if ([...candidate].length !== 1) return null;
  if (candidate === char) return null;

  const expectedCategory = direction === "toUpper" ? /^\p{Lu}$/u : /^\p{Ll}$/u;
  if (!expectedCategory.test(candidate)) return null;

  return { counterpart: candidate, direction };
}


// ---------------------------------------------------------------------------
// Key-level cased-key derivation (spec 112, research R1)
// ---------------------------------------------------------------------------

export type Plane = "base" | "shift" | "ralt" | "shift-ralt";

/** True for the CAPS / NCAPS modifier tokens (any spelling case). */
export function isCapsModifier(modifier: string): boolean {
  const m = modifier.toUpperCase();
  return m === "CAPS" || m === "NCAPS";
}

function upperVKey(name: string): string {
  return name.trim().toUpperCase();
}

/** Resolve bracket modifiers to a plane; null when the combination is not one of the four planes. */
function planeOf(modifiers: readonly string[]): Plane | null {
  let shift = false;
  let ralt = false;
  let ctrl = false;
  let alt = false;
  for (const raw of modifiers) {
    const m = raw.toUpperCase();
    if (m === "SHIFT") shift = true;
    else if (m === "RALT") ralt = true;
    else if (m === "NCAPS") continue;
    else if (m === "CTRL") ctrl = true;
    else if (m === "ALT") alt = true;
    else return null; // CAPS, LALT, LCTRL, RCTRL, ...
  }
  if (ctrl || alt) {
    if (ctrl && alt && !ralt) ralt = true;
    else return null;
  }
  if (ralt) return shift ? "shift-ralt" : "ralt";
  return shift ? "shift" : "base";
}

/** The plane of a CAPS rule (CAPS dropped from its modifiers); null when the rule is not a CAPS rule. */
function capsPlaneOf(modifiers: readonly string[]): Plane | null {
  if (!modifiers.some((m) => m.toUpperCase() === "CAPS")) return null;
  return planeOf(modifiers.filter((m) => m.toUpperCase() !== "CAPS"));
}

function parseKeySpec(
  text: string,
  planeFor: (modifiers: readonly string[]) => Plane | null = planeOf,
): { vkey: string; plane: Plane } | null {
  const m = /^\[([^\]]*)\]$/.exec(text.trim());
  if (m === null) return null;
  const parts = (m[1] as string).trim().split(/\s+/);
  const vkey = parts[parts.length - 1];
  if (vkey === undefined || vkey === "") return null;
  const plane = planeFor(parts.slice(0, -1));
  return plane === null ? null : { vkey: upperVKey(vkey), plane };
}

function findStore(ir: KeyboardIR, name: string): IRStore | undefined {
  const lc = name.toLowerCase();
  return ir.stores.find((s) => s.name === name) ?? ir.stores.find((s) => s.name.toLowerCase() === lc);
}

/**
 * Single-character output per key per plane, from direct rules and the
 * `any(store) > index(store, n)` form. Rules with any other context element
 * (deadkeys, preceding characters) are skipped; CAPS rules are skipped so a
 * CAPS/NCAPS sibling pair folds to the NCAPS output.
 */
export function keyPlaneOutputs(ir: KeyboardIR): Map<string, Partial<Record<Plane, string>>> {
  return collectPlaneOutputs(ir, planeOf);
}

/**
 * What each key's own CAPS rules type, by the plane the rule sits on with Caps
 * on (e.g. `[CAPS K_1]` -> base, `[SHIFT CAPS K_1]` -> shift).
 */
export function capsPlaneOutputs(ir: KeyboardIR): Map<string, Partial<Record<Plane, string>>> {
  return collectPlaneOutputs(ir, capsPlaneOf);
}

function collectPlaneOutputs(
  ir: KeyboardIR,
  planeFor: (modifiers: readonly string[]) => Plane | null,
): Map<string, Partial<Record<Plane, string>>> {
  const out = new Map<string, Partial<Record<Plane, string>>>();
  const put = (vkey: string, plane: Plane, ch: string): void => {
    const row = out.get(vkey) ?? {};
    if (row[plane] === undefined) row[plane] = ch;
    out.set(vkey, row);
  };
  for (const group of ir.groups) {
    if (!group.usingKeys) continue;
    for (const rule of group.rules) {
      if (rule.output.length === 0) continue;
      // A bare keystroke: no `nul`, condition or pre-context around it.
      if (ruleHasNulContext(rule) || ruleConditions(rule).length > 0) continue;
      if (rulePreContext(rule, group).length > 0) continue;
      const ctx = ruleKeystroke(rule, group);
      if (ctx === undefined) continue;
      if (ctx.kind === "vkey") {
        const plane = planeFor(ctx.modifiers);
        if (plane === null) continue;
        let text = "";
        let ok = true;
        for (const el of rule.output) {
          if (el.kind === "char") text += el.value;
          else {
            ok = false;
            break;
          }
        }
        if (ok && [...text].length === 1) put(upperVKey(ctx.name), plane, text);
      } else if (ctx.kind === "any") {
        const o = rule.output.length === 1 ? (rule.output[0] as OutputElement) : undefined;
        if (o === undefined || o.kind !== "index" || o.offset !== 1) continue;
        const keys = findStore(ir, ctx.storeRef);
        const chars = findStore(ir, o.storeRef);
        if (keys === undefined || chars === undefined) continue;
        keys.items.forEach((item, i) => {
          const target = chars.items[i];
          if (target === undefined || target.kind !== "char") return;
          if (item.kind === "vkey") {
            if (planeFor([]) !== null) put(upperVKey(item.name), "base", target.value);
          } else if (item.kind === "raw") {
            const spec = parseKeySpec(item.text, planeFor);
            if (spec !== null) put(spec.vkey, spec.plane, target.value);
          }
        });
      }
    }
  }
  return out;
}

/** The parsed &CasedKeys store, ranges expanded. Undefined when not declared. */
export function declaredCasedKeys(ir: KeyboardIR): Set<string> | undefined {
  const store = ir.stores.find((s) => s.isSystem && /^&?casedkeys$/i.test(s.name));
  if (store === undefined) return undefined;
  const out = new Set<string>();
  const names: (string | "..")[] = [];
  for (const it of store.items) {
    if (it.kind === "vkey") names.push(it.name);
    else if (it.kind === "raw") {
      const text = it.text.trim();
      if (text === "..") names.push("..");
      else {
        const m = /([KTU]_[A-Za-z0-9_]+)\s*\]?$/.exec(text);
        if (m) names.push(m[1] as string);
      }
    }
  }
  names.forEach((n, i) => {
    if (n === "..") return;
    out.add(n);
    // `[K_A] .. [K_Z]`: every key between two single-character key names.
    if (names[i + 1] === "..") {
      const to = names[i + 2];
      const a = /^K_([A-Za-z0-9])$/.exec(n)?.[1];
      const b = to === undefined ? undefined : /^K_([A-Za-z0-9])$/.exec(to)?.[1];
      if (a !== undefined && b !== undefined) {
        for (let c = a.toUpperCase().charCodeAt(0); c <= b.toUpperCase().charCodeAt(0); c++) out.add(`K_${String.fromCharCode(c)}`);
      }
    }
  });
  return out;
}

export interface CasedKeySet {
  keys: string[];
  extra: string[];
  conflicts: { vkey: string; plane: Plane; unshifted: string; shifted: string }[];
}

/** Windows virtual-key order, for the extra keys after the floor. */
const KEY_CODE_ORDER: readonly string[] = [
  ...Array.from({ length: 10 }, (_, i) => `K_${(i + 1) % 10}`), // K_1..K_9, K_0 (0x30-0x39)
  ...Array.from({ length: 26 }, (_, i) => `K_${String.fromCharCode(65 + i)}`),
  "K_COLON", "K_EQUAL", "K_COMMA", "K_HYPHEN", "K_PERIOD", "K_SLASH", "K_BKQUOTE",
  "K_LBRKT", "K_BKSLASH", "K_RBRKT", "K_QUOTE", "K_OE2",
];

function keyCodeRank(vkey: string): number {
  const i = KEY_CODE_ORDER.indexOf(vkey);
  return i === -1 ? KEY_CODE_ORDER.length : i;
}

const PLANE_PAIRS: readonly (readonly [Plane, Plane])[] = [
  ["base", "shift"],
  ["ralt", "shift-ralt"],
];

/**
 * The keys `&CasedKeys` should list (research R1): the family floor, plus any key
 * whose Caps acts as Shift on a used plane, minus any key where Caps would not
 * (reported in `conflicts`, even when it is in the floor). `&CasedKeys` makes
 * Caps act as Shift on every plane of a listed key, so a key qualifies only when
 * that holds on each plane whose unshifted and shifted outputs differ.
 *
 * Where the keyboard has CAPS rules for a key and plane they decide: Caps acts
 * as Shift when it types the shifted output, case pair or not (AZERTY's number
 * row types its digits under Caps). Where it has none, the plane must be a case
 * pair.
 */
export function casedKeySet(
  ir: KeyboardIR,
  opts: { bcp47?: string; floor: readonly string[] },
): CasedKeySet {
  const outputs = keyPlaneOutputs(ir);
  const capsOutputs = capsPlaneOutputs(ir);
  const floor = opts.floor.map(upperVKey);
  const floorSet = new Set(floor);
  const qualifying = new Set<string>();
  const conflicts: CasedKeySet["conflicts"] = [];
  const conflicted = new Set<string>();

  for (const [vkey, planes] of outputs) {
    let hasPair = false;
    let conflict: CasedKeySet["conflicts"][number] | undefined;
    for (const [lo, hi] of PLANE_PAIRS) {
      const u = planes[lo];
      const s = planes[hi];
      if (u === undefined || s === undefined || u === s) continue;
      const c = capsOutputs.get(vkey)?.[lo];
      const cp = caseCounterpart(u, opts.bcp47);
      if (c !== undefined ? c === s : cp !== null && cp.counterpart === s) hasPair = true;
      else if (conflict === undefined) conflict = { vkey, plane: lo, unshifted: u, shifted: s };
    }
    if (conflict !== undefined) {
      if (hasPair || floorSet.has(vkey)) conflicts.push(conflict);
      conflicted.add(vkey);
    } else if (hasPair) qualifying.add(vkey);
  }

  const keys = floor.filter((k) => !conflicted.has(k));
  const extra = [...qualifying]
    .filter((k) => !floorSet.has(k))
    .sort((a, b) => keyCodeRank(a) - keyCodeRank(b) || a.localeCompare(b));
  conflicts.sort((a, b) => keyCodeRank(a.vkey) - keyCodeRank(b.vkey));
  return { keys: [...keys, ...extra], extra, conflicts };
}

/** Store items for a key list: `[K_A]..[K_Z]` when the floor is complete, then the rest. */
export function casedKeysStoreText(keys: readonly string[]): string {
  const have = new Set(keys.map(upperVKey));
  const az = Array.from({ length: 26 }, (_, i) => `K_${String.fromCharCode(65 + i)}`);
  const complete = az.every((k) => have.has(k));
  const rest = [...have]
    .filter((k) => !(complete && az.includes(k)))
    .sort((a, b) => keyCodeRank(a) - keyCodeRank(b) || a.localeCompare(b));
  const items = [...(complete ? ["[K_A]..[K_Z]"] : []), ...rest.map((k) => `[${k === "K_OE2" ? "K_oE2" : k}]`)];
  return items.join(" ");
}

// ---------------------------------------------------------------------------
// Touch frame keys (spec 112, research R8)
// ---------------------------------------------------------------------------

/** Touch key ids that are layout frame (control) keys, never character keys. */
const TOUCH_FRAME_KEY_IDS: ReadonlySet<string> = new Set([
  "K_SHIFT",
  "K_LOPT",
  "K_ROPT",
  "K_RALT",
  "K_LALT",
  "K_LCONTROL",
  "K_RCONTROL",
  "K_CAPS",
  "K_NUMLOCK",
  "K_SYMBOLS",
  "K_BKSP",
  "K_ENTER",
  "K_SPACE",
  "K_TAB",
  "K_ALT",
  "K_CONTROL",
]);

/**
 * True when a touch key is a frame key: it is allowed to switch layers (Shift
 * returns to `default`, the symbol/RAlt keys reach their own layers). Every
 * other key is a character key, which must not switch layer after typing on a
 * caps layer (FR-003). A key whose text is a `*Glyph*` special label counts as
 * a frame key too.
 */
export function isTouchFrameKey(key: { id: string; text?: string }): boolean {
  if (TOUCH_FRAME_KEY_IDS.has(key.id.toUpperCase())) return true;
  return key.text !== undefined && /^\*.+\*$/.test(key.text);
}
