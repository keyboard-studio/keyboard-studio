/**
 * deadkeys — Phase 1 read-only queries for spec 083 (deadkey lifecycle
 * authoring, issue #1849).
 *
 * A deadkey *entity* (trigger key, fan-out stores, pairs) is not a node in
 * the IR — it is a cluster of rules + stores the studio reconstructs by
 * shape. This module performs that reconstruction without mutating the IR
 * and without any schema migration (spec §5a):
 *
 * - {@link listDeadkeys} — one {@link DeadkeyInfo} per deadkey id found
 *   anywhere in the IR (rule contexts, rule outputs, store items).
 * - {@link allocateDeadkeyId} — the next auto-unique numeric id.
 * - {@link getDeadkeyName} / {@link setDeadkeyName} — the author-chosen name
 *   metadata carrier (see "Name metadata carrier — DECISION" below).
 *
 * The validator checks that guard lifecycle mutations live in
 * `../validator.ts` (`validateDeadkeyLifecycle`); they consume the scanners
 * here.
 *
 * Pure, browser-safe, no I/O. Numeric ids only — named/opaque `dk(name)`
 * deadkeys (which the codec opaques into RawKmnFragments until 076 FR-004
 * closes the codec) are listed best-effort with `id: null`; Phase 2/3 treat
 * null-id entries as delete/retarget-only.
 *
 * @see specs/083-deadkey-lifecycle/spec.md
 * @see specs/083-deadkey-lifecycle/plan.md (Phase 1)
 */

// ---------------------------------------------------------------------------
// Name metadata carrier — DECISION (Phase 1, spec 083)
// ---------------------------------------------------------------------------
//
// The spec requires an optional author-chosen name, stored as round-tripping
// metadata from day one and mechanically migrated to a real `dk(name)` id
// after 076 FR-004 — and NEVER written as `dk(name)` before the codec can
// round-trip it. Two carriers were considered:
//
// 1. Structured comment token on the trigger rule's `trailingComment` —
//    `c @deadkey:<hexid> name=<name>`. CHOSEN.
// 2. Manifest / IR metadata field. REJECTED: there is no metadata slot on
//    KeyboardIR today, and adding one is an IR schema change, which §5a
//    forbids in Phase 1 ("no IR schema migration; do not change existing
//    interfaces").
// 3. A freestanding/anchored IRComment node. REJECTED on two counts: a
//    leading-anchor comment re-anchors to the *following* rule on re-parse,
//    so deleting the trigger rule would silently re-attribute the name to
//    the next rule; and trailing-anchor IRComments are not emitted by the
//    codec at all (emit.ts only emits `leading` and `freestanding` anchors),
//    so they do not survive a parse→emit→parse round trip.
//
// The trailingComment token travels ON the trigger rule's own source line —
// it is emitted inline (`+ [K_QUOTE] > dk(0001) c @deadkey:0001 name=acute`),
// re-parsed back into `trailingComment` by the codec's stripTrailingComment,
// deleted/moved together with the rule, and never disturbs neighbouring
// rules. It coexists with surrounding user comment text (get/set preserve
// it). A hand-edit that changes the rule's dk id without updating the token
// invalidates it: a hex mismatch is treated as absent, never misattributed.
//
// The bare `@deadkey:<hexid>` marker (no `name=`) is the studio's authorship
// marker — it is what classifies a deadkey's origin as "studio" in
// listDeadkeys. Clearing the name keeps the marker; the deadkey stays
// studio-authored. (Phase 2's define action writes the token whenever the
// author supplies a name.)

