/**
 * #2633 corpus round-trip: for a sample of release/ keyboards that use
 * Keyman 19-deprecated forms, parse → emit rewrites them to the modern
 * equivalent, records each rewrite, and parse → emit → parse is stable.
 *
 * Invariants per keyboard:
 *   - every deprecated form in the source is rewritten or, for the
 *     documented non-rewritable cases, recorded as an escalation
 *     (opaque prefixed lines keep their prefix in the fragment text —
 *     D9 fidelity — and the emitted `$keyman*:` lines are exactly the
 *     escalation rewrites, no more);
 *   - bu_phonetic's `d151` values in its `begin ANSI` section are the one
 *     legacy-format exception: code-page bytes, kept raw and escalated;
 *   - the second parse records no NEW rewrites (only the same escalations
 *     re-recorded) and the emitted text is byte-stable.
 *
 * Root convention mirrors named-deadkey.corpus.test.ts: env
 * KS_KEYBOARDS_FULL when set (fail — never skip — when set but missing),
 * else the sibling `keyboards-full` checkout.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import type { DeprecatedRewrite, DeprecatedRewriteKind } from "@keyboard-studio/contracts";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dir, "../../../../../keyboards-full");
const ROOT = process.env.KS_KEYBOARDS_FULL ?? DEFAULT_ROOT;
const rootExists = fs.existsSync(path.join(ROOT, "release"));

if (process.env.KS_KEYBOARDS_FULL !== undefined && !rootExists) {
  throw new Error(
    `KS_KEYBOARDS_FULL=${ROOT} does not contain a release/ tree — the #2633 corpus gate must not skip silently`,
  );
}
if (!rootExists) {
  console.warn(
    `[WARN] full keyboards corpus not found at ${ROOT}; skipping the #2633 deprecated-forms corpus gate`,
  );
}

interface Sample {
  /** Path relative to the corpus root. */
  rel: string;
  /** Rewrite kinds the sample must record at least one of. */
  expectKinds: DeprecatedRewriteKind[];
  /**
   * When set, the second parse is EXPECTED to decode exactly these legacy
   * tokens (as a multiset of sourceTexts) instead of recording no new
   * rewrites, and emit-stability is not asserted. That is the documented
   * multi-begin loss: the source has a second `begin ANSI` directive, the
   * codec models only the first begin, so the emitted file has no ANSI
   * marker and a re-parse decodes the escalated tokens numerically. The
   * first-parse escalation (the actual import path) is still correct.
   */
  expectSecondParseDecodes?: string[];
}

const SAMPLES: Sample[] = [
  // Header statements.
  { rel: "release/sil/sil_hebr_grek_trans/source/sil_hebr_grek_trans.kmn", expectKinds: ["header-statement"] },
  { rel: "release/sil/sil_uganda_tanzania/source/sil_uganda_tanzania.kmn", expectKinds: ["header-statement"] },
  { rel: "release/sil/sil_extended_urdu_np/source/sil_extended_urdu_np.kmn", expectKinds: ["header-statement"] },
  // Target-selector prefixes.
  { rel: "release/gff/gff_amh_7/source/gff_amh_7.kmn", expectKinds: ["target-selector"] },
  { rel: "release/sil/sil_euro_latin/source/sil_euro_latin.kmn", expectKinds: ["target-selector"] },
  { rel: "release/itrans/itrans_devanagari_hindi/source/itrans_devanagari_hindi.kmn", expectKinds: ["target-selector"] },
  { rel: "release/sil/sil_ipa/source/sil_ipa.kmn", expectKinds: ["target-selector"] },
  { rel: "release/e/eo_plus/source/eo_plus.kmn", expectKinds: ["target-selector"] },
  { rel: "release/k/korean_rr/source/korean_rr.kmn", expectKinds: ["target-selector"] },
  { rel: "release/o/old_hungarian/source/old_hungarian.kmn", expectKinds: ["target-selector"] },
  { rel: "release/o/old_hungarian_carpathian_highlands/source/old_hungarian_carpathian_highlands.kmn", expectKinds: ["target-selector"] },
  // Legacy value formats.
  { rel: "release/a/akha_lahu/source/akha_lahu.kmn", expectKinds: ["legacy-value-format"] },
  // sil_hebrew's d### mentions live only in comments — it records NO
  // rewrites, and proves comment text is left alone.
  { rel: "release/sil/sil_hebrew/source/sil_hebrew.kmn", expectKinds: [] },
  { rel: "release/sil/sil_greek_polytonic/source/sil_greek_polytonic.kmn", expectKinds: ["legacy-value-format"] },
  // ANSI escalation: bu_phonetic's only legacy tokens are d150/d151 in its
  // begin ANSI section — code-page bytes, kept raw and escalated. Its second
  // begin (`begin ANSI > use(main-A)`) is lost on emit (the codec models
  // only the first begin), so a re-parse decodes the five escalated tokens
  // numerically — a documented multi-begin limitation, not a rewrite miss.
  {
    rel: "release/b/bu_phonetic/source/bu_phonetic.kmn",
    expectKinds: ["legacy-value-format"],
    expectSecondParseDecodes: ["d150", "d150", "d151", "d151", "d151"],
  },
];

