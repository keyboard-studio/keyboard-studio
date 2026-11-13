/**
 * Keyman 19-deprecated .kmn forms, rewritten to modern equivalents on parse
 * (#2633), ported from the pre-spec-116 reader (parse.ts) onto the ng
 * lowering (lower.ts, spec 116). Spec 116 dropped this whole pass when it
 * replaced parse() with lower(): the tests in deprecated-forms.test.ts then
 * failed 37/38 and the target-selector merges that carveViaSplice relies on
 * went with it (main-CI run 43111580075).
 *
 * Three form classes:
 *   1. Header statements (NAME, VERSION, ...) → matching system store,
 *      except LANGUAGE / LAYOUT / BITMAPS, which are dropped.
 *   2. Legacy value formats (d### / x### / octal ###) → U+XXXX.
 *   3. Target-selector prefixes ($keyman: / $keymanweb: / $keymanonly:)
 *      → dropped / platform() guards / merged stores.
 *
 * Every rewrite is recorded in `rewrites` so the import can show it in the
 * as-built notes. The parser still ACCEPTS every form; the rewrite is what
 * the emitted .kmn carries.
 */

import type {
  ContextElement,
  DeprecatedRewrite,
  IRGroup,
  IRRule,
  IRStore,
  RawKmnFragment,
  StoreItem,
  TargetSelector,
} from "@keyboard-studio/contracts";
import { isPlusSeparator } from "@keyboard-studio/contracts";

import type { NodeIdMinter } from "../shared/node-ids.js";
import {
  DESKTOP_PLATFORM_GUARD,
  WEB_PLATFORM_GUARDS,
} from "./target-guards.js";

// ---------------------------------------------------------------------------
// Legacy value formats (#2633 §3)
// ---------------------------------------------------------------------------

/**
 * Decode a legacy Keyman value-format token to its character, or null.
 *
 * Keyman 19 deprecated `d###` (decimal), `x###` (hex) and bare `###`
 * (octal) codepoint spellings (WARN_DeprecatedValueFormat 0x0BC); Keyman 20
 * removes them. The modern spelling is `U+XXXX`. Only the unambiguous
 * shapes decode: `d` + 1-3 decimal digits 0-255 (a byte value), `x` + 1-4
 * hex digits (a BMP codepoint), or 1-3 octal digits (0-0777). Anything
 * outside those ranges stays raw — never mistype a token that is not a
 * legacy codepoint (e.g. an out-of-range `d999` keeps its raw form and the
 * compiler's error, rather than fabricating a character).
 */
export function parseLegacyValueFormat(tok: string): string | null {
  const dec = /^d(\d{1,3})$/i.exec(tok);
  if (dec !== null) {
    const cp = parseInt(dec[1] ?? "0", 10);
    return cp <= 0xff ? String.fromCodePoint(cp) : null;
  }
  const hex = /^x([0-9A-Fa-f]{1,4})$/i.exec(tok);
  if (hex !== null) {
    return String.fromCodePoint(parseInt(hex[1] ?? "0", 16));
  }
  const oct = /^([0-7]{1,3})$/.exec(tok);
  if (oct !== null) {
    return String.fromCodePoint(parseInt(oct[1] ?? "0", 8));
  }
  return null;
}