import type {
  ContextElement,
  IRRule,
  KeyboardIR,
  OutputElement,
  StoreItem,
} from "../keyboard-ir.js";
import { isPlusSeparator } from "../rule-shape.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Origin classification of a listed deadkey (spec 083, User Story 2 —
 * inventory must list every deadkey "including deadkeys the studio did not
 * create").
 *
 * - `"studio"` — the trigger rule carries the studio's authorship marker
 *   (`@deadkey:<hexid>` token in its trailing comment). Written by the
 *   define action (Phase 2); the id is decoupled from the trigger key.
 * - `"s02-legacy"` — the id equals the codepoint of the trigger char
 *   (the old S-02 assign-flow convention: `dk(003b)` for `;`). The id is
 *   coupled to the trigger key; retargeting such a deadkey keeps the stale
 *   id unless it is renamed.
 * - `"imported"` — anything else: base-keyboard and third-party deadkeys,
 *   including non-US-layout keyboards whose trigger char the US-layout
 *   lookup below cannot resolve (documented limitation — see
 *   {@link US_TRIGGER_CHAR}).
 *
 * A studio-minted deadkey with no name is indistinguishable from an
 * imported one until Phase 2 writes the authorship marker; that ambiguity
 * is inherent to the marker design, not a detection failure.
 */
export type DeadkeyOrigin = "studio" | "s02-legacy" | "imported";

/**
 * One deadkey entity reconstructed from the IR's rule/store cluster
 * (spec 083, User Story 2).
 *
 * Incomplete clusters are listed with nulls — never silently dropped. A
 * deadkey whose trigger rule exists but whose fan-out rule is missing (or
 * vice versa) still appears in the inventory; Phase 2/3 treat such entries
 * as manageable for delete/retarget but not for pair editing.
 */
export interface DeadkeyInfo {
  /**
   * Numeric deadkey id, or `null` for named/opaque `dk(name)` deadkeys the
   * codec keeps as raw (pre-076 FR-004). Null-id entries carry {@link name}
   * instead; Phase 2/3 treat them as delete/retarget-only.
   */
  id: number | null;
  /**
   * Opaque name for null-id entries (e.g. `"acute"` for `dk(acute)`),
   * recovered from the codec's `named-deadkey` RawKmnFragments. Absent for
   * numeric deadkeys.
   */
  name?: string;
  /**
   * Trigger key: the vkey name (e.g. `"K_COLON"`) or the literal char when
   * the trigger rule uses a string-literal context (corpus-attested, e.g.
   * sil_euro_latin's `"'"` trigger). `null` when no trigger rule was found.
   */
  triggerKey: string | null;
  /**
   * Fan-out base store name (the `any(...)` storeRef). `null` when no
   * fan-out rule was found. Store names are taken as-is — never matched
   * against a `dk_<hex>_*` pattern, because corpus keyboards use other
   * names (e.g. sil_euro_latin's `acuteK`/`acuteO`).
   */
  baseStore: string | null;
  /**
   * Fan-out output store name (the `index(...)` storeRef). `null` when no
   * fan-out rule was found.
   */
  outputStore: string | null;
  /**
   * Defined base→accented pairs: the char-item count of the shorter of the
   * two fan-out stores. `0` when either store is missing or unresolvable.
   */
  pairCount: number;
  /** See {@link DeadkeyOrigin}. */
  origin: DeadkeyOrigin;
  /**
   * Author-chosen name from the `@deadkey:<hexid> name=<name>` trailing-
   * comment token on the trigger rule. Absent when the deadkey is unnamed.
   */
  authorName?: string;
}

// ---------------------------------------------------------------------------
// Cluster shape matchers
// ---------------------------------------------------------------------------

/** Context/output elements with the codec's synthetic `+` separators removed. */
function withoutPlusSeparators<T extends { kind: string; text?: string }>(
  els: readonly T[],
): T[] {
  return els.filter((el) => !isPlusSeparator(el));
}

/**
 * Trigger rule: `+ [K] > dk(id)` — a single vkey (or single char literal)
 * context producing exactly one deadkey output. Returns the id and the
 * trigger key (vkey name or literal char).
 */
function matchTriggerRule(
  rule: IRRule,
): { id: number; triggerKey: string } | null {
  const ctx = withoutPlusSeparators(rule.context);
  if (ctx.length !== 1) return null;
  const c0 = ctx[0] as ContextElement | undefined;
  let triggerKey: string | null = null;
  if (c0?.kind === "vkey") triggerKey = c0.name;
  else if (c0?.kind === "char") triggerKey = c0.value;
  else return null;
  if (rule.output.length !== 1) return null;
  const o0 = rule.output[0] as OutputElement | undefined;
  if (o0?.kind !== "deadkey") return null;
  return { id: o0.id, triggerKey };
}

