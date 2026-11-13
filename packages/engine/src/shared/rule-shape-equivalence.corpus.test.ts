/**
 * Equivalence corpus test for the shared rule-shape accessors.
 *
 * The inline "which element is the keystroke / what is pre-context" logic of
 * each of the five pre-existing splitters is copied below as a REFERENCE
 * function (these copies never ship). Over every rule of every corpus `.kmn`
 * the references are compared with `ruleKeystroke` / `rulePreContext`, and every
 * disagreement is written to
 * specs/116-ng-parser-adoption/evidence/splitter-disagreements.md.
 *
 * The test fails only on a disagreement that research R5a's kmcmplib rule does
 * not explain. A disagreement is explained when the rule has one of the edge
 * features R5a names (more than one inline `+`; a vkey before the `+`; `any()`
 * as the keystroke; a group that is not `using keys`) or one of the two shape
 * features the accessors define on top of it (a head run of `nul`/conditions
 * that is not pre-context; extra keystroke elements; a `+`-less multi-element
 * left-hand side).
 *
 * Root: env KS_KEYBOARDS when set, else the sibling `keyboards` checkout.
 * Skipped with a [WARN] when the corpus is absent.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextElement, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import {
  isPlusSeparator,
  ruleConditions,
  ruleExtraKeystrokeElements,
  ruleHasNulContext,
  ruleKeystroke,
  rulePreContext,
} from "./rule-shape.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));
const EVIDENCE = path.resolve(
  __dir,
  "../../../../specs/116-ng-parser-adoption/evidence/splitter-disagreements.md",
);

if (!rootExists) {
  console.warn(`[WARN] keyboards corpus not found at ${ROOT}; skipping the splitter equivalence test`);
}

// ---------------------------------------------------------------------------
// Reference splitters (copied inline logic; never shipped)
// ---------------------------------------------------------------------------

interface Answer {
  /** The keystroke element; undefined when the splitter finds none. */
  key: ContextElement | undefined;
  /** The pre-context elements, when the splitter computes them. */
  pre?: ContextElement[];
}

type Reference = (rule: IRRule, group: IRGroup) => Answer;

/** touch-key-rule-join.ts: resolveStruckVkey / indexOfStruckVkey / resolveStruckAny + hasPreContext. */
const refTouchKeyJoin: Reference = (rule) => {
  const context = rule.context;
  let struck: ContextElement | undefined;
  for (const el of context) {
    if (isPlusSeparator(el)) continue;
    if (el.kind === "vkey") {
      struck = el;
      break;
    }
  }
  if (struck === undefined) {
    let separatorIndex = -1;
    for (let i = 0; i < context.length; i++) {
      const el = context[i];
      if (el !== undefined && isPlusSeparator(el)) {
        separatorIndex = i;
        break;
      }
    }
    if (separatorIndex === -1) {
      const nonSeparators = context.filter((el) => !isPlusSeparator(el));
      const only = nonSeparators[0];
      if (nonSeparators.length === 1 && only !== undefined && only.kind === "any") struck = only;
    } else {
      for (let i = 0; i < context.length; i++) {
        const el = context[i];
        if (el === undefined || isPlusSeparator(el)) continue;
        if (i > separatorIndex && el.kind === "any") {
          struck = el;
          break;
        }
      }
    }
  }
  if (struck === undefined) return { key: undefined };
  return { key: struck, pre: context.filter((el) => el !== struck && !isPlusSeparator(el)) };
};

/** ldml-export/classify/keystrokes.ts: splitRule. */
const refLdmlSplitRule: Reference = (rule, group) => {
  if (!group.usingKeys || rule.matchKind !== undefined) return { key: undefined, pre: rule.context };
  const ctx = rule.context;
  let plus = -1;
  for (let i = ctx.length - 1; i >= 0; i--) {
    const el = ctx[i];
    if (el !== undefined && isPlusSeparator(el)) {
      plus = i;
      break;
    }
  }
  if (plus >= 0) return { key: ctx[plus + 1], pre: ctx.slice(0, plus) };
  const last = ctx[ctx.length - 1];
  if (last === undefined) return { key: undefined, pre: [] };
  return { key: last, pre: ctx.slice(0, -1) };
};

/** kmAssist/group.ts: splitGuards (key only when the last element is a vkey). */
const refKmAssistSplitGuards: Reference = (rule) => {
  const ctx = rule.context;
  const last = ctx[ctx.length - 1];
  if (last !== undefined && last.kind === "vkey") return { key: last, pre: ctx.slice(0, -1) };
  return { key: undefined, pre: ctx };
};

/**
 * contracts/src/ir/outputRepertoire.ts: splitContext. The key side is every
 * element after the first `+` (or all of them in a `using keys` group with no
 * `+`); only the first key element is compared as the keystroke, and the rest
 * go to the key-side list.
 */