/** Format a BMP character the way the rewrite record (and emit) spell it. */
export function formatLegacyRewrite(ch: string): string {
  const hex = (ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
  return `U+${hex}`;
}

/**
 * Options for decoding a legacy value-format token (#2633 §3).
 * `isAnsi` marks a `begin ANSI` section: values ≥ 128 there are code-page
 * bytes, not necessarily Unicode codepoints, so they are left raw and
 * reported via `onEscalation` rather than guessed. `onRewrite` records a
 * performed rewrite; both callbacks are omitted for best-effort sketches
 * (the fragment preserves the source text, so no rewrite happened there).
 */
export interface LegacyValueOptions {
  isAnsi?: boolean;
  onRewrite?: (original: string, rewritten: string) => void;
  onEscalation?: (original: string) => void;
}

/**
 * Decode one legacy value-format token, honouring the ANSI guard. Returns
 * the character, or null when the token is not a legacy format — or when it
 * is one the ANSI guard forbids decoding (reported via `onEscalation`,
 * caller falls through to the raw handling).
 */
export function tryLegacyValue(tok: string, opts?: LegacyValueOptions): string | null {
  const decoded = parseLegacyValueFormat(tok);
  if (decoded === null) return null;
  if (opts?.isAnsi === true && (decoded.codePointAt(0) ?? 0) >= 0x80) {
    opts.onEscalation?.(tok);
    return null;
  }
  opts?.onRewrite?.(tok, formatLegacyRewrite(decoded));
  return decoded;
}

// ---------------------------------------------------------------------------
// Header statements (#2633 §1)
// ---------------------------------------------------------------------------

// Old-style bare header statements (help.keyman.com "Header keywords"),
// matched pre-`begin` only. `BITMAPS` is the plural spelling of `BITMAP`.
// The mapping is the km-keyman ruling for #2633 (see
// ~/workspace/keyboard-studio-notes/2633-ruling.md): NAME / VERSION /
// COPYRIGHT / HOTKEY / BITMAP / MESSAGE become the matching system store
// (precedent: #4160/#4161 `VERSION 10.0` → `store(&VERSION) '10.0'`);
// LANGUAGE / LAYOUT have no modern store — `store(&LANGUAGE)` and
// `store(&LAYOUT)` are illegal since Keyman 10
// (validator/checks/deprecatedStores.ts, DeprecationChecks.cpp) — so those
// headers are dropped: the metadata belongs in the `.kps`.
const HEADER_STATEMENT_RE =
  /^(BITMAPS?|COPYRIGHT|HOTKEY|LANGUAGE|LAYOUT|MESSAGE|NAME|VERSION)\s+(.*)$/i;
const HEADER_STATEMENT_STORES: Record<string, string> = {
  NAME: "NAME",
  VERSION: "VERSION",
  COPYRIGHT: "COPYRIGHT",
  HOTKEY: "HOTKEY",
  BITMAP: "BITMAP",
  MESSAGE: "MESSAGE",
};
// Headers with no modern store: LANGUAGE / LAYOUT are dropped (the metadata
// belongs in the `.kps`); BITMAPS (two images, Keyman 3.2) has no
// single-store equivalent, so it is dropped with both filenames recorded.
const DROPPED_HEADER_STATEMENTS = new Set(["LANGUAGE", "LAYOUT", "BITMAPS"]);

export interface ParsedHeaderStatement {
  /** Upper-cased keyword as written, e.g. "NAME". */
  keyword: string;
  /** System store the statement maps to, or null when the header is dropped. */
  storeName: string | null;
  /** Unquoted value text, e.g. "Test Keyboard" or "10.0". */
  value: string;
}

/**
 * Parse a pre-`begin` line as an old-style header statement, or null when
 * it is not one. The value must be exactly one quoted string or one bare
 * token — except BITMAPS, which takes two filenames. Anything else (missing
 * value, trailing junk) is not a header statement and falls through to the
 * unknown-pre-begin fragment path.
 */
export function parseHeaderStatement(text: string): ParsedHeaderStatement | null {
  const m = HEADER_STATEMENT_RE.exec(text.trim());
  if (m === null) return null;
  const keyword = (m[1] ?? "").toUpperCase();
  const rawValue = (m[2] ?? "").trim();
  // BITMAPS takes two filenames ("a.bmp" "b.bmp"): no single-store
  // equivalent, so it is a dropped header — record both filenames (they
  // ride in the rewrite entry's sourceText), do not guess.
  if (keyword === "BITMAPS") {
    const two = /^("[^"]*"|'[^']*'|\S+)\s+("[^"]*"|'[^']*'|\S+)$/.exec(rawValue);
    if (two === null) return null;
    return { keyword, storeName: null, value: rawValue };
  }
  const quoted = /^"([^"]*)"$/.exec(rawValue) ?? /^'([^']*)'$/.exec(rawValue);
  let value: string;
  if (quoted !== null) {
    value = quoted[1] ?? "";
  } else if (/^\S+$/.test(rawValue)) {
    value = rawValue;
  } else {
    return null;
  }
  const storeName = HEADER_STATEMENT_STORES[keyword] ??
    (DROPPED_HEADER_STATEMENTS.has(keyword) ? null : undefined);
  if (storeName === undefined) return null;
  return { keyword, storeName, value };
}

