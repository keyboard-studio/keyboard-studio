/**
 * Fired-rule tracking for the headless simulator (spec 082, Track A FR-002).
 *
 * HOW THE FIRED RULE IS CAPTURED — hook, not heuristic.
 *
 * The vendored `jsKeyboardProcessor` does not itself match rules: rule matching
 * happens inside the *compiled keyboard's* JavaScript, in one generated group
 * function per KMN group (`this.g_<name>_<n> = function(t,e) { ... }`). Each
 * group is an if/else-if chain over the keystroke, and kmc-kmn emits exactly
 * one rule-match marker per KMN rule at the head of the branch that matched:
 *
 *   - `r=m=1;` for ordinary rules (optionally followed by `// Line N`, the
 *     KMN source line of the rule), and
 *   - `r=1;` for `nomatch` rules.
 *
 * `instrumentFiredRuleTracking()` statically parses the compiled `.js`,
 * enumerates those markers per group in source order (marker ordinal =
 * ruleIndex), and injects a call to a sandbox global,
 * `__ksFiredRule("<group>", <ruleIndex>, <srcLine|null>)`, immediately after
 * each marker. `simulate()` installs that global on the loader sandbox so the
 * injected call records the hit on the host side, then reads the last hit
 * after each `processKeystroke`.
 *
 * Because the marker executes if and only if the rule's match succeeded, this
 * is a genuine hook into the rule-matching loop — no re-derivation from
 * context diffs, no guessing from outputs. Consequences worth knowing:
 *
 * - With `use()` delegation the outer rule's marker fires first, then the
 *   called group's marker fires; the LAST hit wins, so the reported rule is
 *   the innermost one — the rule that determined the final match/output.
 * - A rule that fires but whose delegation finds no match still records its
 *   hit (the keystroke then falls through to default output).
 * - `begin NewContext` / `begin PostKeystroke` groups (`gn`/`gpk`) are also
 *   instrumented if present, but `simulate()` only drives keystroke
 *   processing, so their hits are discarded by the per-keystroke reset.
 *
 * FALLBACK: if the script does not look like kmc-kmn output (no group
 * functions found, or none contains a marker), the function returns `null`
 * and `simulate()` loads the script uninstrumented — `firedRule` simply stays
 * absent. The compiled shape is machine-generated and stable across the kmc
 * versions the studio ships, but a future emitter change must keep the
 * `r=m=1`/`r=1` idiom (or this parser updated) for tracking to work.
 */

/** One recorded rule-match hit from the instrumented keyboard script. */
export interface FiredRuleHit {
  /** Group name in the compiled keyboard (e.g. `"main"`). */
  group: string;
  /** 0-based ordinal of the rule within its group, in compiled source order. */
  ruleIndex: number;
  /** KMN source line from the `// Line N` comment, or `null` when absent. */
  srcLine: number | null;
}

/** Name of the sandbox global the injected calls target. */
export const FIRED_RULE_HOOK_NAME = '__ksFiredRule';

/** One instrumented group: its name and per-rule source lines (for tests/diagnostics). */
export interface InstrumentedGroup {
  name: string;
  ruleSrcLines: Array<number | null>;
}

/** Result of instrumenting a compiled keyboard script. */
export interface InstrumentedScript {
  /** The script with `__ksFiredRule(...)` calls injected after each rule marker. */
  script: string;
  /** Always {@link FIRED_RULE_HOOK_NAME}; install it on the loader sandbox. */
  hookName: string;
  /** Groups found and instrumented, in source order. */
  groups: InstrumentedGroup[];
}

/** Matches `this.g_<name>_<n> = function(` — kmc-kmn's group function shape. */
const GROUP_FN_RE = /this\.(g_[A-Za-z0-9_]+)\s*=\s*function\s*\(/g;

/** Matches kmc-kmn's rule-match markers: `r=m=1;` and the `nomatch` form `r=1;`. */
const RULE_MARKER_RE = /\br\s*=\s*(?:m\s*=\s*)?1\s*;/g;

/** Matches the `// Line N` comment kmc-kmn emits after most markers. */
const LINE_COMMENT_RE = /\/\/\s*Line\s+(\d+)/;

/** Recovers the KMN group name from `g_<name>_<n>`. */
const GROUP_NAME_RE = /^g_(.+)_\d+$/;

interface ScanResult {
  start: number;
  end: number;
}

/**
 * Find the `{ ... }` body starting at `braceIndex`, skipping over string
 * literals, template literals, and comments so braces inside them (or inside
 * object literals like `[{t:'d',d:0}]`) don't confuse the depth count.
 * Returns `null` when the braces never balance.
 */
function findBalancedBody(src: string, braceIndex: number): ScanResult | null {
  let depth = 0;
  let i = braceIndex;
  const n = src.length;
  // 0 = code, 1 = ', 2 = ", 3 = `, 4 = // comment, 5 = /* comment */
  let state = 0;

  while (i < n) {
    const ch = src[i]!;
    const next = i + 1 < n ? src[i + 1]! : '';

    if (state === 0) {
      if (ch === "'") state = 1;
      else if (ch === '"') state = 2;
      else if (ch === '`') state = 3;
      else if (ch === '/' && next === '/') state = 4;
      else if (ch === '/' && next === '*') state = 5;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return { start: braceIndex, end: i + 1 };
      }
    } else if (state === 1 || state === 2 || state === 3) {
      const quote = state === 1 ? "'" : state === 2 ? '"' : '`';
      if (ch === '\\') i++; // skip escaped char
      else if (ch === quote) state = 0;
    } else if (state === 4) {
      if (ch === '\n') state = 0;
    } else if (state === 5) {
      if (ch === '*' && next === '/') {
        state = 0;
        i++;
      }
    }
    i++;
  }
  return null;
}