/**
 * Fan-out rule: `dk(id) + any(bases) > index(output, N)` — the deadkey state
 * plus a base letter from the bases store maps to the parallel output store.
 * The `index()` offset is not constrained (corpus uses 2 and 3).
 */
function matchFanoutRule(
  rule: IRRule,
): { id: number; baseStore: string; outputStore: string } | null {
  const ctx = withoutPlusSeparators(rule.context);
  if (ctx.length !== 2) return null;
  const d = ctx[0] as ContextElement | undefined;
  const a = ctx[1] as ContextElement | undefined;
  if (d?.kind !== "deadkey" || a?.kind !== "any") return null;
  if (rule.output.length !== 1) return null;
  const o = rule.output[0] as OutputElement | undefined;
  if (o?.kind !== "index") return null;
  return { id: d.id, baseStore: a.storeRef, outputStore: o.storeRef };
}

// ---------------------------------------------------------------------------
// Named/opaque deadkeys (pre-076 FR-004)
// ---------------------------------------------------------------------------

/**
 * The codec's opaque-feature reason for `dk(name)` with a non-hex identifier
 * (engine `src/codec/opaque-reasons.ts` `NAMED_DEADKEY`). Kept as a local
 * string literal: contracts is the dependency root and cannot import engine.
 */
const NAMED_DEADKEY_REASON = "named-deadkey";

/**
 * Trigger-shaped raw fragment: `+ [K_A] > dk(acute)` (a trailing `c` comment,
 * if any, is ignored). A bracket with modifiers (`[SHIFT K_A]`) resolves to
 * the vkey name; a quoted literal context resolves to the literal string.
 */
const RAW_NAMED_TRIGGER_RE =
  /^\s*\+?\s*(?:\[([^\]]+)\]|'([^']*)'|"([^"]*)")\s*>\s*dk\(\s*([^)]*?)\s*\)/i;

/** Fan-out-shaped raw fragment: `dk(acute) + any(acuteK) > index(acuteO, 2)`. */
const RAW_NAMED_FANOUT_RE =
  /^\s*dk\(\s*([^)]*?)\s*\)\s*\+\s*any\(\s*([^)]+?)\s*\)\s*>\s*index\(\s*([^)]+?)\s*,\s*\d+\s*\)/i;

/** Mirror of the codec's `isNamedDk`: non-empty and not pure hex. */
function isNamedDkName(inner: string): boolean {
  const name = inner.trim();
  return name.length > 0 && !/^[0-9A-Fa-f]+$/.test(name);
}

interface NamedRawEntry {
  name: string;
  triggerKey: string | null;
  baseStore: string | null;
  outputStore: string | null;
}

/**
 * Recover named/opaque deadkeys from the codec's RawKmnFragments. The codec
 * opaques any rule mentioning `dk(name)` in its strict parse, so trigger and
 * fan-out rules for named deadkeys never reach the typed rule list — this
 * scan is the only way they appear in the inventory. Entries merge by name
 * across trigger- and fan-out-shaped fragments; only fragments the codec
 * attributed to the named-deadkey opaque reason are considered.
 */
