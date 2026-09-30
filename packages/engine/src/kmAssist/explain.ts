/**
 * kmAssist rule explainer — spec 082 Track C read-only v1.
 *
 * Produces one plain-language sentence per rule from its IR SHAPE (the
 * spec-076 FR-012 behaviour recogniser is not built yet, so no recognised
 * behaviour names are available). READ-ONLY: pure functions.
 *
 * Honesty rule: every sentence describes only what the shape shows. When a
 * shape is not in the catalogue, the explainer says so ("doesn't recognise
 * yet") rather than inventing semantics.
 */
import type {
  ContextElement,
  IRRule,
  OutputElement,
  RawKmnFragment,
} from "@keyboard-studio/contracts";
import {
  classifyRuleKind,
  isBareContextOutput,
  isIndexedContextOutput,
  isNulOutput,
  isSuppressionOnlyOutput,
  shapeContext,
  shapeOutput,
} from "./classify.js";
import { getCategory, getName } from "./unicodeAdapter.js";

/** Short modifier labels for author-language key descriptions. */
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

/** Friendly key-name labels; falls back to the raw virtual-key name. */
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

function keyLabel(name: string): string {
  const known = KEY_LABELS[name];
  if (known !== undefined) return known;
  const m = /^K_([A-Z0-9])$/.exec(name);
  if (m?.[1] !== undefined) return m[1];
  const t = /^T_(.+)$/.exec(name);
  if (t?.[1] !== undefined) return `touch key ${t[1]}`;
  return name;
}

function modifierLabel(mod: string): string {
  return MODIFIER_LABELS[mod.toUpperCase()] ?? mod;
}

/** "Shift+0", "Right Alt+C", "A" — compact key description. Exported for suggestGuards. */
export function describeKey(name: string, modifiers: string[]): string {
  const mods = modifiers.map(modifierLabel);
  const key = keyLabel(name);
  return mods.length > 0 ? `${mods.join("+")}+${key}` : key;
}

/** "Right Alt + C" — spaced variant used in FR-019 composed sentences (the reference output style). */
function describeKeySpaced(name: string, modifiers: string[]): string {
  const mods = modifiers.map(modifierLabel);
  const key = keyLabel(name);
  return mods.length > 0 ? `${mods.join(" + ")} + ${key}` : key;
}

/** Author-language description of one context element. */
function describeContextElement(el: ContextElement): string {
  switch (el.kind) {
    case "char":
      return JSON.stringify(el.value);
    case "vkey":
      return describeKey(el.name, el.modifiers);
    case "deadkey":
      return `deadkey ${el.id.toString(16).padStart(4, "0")}`;
    case "any":
      return `a character from the "${el.storeRef}" store`;
    case "notany":
      return `any character not in the "${el.storeRef}" store`;
    case "context":
      return `context item ${el.offset}`;
    case "index":
      return `the ${ordinal(el.offset)} character of the "${el.storeRef}" store`;
    case "baselayout":
      return `the "${el.value}" base layout`;
    case "raw":
      return el.text;
  }
}

/** Author-language description of one output element. */
function describeOutputElement(el: OutputElement): string {
  switch (el.kind) {
    case "char":
      return JSON.stringify(el.value);
    case "deadkey":
      return `deadkey ${el.id.toString(16).padStart(4, "0")}`;
    case "beep":
      return "a beep";
    case "nul":
      // 076 FR-004 typed suppression — same author wording as the legacy
      // raw-`nul` encoding handled below.
      return "nothing";
    case "context":
      // 076 FR-004 typed context reference: bare `context` (offset 0)
      // re-emits the whole matched context; `context(N)` the Nth character.
      return el.offset === 0
        ? "the existing text, unchanged"
        : `the ${ordinal(el.offset)} character of the matched context`;
    case "index":
      // In output position, index(store, N) emits the store character at the
      // position matched by the Nth context reference — the "corresponding"
      // character of the parallel store.
      return `the corresponding character from the "${el.storeRef}" store`;
    case "outs":
      return `every character in the "${el.storeRef}" store`;
    case "useGroup":
      return `a jump to the "${el.groupName}" group`;
    case "raw":
      if (isNulOutput(el)) return "nothing";
      if (isBareContextOutput(el)) return "the existing text, unchanged";
      return el.text;
  }
}