const refOutputRepertoire: Reference = (rule, group) => {
  const sep = rule.context.findIndex(isPlusSeparator);
  const keys: ContextElement[] = [];
  const pre: ContextElement[] = [];
  rule.context.forEach((el, i) => {
    if (i === sep) return;
    const isKey = sep >= 0 ? i > sep : group.usingKeys;
    (isKey ? keys : pre).push(el);
  });
  return { key: keys[0], pre };
};

/** base-fallback/unhandledPositions.ts: keystrokeElement. */
const refUnhandledPositions: Reference = (rule) => {
  const ctx = rule.context;
  for (let i = ctx.length - 1; i >= 0; i--) {
    const el = ctx[i];
    if (el !== undefined && isPlusSeparator(el)) return { key: ctx[i + 1] };
  }
  return { key: ctx[ctx.length - 1] };
};

/** Element kinds a reference could ever report as the keystroke (absent = any). */
const RECOGNISED_KEY_KINDS = new Map<string, string[]>([
  ["touch-key-rule-join (struck key)", ["vkey", "any"]],
  ["kmAssist splitGuards", ["vkey"]],
]);

const EXAMPLES_PER_GROUP = 12;

const REFERENCES: Array<[string, Reference]> = [
  ["touch-key-rule-join (struck key)", refTouchKeyJoin],
  ["ldml-export splitRule", refLdmlSplitRule],
  ["kmAssist splitGuards", refKmAssistSplitGuards],
  ["outputRepertoire splitContext", refOutputRepertoire],
  ["unhandledPositions keystrokeElement", refUnhandledPositions],
];

// ---------------------------------------------------------------------------
// Rendering and classification
// ---------------------------------------------------------------------------

function showEl(el: ContextElement | undefined): string {
  if (el === undefined) return "(none)";
  switch (el.kind) {
    case "char":
      return JSON.stringify(el.value);
    case "vkey":
      return `[${[...el.modifiers, el.name].join(" ")}]`;
    case "deadkey":
      return `dk(${el.id})`;
    case "namedDeadkey":
      return `dk(${el.name})`;
    case "any":
    case "notany":
      return `${el.kind}(${el.storeRef})`;
    case "context":
      return `context(${el.offset})`;
    case "index":
      return `index(${el.storeRef},${el.offset})`;
    case "baselayout":
      return `baselayout(${el.value})`;
    case "if":
      return `if(${el.store}=${el.value})`;
    case "raw":
      return el.text;
  }
}

const showList = (els: readonly ContextElement[]): string => (els.length === 0 ? "(empty)" : els.map(showEl).join(" "));

interface Features {
  tags: string[];
}

function featuresOf(rule: IRRule, group: IRGroup): Features {
  const tags: string[] = [];
  const ctx = rule.context;
  const seps = ctx.filter(isPlusSeparator).length;
  if (rule.matchKind !== undefined) tags.push("match/nomatch rule");
  if (!group.usingKeys) tags.push("group is not using keys");
  if (seps > 1) tags.push("more than one inline +");
  const sepIdx = ctx.findIndex(isPlusSeparator);
  if (sepIdx > 0 && ctx.slice(0, sepIdx).some((el) => el.kind === "vkey")) tags.push("vkey before the +");
  const ks = ruleKeystroke(rule, group);
  if (ks?.kind === "any") tags.push("any() as the keystroke");
  const keyLike = ctx.some((el, i) => el.kind === "any" && sepIdx >= 0 && i > sepIdx);
  if (keyLike) tags.push("any() as the keystroke");
  if (ruleHasNulContext(rule) || ruleConditions(rule).length > 0) tags.push("head run (nul/conditions) is not pre-context");
  if (ruleExtraKeystrokeElements(rule, group).length > 0) tags.push("extra keystroke elements");
  if (sepIdx === -1 && ctx.filter((el) => !isPlusSeparator(el)).length > 1) tags.push("no + with a multi-element left-hand side");
  if (ks === undefined && ctx.length > 0 && rule.matchKind === undefined && group.usingKeys) tags.push("no element at the keystroke position");
  return { tags: [...new Set(tags)] };
}

function sameList(a: readonly ContextElement[], b: readonly ContextElement[]): boolean {
  return a.length === b.length && a.every((el, i) => el === b[i]);
}

interface Disagreement {
  file: string;
  line: number | undefined;
  rule: string;
  splitter: string;
  what: "keystroke" | "pre-context";
  oldAnswer: string;
  newAnswer: string;
  tags: string[];
}

function walkKmn(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "build") walkKmn(full, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".kmn")) {
      out.push(full);
    }
  }
}

