// kmc parity (spec 115 FR-023, SC-004): for every `.kps` `<Language ID>` in
// ../keyboards, compare kmc-package's
// `PackageValidation.checkForDuplicatedOrNonMinimalLanguages` with
// `isWellFormedBcp47` + `minimalTagOf`. Disagreements must equal the fixture
// list, each with a reason. Skips visibly without the corpus.
//
// The comparison is per keyboard: kmc checks one keyboard's language list at
// a time (and stops that list at the first invalid tag), so the studio side
// is computed per keyboard list too. Lexical models are out of scope: the
// studio's package carries keyboard languages. An empty language list is
// out of scope as well: kmc warns, the studio says nothing, and neither is
// a verdict about a tag.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isWellFormedBcp47 } from "@keyboard-studio/contracts";
import {
  PackageCompilerMessages,
  PackageValidation,
} from "@keymanapp/kmc-package";
import type { CompilerCallbacks, CompilerEvent } from "@keymanapp/developer-utils";
import { minimalTagOf } from "./minimalTag.ts";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);
const FIXTURE = JSON.parse(
  readFileSync(join(__dir, "kmcParity.fixture.json"), "utf-8"),
) as {
  disagreements: {
    key: string;
    file: string;
    keyboard: string;
    kind: string;
    tag: string;
    kmc: string;
    studio: string;
    reason: string;
  }[];
};

/** One keyboard's language list, as the `.kps` declares it. */
interface KeyboardLanguages {
  id: string;
  languages: string[];
}

function listCorpusKps(): string[] {
  if (!available) return [];
  const out: string[] = [];
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const shardDir = join(RELEASE_ROOT, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const id of readdirSync(shardDir)) {
      const f = join(shardDir, id, "source", `${id}.kps`);
      if (existsSync(f)) out.push(f);
    }
  }
  return out.sort();
}

/** The `.kps` Keyboard blocks, each with its declared Language IDs. */
function keyboardLanguageLists(kpsText: string, fallbackId: string): KeyboardLanguages[] {
  const lists: KeyboardLanguages[] = [];
  // Same ID extraction the engine's kps-parser uses (no XML parser here).
  const langRe = /<Language\b[^>]*\bID="([^"]+)"/g;
  const kbRe = /<Keyboard\b([^>]*)>([\s\S]*?)<\/Keyboard>/g;
  let kb: RegExpExecArray | null;
  while ((kb = kbRe.exec(kpsText)) !== null) {
    const body = kb[2] ?? "";
    const id = /<ID>([^<]+)<\/ID>/.exec(body)?.[1] ?? fallbackId;
    const languages: string[] = [];
    let lang: RegExpExecArray | null;
    langRe.lastIndex = 0;
    while ((lang = langRe.exec(kb[2] ?? "")) !== null) languages.push(lang[1]!);
    lists.push({ id, languages });
  }
  return lists;
}

/** What the studio says about one keyboard's list, as comparable records. */
function studioRecords(languages: string[]): { kind: string; tag: string; detail: string }[] {
  const out: { kind: string; tag: string; detail: string }[] = [];
  const seenMinimal = new Map<string, string>();
  for (const tag of languages) {
    if (!isWellFormedBcp47(tag)) {
      out.push({ kind: "invalid", tag, detail: "invalid" });
      continue;
    }
    const minimal = minimalTagOf(tag);
    if (minimal !== null && minimal !== tag) {
      out.push({ kind: "non-minimal", tag, detail: `non-minimal, should be ${minimal}` });
    }
    if (minimal !== null) {
      const key = minimal.toLowerCase();
      const first = seenMinimal.get(key);
      if (first !== undefined) {
        out.push({ kind: "duplicate", tag, detail: `duplicate of ${first} (${minimal})` });
      } else {
        seenMinimal.set(key, tag);
      }
    }
  }
  return out;
}