/** Lines of `text` that still carry a `$keyman*:` prefix. */
function prefixedLines(text: string): string[] {
  return text.split("\n").filter((line) => /^\$keyman(?:web|only)?:/.test(line));
}

/** Header-statement lines remaining in `text`. */
function headerLines(text: string): string[] {
  return text
    .split("\n")
    .filter((line) =>
      /^(NAME|VERSION|COPYRIGHT|HOTKEY|BITMAP|BITMAPS|LANGUAGE|LAYOUT|MESSAGE)\s/.test(line),
    );
}

/**
 * Legacy-format tokens in CODE positions of `text` — comments are not code:
 * full-line `c ...` lines are skipped and trailing ` c ...` comments are
 * stripped first, so a comment word such as `xe` or `d203` is never mistaken
 * for a legacy value (sil_ipa's and sil_hebrew's `d###` mentions live only
 * in comments). Counts tokens, not lines — one line can hold several.
 */
function legacyTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*c\s/.test(line)) continue;
    const code = line.replace(/\s+c\s.*$/, "");
    for (const tok of code.split(/\s+/)) {
      if (/^(?:d\d{1,3}|x[0-9a-fA-F]{1,4}|\d{1,3})$/.test(tok)) tokens.push(tok);
    }
  }
  return tokens;
}

/** True when the rewrite is a deliberate non-rewrite (kept as-is). */
function isEscalation(rw: DeprecatedRewrite): boolean {
  return rw.rewrittenText.startsWith("(kept as-is") || rw.rewrittenText.includes("code-page");
}

function rewriteKey(rw: DeprecatedRewrite): string {
  return `${rw.kind}|${rw.sourceText}|${rw.rewrittenText}`;
}

(rootExists ? describe : describe.skip)("deprecated-forms corpus round-trip (#2633)", () => {
  for (const sample of SAMPLES) {
    it(`${sample.rel} — rewrites recorded, no deprecated forms left except escalations`, () => {
      const src = fs.readFileSync(path.join(ROOT, sample.rel), "utf8");
      const first = parse(src, "kb-2633");
      const emitted = emit(first.ir);

      // Expected kinds were recorded.
      for (const kind of sample.expectKinds) {
        expect(
          first.rewrites.filter((r) => r.kind === kind),
          `${sample.rel}: expected at least one ${kind} rewrite`,
        ).not.toHaveLength(0);
      }

      // No header statements survive in the emitted text.
      expect(headerLines(emitted)).toEqual([]);

      // Every prefixed line left in the emitted text is exactly one
      // escalation rewrite (an opaque line kept verbatim, D9 fidelity) —
      // no silent pass-through, no unrecorded prefix.
      const remaining = prefixedLines(emitted);
      const escalations = first.rewrites.filter(
        (r) => r.kind === "target-selector" && isEscalation(r),
      );
      expect(remaining).toHaveLength(escalations.length);
      for (const line of remaining) {
        expect(
          escalations.some((rw) => rw.sourceText === line),
          `${sample.rel}: emitted prefix line has no escalation record: ${line}`,
        ).toBe(true);
      }

      // bu_phonetic: the d151 escalations are the only legacy tokens left
      // in code positions (comment mentions do not count — see legacyTokens).
      // Legacy tokens inside opaque fragments are preserved verbatim (D9
      // fidelity) with no rewrite record — the fragment itself is the record
      // (opaque inventory), not a rewrite — so they are counted from the
      // fragment texts, not the escalation records.
      const tokensLeft = legacyTokens(emitted);
      const legacyEscalations = first.rewrites.filter(
        (r) => r.kind === "legacy-value-format" && isEscalation(r),
      );
      const fragmentTokens = first.ir.raw.flatMap((f) => legacyTokens(f.sourceText));
      expect(tokensLeft.sort()).toEqual(
        [...legacyEscalations.map((r) => r.sourceText), ...fragmentTokens].sort(),
      );

      // Second parse: no NEW rewrites (only the same escalations
      // re-recorded) and byte-stable emit — except for the documented
      // multi-begin loss (see Sample.expectSecondParseDecodes), where the
      // re-parse decodes exactly the escalated tokens and emit-stability
      // does not hold.
      const second = parse(emitted, "kb-2633");
      const firstEscalations = new Set(first.rewrites.filter(isEscalation).map(rewriteKey));
      const secondNew = second.rewrites.filter((rw) => !firstEscalations.has(rewriteKey(rw)));
      if (sample.expectSecondParseDecodes !== undefined) {
        expect(secondNew.map((rw) => rw.sourceText).sort()).toEqual(
          [...sample.expectSecondParseDecodes].sort(),
        );
        expect(
          secondNew.every(
            (rw) => rw.kind === "legacy-value-format" && !isEscalation(rw),
          ),
        ).toBe(true);
      } else {
        expect(secondNew).toEqual([]);
        expect(emit(second.ir)).toBe(emitted);
      }
    });
  }
});