describe.skipIf(!rootExists)("rule-shape accessors vs the five legacy splitters (corpus)", () => {
  it("every disagreement is explained by the kmcmplib rule, and all are recorded", () => {
    const files: string[] = [];
    for (const tree of ["release", "experimental"]) walkKmn(path.join(ROOT, tree), files);
    expect(files.length).toBeGreaterThan(0);

    const disagreements: Disagreement[] = [];
    let ruleCount = 0;
    let parsedFiles = 0;

    for (const file of files) {
      let ir;
      try {
        ir = parse(fs.readFileSync(file, "utf8"), path.basename(file, ".kmn")).ir;
      } catch {
        continue;
      }
      parsedFiles++;
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      for (const group of ir.groups) {
        for (const rule of group.rules) {
          ruleCount++;
          const newKey = ruleKeystroke(rule, group);
          const newPre = rulePreContext(rule, group);
          const ruleText = `${showList(rule.context)} > ${rule.output.length} output element(s)`;
          const feats = featuresOf(rule, group);
          for (const [name, ref] of REFERENCES) {
            const old = ref(rule, group);
            const tags = [...feats.tags];
            // touch-key-rule-join and kmAssist only ever look for a vkey (the
            // touch join also for any()); a rule whose keystroke is some other
            // element is outside what they answered, not a splitting difference.
            const recognised = RECOGNISED_KEY_KINDS.get(name);
            if (
              recognised !== undefined &&
              old.key === undefined &&
              newKey !== undefined &&
              !recognised.includes(newKey.kind)
            ) {
              tags.push(`old splitter recognised only ${recognised.join("/")} keystrokes`);
            }
            if (old.key !== newKey) {
              disagreements.push({
                file: rel,
                line: rule.sourceLine,
                rule: ruleText,
                splitter: name,
                what: "keystroke",
                oldAnswer: showEl(old.key),
                newAnswer: showEl(newKey),
                tags,
              });
            }
            if (old.pre !== undefined) {
              const oldPre = old.pre.filter((el) => !isPlusSeparator(el));
              if (!sameList(oldPre, newPre)) {
                disagreements.push({
                  file: rel,
                  line: rule.sourceLine,
                  rule: ruleText,
                  splitter: name,
                  what: "pre-context",
                  oldAnswer: showList(oldPre),
                  newAnswer: showList(newPre),
                  tags,
                });
              }
            }
          }
        }
      }
    }

    const unexplained = disagreements.filter((d) => d.tags.length === 0);

    // ---- evidence file ----
    const byKey = new Map<string, number>();
    for (const d of disagreements) {
      const tag = d.tags.length === 0 ? "UNEXPLAINED" : d.tags.join(" + ");
      const k = `${d.splitter} | ${d.what} | ${tag}`;
      byKey.set(k, (byKey.get(k) ?? 0) + 1);
    }
    const seenPerGroup = new Map<string, number>();
    const examples = disagreements.filter((d) => {
      const k = `${d.splitter}|${d.what}|${d.tags.join("+")}`;
      const n = seenPerGroup.get(k) ?? 0;
      seenPerGroup.set(k, n + 1);
      return n < EXAMPLES_PER_GROUP;
    });
    const esc = (s: string): string => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const lines: string[] = [
      "# Splitter disagreements",
      "",
      "Generated by `packages/engine/src/shared/rule-shape-equivalence.corpus.test.ts`. Each row is a rule where",
      "one of the five pre-existing splitters answered differently from `ruleKeystroke` / `rulePreContext`,",
      "which follow the kmcmplib rule from research R5a. Separator elements are removed from the old",
      "pre-context answer before comparing (the new API never counts the `+`).",
      "",
      `- corpus files parsed: ${parsedFiles} of ${files.length}`,
      `- rules compared: ${ruleCount}`,
      `- disagreements: ${disagreements.length}`,
      `- unexplained disagreements: ${unexplained.length}`,
      "",
      "## Summary by splitter, field and explanation",
      "",
      "| Splitter | Field | Explanation | Count |",
      "|---|---|---|---|",
      ...[...byKey.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => {
          const [s, w, t] = k.split(" | ");
          return `| ${s} | ${w} | ${t} | ${n} |`;
        }),
      "",
      `## Disagreements (all counted above; at most ${EXAMPLES_PER_GROUP} example rows per group below)`,
      "",
      "The full list is regenerated by the test; it is millions of characters long because the legacy",
      "splitters disagree on a rule for every `nul`/condition head and every non-vkey keystroke, so the",
      "rows are capped per (splitter, field, explanation) group. A group with a count of at most the cap",
      "is listed in full.",
      "",
      "| File:line | Splitter | Field | Rule (context > output) | Old answer | New answer | Explanation |",
      "|---|---|---|---|---|---|---|",
      ...examples.map(
        (d) =>
          `| ${d.file}:${d.line ?? "?"} | ${d.splitter} | ${d.what} | ${esc(d.rule)} | ${esc(d.oldAnswer)} | ${esc(d.newAnswer)} | ${d.tags.length === 0 ? "UNEXPLAINED" : d.tags.join("; ")} |`,
      ),
      "",
    ];
    fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
    fs.writeFileSync(EVIDENCE, lines.join("\n"));
    console.log(
      `[OK] splitter equivalence: ${ruleCount} rules, ${disagreements.length} disagreements, ${unexplained.length} unexplained`,
    );

    expect(
      unexplained.slice(0, 10).map((d) => `${d.file}:${d.line} ${d.splitter} ${d.what}: ${d.rule}`),
    ).toEqual([]);
  }, 600_000);
});