/** "1st", "2nd", "11th" — exported for group.ts. */
export function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st"
    : n % 10 === 2 && n % 100 !== 12 ? "nd"
    : n % 10 === 3 && n % 100 !== 13 ? "rd"
    : "th";
  return `${n}${suffix}`;
}

/** "a, b and c" — exported for group.ts. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Split shape context into the pre-context (everything before the struck
 * key) and the struck key itself (the trailing vkey, if present).
 */
function splitKeyContext(ctx: ContextElement[]): {
  pre: ContextElement[];
  key?: Extract<ContextElement, { kind: "vkey" }>;
} {
  const last = ctx[ctx.length - 1];
  if (last !== undefined && last.kind === "vkey") {
    return { pre: ctx.slice(0, -1), key: last };
  }
  return { pre: ctx };
}

function describeBlocking(rule: IRRule): string {
  const { pre, key } = splitKeyContext(shapeContext(rule));
  const out = shapeOutput(rule);
  const hasBeep = out.some((el) => el.kind === "beep");
  const keepsContext = out.some(isBareContextOutput);
  const verb = `${hasBeep ? "beeps and " : ""}produces nothing`;
  const keyDesc = key !== undefined
    ? describeKey(key.name, key.modifiers)
    : "the key";
  if (pre.length === 0) {
    const kept = keepsContext ? " (the existing text is kept as-is)" : "";
    return `${keyDesc} ${verb}${kept}.`;
  }
  const when = joinList(pre.map(describeContextElement));
  const kept = keepsContext ? ", keeping the existing text" : "";
  return `Swallows the key when ${when} precedes it${kept} — ${keyDesc} ${verb}.`;
}

function describePlainOutput(rule: IRRule): string {
  const ctx = shapeContext(rule);
  const out = shapeOutput(rule);
  const keyEl = ctx[0];
  const keyDesc = keyEl !== undefined && keyEl.kind === "vkey"
    ? describeKey(keyEl.name, keyEl.modifiers)
    : "the key";
  const chars = out.filter((el) => el.kind === "char").map((el) => el.value).join("");
  const deadkey = out.find((el) => el.kind === "deadkey");
  if (deadkey !== undefined && deadkey.kind === "deadkey") {
    return `${keyDesc} sets deadkey ${deadkey.id.toString(16).padStart(4, "0")} instead of typing a character.`;
  }
  if (chars.length > 0) {
    const rest = out.filter((el) => el.kind !== "char").map(describeOutputElement);
    const extra = rest.length > 0 ? `, plus ${joinList(rest)}` : "";
    return `${keyDesc} types ${JSON.stringify(chars)}${extra}.`;
  }
  return `${keyDesc} produces ${joinList(out.map(describeOutputElement))}.`;
}

function describeContextRule(rule: IRRule): string {
  const ctx = shapeContext(rule).map(describeContextElement);
  const out = shapeOutput(rule).map(describeOutputElement);
  return `After ${joinList(ctx)}, outputs ${joinList(out)}.`;
}

function describeReorder(rule: IRRule): string {
  const items = shapeOutput(rule)
    .filter(isIndexedContextOutput)
    .map((el) => {
      const text = el.kind === "raw" ? el.text : "";
      const m = /^context\s*\(\s*(\d+)\s*\)$/i.exec(text);
      return `context item ${m?.[1] ?? "?"}`;
    });
  const rest = shapeOutput(rule)
    .filter((el) => !isIndexedContextOutput(el))
    .map(describeOutputElement);
  const tail = rest.length > 0 ? `, plus ${joinList(rest)}` : "";
  return `Reorders the matched context, emitting ${joinList(items)}${tail}.`;
}

function describeOpaqueRule(rule: IRRule): string {
  if (rule.matchKind !== undefined) {
    const target = shapeOutput(rule).find(
      (el) =>
        el.kind === "useGroup" ||
        (el.kind === "raw" && /^use\s*\(/i.test(el.text)),
    );
    let name = "another";
    if (target !== undefined) {
      if (target.kind === "useGroup") {
        name = `"${target.groupName}"`;
      } else if (target.kind === "raw") {
        const m = /^use\s*\(\s*([^)]+?)\s*\)$/i.exec(target.text.trim());
        if (m?.[1] !== undefined) name = `"${m[1]}"`;
      }
    }
    const when = rule.matchKind === "match"
      ? "When a rule in this group has matched"
      : "When nothing else in this group matched";
    return `${when}, processing moves to the ${name} group — a group transition, not a keystroke rule.`;
  }
  return "This rule has a shape the assist layer doesn't recognise yet — it is shown as written.";
}