function scanNamedRawEntries(ir: KeyboardIR): NamedRawEntry[] {
  const byName = new Map<string, NamedRawEntry>();
  const entryFor = (name: string): NamedRawEntry => {
    let e = byName.get(name);
    if (!e) {
      e = { name, triggerKey: null, baseStore: null, outputStore: null };
      byName.set(name, e);
    }
    return e;
  };
  for (const frag of ir.raw) {
    if (frag.reason !== NAMED_DEADKEY_REASON) continue;
    const t = RAW_NAMED_TRIGGER_RE.exec(frag.sourceText);
    if (t !== null) {
      const name = (t[4] ?? "").trim();
      if (!isNamedDkName(name)) continue;
      const e = entryFor(name);
      if (e.triggerKey === null) {
        const bracket = t[1];
        e.triggerKey =
          bracket !== undefined
            ? (bracket.trim().split(/\s+/).pop() ?? "")
            : (t[2] ?? t[3] ?? "");
      }
      continue;
    }
    const f = RAW_NAMED_FANOUT_RE.exec(frag.sourceText);
    if (f !== null) {
      const name = (f[1] ?? "").trim();
      if (!isNamedDkName(name)) continue;
      const e = entryFor(name);
      if (e.baseStore === null) e.baseStore = (f[2] ?? "").trim();
      if (e.outputStore === null) e.outputStore = (f[3] ?? "").trim();
    }
  }
  return [...byName.values()];
}

/**
 * Store names claimed by opaque named-deadkey rules. The codec opaques any
 * rule mentioning `dk(name)` with a non-hex name, so a named deadkey's
 * fan-out rules never reach the typed rule list — but its stores are still
 * typed IR stores. A store shaped `dk_<allhex>_bases|output` (e.g.
 * `dk_cafe_bases` for an all-hex name slug) would otherwise look orphaned
 * to the numeric-only liveness scan in {@link validateDeadkeyLifecycle},
 * so that check treats every store named in a named-deadkey-attributed
 * fan-out fragment as live.
 */
export function namedDeadkeyRawStoreNames(ir: KeyboardIR): Set<string> {
  const names = new Set<string>();
  for (const frag of ir.raw) {
    if (frag.reason !== NAMED_DEADKEY_REASON) continue;
    const f = RAW_NAMED_FANOUT_RE.exec(frag.sourceText);
    if (f === null) continue;
    const base = (f[2] ?? "").trim();
    const output = (f[3] ?? "").trim();
    if (base !== "") names.add(base);
    if (output !== "") names.add(output);
  }
  return names;
}

// ---------------------------------------------------------------------------
// s02-legacy detection
// ---------------------------------------------------------------------------

/**
 * Unshifted US-QWERTY character per trigger vkey — mirrors the studio's own
 * `TRIGGER_KEY_CHARS` convention (MechanismGallery.tsx `deadkeyNameFor`:
 * id = codepoint of the trigger key's character).
 *
 * Best-effort and US-layout-only: a deadkey minted by the S-02 path on a
 * non-US base layout (e.g. basic_kbdfr's `+ [K_LBRKT] > dk(005e)`, where the
 * AZERTY key produces `^`) will NOT match here and classifies as
 * `"imported"`. That is an honest display limitation, not a correctness
 * issue — grandfathering (allocateDeadkeyId) never depends on origin.
 */
const US_TRIGGER_CHAR: Readonly<Record<string, string>> = {
  K_QUOTE: "'",
  K_COMMA: ",",
  K_PERIOD: ".",
  K_SLASH: "/",
  K_COLON: ";",
  K_LBRKT: "[",
  K_RBRKT: "]",
  K_BKQUOTE: "`",
  K_HYPHEN: "-",
  K_EQUAL: "=",
  K_1: "1",
  K_2: "2",
  K_3: "3",
  K_4: "4",
  K_5: "5",
  K_6: "6",
  K_7: "7",
  K_8: "8",
  K_9: "9",
  K_0: "0",
  K_Q: "q", K_W: "w", K_E: "e", K_R: "r", K_T: "t",
  K_Y: "y", K_U: "u", K_I: "i", K_O: "o", K_P: "p",
  K_A: "a", K_S: "s", K_D: "d", K_F: "f", K_G: "g",
  K_H: "h", K_J: "j", K_K: "k", K_L: "l",
  K_Z: "z", K_X: "x", K_C: "c", K_V: "v", K_B: "b",
  K_N: "n", K_M: "m",
};

/** True when `id` equals the codepoint of the trigger char (US layout). */
function isLegacyCodepointId(id: number, triggerKey: string | null): boolean {
  if (triggerKey === null) return false;
  // A literal-char trigger carries its own character.
  const ch =
    triggerKey.length === 1 ? triggerKey : US_TRIGGER_CHAR[triggerKey];
  if (ch === undefined || [...ch].length !== 1) return false;
  return id === (ch.codePointAt(0) ?? -1);
}