/**
 * Translate an old-style HOTKEY string to the modern `store(&hotkey)`
 * virtual-key form (#2633 ruling §2): `^` = Ctrl, `%` = Alt, `+` = Shift,
 * then the letter key — `HOTKEY "^%A"` → `[CTRL ALT K_A]`. An
 * already-bracketed form (`[Alt Shift K_PAUSE]`) passes through verbatim.
 * Returns null for forms the mapping does not cover (non-letter keys) —
 * the caller then keeps the quoted-string form and records it.
 */
export function translateHotkey(value: string): string | null {
  if (/^\[.*\]$/.test(value.trim())) return value.trim();
  const m = /^([\^%+]*)'?([A-Za-z])'?$/.exec(value.trim());
  if (m === null) return null;
  const mods: string[] = [];
  const marks = m[1] ?? "";
  if (marks.includes("^")) mods.push("CTRL");
  if (marks.includes("%")) mods.push("ALT");
  if (marks.includes("+")) mods.push("SHIFT");
  mods.push(`K_${(m[2] ?? "").toUpperCase()}`);
  return `[${mods.join(" ")}]`;
}

/** True when a raw fragment's source text declares `store(&NAME)` (system). */
export function fragmentDeclaresSystemStore(frag: RawKmnFragment, name: string): boolean {
  const re = new RegExp(
    `^\\s*(?:\\$[^:]+:\\s*)?store\\s*\\(\\s*&${name}\\s*\\)`,
    "i",
  );
  return re.test(frag.sourceText);
}

// ---------------------------------------------------------------------------
// Rewriter state
// ---------------------------------------------------------------------------

/** A classified line carrying a target-selector prefix (or none). */
export interface TargetedLine {
  line: number;
  text: string;
  targetSelector?: TargetSelector;
}

/** A header statement collected during the loop, finalised after it. */
export interface PendingHeader {
  keyword: string;
  storeName: string | null;
  value: string;
  line: number;
  sourceText: string;
}

export interface DeprecatedRewriterState {
  /** Typed stores, in source order (mutated in place by the merges). */
  stores: IRStore[];
  /** Groups, in source order (merge drops targeted transitions in place). */
  groups: IRGroup[];
  /** Opaque fragments (a dropped header may be consumed by one). */
  rawFragments: RawKmnFragment[];
  /** System-store raw values, for IRHeader construction. */
  sysStores: Record<string, string>;
  minter: NodeIdMinter;
  getCurrentGroup: () => IRGroup | null;
  /**
   * Encoding breakpoints for the §3 ANSI guard: (line, encoding) of each
   * `begin` directive in source order. A line's enclosing encoding is the
   * most recent begin at or before it; before any begin, the file's FIRST
   * begin encoding (the same first-wins convention as IRHeader.encoding).
   */
  encodingBreakpoints: Array<{ line: number; encoding: "Unicode" | "ANSI" }>;
}

/**
 * Split a rule's source text on its trailing `c <comment>`, mirroring
 * parse-shared's stripTrailingComment (kept local so this module does not
 * import parse-shared, which imports this module for tryLegacyValue).
 */
function splitTrailingComment(text: string): { rhs: string; trailingComment: string | undefined } {
  let inS = false;
  let inD = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    if (
      depth === 0 &&
      ch === "c" &&
      /\s/.test(text[i - 1] ?? "") &&
      (i === text.length - 1 || /\s/.test(text[i + 1] ?? ""))
    ) {
      const stripped = text.slice(0, i).trim();
      const commentText = text.slice(i + 1).trim();
      return { rhs: stripped, trailingComment: commentText || undefined };
    }
  }
  return { rhs: text, trailingComment: undefined };
}

/**
 * The #2633 rewrite pass, driven by lower.ts's line loop and finalised
 * after it. Holds the rewrite records and the per-parse state the old
 * parse() kept in closures (pending headers, targeted-store source texts,
 * the platform-guard flag).
 */
export class DeprecatedRewriter {
  /** Every rewrite performed, in parse order per form (sorted in finalize). */
  readonly rewrites: DeprecatedRewrite[] = [];

  private readonly stores: IRStore[];
  private readonly groups: IRGroup[];
  private readonly rawFragments: RawKmnFragment[];
  private readonly sysStores: Record<string, string>;
  private readonly minter: NodeIdMinter;
  private readonly getCurrentGroup: () => IRGroup | null;
  private readonly encodingBreakpoints: Array<{ line: number; encoding: "Unicode" | "ANSI" }>;

