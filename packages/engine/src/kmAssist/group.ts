/**
 * kmAssist rule families — spec 082 FR-018 (Track C read-only v1).
 *
 * Groups typed {@link IRRule}s into families: rules sharing a guard
 * store/set and an output shape form one family (e.g. all 36
 * `any(diablock) + key > context` rules = "Diacritic blocking").
 *
 * Grouping key (documented, stable):
 * - `guardKey` — the shape-context elements before the struck key
 *   (the trailing vkey), as tokens joined with `+`:
 *   `any(s)` → `any:s`, `notany(s)` → `notany:s`, `deadkey(id)` →
 *   `deadkey:003b` (lowercase hex, 4-padded), `char(c)` → `char:<c>`,
 *   `context(n)` → `context:n`, `index(s,n)` → `index:s:n`,
 *   `baselayout(v)` → `baselayout:v`, `raw(t)` → `raw:<t>`.
 *   Rules with no guard elements have guardKey `""`.
 *   `platform('…')` guards and the structural `+` separator are already
 *   excluded by `shapeContext` and never contribute to the key.
 * - `outputShape` — the shape-output elements as tokens joined with `+`:
 *   `nul` / `context` (bare) / `beep` / `indexed` (typed `index()` or raw
 *   `context(N)`) / `char` / `deadkey` / `outs` / `raw`.
 *   Note the contract spelling `indexed` (not the IR kind `index`).
 * - `kind` — `classifyRuleKind(member)`. This is a deliberate refinement of
 *   the bare (guard, shape) key: it guarantees the family's `kind` field
 *   ("the common classifyRuleKind of members") is always truthful, even for
 *   pathological keyboards where one (guard, shape) pair spans two kinds.
 *
 * Family id: `guard:<guardId>>outputShape`, where `<guardId>` is the store
 * name for a single `any(s)` guard (e.g. `guard:diablock>context`), `none`
 * for unguarded rules, `notany:s` / `deadkey:003b` for those single guards,
 * and the full `+`-joined guardKey otherwise. If the kind refinement ever
 * splits one id into two families, the later family gets `:<kind>` appended.
 *
 * Singleton families are kept as families of one (e.g. the single
 * `any(composed) + [K_BKSP] > index(comp-dia,1)` rule is its own family) —
 * Matthew's directive names that rule a family of its own, and merging
 * singletons would hide the (guard, shape) structure FR-018 wants visible.
 *
 * Rules that don't fit any family: `classifyRuleKind` "opaque" rules (raw /
 * unrecognised shapes, group-transition `match > use(g)` / `nomatch >
 * use(g)` rules) go into ONE shared "Other rules" family (`other:opaque`,
 * kind "opaque", outputShape "mixed") rather than per-rule singletons, so
 * the demo trace (FR-018) always has a stable group name to show. The
 * family explanation says plainly that these shapes aren't recognised yet.
 *
 * `memberIds` are the members' `IRRule.nodeId` values in input order
 * (the codec mints deterministic `rule#N` ids per parse pass). Families are
 * returned in first-appearance order.
 *
 * READ-ONLY: pure function, no mutation, no IR writes.
 */
import type {
  ContextElement,
  IRRule,
  OutputElement,
} from "@keyboard-studio/contracts";
import { isPlusSeparator } from "@keyboard-studio/contracts";
import {
  classifyRuleKind,
  isBareContextOutput,
  isIndexedContextOutput,
  isNulOutput,
  shapeContext,
  shapeOutput,
  type RuleKind,
} from "./classify.js";
import { emitRule } from "../codec/emit.js";

/** A family of related rules sharing a guard store/set and output shape. */
export interface RuleFamily {
  /** Stable key, e.g. "guard:diablock>context". */
  id: string;
  /** Author-language name, e.g. "Diacritic blocking". */
  name: string;
  /** Guard store name when the family is guarded by a single store, e.g. "diablock". */
  guardStore?: string;
  /** Output shape token, e.g. "context" | "nul" | "beep" | "indexed" | "char" | "mixed". */
  outputShape: string;
  /** The common classifyRuleKind of the members. */
  kind: RuleKind;
  /**
   * Member rule identifiers: the members' `IRRule.nodeId` values, in the
   * order the rules were passed in. (nodeId, not IR index: indexes shift
   * when rules are added/removed; nodeIds are stable per parse.)
   */
  memberIds: string[];
  /** Number of member rules. */
  count: number;
  /** Group-level plain-language explanation, generalized from the explain.ts catalogue. */
  explanation: string;
  /** First ~3 member KMN texts (canonical emit). */
  sampleRuleTexts: string[];
  /** Pattern summary, e.g. "any(diablock) + key > context". */
  patternSummary: string;
}

