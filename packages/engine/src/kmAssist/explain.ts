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
  shapeContext,
  shapeOutput,
} from "./classify.js";

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

/** "Shift+0", "Right Alt+C", "A" — compact key description. */
function describeKey(name: string, modifiers: string[]): string {
  const mods = modifiers.map(modifierLabel);
  const key = keyLabel(name);
  return mods.length > 0 ? `${mods.join("+")}+${key}` : key;
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

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? "st"
    : n % 10 === 2 && n % 100 !== 12 ? "nd"
    : n % 10 === 3 && n % 100 !== 13 ? "rd"
    : "th";
  return `${n}${suffix}`;
}

function joinList(items: string[]): string {
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

/**
 * One plain-language sentence describing what a typed rule does, derived
 * from its IR shape. Says "doesn't recognise yet" for unknown shapes —
 * never invents semantics.
 */
export function explainRule(rule: IRRule): string {
  switch (classifyRuleKind(rule)) {
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