  /** Header statements collected during the loop, finalised after it — only
   * then is it known whether a real store() declaration already provides
   * the value (a real store wins, either order). */
  private readonly pendingHeaders: PendingHeader[] = [];
  /** Set when a rule is rewritten with a platform() guard — a guard needs
   * store(&version) >= '9.0' (see raiseVersionForPlatformGuards). */
  private addedPlatformGuards = false;
  // Original (prefix-stripped) line text of targeted typed stores, by nodeId,
  // plus the raw value for system stores — the post-loop store merge needs
  // both to write its rewrite records and fix up sysStores. `selector`
  // records which prefix the store came from (the merge deletes the
  // survivor's targetSelector, so the conflict pass reads it here).
  private readonly storeSourceText = new Map<
    string,
    { text: string; rawValue: string; selector: TargetSelector }
  >();

  constructor(state: DeprecatedRewriterState) {
    this.stores = state.stores;
    this.groups = state.groups;
    this.rawFragments = state.rawFragments;
    this.sysStores = state.sysStores;
    this.minter = state.minter;
    this.getCurrentGroup = state.getCurrentGroup;
    this.encodingBreakpoints = state.encodingBreakpoints;
  }

  recordRewrite(
    kind: DeprecatedRewrite["kind"],
    sourceLine: number,
    sourceText: string,
    rewrittenText: string,
  ): void {
    this.rewrites.push({ kind, sourceLine, sourceText, rewrittenText });
  }

  /** True when `line` sits in a `begin ANSI` section (see isAnsiLine). */
  isAnsiLine(line: number): boolean {
    let current: "Unicode" | "ANSI" | undefined;
    for (const bp of this.encodingBreakpoints) {
      if (bp.line <= line) current = bp.encoding;
      else break;
    }
    if (current === undefined) current = this.encodingBreakpoints[0]?.encoding;
    return current === "ANSI";
  }

  /** Legacy-value options for a source line: ANSI guard + rewrite recording. */
  legacyOptsFor(line: number): LegacyValueOptions {
    return {
      isAnsi: this.isAnsiLine(line),
      onRewrite: (original, rewritten) =>
        this.recordRewrite("legacy-value-format", line, original, rewritten),
      onEscalation: (original) =>
        this.recordRewrite(
          "legacy-value-format",
          line,
          original,
          `(kept as ${original} — a begin ANSI value ≥ 128 is a code-page byte, not a Unicode codepoint; needs a code-page decision)`,
        ),
    };
  }

  /**
   * Source text of a fragment line, preserving a stripped target-selector
   * prefix (#2633): opaque lines are NOT rewritten, so the gate stays
   * visible in the fragment. `$keyman:` ("both") is a no-op and is dropped.
   */
  fragmentSourceText(tok: TargetedLine): string {
    if (tok.targetSelector === "keyman" || tok.targetSelector === undefined) return tok.text;
    return `$${tok.targetSelector}: ${tok.text}`;
  }

  /**
   * Record the drop of a `$keyman:` ("both") prefix — semantics-preserving,
   * so it is dropped wherever it appears (typed and opaque lines alike).
   */
  recordKeymanDrop(tok: TargetedLine): void {
    if (tok.targetSelector === "keyman") {
      this.recordRewrite("target-selector", tok.line, `$keyman: ${tok.text}`, tok.text);
    }
  }

  /**
   * Record a `$keymanweb:` / `$keymanonly:` prefix on a line that cannot be
   * rewritten (opaque store/rule, pre-begin line, begin/group/header line):
   * the prefix stays in the fragment text and the escalation is recorded so
   * the user can see it needs review. `rewrittenText` is the exact record
   * text, mirroring the old parse() per-kind wording.
   */
  recordTargetEscalation(tok: TargetedLine, rewrittenText: string): void {
    if (tok.targetSelector === "keymanweb" || tok.targetSelector === "keymanonly") {
      this.recordRewrite(
        "target-selector",
        tok.line,
        this.fragmentSourceText(tok),
        rewrittenText,
      );
    }
  }

  /** Collect a pre-`begin` header statement for post-loop finalisation. */
  collectHeader(header: ParsedHeaderStatement, line: number, sourceText: string): void {
    this.pendingHeaders.push({
      keyword: header.keyword,
      storeName: header.storeName,
      value: header.value,
      line,
      sourceText,
    });
  }

  /** Remember a targeted typed store's source line for the post-loop merge. */
  recordStoreSource(
    nodeId: string,
    src: { text: string; rawValue: string; selector: TargetSelector },
  ): void {
    this.storeSourceText.set(nodeId, src);
  }