// ---------------------------------------------------------------------------
// Guard / output-shape tokenisation
// ---------------------------------------------------------------------------

function hexId(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/** Guard token for one pre-key context element. */
function guardToken(el: ContextElement): string {
  switch (el.kind) {
    case "any":
      return `any:${el.storeRef}`;
    case "notany":
      return `notany:${el.storeRef}`;
    case "deadkey":
      return `deadkey:${hexId(el.id)}`;
    case "char":
      return `char:${el.value}`;
    case "context":
      return `context:${el.offset}`;
    case "index":
      return `index:${el.storeRef}:${el.offset}`;
    case "baselayout":
      return `baselayout:${el.value}`;
    case "vkey":
      return `vkey:${el.name}`;
    case "raw":
      return `raw:${el.text.trim()}`;
  }
}

/** Author-language display of one guard element (pattern summaries). */
function displayGuard(el: ContextElement): string {
  switch (el.kind) {
    case "any":
      return `any(${el.storeRef})`;
    case "notany":
      return `notany(${el.storeRef})`;
    case "deadkey":
      return `dk(${hexId(el.id)})`;
    case "char":
      return JSON.stringify(el.value);
    case "context":
      return `context(${el.offset})`;
    case "index":
      return `index(${el.storeRef},${el.offset})`;
    case "baselayout":
      return `baselayout('${el.value}')`;
    case "vkey":
      return `[${el.name}]`;
    case "raw":
      return el.text.trim();
  }
}

/** Author-language description of the guard set ("a character from the … store"). */
function describeGuards(guards: ContextElement[]): string {
  return joinList(
    guards.map((el) => {
      switch (el.kind) {
        case "any":
          return `a character from the “${el.storeRef}” store`;
        case "notany":
          return `any character not in the “${el.storeRef}” store`;
        case "deadkey":
          return `deadkey ${hexId(el.id)}`;
        case "char":
          return JSON.stringify(el.value);
        case "context":
          return `context item ${el.offset}`;
        case "index":
          return `the ${ordinal(el.offset)} character of the “${el.storeRef}” store`;
        case "baselayout":
          return `the “${el.value}” base layout`;
        case "vkey":
          return describeKey(el.name, el.modifiers);
        case "raw":
          return el.text.trim();
      }
    }),
  );
}

/** Output-shape token for one output element (contract spelling: "indexed"). */
function outputToken(el: OutputElement): string {
  switch (el.kind) {
    case "char":
      return "char";
    case "deadkey":
      return "deadkey";
    case "beep":
      return "beep";
    case "nul":
      // 076 FR-004 typed suppression.
      return "nul";
    case "context":
      // 076 FR-004 typed context reference — same token taxonomy as the
      // legacy raw encodings below.
      return el.offset === 0 ? "context" : "indexed";
    case "index":
      return "indexed";
    case "outs":
      return "outs";
    case "useGroup":
      return "useGroup";
    case "raw":
      if (isNulOutput(el)) return "nul";
      if (isBareContextOutput(el)) return "context";
      if (isIndexedContextOutput(el)) return "indexed";
      return "raw";
  }
}

/**
 * Split shape context into the guard set (everything before the struck key)
 * and the struck key itself (the trailing vkey, if present).
 */
function splitGuards(ctx: ContextElement[]): {
  guards: ContextElement[];
  key?: Extract<ContextElement, { kind: "vkey" }>;
} {
  const last = ctx[ctx.length - 1];
  if (last !== undefined && last.kind === "vkey") {
    return { guards: ctx.slice(0, -1), key: last };
  }
  return { guards: ctx };
}

// ---------------------------------------------------------------------------
// Small author-language helpers (mirror explain.ts phrasing)
// ---------------------------------------------------------------------------

const KEY_LABELS: Record<string, string> = {
  K_SPACE: "Space",
  K_BKSP: "Backspace",
  K_TAB: "Tab",
  K_ENTER: "Enter",
  K_ESC: "Esc",
  K_BKQUOTE: "Backquote",
  K_HYPHEN: "Hyphen",
  K_EQUAL: "Equals",
  K_LBRKT: "Left bracket",
  K_RBRKT: "Right bracket",
  K_BKSLASH: "Backslash",
  K_SCOLON: "Semicolon",
  K_QUOTE: "Quote",
  K_COMMA: "Comma",
  K_PERIOD: "Period",
  K_SLASH: "Slash",
};

const MODIFIER_LABELS: Record<string, string> = {
  SHIFT: "Shift",
  LSHIFT: "Shift",
  RSHIFT: "Shift",
  LCTRL: "Ctrl",
  RCTRL: "Ctrl",
  LALT: "Alt",
  RALT: "Right Alt",
  LWIN: "Win",
  RWIN: "Win",
  NCAPS: "CapsLock off",
};

function keyLabel(name: string): string {
  const known = KEY_LABELS[name];
  if (known !== undefined) return known;
  const m = /^K_([A-Z0-9])$/.exec(name);
  if (m?.[1] !== undefined) return m[1];
  const t = /^T_(.+)$/.exec(name);
  if (t?.[1] !== undefined) return `touch key ${t[1]}`;
  return name;
}

function describeKey(name: string, modifiers: string[]): string {
  const mods = modifiers.map((mod) => MODIFIER_LABELS[mod.toUpperCase()] ?? mod);
  const key = keyLabel(name);
  return mods.length > 0 ? `${mods.join("+")}+${key}` : key;
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "st"
      : n % 10 === 2 && n % 100 !== 12
        ? "nd"
        : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Family naming
// ---------------------------------------------------------------------------

/**
 * Curated author-language family names, keyed by family id. These come from
 * the approved rules-step mockup (~/workspace/mockups-082/rules-mockup.html);
 * single-guard and unguarded families fall back to `genericFamilyName`, and
 * multi-guard families fall back to their pattern summary.
 */
const FAMILY_NAME_CATALOGUE: Record<string, string> = {
  "guard:diablock>context": "Diacritic blocking",
  "guard:composed>indexed": "Composed-character unwrap",
  "guard:none>beep": "Dead combinations",
};

/** Action word for an output shape, used by the generic name. */
function actionWord(outputShape: string): string {
  switch (outputShape) {
    case "nul":
      return "key suppression";
    case "context":
      return "blocking";
    case "beep":
      return "dead combinations";
    case "indexed":
      return "substitution";
    case "char":
      return "output";
    case "deadkey":
      return "deadkey output";
    case "outs":
      return "store expansion";
    default:
      return outputShape;
  }
}

/**
 * Generic author-language name when the family isn't in the catalogue:
 * `“<store>” <action>` for single-store guards, a capitalized action for
 * unguarded families. Multi-guard families are named by the caller with
 * their pattern summary (always available, always honest).
 */
function genericFamilyName(
  guardStore: string | undefined,
  outputShape: string,
  kind: RuleKind,
): string {
  if (guardStore !== undefined) return `“${guardStore}” ${actionWord(outputShape)}`;
  if (kind === "plain-output") return "Key output";
  return capitalize(actionWord(outputShape));
}

// ---------------------------------------------------------------------------
// Family explanations (generalized from the explain.ts catalogue)
// ---------------------------------------------------------------------------

/**
 * Describe the struck key when every member shares the same one, else
 * "the key". Keeps explanations honest: never names a key that varies.
 */
function commonKeyDescription(
  members: Array<{ key: Extract<ContextElement, { kind: "vkey" }> | undefined }>,
): string {
  const first = members[0]?.key;
  if (first === undefined) return "the key";
  const same = members.every(
    (m) =>
      m.key !== undefined &&
      m.key.name === first.name &&
      m.key.modifiers.join("+") === first.modifiers.join("+"),
  );
  return same ? describeKey(first.name, first.modifiers) : "the key";
}

/** First `index()` output store referenced by the members, if any. */
function firstIndexStore(members: IRRule[]): string | undefined {
  for (const rule of members) {
    for (const el of shapeOutput(rule)) {
      if (el.kind === "index") return el.storeRef;
    }
  }
  return undefined;
}

function familyCoreExplanation(
  kind: RuleKind,
  outputShape: string,
  guardDesc: string,
  members: IRRule[],
  split: Array<{ key: Extract<ContextElement, { kind: "vkey" }> | undefined }>,
): string {
  const when = guardDesc === "" ? "" : ` when ${guardDesc} precedes it`;
  switch (kind) {
    case "blocking": {
      if (outputShape === "context") {
        return `Swallows the key${when}, keeping the existing text — the key produces nothing.`;
      }
      if (outputShape === "beep") {
        return guardDesc === ""
          ? "The key beeps and produces nothing."
          : `When ${guardDesc} precedes the key, it beeps and produces nothing.`;
      }
      if (outputShape === "nul") {
        return `Swallows the key${when} — it produces nothing.`;
      }
      return `Blocks the key${when} — the output is suppression-only.`;
    }
    case "context": {
      if (outputShape === "indexed") {
        const store = firstIndexStore(members);
        const keyDesc = commonKeyDescription(split);
        const what = store === undefined
          ? "the corresponding store character"
          : `the corresponding character from the “${store}” store`;
        return guardDesc === ""
          ? `When ${keyDesc} is struck, the rule emits ${what}.`
          : `When ${guardDesc} precedes ${keyDesc}, the rule emits ${what}.`;
      }
      if (outputShape === "char") {
        return guardDesc === ""
          ? "The key types its character."
          : `When ${guardDesc} precedes the key, the key types its character.`;
      }
      return guardDesc === ""
        ? "The key produces its output."
        : `When ${guardDesc} precedes the key, the key produces its output.`;
    }
    case "plain-output":
      return "Each key produces its assigned output — a character or a deadkey.";
    case "reorder":
      return "Reorders the matched context, emitting an earlier context item in its place.";
    case "opaque":
      return "These rules have shapes the assist layer doesn't recognise yet — they are shown as written.";
  }
}

/** True when every member's shape-output is deeply identical. */
function outputsIdentical(members: IRRule[]): boolean {
  const first = JSON.stringify(shapeOutput(members[0]!));
  return members.every((m) => JSON.stringify(shapeOutput(m)) === first);
}

// ---------------------------------------------------------------------------
// Sample rule texts
// ---------------------------------------------------------------------------

/**
 * Canonical KMN text for one rule. `emitRule` needs the group's
 * `usingKeys` flag, which a flat `IRRule[]` doesn't carry; heuristic: a
 * rule already carrying the structural `+` separator, or any vkey in its
 * context, is rendered as a keys-group rule (the `+` is only prepended when
 * missing, so this never double-emits). Keyless deadkey-group-style rules
 * render without the `+`, matching their source form.
 */
function sampleText(rule: IRRule): string {
  const hasInlinePlus = rule.context.some(isPlusSeparator);
  const hasVkey = rule.context.some((el) => el.kind === "vkey");
  return emitRule(rule, hasInlinePlus || hasVkey);
}

// ---------------------------------------------------------------------------
// groupRules
// ---------------------------------------------------------------------------

interface MemberSplit {
  rule: IRRule;
  guards: ContextElement[];
  key: Extract<ContextElement, { kind: "vkey" }> | undefined;
  guardTokens: string[];
  guardKey: string;
  outputShape: string;
  kind: RuleKind;
}

function splitRule(rule: IRRule): MemberSplit {
  const ctx = shapeContext(rule);
  const { guards, key } = splitGuards(ctx);
  const guardTokens = guards.map(guardToken);
  const outputShape = shapeOutput(rule).map(outputToken).join("+") || "empty";
  return {
    rule,
    guards,
    key,
    guardTokens,
    guardKey: guardTokens.join("+"),
    outputShape,
    kind: classifyRuleKind(rule),
  };
}

/** The `<guardId>` segment of the family id. */
function guardIdFor(guardTokens: string[]): string {
  if (guardTokens.length === 0) return "none";
  if (guardTokens.length === 1) {
    const token = guardTokens[0]!;
    // Single `any(s)` guard → bare store name (contract example:
    // "guard:diablock>context"). notany/deadkey keep their qualifier so
    // they can't collide with an any() guard on the same store.
    if (token.startsWith("any:")) return token.slice(4);
    return token;
  }
  return guardTokens.join("+");
}

/**
 * Group rules into families sharing a guard store/set and output shape.
 *
 * Pure function: no mutation, no IR writes. Families are returned in
 * first-appearance order; member ids are `IRRule.nodeId` in input order.
 */
export function groupRules(rules: IRRule[]): RuleFamily[] {
  const splits = rules.map(splitRule);

  // Bucket opaque rules into the single "Other rules" family; bucket the
  // rest by (guardKey, outputShape, kind).
  const buckets = new Map<string, MemberSplit[]>();
  const opaque: MemberSplit[] = [];
  for (const s of splits) {
    if (s.kind === "opaque") {
      opaque.push(s);
      continue;
    }
    const key = JSON.stringify([s.guardKey, s.outputShape, s.kind]);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [s]);
    else bucket.push(s);
  }

  const families: RuleFamily[] = [];
  const usedIds = new Set<string>();

  const takeId = (base: string, kind: RuleKind): string => {
    let id = base;
    if (usedIds.has(id)) id = `${base}:${kind}`;
    let n = 2;
    while (usedIds.has(id)) id = `${base}:${kind}:${n++}`;
    usedIds.add(id);
    return id;
  };

  for (const bucket of buckets.values()) {
    const first = bucket[0]!;
    const members = bucket.map((s) => s.rule);
    const guardToken0 = first.guardTokens[0];
    const guardStore =
      first.guardTokens.length === 1 &&
      guardToken0 !== undefined &&
      (guardToken0.startsWith("any:") || guardToken0.startsWith("notany:"))
        ? guardToken0.slice(guardToken0.startsWith("any:") ? 4 : 7)
        : undefined;
    const id = takeId(
      `guard:${guardIdFor(first.guardTokens)}>${first.outputShape}`,
      first.kind,
    );
    const guardDesc = describeGuards(first.guards);
    const hasKey = bucket.some((s) => s.key !== undefined);
    const left = [...first.guards.map(displayGuard), ...(hasKey ? ["key"] : [])].join(" + ");
    const patternSummary = `${left === "" ? "(no context)" : left} > ${first.outputShape}`;
    const name =
      FAMILY_NAME_CATALOGUE[id] ??
      (first.guards.length > 1
        ? patternSummary
        : genericFamilyName(guardStore, first.outputShape, first.kind));
    const core = familyCoreExplanation(
      first.kind,
      first.outputShape,
      guardDesc,
      members,
      bucket,
    );
    const allKeyed = bucket.every((s) => s.key !== undefined);
    const vary =
      allKeyed && outputsIdentical(members)
        ? " They differ only in the struck key."
        : "";
    families.push({
      id,
      name,
      ...(guardStore === undefined ? {} : { guardStore }),
      outputShape: first.outputShape,
      kind: first.kind,
      memberIds: members.map((r) => r.nodeId),
      count: members.length,
      explanation:
        members.length > 1
          ? `${core} All ${members.length} rules in this family follow the same pattern.${vary}`
          : core,
      sampleRuleTexts: members.slice(0, 3).map(sampleText),
      patternSummary,
    });
  }

  if (opaque.length > 0) {
    const members = opaque.map((s) => s.rule);
    families.push({
      id: takeId("other:opaque", "opaque"),
      name: "Other rules",
      outputShape: "mixed",
      kind: "opaque",
      memberIds: members.map((r) => r.nodeId),
      count: members.length,
      explanation:
        members.length === 1
          ? "This rule has a shape the assist layer doesn't recognise yet — it is shown as written."
          : `These ${members.length} rules have shapes the assist layer doesn't recognise yet — they are shown as written.`,
      sampleRuleTexts: members.slice(0, 3).map(sampleText),
      patternSummary: "various (unrecognised shapes)",
    });
  }

  return families;
}

/**
 * Find the family containing a rule (by nodeId). Used by the demo trace
 * to name the family alongside the fired rule.
 */
export function familyOfRule(
  families: readonly RuleFamily[],
  nodeId: string,
): RuleFamily | undefined {
  return families.find((f) => f.memberIds.includes(nodeId));
}