// ---------------------------------------------------------------------------
// FR-019: deterministic, context-aware rule explanations
// ---------------------------------------------------------------------------

/**
 * Context the studio threads in for FR-019 enriched explanations: the full
 * rule list (to find the counterpart emitting rule for the same key) and
 * the guard stores' characters (to summarise a store from the characters
 * themselves, never from its name).
 */
export interface ExplainContext {
  /** All rules of the keyboard. */
  rules: IRRule[];
  /** Store name → characters. */
  stores: Map<string, string[]>;
}

const EMPTY_EXPLAIN_CONTEXT: ExplainContext = { rules: [], stores: new Map() };

/** Key identity including modifiers, for counterpart lookup. */
function keySignature(name: string, modifiers: string[]): string {
  return `${name}|${[...modifiers].sort().join(",")}`;
}

/** The single character a bare `+ [key] > X` rule emits, when it emits exactly one. */
function singleCharOutput(rule: IRRule): { char: string; cp: number } | undefined {
  const out = shapeOutput(rule);
  if (out.length !== 1) return undefined;
  const el = out[0];
  if (el === undefined || el.kind !== "char" || [...el.value].length !== 1) return undefined;
  const cp = el.value.codePointAt(0);
  return cp === undefined ? undefined : { char: el.value, cp };
}

interface GuardIdiom {
  store: string;
  keyName: string;
  modifiers: string[];
}

/**
 * The guard-family idiom `any(store) + [key] > context|nul`: exactly one
 * `any()` guard ahead of the struck key, suppression-only output.
 */
function asGuardIdiom(rule: IRRule): GuardIdiom | undefined {
  const ctx = shapeContext(rule);
  if (ctx.length !== 2) return undefined;
  const guardEl = ctx[0];
  const keyEl = ctx[1];
  if (guardEl === undefined || guardEl.kind !== "any") return undefined;
  if (keyEl === undefined || keyEl.kind !== "vkey") return undefined;
  if (!isSuppressionOnlyOutput(shapeOutput(rule))) return undefined;
  return { store: guardEl.storeRef, keyName: keyEl.name, modifiers: keyEl.modifiers };
}

/**
 * The bare `+ [same key, same modifiers] > <single char>` rule emitting
 * what the guarded key would otherwise produce. Scans ctx.rules; skips the
 * rule being explained.
 */
function findEmittingCounterpart(
  rule: IRRule,
  guard: GuardIdiom,
  ctx: ExplainContext,
): { char: string; cp: number } | undefined {
  const sig = keySignature(guard.keyName, guard.modifiers);
  for (const other of ctx.rules) {
    if (other === rule) continue;
    const c = shapeContext(other);
    if (c.length !== 1) continue;
    const first = c[0];
    if (first === undefined || first.kind !== "vkey") continue;
    if (keySignature(first.name, first.modifiers) !== sig) continue;
    const single = singleCharOutput(other);
    if (single === undefined) continue;
    return single;
  }
  return undefined;
}

function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * "COMBINING CEDILLA" → "combining cedilla": the full name lowercased, used
 * when naming what a key TYPES ("types a combining cedilla"). The
 * combining-prefix strip (shortUnicodeName below) is reserved for rule
 * nicknames ("the plain cedilla rule") and per-mark reasoning strings.
 */
function fullUnicodeName(name: string): string {
  return name.toLowerCase();
}

/**
 * "COMBINING CEDILLA" → "cedilla"; "COMBINING ACUTE ACCENT" → "acute
 * accent". The combining-prefix strip keeps mark names short for rule
 * nicknames ("the plain cedilla rule") and per-mark reasoning labels.
 */
function shortUnicodeName(name: string): string {
  return name.replace(/^combining\s+/i, "").toLowerCase();
}

type CharBucket = "space" | "digit" | "punctuation" | "letter" | "mark" | "symbol" | "other";
const BUCKET_ORDER: CharBucket[] = ["space", "digit", "punctuation", "letter", "mark", "symbol", "other"];
const CORE_BUCKETS: CharBucket[] = ["space", "digit", "punctuation"];