  /**
   * Bump every index(store, N) offset in a rule's source text by one — the
   * record of a guard rewrite, mirroring the IR change below. Only the code
   * part is touched (a trailing `c <comment>` may mention index() without
   * referring to a rule position). The text is returned unchanged when it
   * holds no index() call, so spacing is preserved exactly in that case.
   */
  bumpIndexOffsetsInRuleText(text: string): string {
    if (!/\bindex\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*\d+\s*\)/i.test(text)) return text;
    const { rhs, trailingComment } = splitTrailingComment(text);
    const bumped = rhs.replace(
      /\bindex\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*\)/gi,
      (_m, store: string, n: string) => `index(${store}, ${Number(n) + 1})`,
    );
    return trailingComment === undefined ? bumped : `${bumped} c ${trailingComment}`;
  }

  /**
   * Rewrite a typed rule's target-selector prefix (#2633 §1): `$keyman:`
   * ("both") is dropped; `$keymanonly:` becomes one rule guarded
   * `platform('desktop native')`; `$keymanweb:` becomes THREE rules guarded
   * `platform('web')` / `platform('phone native')` / `platform('tablet
   * native')` (no single "js build" token exists). Returns the rules to
   * push — the first keeps `base.nodeId` (leading/trailing comments anchor
   * to it), the web copies mint fresh nodeIds and drop the trailing comment.
   * Sets `addedPlatformGuards` when any guard is added.
   *
   * Guard placement (verified against kmc 19.0.320-beta, exp1–exp6): the
   * guard goes FIRST in the context, and every index(store, N) offset is
   * bumped by one. index() pairs with the Nth context position (1-based,
   * counting every element including zero-width if()/platform() calls, and
   * counting multi-char strings per character) — a guard inserted before a
   * paired any() without the bump makes kmc report "An index() in the
   * output does not have a corresponding any() statement" (0x502032).
   * outs() is unaffected by guard position (no offset to track).
   */
  applyTargetSelectorToRule(base: IRRule, tok: TargetedLine): IRRule[] {
    const selector = tok.targetSelector;
    if (selector === undefined) return [base];
    if (selector === "keyman") {
      this.recordRewrite("target-selector", tok.line, `$keyman: ${tok.text}`, tok.text);
      return [base];
    }
    const guards =
      selector === "keymanonly" ? [DESKTOP_PLATFORM_GUARD] : [...WEB_PLATFORM_GUARDS];
    this.addedPlatformGuards = true;
    const bumpedText = this.bumpIndexOffsetsInRuleText(tok.text);
    const rewrittenText = guards.map((g) => `${g} ${bumpedText}`).join("; ");
    this.recordRewrite("target-selector", tok.line, `$${selector}: ${tok.text}`, rewrittenText);
    return guards.map((guard, i) => {
      // index() offsets (context and output) are 1-based context positions;
      // the guard prepended below shifts every paired any() one position
      // later, so each offset is bumped by one. Elements are cloned — the
      // web copies must not share (and re-bump) base's elements.
      const context: ContextElement[] = [
        { kind: "raw", text: guard },
        ...base.context.map((el) =>
          el.kind === "index" ? { ...el, offset: el.offset + 1 } : el,
        ),
      ];
      const output = base.output.map((el) =>
        el.kind === "index" ? { ...el, offset: el.offset + 1 } : el,
      );
      // In a `using keys` group the `+` keystroke separator belongs AFTER
      // the guard, immediately before the KEY — the LAST context element
      // (the key is the last element by KMN definition, whatever its kind:
      // vkey, any(), char). kmc rejects `+ platform(...)` ("Invalid
      // statement in key part") and, in a non-keys group, `platform(...)
      // + <key>` — so in a non-keys group no `+` is inserted at all
      // (emitRule prepends none there either). Attested corpus shape:
      // `platform('touch') any(x) + [K_A]`.
      if (
        this.getCurrentGroup()?.usingKeys === true &&
        !context.some((el) => isPlusSeparator(el)) &&
        context.length > 1
      ) {
        context.splice(context.length - 1, 0, { kind: "raw", text: "+" });
      }
      const copy: IRRule = {
        nodeId: i === 0 ? base.nodeId : this.minter.mint("rule"),
        context,
        output,
        ...(base.sourceLine !== undefined ? { sourceLine: base.sourceLine } : {}),
      };
      if (i === 0 && base.trailingComment !== undefined) {
        copy.trailingComment = base.trailingComment;
      }
      return copy;
    });
  }

  /**
   * Post-loop passes, in the old parse() order: merge targeted stores,
   * resolve the &CasedKeys/&mnemonicLayout conflict, merge targeted
   * transitions, finalise pending headers, raise the version for added
   * platform() guards. Rewrites are then sorted by source line for a
   * stable, source-order presentation in the as-built notes.
   */
  finalize(): void {
    this.mergeTargetedStores();
    this.resolveCasedKeysMnemonicConflict();
    this.mergeTargetedTransitions();
    this.finalizePendingHeaders();
    this.raiseVersionForPlatformGuards();
    // Rewrites are recorded in parse order per form; sort by source line for
    // a stable, source-order presentation in the as-built notes.
    this.rewrites.sort((a, b) => a.sourceLine - b.sourceLine);
  }

  // A merge-dropped twin's source line has no IR node left to own it, so
  // the text-splice carve path could never delete it: deleting the survivor
  // (or its group) would orphan the line, and a re-parse would resurrect
  // the twin — or re-attribute it to the preceding group (main-CI run
  // 42906157256: korean_rr's dropped `$keymanweb: nomatch > nul` line
  // survived a group deletion and re-parsed as an extra rule in
  // combineJamo). The survivor therefore consumes the loser's line(s):
  // the splice deletes them together with the survivor.
  private absorbDroppedLines(
    survivor: IRStore | IRRule | RawKmnFragment,
    loser: { sourceLine?: number; consumedSourceLines?: number[] },
  ): void {
    const lines = [
      ...(loser.sourceLine !== undefined ? [loser.sourceLine] : []),
      ...(loser.consumedSourceLines ?? []),
    ];
    if (lines.length === 0) return;
    const next = new Set(survivor.consumedSourceLines ?? []);
    for (const l of lines) next.add(l);
    survivor.consumedSourceLines = [...next].sort((a, b) => a - b);
  }

  // Merge target-prefixed store twins: group typed stores by lowercased
  // name; when a group has targeted stores and NO unprefixed store, the
  // desktop (`keymanonly`) body wins (first desktop wins; if no desktop,
  // the first web body wins). Losers are dropped and the survivor is
  // unprefixed. Groups that already have an unprefixed store are left
  // alone — that is a genuine duplicate in the source, which kmc errors
  // on today too.
  private mergeTargetedStores(): void {
    const byName = new Map<string, IRStore[]>();
    for (const s of this.stores) {
      const key = s.name.toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(s);
      byName.set(key, list);
    }
    for (const [, group] of byName) {
      const targeted = group.filter(
        (s) => s.targetSelector === "keymanweb" || s.targetSelector === "keymanonly",
      );
      if (targeted.length === 0) continue;
      if (group.some((s) => s.targetSelector === undefined)) continue;
      const desktop = targeted.find((s) => s.targetSelector === "keymanonly");
      const survivor = desktop ?? targeted[0]!;
      const survivorSrc = this.storeSourceText.get(survivor.nodeId);
      const survivorLine = survivorSrc?.text ?? `store(${survivor.isSystem ? "&" : ""}${survivor.name})`;
      this.recordRewrite(
        "target-selector",
        survivor.sourceLine ?? 0,
        `$${survivor.targetSelector}: ${survivorLine}`,
        survivorLine,
      );
      for (const loser of targeted) {
        if (loser === survivor) continue;
        const loserSrc = this.storeSourceText.get(loser.nodeId);
        const loserLine = loserSrc?.text ?? `store(${loser.isSystem ? "&" : ""}${loser.name})`;
        this.recordRewrite(
          "target-selector",
          loser.sourceLine ?? 0,
          `$${loser.targetSelector}: ${loserLine}`,
          `(dropped — store(${loser.name}) keeps the ${desktop !== undefined ? "desktop" : "first web"} body)`,
        );
        // The survivor consumes the loser's line: it has no node left to
        // own it, so a splice deletion of the survivor must remove it too.
        this.absorbDroppedLines(survivor, loser);
        const idx = this.stores.indexOf(loser);
        if (idx >= 0) this.stores.splice(idx, 1);
      }
      // The survivor is now unprefixed; for a system store the header
      // extraction must see the SURVIVOR's value (the loop's last-wins
      // sysStores entry may hold a dropped twin's value).
      delete survivor.targetSelector;
      if (survivor.isSystem && survivorSrc !== undefined) {
        this.sysStores[survivor.name] = survivorSrc.rawValue;
      }
    }
  }

  // &CasedKeys and &mnemonicLayout cannot coexist in one file (kmc
  // 0x50206b: "&CasedKeys system store is not supported with mnemonic
  // layouts"). The pair is legal only when target-separated ($keymanweb:
  // vs $keymanonly:), and the store merge unprefixes both into one file.
  // When the pair was target-separated in the source, keep the WEB store
  // and drop the desktop-only one (the ruling's compile-gate fallback:
  // never emit a file that fails to build), recording the loss. When both
  // were unprefixed (or same-target) in the source the conflict is
  // pre-existing — leave it alone.
  private resolveCasedKeysMnemonicConflict(): void {
    const cased = this.stores.find((s) => s.isSystem && s.name.toUpperCase() === "CASEDKEYS");
    const mnemonic = this.stores.find(
      (s) => s.isSystem && s.name.toUpperCase() === "MNEMONICLAYOUT",
    );
    if (cased === undefined || mnemonic === undefined) return;
    const casedSel = this.storeSourceText.get(cased.nodeId)?.selector;
    const mnemonicSel = this.storeSourceText.get(mnemonic.nodeId)?.selector;
    const separated =
      (casedSel === "keymanweb" && mnemonicSel === "keymanonly") ||
      (casedSel === "keymanonly" && mnemonicSel === "keymanweb");
    if (!separated) return;
    const keepWeb = casedSel === "keymanweb" ? cased : mnemonic;
    const dropDesktop = casedSel === "keymanweb" ? mnemonic : cased;
    const dropSrc = this.storeSourceText.get(dropDesktop.nodeId);
    const dropLine = dropSrc?.text ?? `store(&${dropDesktop.name})`;
    this.recordRewrite(
      "target-selector",
      dropDesktop.sourceLine ?? 0,
      `$keymanonly: ${dropLine}`,
      `(dropped — store(&${keepWeb.name}) and store(&${dropDesktop.name}) cannot coexist; the web &${keepWeb.name} store is kept so the file compiles; the desktop-only value needs review)`,
    );
    const idx = this.stores.indexOf(dropDesktop);
    if (idx >= 0) this.stores.splice(idx, 1);
    // The kept store consumes the dropped line (see absorbDroppedLines).
    this.absorbDroppedLines(keepWeb, dropDesktop);
    delete this.sysStores[dropDesktop.name];
  }

  // Merge target-prefixed match/nomatch twins, per group and kind: desktop
  // wins, web is dropped; a lone prefixed transition is kept unprefixed.
  // Groups that already have an unprefixed transition of the same kind are
  // left alone (genuine duplicate in the source).
  private mergeTargetedTransitions(): void {
    for (const group of this.groups) {
      for (const kind of ["match", "nomatch"] as const) {
        const targeted = group.rules.filter(
          (r) => r.matchKind === kind &&
            (r.targetSelector === "keymanweb" || r.targetSelector === "keymanonly"),
        );
        if (targeted.length === 0) continue;
        if (group.rules.some((r) => r.matchKind === kind && r.targetSelector === undefined)) {
          continue;
        }
        const desktop = targeted.find((r) => r.targetSelector === "keymanonly");
        const survivor = desktop ?? targeted[0]!;
        const rhs = survivor.output[0]?.kind === "raw" ? survivor.output[0].text : "";
        this.recordRewrite(
          "target-selector",
          survivor.sourceLine ?? 0,
          `$${survivor.targetSelector}: ${kind} > ${rhs}`,
          `${kind} > ${rhs}`,
        );
        for (const loser of targeted) {
          if (loser === survivor) continue;
          const loserRhs = loser.output[0]?.kind === "raw" ? loser.output[0].text : "";
          this.recordRewrite(
            "target-selector",
            loser.sourceLine ?? 0,
            `$${loser.targetSelector}: ${kind} > ${loserRhs}`,
            `(dropped — ${kind} keeps the ${desktop !== undefined ? "desktop" : "first web"} variant)`,
          );
          const idx = group.rules.indexOf(loser);
          if (idx >= 0) group.rules.splice(idx, 1);
          // The survivor consumes the loser's line: it has no node left to
          // own it, so a splice deletion of the survivor must remove it too.
          this.absorbDroppedLines(survivor, loser);
        }
        delete survivor.targetSelector;
      }
    }
  }

  // Finalise pending header statements: synthesise the matching system
  // store when no real store() declaration already provides the value
  // (a real store wins, either order — including an opaque fragment that
  // declares the name). LANGUAGE / LAYOUT / BITMAPS have no modern store
  // and are dropped, with the drop recorded.
  private finalizePendingHeaders(): void {
    for (const header of this.pendingHeaders) {
      if (header.storeName === null) {
        this.recordRewrite(
          "header-statement",
          header.line,
          header.sourceText,
          `(dropped — ${header.keyword} has no modern equivalent; metadata belongs in the .kps)`,
        );
        continue;
      }
      const name = header.storeName;
      const existingTyped = this.stores.find(
        (s) => s.isSystem && s.name.toUpperCase() === name,
      );
      const existingFrag = this.rawFragments.find((f) => fragmentDeclaresSystemStore(f, name));
      if (existingTyped !== undefined || existingFrag !== undefined) {
        this.recordRewrite(
          "header-statement",
          header.line,
          header.sourceText,
          `(dropped — store(&${name}) already declared; header value '${header.value}' not used)`,
        );
        // The dropped header line has no node of its own: the node that
        // already declares the value consumes it, so deleting that node
        // removes the header too instead of letting a re-parse
        // re-synthesise the store from the surviving header line.
        this.absorbDroppedLines(existingTyped ?? existingFrag!, { sourceLine: header.line });
        continue;
      }
      // Synthesise the system store. HOTKEY translates to the virtual-key
      // form when the old string form maps cleanly; anything else becomes
      // plain characters of the quoted value (the HOTKEY fallback keeps the
      // quoted string so the value survives, and the record says so).
      let items: StoreItem[];
      let rewrittenText: string;
      if (name === "HOTKEY") {
        const vkey = translateHotkey(header.value);
        if (vkey !== null) {
          items = [{ kind: "raw", text: vkey }];
          rewrittenText = `store(&HOTKEY) ${vkey}`;
        } else {
          items = [...header.value].map((ch) => ({ kind: "char" as const, value: ch }));
          rewrittenText = `store(&HOTKEY) '${header.value}' (kept as a quoted string — no virtual-key mapping for '${header.value}')`;
        }
      } else {
        items = [...header.value].map((ch) => ({ kind: "char" as const, value: ch }));
        const q = header.value.includes("'") ? '"' : "'";
        rewrittenText = `store(&${name}) ${q}${header.value}${q}`;
      }
      const store: IRStore = {
        nodeId: this.minter.mint("store"),
        name,
        items,
        isSystem: true,
        sourceLine: header.line,
      };
      this.stores.push(store);
      if (!(name in this.sysStores)) {
        this.sysStores[name] =
          name === "HOTKEY" && items[0]?.kind === "raw"
            ? (items[0].text ?? "")
            : `'${header.value}'`;
      }
      this.recordRewrite("header-statement", header.line, header.sourceText, rewrittenText);
    }
  }

  // Raise store(&version) to '9.0' when platform() guards were added and
  // the file declares an explicit version below 9.0 — guards need Keyman
  // 9.0+. A missing version is left alone (the compiler infers it).
  private raiseVersionForPlatformGuards(): void {
    if (!this.addedPlatformGuards) return;
    const versionStore = this.stores.find(
      (s) => s.isSystem && s.name.toUpperCase() === "VERSION",
    );
    if (versionStore === undefined) return;
    if (!versionStore.items.every((it) => it.kind === "char")) return;
    const text = versionStore.items
      .map((it) => (it.kind === "char" ? it.value : ""))
      .join("");
    const m = /^(\d+)(?:\.\d+)?/.exec(text);
    if (m === null) return;
    if (parseInt(m[1] ?? "0", 10) >= 9) return;
    versionStore.items = [..."9.0"].map((ch) => ({ kind: "char" as const, value: ch }));
    this.sysStores["VERSION"] = "'9.0'";
    this.recordRewrite(
      "version-raise",
      versionStore.sourceLine ?? 0,
      `store(&VERSION) '${text}'`,
      `store(&VERSION) '9.0' (raised — platform() guards need Keyman 9.0+)`,
    );
  }
}
