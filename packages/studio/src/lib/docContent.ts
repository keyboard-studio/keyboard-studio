// docContent — the documentation's "how this keyboard works" sections
// (spec 095 US2), derived from the working-copy IR as built, including rules
// inherited from the starting keyboard that the author never touched.
//
// Pure and synchronous, so the docs preview stays a plain memoised derivation
// with no timer (decision D3). The output projection and useDocsPreview call
// it with the same input, so the preview and the package agree.
//
// Every value is an HTML fragment already escaped for the .htm/.php forms; the
// body form in doc-forms.json supplies each section's heading, and an empty
// value drops the section with its heading.
//
// The Unicode table is imported statically: this runs inside a synchronous
// render, and the table is already in the initial bundle through the engine
// (see survey/characterMap/unicodeTable.ts).

import {
  DOC_FORMS,
  DOC_MECHANISM_ORDER,
  buildProducedSet,
  type ContextElement,
  type DocMechanismId,
  type IRRule,
  type KeyboardIR,
  type TouchKeyIR,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { getCategory, getName } from "@keyboard-studio/contracts/unicode";
import { escapeDocHtml, parseTouchLayout, type GeneratedDocSlots } from "@keyboard-studio/engine";
import { charProducers, ruleModifier } from "./irToCarveNodes.ts";

export interface DocContentInput {
  /** The working-copy IR. */
  ir: KeyboardIR;
  /** `null`: no phone/tablet layout. */
  touchLayout: TouchLayoutIR | null;
  /** Track 2 welcome/help prose; `null` on Track 1. */
  inheritedProse: string | null;
}

export interface DocContent {
  /** Already escaped for the .htm/.php forms. `layoutPictures` stays empty: the welcome renderer builds it from the shipped image files. */
  slots: GeneratedDocSlots;
  /** True when the typing guide was emptied because the inherited docs already hold one. */
  typingGuideSuppressed: boolean;
}

/** The parsed touch layout, or null when there is none or it does not parse (the output path's chart step reports that case). */
export function parseTouchLayoutOrNull(json: string | null): TouchLayoutIR | null {
  if (json === null) return null;
  try {
    return parseTouchLayout(json);
  } catch {
    return null;
  }
}

/** Above this many rows the typing guide becomes a grouped summary. */
export const TYPING_GUIDE_SUMMARY_THRESHOLD = 200;

const DOTTED_CIRCLE = "◌";

type CharGroup = "letters" | "marks" | "punctuation" | "digits" | "other";
const GROUP_ORDER: readonly CharGroup[] = ["letters", "marks", "punctuation", "digits", "other"];
const GROUP_LABEL: Readonly<Record<CharGroup, string>> = {
  letters: "Letters",
  marks: "Marks",
  punctuation: "Punctuation and symbols",
  digits: "Digits",
  other: "Other",
};

/** Code-point order, not UTF-16 unit order, so astral characters sort where Unicode puts them. */
function compareCodePoints(a: string, b: string): number {
  const ac = [...a];
  const bc = [...b];
  for (let i = 0; i < Math.min(ac.length, bc.length); i++) {
    const d = ac[i]!.codePointAt(0)! - bc[i]!.codePointAt(0)!;
    if (d !== 0) return d;
  }
  return ac.length - bc.length;
}

function codePointLabel(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function groupOf(cp: number): CharGroup {
  const cat = getCategory(cp) ?? "";
  if (cat.startsWith("L")) return "letters";
  if (cat.startsWith("M")) return "marks";
  if (cat.startsWith("P") || cat.startsWith("S")) return "punctuation";
  if (cat.startsWith("N")) return "digits";
  return "other";
}

function isMark(cp: number): boolean {
  return (getCategory(cp) ?? "").startsWith("M");
}

/** The character as shown: a combining mark sits on a dotted circle, never bare (spec 056). */
function glyph(ch: string): string {
  const cp = ch.codePointAt(0)!;
  return escapeDocHtml(isMark(cp) ? `${DOTTED_CIRCLE}${ch}` : ch);
}

/** "U+014B LATIN SMALL LETTER ENG", or just the code point when the table has no name. */
function nameLabel(ch: string): string {
  const cp = ch.codePointAt(0)!;
  const name = getName(cp);
  return escapeDocHtml(name !== undefined ? `${codePointLabel(cp)} ${name}` : codePointLabel(cp));
}

// simplified: base = printable ASCII; when another base layout is declared, derive the set from it.
function isBaseCharacter(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return cp >= 0x20 && cp <= 0x7e;
}

function producedChars(ir: KeyboardIR): string[] {
  return [...buildProducedSet(ir)].sort(compareCodePoints);
}

interface GuideRow {
  ch: string;
  /** Escaped keystroke markup, or "" when no faithful path exists. */
  keys: string;
}

/** The fewest-step way to type `ch`. A producer with only a trigger floor counts as one step; ties go to the joined label in code-point order. */
function shortestKeys(ir: KeyboardIR, ch: string): string {
  let best: { steps: number; label: string; parts: string[] } | undefined;
  for (const producer of charProducers(ir, ch)) {
    const parts = producer.steps.length > 0 ? producer.steps : producer.triggerFloor !== undefined ? [producer.triggerFloor] : [];
    if (parts.length === 0) continue;
    const label = parts.join(" ");
    if (
      best === undefined ||
      parts.length < best.steps ||
      (parts.length === best.steps && compareCodePoints(label, best.label) < 0)
    ) {
      best = { steps: parts.length, label, parts };
    }
  }
  return best === undefined ? "" : best.parts.map((p) => `<kbd>${escapeDocHtml(p)}</kbd>`).join(" then ");
}

function guideRows(ir: KeyboardIR): GuideRow[] {
  return producedChars(ir)
    .filter((ch) => !isBaseCharacter(ch))
    .map((ch) => ({ ch, keys: shortestKeys(ir, ch) }));
}

function renderGuideTable(rows: readonly GuideRow[]): string {
  const body = rows
    .map((r) => `<tr><td>${glyph(r.ch)}</td><td>${nameLabel(r.ch)}</td><td>${r.keys !== "" ? r.keys : "See the layout pictures"}</td></tr>`)
    .join("");
  return `<table><thead><tr><th>Character</th><th>Name</th><th>Keys</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderGuideSummary(rows: readonly GuideRow[]): string {
  const counts = new Map<CharGroup, number>();
  for (const r of rows) {
    const g = groupOf(r.ch.codePointAt(0)!);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const items = GROUP_ORDER.filter((g) => (counts.get(g) ?? 0) > 0)
    .map((g) => `<li>${escapeDocHtml(GROUP_LABEL[g])}: ${counts.get(g)}</li>`)
    .join("");
  return `<p>This keyboard types ${rows.length} characters beyond the standard keyboard, too many to list here. The layout pictures show where each one is.</p><ul>${items}</ul>`;
}

// ---------------------------------------------------------------------------
// Mechanisms (research R7)
// ---------------------------------------------------------------------------

const isPlus = (el: ContextElement): boolean => el.kind === "raw" && el.text === "+";

function allRules(ir: KeyboardIR): IRRule[] {
  return ir.groups.flatMap((g) => g.rules);
}

/** A comparable key identity for a single-key context element, or undefined when the element is not one key. */
function keyIdentity(el: ContextElement | undefined): string | undefined {
  if (el === undefined) return undefined;
  if (el.kind === "vkey") return `v:${[...el.modifiers].sort().join("+")}:${el.name}`;
  if (el.kind === "char") return `c:${el.value}`;
  return undefined;
}

function charOutput(rule: IRRule): string | undefined {
  if (rule.output.length === 0 || !rule.output.every((o) => o.kind === "char")) return undefined;
  return rule.output.map((o) => (o.kind === "char" ? o.value : "")).join("");
}

/** A rule whose context is a produced character then a key, where that same key alone produces that character. */
function hasRepeatToCycle(rules: readonly IRRule[]): boolean {
  const directOutputs = new Map<string, Set<string>>();
  for (const rule of rules) {
    const ctx = rule.context.filter((el) => !isPlus(el));
    const out = charOutput(rule);
    const key = ctx.length === 1 ? keyIdentity(ctx[0]) : undefined;
    if (key === undefined || out === undefined) continue;
    const set = directOutputs.get(key) ?? new Set<string>();
    set.add(out);
    directOutputs.set(key, set);
  }
  return rules.some((rule) => {
    const ctx = rule.context.filter((el) => !isPlus(el));
    if (ctx.length !== 2 || ctx[0]?.kind !== "char") return false;
    const key = keyIdentity(ctx[1]);
    return key !== undefined && (directOutputs.get(key)?.has(ctx[0].value) ?? false);
  });
}

function detectMechanisms(ir: KeyboardIR, produced: readonly string[]): Set<DocMechanismId> {
  const rules = allRules(ir);
  const found = new Set<DocMechanismId>();
  if (rules.some((r) => r.context.some((el) => el.kind === "deadkey"))) found.add("deadkeys");
  if (rules.some((r) => ruleModifier(r) === "ralt")) found.add("rightAlt");
  if (hasRepeatToCycle(rules)) found.add("repeatToCycle");
  if (produced.some((ch) => {
    const cat = getCategory(ch.codePointAt(0)!);
    return cat === "Mn" || cat === "Mc";
  })) found.add("combiningOrder");
  return found;
}

function renderMechanisms(found: ReadonlySet<DocMechanismId>): string {
  return DOC_MECHANISM_ORDER.filter((id) => found.has(id))
    .map((id) => `<p>${escapeDocHtml(DOC_FORMS.mechanisms[id])}</p>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Touch notes
// ---------------------------------------------------------------------------

const FLICK_DIRECTION: Readonly<Record<string, string>> = {
  n: "up",
  s: "down",
  e: "right",
  w: "left",
  ne: "up and right",
  nw: "up and left",
  se: "down and right",
  sw: "down and left",
};

function keyLabel(key: TouchKeyIR): string {
  return key.text !== undefined && key.text !== "" ? key.text : key.id;
}

/** "ŋ (U+014B LATIN SMALL LETTER ENG)" for one character, the escaped text otherwise. */
function describeText(text: string): string {
  const chars = [...text];
  return chars.length === 1 ? `${glyph(text)} (${nameLabel(text)})` : escapeDocHtml(text);
}

function renderTouchNotes(layout: TouchLayoutIR | null): string {
  if (layout === null) return "";
  const longPress: string[] = [];
  const flicks: string[] = [];
  const seen = new Set<string>();
  const add = (list: string[], item: string) => {
    if (!seen.has(item)) {
      seen.add(item);
      list.push(item);
    }
  };
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const label = escapeDocHtml(keyLabel(key));
          for (const sub of key.sk ?? []) {
            const text = sub.text ?? "";
            if (text !== "") add(longPress, `<li>Hold <kbd>${label}</kbd> for ${describeText(text)}</li>`);
          }
          for (const dir of Object.keys(FLICK_DIRECTION)) {
            const sub = key.flick?.[dir as keyof NonNullable<TouchKeyIR["flick"]>];
            const text = sub?.text ?? "";
            if (text !== "") {
              add(flicks, `<li>Flick <kbd>${label}</kbd> ${FLICK_DIRECTION[dir]} for ${describeText(text)}</li>`);
            }
          }
        }
      }
    }
  }
  const parts: string[] = [];
  if (longPress.length > 0) parts.push(`<h3>Long-press keys</h3><ul>${longPress.join("")}</ul>`);
  if (flicks.length > 0) parts.push(`<h3>Flick keys</h3><ul>${flicks.join("")}</ul>`);
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Character inventory
// ---------------------------------------------------------------------------