/** Locate every `this.g_<name>_<n> = function(...) { ... }` body in the script. */
function findGroupBodies(src: string): Array<{ fnName: string; bodyStart: number; bodyEnd: number }> {
  const found: Array<{ fnName: string; bodyStart: number; bodyEnd: number }> = [];
  GROUP_FN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GROUP_FN_RE.exec(src)) !== null) {
    // Skip past the parameter list: `function(` ... `)`.
    let i = m.index + m[0].length;
    let parenDepth = 1;
    while (i < src.length && parenDepth > 0) {
      if (src[i] === '(') parenDepth++;
      else if (src[i] === ')') parenDepth--;
      i++;
    }
    // Skip whitespace to the opening brace of the body.
    while (i < src.length && /\s/.test(src[i]!)) i++;
    if (src[i] !== '{') continue;
    const body = findBalancedBody(src, i);
    if (!body) continue;
    found.push({ fnName: m[1]!, bodyStart: body.start, bodyEnd: body.end });
  }
  return found;
}

/**
 * Instrument a compiled Keyman `.js` keyboard so every rule match reports
 * itself via the {@link FIRED_RULE_HOOK_NAME} sandbox global.
 *
 * Returns `null` when the script doesn't contain instrumentable group
 * functions — callers must then load the script as-is (no tracking).
 */
export function instrumentFiredRuleTracking(scriptSrc: string): InstrumentedScript | null {
  const groups = findGroupBodies(scriptSrc);
  if (groups.length === 0) return null;

  // Collect insertions as [offset, text, groupName, ruleIndex, srcLine].
  const insertions: Array<{
    offset: number;
    text: string;
    groupName: string;
    ruleIndex: number;
    srcLine: number | null;
  }> = [];
  const groupInfo: InstrumentedGroup[] = [];

  for (const { fnName, bodyStart, bodyEnd } of groups) {
    const nameMatch = GROUP_NAME_RE.exec(fnName);
    if (!nameMatch) continue;
    const groupName = nameMatch[1]!;

    const body = scriptSrc.slice(bodyStart, bodyEnd);
    RULE_MARKER_RE.lastIndex = 0;
    let ruleIndex = 0;
    const ruleSrcLines: Array<number | null> = [];
    let marker: RegExpExecArray | null;
    while ((marker = RULE_MARKER_RE.exec(body)) !== null) {
      // Source line comes from the `// Line N` comment on the marker's line.
      const lineEnd = body.indexOf('\n', marker.index);
      const lineTail = body.slice(marker.index, lineEnd === -1 ? body.length : lineEnd);
      const lineMatch = LINE_COMMENT_RE.exec(lineTail);
      const srcLine = lineMatch ? parseInt(lineMatch[1]!, 10) : null;

      insertions.push({
        offset: bodyStart + marker.index + marker[0].length,
        text:
          `${FIRED_RULE_HOOK_NAME}(${JSON.stringify(groupName)},${ruleIndex},` +
          `${srcLine === null ? 'null' : srcLine});`,
        groupName,
        ruleIndex,
        srcLine,
      });
      ruleSrcLines.push(srcLine);
      ruleIndex++;
    }

    if (ruleIndex > 0) {
      groupInfo.push({ name: groupName, ruleSrcLines });
    }
  }

  if (insertions.length === 0) return null;

  // Build the instrumented script in a single pass. The old code spliced each
  // insertion with slice/concat (O(insertions × script length)); corpus
  // keyboards with tens of thousands of rules turned that quadratic.
  insertions.sort((a, b) => a.offset - b.offset);
  const parts: string[] = [];
  let cursor = 0;
  for (const ins of insertions) {
    parts.push(scriptSrc.slice(cursor, ins.offset), ins.text);
    cursor = ins.offset;
  }
  parts.push(scriptSrc.slice(cursor));
  const script = parts.join('');

  return { script, hookName: FIRED_RULE_HOOK_NAME, groups: groupInfo };
}
