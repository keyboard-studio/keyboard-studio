// Check 7.27 — KM_LINT_DEPRECATED_HEADER_OR_UNUSED_STORE.
//
// (a) No deprecated header statements. Bare old-style headers (`VERSION
// 10.0`, `NAME "..."`, ...) must be `store(&...)` system stores (kmc
// KM0209D WARN_HeaderStatementIsDeprecated); the deprecated system stores
// `&ETHNOLOGUECODE`, `&LANGUAGE` and `&WINDOWSLANGUAGES` must go (kmc
// KM020A5 WARN_LanguageHeadersDeprecatedInKeyman10 — "add language
// metadata in the package file" instead). Evidence: #4161/#4160 (`VERSION
// 10.0` → `store(&VERSION) '10.0'`), #4151 (`store(&ETHNOLOGUECODE)`
// removed).
// (b) No unused stores: a declared non-system store never referenced by
// any rule is dead weight (#4163 removed an unused decimal store).
// References are collected from the IR (any/notany/index/outs/if); a
// text fallback covers references the IR left in raw fragments.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  ruleConditions,
  ruleExtraKeystrokeElements,
  ruleKeystrokeLoose,
  rulePreContext,
} from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

// Old-style bare headers (help.keyman.com "Header keywords": bitmap,
// bitmaps, copyright, hotkey, language, layout, message, name, version;
// corpus forms: NAME/BITMAP/VERSION/LANGUAGE). `begin` is not a header
// statement and `store(` lines are the modern form — both excluded.
const BARE_HEADER = /^\s*(BITMAPS?|COPYRIGHT|HOTKEY|LANGUAGE|LAYOUT|MESSAGE|NAME|VERSION)\b/i;
const BEGIN_LINE = /^\s*begin\b/i;
const STORE_LINE = /^\s*store\s*\(/i;

// Deprecated system stores (help.keyman.com "Header system stores").
const DEPRECATED_SYS_STORE =
  /store\s*\(\s*&(ETHNOLOGUECODE|LANGUAGE|WINDOWSLANGUAGES)\s*\)/i;

/** Strip a trailing `c` comment (standalone token, outside strings). */
function stripComment(line: string): string {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote !== null) {
      if (ch === quote && line[i + 1] !== quote) quote = null;
      else if (ch === quote) i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (
      (ch === "c" || ch === "C") &&
      (i === 0 || /\s/.test(line[i - 1]!)) &&
      (i + 1 >= line.length || /\s/.test(line[i + 1]!))
    ) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** (a) Deprecated header statements in the header section (before `begin`). */
function deprecatedHeaders(kmnText: string): string[] {
  const hits: string[] = [];
  for (const raw of kmnText.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (BEGIN_LINE.test(line)) break;
    if (STORE_LINE.test(line)) {
      const m = line.match(DEPRECATED_SYS_STORE);
      if (m) hits.push(`deprecated system store &${m[1]!.toUpperCase()}`);
      continue;
    }
    const m = line.match(BARE_HEADER);
    if (m) hits.push(`deprecated header statement ${m[1]!.toUpperCase()}`);
  }
  return [...new Set(hits)];
}

/** (b) Declared non-system stores never referenced by any rule. */
function unusedStores(
  ir: KeyboardIR,
  kmnText: string | undefined,
): string[] {
  const referenced = new Set<string>();
  const note = (name: string) => {
    referenced.add(name.replace(/^&/, "").toLowerCase());
  };
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const keystroke = ruleKeystrokeLoose(rule);
      const elements = [
        ...ruleConditions(rule),
        ...rulePreContext(rule, { usingKeys: true }),
        ...(keystroke !== undefined ? [keystroke] : []),
        ...ruleExtraKeystrokeElements(rule, { usingKeys: true }),
        ...rule.output,
      ];
      for (const el of elements) {
        if (el.kind === "if") {
          note(el.store);
        } else if ("storeRef" in el && typeof el.storeRef === "string") {
          note(el.storeRef);
        }
      }
    }
  }
  const unused: string[] = [];
  for (const store of ir.stores) {
    if (store.isSystem) continue;
    const key = store.name.replace(/^&/, "").toLowerCase();
    if (referenced.has(key)) continue;
    // Text fallback: a reference the IR left inside a raw fragment still
    // counts as a use. Look for the name as a word outside its own
    // declaration line.
    if (kmnText !== undefined) {
      const word = new RegExp(`\\b${escapeRegExp(store.name)}\\b`, "i");
      const decl = new RegExp(
        `^\\s*store\\s*\\(\\s*${escapeRegExp(store.name)}\\s*\\)`,
        "im",
      );
      const bodyWithoutDecl = kmnText.replace(decl, "");
      if (word.test(bodyWithoutDecl)) continue;
    }
    unused.push(store.name);
  }
  return unused;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 7.27 — one aggregated finding covering deprecated headers and unused
 * stores. Either half may be skipped when its input is absent (no .kmn
 * text / no parsed IR); the verified lines name what was actually
 * checked.
 */
export function checkDeprecatedHeaders(
  kmnText: string | undefined,
  ir: KeyboardIR | undefined,
  keyboardId: string,
): CheckResult {
  const problems: string[] = [];
  const checked: string[] = [];
  if (kmnText !== undefined) {
    problems.push(...deprecatedHeaders(kmnText).map((h) => `${h}`));
    checked.push("header statements");
  }
  if (ir !== undefined) {
    problems.push(
      ...unusedStores(ir, kmnText).map((s) => `unused store ${s}`),
    );
    checked.push("store references");
  }
  if (problems.length > 0) {
    return checkFailed("KM_LINT_DEPRECATED_HEADER_OR_UNUSED_STORE", [
      criteriaFinding({
        code: "KM_LINT_DEPRECATED_HEADER_OR_UNUSED_STORE",
        file: kmnPath(keyboardId),
        message: `Deprecated or dead header/store constructs: ${[...new Set(problems)].join("; ")}.`,
        hint: "Rewrite bare headers as store(&...) system stores, drop &ETHNOLOGUECODE/&LANGUAGE/&WINDOWSLANGUAGES, and delete stores no rule references.",
      }),
    ]);
  }
  return checkPassed("KM_LINT_DEPRECATED_HEADER_OR_UNUSED_STORE", [
    `Checked ${checked.join(" and ") || "nothing (no inputs)"}: no deprecated headers or unused stores.`,
  ]);
}