function renderInventory(produced: readonly string[]): string {
  const groups = new Map<CharGroup, string[]>();
  for (const ch of produced) {
    const g = groupOf(ch.codePointAt(0)!);
    const list = groups.get(g) ?? [];
    list.push(`<li>${glyph(ch)} ${nameLabel(ch)}</li>`);
    groups.set(g, list);
  }
  return GROUP_ORDER.filter((g) => (groups.get(g) ?? []).length > 0)
    .map((g) => `<h3>${escapeDocHtml(GROUP_LABEL[g])}</h3><ul>${groups.get(g)!.join("")}</ul>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Typing-guide suppression (research R11)
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The accented-letter entities a hand-written typing table is likely to use (&eacute;), as their combining mark. */
const ACCENT_ENTITIES: Readonly<Record<string, string>> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  tilde: "̃",
  uml: "̈",
  cedil: "̧",
  ring: "̊",
  caron: "̌",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const cp = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    if (named !== undefined) return named;
    const accent = ACCENT_ENTITIES[body.slice(1).toLowerCase()];
    return accent !== undefined ? `${body[0]}${accent}`.normalize("NFC") : whole;
  });
}

/** Each table or list in the prose, as the set of characters it holds. */
function listsAndTables(prose: string): Set<string>[] {
  const blocks: string[] = [];
  for (const m of prose.matchAll(/<(table|ul|ol)\b[\s\S]*?<\/\1\s*>/gi)) blocks.push(m[0]);
  let run: string[] = [];
  let runKind: "table" | "list" | null = null;
  const flush = () => {
    if (run.length > 0) blocks.push(run.join("\n"));
    run = [];
    runKind = null;
  };
  for (const line of prose.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    const kind = trimmed.startsWith("|") ? "table" : /^([-*+]|\d+[.)])\s/.test(trimmed) ? "list" : null;
    if (kind === null || (runKind !== null && kind !== runKind)) flush();
    if (kind !== null) {
      runKind = kind;
      run.push(trimmed);
    }
  }
  flush();
  return blocks.map((block) => {
    const text = decodeEntities(block.replace(/<[^>]*>/g, " ")).normalize("NFC");
    return new Set([...text]);
  });
}

function inheritedGuideCovers(prose: string, guideChars: readonly string[]): boolean {
  if (guideChars.length === 0) return false;
  return listsAndTables(prose).some((chars) => {
    const held = guideChars.filter((ch) => chars.has(ch)).length;
    return held * 2 >= guideChars.length;
  });
}

// ---------------------------------------------------------------------------

/** The derived documentation sections for a keyboard. Pure, synchronous and deterministic. */
export function buildDocContent(input: DocContentInput): DocContent {
  const { ir, touchLayout, inheritedProse } = input;
  const produced = producedChars(ir);
  const rows = guideRows(ir);
  const typingGuideSuppressed =
    inheritedProse !== null && inheritedGuideCovers(inheritedProse, rows.map((r) => r.ch));
  const typingGuide =
    typingGuideSuppressed || rows.length === 0
      ? ""
      : rows.length > TYPING_GUIDE_SUMMARY_THRESHOLD
        ? renderGuideSummary(rows)
        : renderGuideTable(rows);
  return {
    slots: {
      typingGuide,
      mechanisms: renderMechanisms(detectMechanisms(ir, produced)),
      layoutPictures: "",
      touchNotes: renderTouchNotes(touchLayout),
      characterInventory: renderInventory(produced),
    },
    typingGuideSuppressed,
  };
}