describe.skipIf(!available)("kmc parity — corpus sweep (../keyboards/release)", () => {
  it("every disagreement with kmc is listed in the fixture, with a reason", () => {
    const files = listCorpusKps();
    expect(files.length).toBeGreaterThan(0);
    let keyboards = 0;
    let tags = 0;
    let kmcFindings = 0;
    let studioFindings = 0;
    const computed: {
      key: string;
      file: string;
      keyboard: string;
      kind: string;
      tag: string;
      kmc: string;
      studio: string;
    }[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf-8");
      const short = file.slice(RELEASE_ROOT.length + 1);
      for (const list of keyboardLanguageLists(text, short)) {
        keyboards++;
        tags += list.languages.length;
        if (list.languages.length === 0) continue;
        const messages: CompilerEvent[] = [];
        const validation = new PackageValidation(
          {
            reportMessage: (e: CompilerEvent) => {
              messages.push(e);
            },
          } as unknown as CompilerCallbacks,
          {},
        );
        (
          validation as unknown as {
            checkForDuplicatedOrNonMinimalLanguages: (
              resourceType: string,
              id: string,
              languages: { id: string }[],
            ) => boolean;
          }
        ).checkForDuplicatedOrNonMinimalLanguages(
          "keyboard",
          list.id,
          list.languages.map((id) => ({ id })),
        );
        const kmc = messages.map((m) => {
          if (m.code === PackageCompilerMessages.ERROR_LanguageTagIsNotValid) {
            const tag = /Language tag '([^']+)' in .* is invalid\./.exec(m.message)?.[1] ?? "?";
            return { kind: "invalid", tag, detail: "invalid" };
          }
          if (m.code === PackageCompilerMessages.HINT_LanguageTagIsNotMinimal) {
            const match =
              /Language tag '([^']+)' in .* is not minimal, and should be '([^']+)'\./.exec(
                m.message,
              );
            return {
              kind: "non-minimal",
              tag: match?.[1] ?? "?",
              detail: `non-minimal, should be ${match?.[2] ?? "?"}`,
            };
          }
          if (m.code === PackageCompilerMessages.HINT_PackageShouldNotRepeatLanguages) {
            const match =
              /Two language tags in .*, '([^']+)' and '([^']+)', reduce to the same minimal tag '([^']+)'\./.exec(
                m.message,
              );
            return {
              kind: "duplicate",
              tag: match?.[1] ?? "?",
              detail: `duplicate of ${match?.[2] ?? "?"} (${match?.[3] ?? "?"})`,
            };
          }
          return { kind: "other", tag: "?", detail: m.message };
        });
        const studio = studioRecords(list.languages);
        kmcFindings += kmc.length;
        studioFindings += studio.length;
        // Compare as one record per (kind, tag) per keyboard, carrying BOTH
        // sides' verdicts ("none" when a side found nothing). A tag can
        // disagree in both directions at once — e.g. kmr-Arab: kmc says
        // "should be ku-IQ", the studio says "should be ku-Arab-TR" — so
        // keying a record per side would collide on the same key. Two
        // records for the same (kind, tag) with different details on one
        // side would silently collapse in a Map; fail loudly instead.
        const keyOf = (r: { kind: string; tag: string }) => `${r.kind}|${r.tag}`;
        const bySide = (
          side: { kind: string; tag: string; detail: string }[],
          label: string,
        ): Map<string, string> => {
          const m = new Map<string, string>();
          for (const r of side) {
            const k = keyOf(r);
            const prev = m.get(k);
            if (prev !== undefined && prev !== r.detail) {
              throw new Error(
                `same (${label}) finding ${k} with two details: ${prev} vs ${r.detail}`,
              );
            }
            m.set(k, r.detail);
          }
          return m;
        };
        const kmcByKey = bySide(kmc, "kmc");
        const studioByKey = bySide(studio, "studio");
        for (const key of new Set([...kmcByKey.keys(), ...studioByKey.keys()])) {
          const kmcDetail = kmcByKey.get(key) ?? "none";
          const studioDetail = studioByKey.get(key) ?? "none";
          if (kmcDetail !== studioDetail) {
            const [kind = "", tag = ""] = key.split("|");
            computed.push({
              key: `${short}|${list.id}|${kind}|${tag}`,
              file: short,
              keyboard: list.id,
              kind,
              tag,
              kmc: kmcDetail,
              studio: studioDetail,
            });
          }
        }
      }
    }
    console.log(
      `kmc parity: ${files.length} .kps files, ${keyboards} keyboards, ${tags} tags; ` +
        `kmc ${kmcFindings} findings, studio ${studioFindings} findings, ` +
        `${computed.length} disagreements.`,
    );
    const fixtureByKey = new Map(FIXTURE.disagreements.map((d) => [d.key, d]));
    const unexplained = computed.filter((c) => !fixtureByKey.has(c.key));
    const stale = FIXTURE.disagreements.filter(
      (d) => !computed.some((c) => c.key === d.key),
    );
    const changed = computed.filter((c) => {
      const f = fixtureByKey.get(c.key);
      return f !== undefined && (f.kmc !== c.kmc || f.studio !== c.studio);
    });
    expect(
      { unexplained, stale, changed },
      "disagreements must equal the fixture (see kmcParity.fixture.json)",
    ).toEqual({ unexplained: [], stale: [], changed: [] });
  });
});