// ---------------------------------------------------------------------------
// Author-name metadata (structured comment token)
// ---------------------------------------------------------------------------

/**
 * Name characters allowed pre-FR-004. Conservative on purpose: the token is
 * whitespace-delimited inside a `c` comment, and the name must one day be a
 * valid `dk(name)` identifier. FR-004's codec closure applies the full KMN
 * identifier rules at migration time; until then, letters/digits/underscore.
 */
const NAME_RE = /^[A-Za-z0-9_]{1,64}$/;

/** `@deadkey:<hex>` with an optional ` name=<name>` attribute. */
const NAME_TOKEN_RE = /@deadkey:([0-9A-Fa-f]+)(?:\s+name=([A-Za-z0-9_]+))?/;

function hexId(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/** The single deadkey id produced by a trigger rule, or null. */
function triggerRuleDeadkeyId(rule: IRRule): number | null {
  const outs = rule.output.filter(
    (o): o is { kind: "deadkey"; id: number } => o.kind === "deadkey",
  );
  return outs.length === 1 ? (outs[0]?.id ?? null) : null;
}

/**
 * True when the rule carries the studio's authorship marker: a
 * `@deadkey:<hexid>` token whose hex matches the deadkey id this trigger
 * rule produces. A hand-edit that changes the dk id without updating the
 * token invalidates the marker (treated as absent, never misattributed).
 */
function hasStudioMarker(rule: IRRule): boolean {
  const id = triggerRuleDeadkeyId(rule);
  if (id === null || rule.trailingComment === undefined) return false;
  const m = NAME_TOKEN_RE.exec(rule.trailingComment);
  if (!m) return false;
  return parseInt(m[1] ?? "", 16) === id;
}

/**
 * Read the author-chosen name from a trigger rule's trailing-comment token
 * (`@deadkey:<hexid> name=<name>`). Returns `undefined` when the rule has no
 * token, the token carries no name, or the token's hex does not match the
 * rule's own deadkey id (stale metadata is ignored, never misattributed).
 */
export function getDeadkeyName(rule: IRRule): string | undefined {
  if (rule.trailingComment === undefined) return undefined;
  const id = triggerRuleDeadkeyId(rule);
  if (id === null) return undefined;
  const m = NAME_TOKEN_RE.exec(rule.trailingComment);
  if (!m) return undefined;
  if (parseInt(m[1] ?? "", 16) !== id) return undefined;
  return m[2] ?? undefined;
}

/**
 * Write (or clear) the author-chosen name on a trigger rule by setting the
 * `@deadkey:<hexid> name=<name>` token in its `trailingComment`. Surrounding
 * user comment text is preserved; an existing token is replaced in place
 * (self-healing when a stale token's hex no longer matches).
 *
 * - `name` given: the token (marker + name) is written; the name must match
 *   {@link NAME_RE} or an Error is thrown — a name that cannot survive the
 *   comment token format must fail loudly here, not corrupt the .kmn.
 * - `name` undefined: the `name=` attribute is removed but the
 *   `@deadkey:<hexid>` authorship marker is kept — clearing the name does
 *   not de-author the deadkey.
 *
 * Throws when the rule has no single deadkey output (it is not a trigger
 * rule — a programmer error, not user input).
 */
export function setDeadkeyName(
  rule: IRRule,
  name: string | undefined,
): void {
  const id = triggerRuleDeadkeyId(rule);
  if (id === null) {
    throw new Error(
      "setDeadkeyName: rule has no single deadkey output — not a trigger rule",
    );
  }
  if (name !== undefined && !NAME_RE.test(name)) {
    throw new Error(
      `setDeadkeyName: invalid name "${name}" — use 1-64 ASCII letters, digits, or underscore`,
    );
  }
  const token = name === undefined ? `@deadkey:${hexId(id)}` : `@deadkey:${hexId(id)} name=${name}`;
  const existing = rule.trailingComment ?? "";
  if (NAME_TOKEN_RE.test(existing)) {
    rule.trailingComment = existing.replace(NAME_TOKEN_RE, token);
  } else if (existing.trim().length === 0) {
    rule.trailingComment = token;
  } else {
    rule.trailingComment = `${existing.trimEnd()} ${token}`;
  }
}

// ---------------------------------------------------------------------------
// listDeadkeys
// ---------------------------------------------------------------------------

/**
 * Where a numeric `dk(id)` occurs in the IR.
 *
 * - `"rule-output"` — a definition: a rule producing the deadkey (the trigger
 *   rule in a well-formed cluster).
 * - `"rule-context"` — a reference: a fan-out or escape rule consuming the
 *   deadkey state.
 * - `"store-item"` — a reference inside a store's item list.
 */
export type DeadkeyRefPosition = "rule-output" | "rule-context" | "store-item";

/** One numeric `dk(id)` occurrence in the IR. */
export interface DeadkeyRef {
  /** Numeric deadkey id. */
  id: number;
  /** Where the occurrence sits. */
  position: DeadkeyRefPosition;
  /** nodeId of the containing rule, or the store name for store-item refs. */
  container: string;
}

/**
 * Every numeric deadkey id referenced anywhere: rule contexts, rule outputs,
 * store items. The validator's lifecycle checks consume this; {@link
 * listDeadkeys} and {@link allocateDeadkeyId} build on it.
 */
export function scanDeadkeyRefs(ir: KeyboardIR): DeadkeyRef[] {
  const refs: DeadkeyRef[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "deadkey") {
          refs.push({ id: el.id, position: "rule-context", container: rule.nodeId });
        }
      }
      for (const el of rule.output) {
        if (el.kind === "deadkey") {
          refs.push({ id: el.id, position: "rule-output", container: rule.nodeId });
        }
      }
    }
  }
  for (const store of ir.stores) {
    for (const item of store.items) {
      if (item.kind === "deadkey") {
        refs.push({ id: item.id, position: "store-item", container: store.name });
      }
    }
  }
  return refs;
}