function bucketOfChar(ch: string): CharBucket | undefined {
  if ([...ch].length !== 1) return undefined;
  const cp = ch.codePointAt(0);
  if (cp === undefined) return undefined;
  const cat = getCategory(cp);
  if (cat === undefined) return undefined;
  if (cat === "Zs") return "space";
  if (cat === "Nd") return "digit";
  if (cat.startsWith("P")) return "punctuation";
  if (cat.startsWith("L")) return "letter";
  if (cat.startsWith("M")) return "mark";
  if (cat.startsWith("S")) return "symbol";
  return "other";
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * Summarise a guard store's characters as the dominant character kinds.
 * When space/digit/punctuation are the majority, name just those (the
 * diablock idiom → "a space, digit or punctuation") and attach the
 * judgement "which can never take a diacritic" — a property of the NAMED
 * kinds, which is what the summary claims. Otherwise name every kind
 * present, with no judgement. Returns undefined when the store is empty or
 * no character has known category data; the caller then falls back to the
 * opaque "a character from the store" phrasing rather than guessing.
 */
function summarizeGuardStore(chars: string[]): { summary: string; judgement: string } | undefined {
  const counts = new Map<CharBucket, number>();
  let total = 0;
  for (const ch of chars) {
    const b = bucketOfChar(ch);
    if (b === undefined) continue;
    counts.set(b, (counts.get(b) ?? 0) + 1);
    total++;
  }
  if (total === 0) return undefined;
  const coreCount = CORE_BUCKETS.reduce((n, b) => n + (counts.get(b) ?? 0), 0);
  if (coreCount > total / 2) {
    const named = CORE_BUCKETS.filter((b) => (counts.get(b) ?? 0) > 0);
    return { summary: `a ${joinOr(named)}`, judgement: ", which can never take a diacritic" };
  }
  const present = BUCKET_ORDER.filter((b) => (counts.get(b) ?? 0) > 0);
  return { summary: `a ${joinOr(present)}`, judgement: "" };
}

/**
 * FR-019 enriched explanation for the guard-family idiom
 * `any(store) + [key] > context|nul`. Composes from (a) the parsed shape,
 * (b) the guard store summarised from its own characters via ctx.stores,
 * (c) the counterpart emitting rule for the same key found by scanning
 * ctx.rules, and (d) the Unicode name and General_Category of the emitted
 * code point. Returns undefined when the rule is not the guard idiom —
 * the caller keeps today's shape sentence.
 *
 * Tone is author-to-author ("so stray marks can't corrupt your text"),
 * never a syntax gloss. The priority claim is the Keyman rule: the longer
 * (guarded) context wins over the bare key rule by longest match,
 * regardless of rule order.
 */
function describeGuardIdiom(rule: IRRule, ctx: ExplainContext): string | undefined {
  const guard = asGuardIdiom(rule);
  if (guard === undefined) return undefined;
  const keyDesc = describeKeySpaced(guard.keyName, guard.modifiers);
  const counterpart = findEmittingCounterpart(rule, guard, ctx);

  // (c) + (d): what the key would otherwise emit.
  let lead: string | undefined;
  let markName: string | undefined;
  let emitsMark = false;
  if (counterpart !== undefined) {
    const name = getName(counterpart.cp);
    const category = getCategory(counterpart.cp);
    emitsMark = category !== undefined && category.startsWith("M");
    if (name !== undefined) {
      const full = fullUnicodeName(name);
      markName = shortUnicodeName(name);
      lead = `${keyDesc} types ${articleFor(full)} ${full}${emitsMark ? " — a mark that needs a base letter" : ""}.`;
    } else {
      // Name unknown (FR-021 not landed / uncovered code point): say only
      // what the shape shows.
      lead = `${keyDesc} types a character on its own.`;
    }
  }

  // (b): the guard store, summarised from its characters.
  const chars = ctx.stores.get(guard.store) ?? [];
  const summary = summarizeGuardStore(chars);
  const after = summary !== undefined
    ? `After ${summary.summary}${summary.judgement}`
    : `After a character from the "${guard.store}" store`;
  const why = emitsMark
    ? "so stray marks can't corrupt your text"
    : "so nothing unexpected reaches your text";
  const swallow = lead !== undefined
    ? `${after}, this rule swallows the keystroke ${why}.`
    : `${after}, this rule swallows the ${keyDesc} keystroke ${why}.`;

  // Priority: longest match wins in Keyman, regardless of rule order.
  let priority = "";
  if (counterpart !== undefined) {
    priority = markName !== undefined
      ? ` It wins over the plain ${markName} rule by being more specific (longest match).`
      : ` It wins over the key's plain rule by being more specific (longest match).`;
  }

  return `${lead !== undefined ? `${lead} ` : ""}${swallow}${priority}`;
}

/**
 * FR-019: a bare mark-emitting key, enriched with the Unicode name and the
 * mark judgement when the category data knows them. Non-marks and unknown
 * code points keep today's shape sentence.
 */
function describeMarkOutput(rule: IRRule): string | undefined {
  const ctx = shapeContext(rule);
  if (ctx.length !== 1) return undefined;
  const first = ctx[0];
  if (first === undefined || first.kind !== "vkey") return undefined;
  const single = singleCharOutput(rule);
  if (single === undefined) return undefined;
  const category = getCategory(single.cp);
  if (category === undefined || !category.startsWith("M")) return undefined;
  const name = getName(single.cp);
  if (name === undefined) return undefined;
  const full = fullUnicodeName(name);
  return `${describeKeySpaced(first.name, first.modifiers)} types ${articleFor(full)} ${full} — a mark that needs a base letter.`;
}

/**
 * One plain-language sentence describing what a typed rule does, derived
 * from its IR shape. Says "doesn't recognise yet" for unknown shapes —
 * never invents semantics.
 *
 * Single-arg `explainRule(rule)` keeps the original behaviour: one sentence
 * from the IR shape (the FR-023 read-only contract). With an
 * {@link ExplainContext}, the guard-family idiom and mark-emitting keys get
 * the FR-019 enriched composition (guard store summarised from its own
 * characters, the counterpart emitting rule for the same key, the Unicode
 * name and General_Category of the emitted code point, and the longest-match
 * priority claim); every other shape keeps its shape sentence.
 *
 * Back-compat choice (documented): the context parameter is optional rather
 * than updating every call site, so existing single-arg callers and the
 * explain.test.ts expectations are untouched.
 *
 * Pure and deterministic — no LLM.
 */
export function explainRule(rule: IRRule, ctx: ExplainContext = EMPTY_EXPLAIN_CONTEXT): string {
  const kind = classifyRuleKind(rule);
  if (ctx.rules.length > 0) {
    if (kind === "blocking") {
      const rich = describeGuardIdiom(rule, ctx);
      if (rich !== undefined) return rich;
    } else if (kind === "plain-output") {
      const mark = describeMarkOutput(rule);
      if (mark !== undefined) return mark;
    }
  }
  switch (kind) {
    case "blocking":
      return describeBlocking(rule);
    case "plain-output":
      return describePlainOutput(rule);
    case "context":
      return describeContextRule(rule);
    case "reorder":
      return describeReorder(rule);
    case "opaque":
      return describeOpaqueRule(rule);
  }
}

// ---------------------------------------------------------------------------
// Opaque fragments
// ---------------------------------------------------------------------------

/** Author-language names for the codec's named opaque reasons. */
const OPAQUE_REASON_LANGUAGE: Record<string, string> = {
  "option-store-directive":
    "Saves, sets, or resets a keyboard option — advanced machinery the assist layer shows but doesn't edit.",
  "if-option-store":
    "Only applies when a keyboard option has a certain value.",
  "call-return":
    "Calls out to custom code.",
  "indexed-context":
    "Looks back more than one character into the context.",
  "outs-expansion":
    "Expands an entire store into the output.",
  "smp-literal":
    "Contains a rare Unicode character literal the typed model can't represent.",
  "named-deadkey":
    "Uses a named deadkey — kept as internal machinery, not editable here.",
  "unknown-pre-begin":
    "A file-level construct the assist layer doesn't model.",
  "descending-range":
    "A store with a backwards character range the editor can't expand safely.",
  "malformed-range":
    "A store with a malformed character range the editor can't expand safely.",
};

/**
 * Plain-language explanation of an opaque fragment. Names the reason in
 * author language, with a dedicated warning for the well-known
 * `nomatch > nul` idiom (spec 082 US-4).
 */
export function explainFragment(frag: RawKmnFragment): string {
  if (/nomatch\s*>\s*nul/i.test(frag.sourceText)) {
    return "This swallows every unmatched keystroke — including Backspace and Enter. " +
      "Several released keyboards use this idiom; prefer the “Closed keyboard” behaviour card, " +
      "which blocks keys without swallowing editing keys.";
  }
  const known = OPAQUE_REASON_LANGUAGE[frag.reason];
  if (known !== undefined) return known;
  return `Uses “${frag.reason}” — an advanced construct the assist layer shows as written.`;
}