/** Every numeric deadkey id referenced anywhere in the IR. */
function collectNumericDeadkeyIds(ir: KeyboardIR): Set<number> {
  return new Set(scanDeadkeyRefs(ir).map((r) => r.id));
}

function charItemCount(store: { items: StoreItem[] } | undefined): number {
  if (!store) return 0;
  return store.items.filter((it) => it.kind === "char").length;
}

/**
 * List every deadkey in the IR as a {@link DeadkeyInfo}.
 *
 * Scans all groups' rules for the deadkey cluster —
 * - trigger `+ [K] > dk(id)` (vkey or char-literal context),
 * - fan-out `dk(id) + any(bases) > index(output, N)` (the `any`/`index`
 *   storeRefs are taken as-is; never pattern-matched),
 * - escape `dk(id) + [K] > char` (detected but not surfaced; it carries no
 *   inventory field),
 * - named `+ [K] > dk(name)` / `dk(name) + any(bases) > index(output, N)`
 *   (the codec opaques these into RawKmnFragments, recovered by
 *   {@link scanNamedRawEntries}; listed with `id: null`)
 * — plus every bare `dk(id)` reference in rule contexts/outputs and store
 * items.
 *
 * Deadkeys whose cluster is incomplete (trigger found but no fan-out, a bare
 * reference with no trigger rule, …) are listed with nulls — never silently
 * dropped. Duplicate numeric ids (the baked-in `"dead0"`-style corruption
 * the plan calls out) collapse to a single entry here; the validator flags
 * them as an error.
 *
 * Deterministic order: numeric ids ascending, named deadkeys after, sorted
 * by name.
 */
export function listDeadkeys(ir: KeyboardIR): DeadkeyInfo[] {
  const triggerById = new Map<number, { rule: IRRule; triggerKey: string }>();
  const fanoutById = new Map<
    number,
    { baseStore: string; outputStore: string }
  >();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const t = matchTriggerRule(rule);
      if (t !== null) {
        if (!triggerById.has(t.id)) triggerById.set(t.id, { rule, triggerKey: t.triggerKey });
        continue;
      }
      const f = matchFanoutRule(rule);
      if (f !== null) {
        if (!fanoutById.has(f.id)) {
          fanoutById.set(f.id, {
            baseStore: f.baseStore,
            outputStore: f.outputStore,
          });
        }
      }
    }
  }

  const storeByName = new Map(ir.stores.map((s) => [s.name, s]));
  const ids = new Set<number>([
    ...triggerById.keys(),
    ...fanoutById.keys(),
    ...collectNumericDeadkeyIds(ir),
  ]);

  const result: DeadkeyInfo[] = [];
  for (const id of [...ids].sort((a, b) => a - b)) {
    const t = triggerById.get(id);
    const f = fanoutById.get(id);
    const baseStore = storeByName.get(f?.baseStore ?? "");
    const outputStore = storeByName.get(f?.outputStore ?? "");
    const triggerKey = t?.triggerKey ?? null;
    const origin: DeadkeyOrigin =
      t !== undefined && hasStudioMarker(t.rule)
        ? "studio"
        : isLegacyCodepointId(id, triggerKey)
          ? "s02-legacy"
          : "imported";
    result.push({
      id,
      triggerKey,
      baseStore: f?.baseStore ?? null,
      outputStore: f?.outputStore ?? null,
      pairCount:
        f !== undefined
          ? Math.min(charItemCount(baseStore), charItemCount(outputStore))
          : 0,
      origin,
      ...(t !== undefined
        ? (() => {
            const authorName = getDeadkeyName(t.rule);
            return authorName === undefined ? {} : { authorName };
          })()
        : {}),
    });
  }

  // Named/opaque deadkeys last, sorted by name. The codec opaques any rule
  // mentioning `dk(name)`, so these are recovered from RawKmnFragments (see
  // scanNamedRawEntries) — best-effort: trigger key and fan-out stores are
  // present only when the corresponding fragment shape was recoverable.
  // There is no numeric id to anchor a name token to, so authorName never
  // applies here.
  for (const n of scanNamedRawEntries(ir).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const baseStore = storeByName.get(n.baseStore ?? "");
    const outputStore = storeByName.get(n.outputStore ?? "");
    result.push({
      id: null,
      name: n.name,
      triggerKey: n.triggerKey,
      baseStore: n.baseStore,
      outputStore: n.outputStore,
      pairCount: Math.min(charItemCount(baseStore), charItemCount(outputStore)),
      origin: "imported",
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// allocateDeadkeyId
// ---------------------------------------------------------------------------

/**
 * Ceiling of the codepoint-derived id range the legacy S-02 path could mint.
 * Trigger characters are printable BMP punctuation/letters; ids at or below
 * this are plausibly (or actually) codepoint-derived.
 */
const LEGACY_ID_CEILING = 0x2fff;

/**
 * Allocate the next auto-unique numeric deadkey id for this IR.
 *
 * Scheme (documented per plan Phase 1):
 * - Scan EVERY existing numeric deadkey id in the IR — rule contexts, rule
 *   outputs, AND store items — and never return one of them. This is what
 *   makes grandfathering load-bearing: a codepoint-derived legacy id
 *   (e.g. `0x003b` = 59, `0x005e` = 94) that exists is never re-minted.
 * - Studio-minted ids start above {@link LEGACY_ID_CEILING} (`max(seen,
 *   0x2FFF) + 1`), so a studio id can never be mistaken for — or collide
 *   with — a codepoint-derived legacy id, even on a keyboard that gains
 *   legacy deadkeys later.
 *
 * Pure: does not mutate the IR.
 */
export function allocateDeadkeyId(ir: KeyboardIR): number {
  let max = LEGACY_ID_CEILING;
  for (const id of collectNumericDeadkeyIds(ir)) {
    if (id > max) max = id;
  }
  return max + 1;
}
