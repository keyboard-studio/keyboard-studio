/**
 * Spec 104 T021 — corpus regression gate: resolver ⇔ consumer equivalence.
 *
 * FR-003's whole wager is that contracts' production resolver is the ONE
 * production model: coverage, the dead-key scan, and removal enumeration
 * all take their verdicts from it, and none keeps a second model standing.
 * Unit tests pin that on fixtures; this gate pins it on the corpus. For
 * every corpus keyboard with a touch layout it asserts, per keyboard:
 *
 *   Arm 1 — DEAD-KEY agreement (zero tolerance). The set of ids
 *     `findDeadTouchKeys` reports dead equals the set of ids the resolver
 *     itself reports dead (source "none", no rule refs) over the same
 *     candidate scope, gathered with diagnostics' own exported predicates.
 *
 *   Arm 2 — COVERAGE loses no production. Every character the resolver
 *     says a key produces (coverage's crediting shape: rule entries per
 *     codepoint, decode/fallback entries as whole units) is credited by
 *     `computeTouchCoverage` on its resolver path. The one justified
 *     exception class is COV-UNREACHABLE-LAYER (below).
 *
 *   Arm 3 — ENUMERATION agreement (zero tolerance). For every produced
 *     single-codepoint character, `enumerateTouchMethodsForChar` (with
 *     resolver production) returns exactly the address set the resolver
 *     produces that character at, addressed with enumeration's own
 *     address builders. This is also the "vice versa" flip direction: a
 *     ruled T_ producer legacy matching could not see MUST be enumerable
 *     now — arm 3 fails if it is not.
 *
 *   Arm 4 — THE FLIP POPULATION, enumerated. An id in the dead-key
 *     candidate scope that the resolver reports dead while it carries
 *     keycap text "flips": pre-104 text-based readings called it
 *     producing; it is in fact dead, and it is exactly the FR-009 (P9)
 *     repair population (research.md §2: the rule-free basic_* T_<HEX>
 *     pairs). Flips are classified by predicate and enumerated per
 *     keyboard — never silently absorbed.
 *
 * ## Delta classes (the ONLY tolerated divergences)
 *
 *   COV-UNREACHABLE-LAYER — a produced character is not credited by
 *     coverage because EVERY occurrence producing it sits on a layer no
 *     nextlayer chain reaches from "default" (per platform). Coverage's
 *     reachability scope is its documented design (it walks reachable
 *     layers only); the resolver is per-occurrence and layer-agnostic
 *     (FR-001). Verified instance: akan — its layout carries no
 *     nextlayer keys at all, so its tablet/shift layer is unreachable
 *     in-layout and its 47 shift-only productions are uncredited.
 *
 *   FLIP-DEAD-TEXT — arm 4's population: T_ id, resolver-dead, keycap
 *     text present. Justification: the keycap is a label, not a
 *     production (research.md §1: rule-free T_ is dead — proven by tap
 *     simulation); the flip is the repair list's input, not a consumer
 *     disagreement.
 *
 * ## Pinning policy
 *
 * Arms 1 and 3 are zero-tolerance on every keyboard, verified or not:
 * both sides derive from the same resolver, so a divergence anywhere is
 * drift, not corpus character. Arms 2 and 4 excuse only predicate-
 * classified instances; for the keyboards in PINNED_DELTAS the excused
 * sets are ALSO pinned exactly (ids / counts), so drift on a verified
 * keyboard fails. Keyboards not yet in PINNED_DELTAS (this gate was
 * developed against the partial local checkout — 13 of the corpus'
 * 962 touch layouts) have their classified deltas enumerated in the
 * run output without failing; extend PINNED_DELTAS deliberately from
 * the first full-corpus run's output, the same bootstrap the repo's
 * other corpus canaries used. Unclassified divergences fail everywhere.
 *
 * Nightly-class: this file matches the engine corpus-sweep pattern
 * (`*.corpus.test.ts`), so it runs in the path-gated corpus step of
 * ci.yml and therefore in the nightly dev soak — not in the per-PR fast
 * lane. Local run:
 *
 *   pnpm --filter @keyboard-studio/engine exec vitest run \
 *     --config vitest.corpus.config.ts touchProductionEquivalence
 *
 * Corpus absent ⇒ skipped, per the repo convention (carveViaSplice).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTouchKeyRuleIndex,
  computeTouchCoverage,
  findDeadTouchKeys,
  isCustomTouchKeyId,
  isEmulationKeyId,
  isFrameKeyLabel,
  isProducingKeyClass,
  isRulelessByConvention,
  isSpacerKeyClass,
  normalizeTouchKeyId,
  parseTouchLayoutString,
  resolveTouchProduction,
  touchKeyStateFromLayerId,
  walkTouchKeysDeep,
} from "@keyboard-studio/contracts";
import type {
  KeyboardIR,
  TouchKeyIR,
  TouchKeyProduction,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { enumerateTouchMethodsForChar } from "./enumerateTouchMethodsForChar.js";
import { productionMatchesRemovalSet } from "./touch-mechanism-shared.js";
import {
  touchFlickAddress,
  touchKeyAddress,
  touchSubKeyAddress,
} from "./touchKeyAddress.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);

/** Per-keyboard pins for the delta arms, verified on the local checkout. */
const PINNED_DELTAS: Readonly<
  Record<string, { flips: readonly string[]; coverageUnreachableUnits: number }>
> = {
  // The basic_* template family: the same rule-free T_ keys with keycap
  // text on every template (research.md §2's P9 population). This pin
  // originally listed only four ids (T_002C/T_002E/T_003A/T_FCFA): the
  // candidate scope's blanket `nextlayer` skip hid every id whose only
  // occurrences carry the symbol layer's post-output layer return — the
  // digits T_0030–T_0039 and T_0021/T_003B/T_003F — although the
  // resolver reported those keys dead (`source: "none"`) all along and
  // FR-009 names the whole family as the repair population. With the
  // scope corrected (FR-006), the pin is the full seventeen.
  basic_kbdfr: { flips: ["T_0021", "T_002C", "T_002E", "T_0030", "T_0031", "T_0032", "T_0033", "T_0034", "T_0035", "T_0036", "T_0037", "T_0038", "T_0039", "T_003A", "T_003B", "T_003F", "T_FCFA"], coverageUnreachableUnits: 0 },
  basic_kbdgr: { flips: ["T_0021", "T_002C", "T_002E", "T_0030", "T_0031", "T_0032", "T_0033", "T_0034", "T_0035", "T_0036", "T_0037", "T_0038", "T_0039", "T_003A", "T_003B", "T_003F", "T_FCFA"], coverageUnreachableUnits: 0 },
  basic_kbduk: { flips: ["T_0021", "T_002C", "T_002E", "T_0030", "T_0031", "T_0032", "T_0033", "T_0034", "T_0035", "T_0036", "T_0037", "T_0038", "T_0039", "T_003A", "T_003B", "T_003F", "T_FCFA"], coverageUnreachableUnits: 0 },
  basic_kbdus: { flips: ["T_0021", "T_002C", "T_002E", "T_0030", "T_0031", "T_0032", "T_0033", "T_0034", "T_0035", "T_0036", "T_0037", "T_0038", "T_0039", "T_003A", "T_003B", "T_003F", "T_FCFA"], coverageUnreachableUnits: 0 },
  basic_kbdusx: { flips: ["T_0021", "T_002C", "T_002E", "T_0030", "T_0031", "T_0032", "T_0033", "T_0034", "T_0035", "T_0036", "T_0037", "T_0038", "T_0039", "T_003A", "T_003B", "T_003F", "T_FCFA"], coverageUnreachableUnits: 0 },
  // akan: no nextlayer keys anywhere ⇒ tablet/shift unreachable ⇒ its
  // 47 shift-only productions are coverage-uncredited (class above).
  akan: { flips: [], coverageUnreachableUnits: 47 },
  arabic_izza: { flips: [], coverageUnreachableUnits: 0 },
  bambara: { flips: [], coverageUnreachableUnits: 0 },
  nias: { flips: [], coverageUnreachableUnits: 0 },
  sil_cameroon_azerty: { flips: [], coverageUnreachableUnits: 0 },
  sil_cameroon_qwerty: { flips: [], coverageUnreachableUnits: 0 },
  sil_euro_latin: { flips: [], coverageUnreachableUnits: 0 },
  sil_ipa: { flips: [], coverageUnreachableUnits: 0 },
};

interface CorpusKeyboard {
  readonly id: string;
  readonly kmnPath: string;
  readonly layoutPath: string;
}

function discoverKeyboards(): CorpusKeyboard[] {
  if (!available) return [];
  const out: CorpusKeyboard[] = [];
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const shardDir = join(RELEASE_ROOT, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const id of readdirSync(shardDir)) {
      const sourceDir = join(shardDir, id, "source");
      if (!existsSync(sourceDir)) continue;
      for (const f of readdirSync(sourceDir)) {
        if (!f.endsWith(".kmn")) continue;
        const layoutPath = join(sourceDir, `${basename(f, ".kmn")}.keyman-touch-layout`);
        if (existsSync(layoutPath)) {
          out.push({ id: basename(f, ".kmn"), kmnPath: join(sourceDir, f), layoutPath });
        }
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Occurrence traversal — mirrors enumerateTouchMethodsForChar's own walk
// (platform → layer → row → key, then sk / multitap / flick), so arm 3
// compares the consumer's walk against the resolver's verdicts, addressed
// with the consumer's own address builders.
// ---------------------------------------------------------------------------

interface Occurrence {
  readonly platformId: string;
  readonly layerId: string;
  readonly key: TouchKeyIR;
  readonly address: string;
}

function allOccurrences(layout: TouchLayoutIR): Occurrence[] {
  const out: Occurrence[] = [];
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          out.push({
            platformId: platform.id,
            layerId: layer.id,
            key,
            address: touchKeyAddress(platform.id, layer.id, key.id),
          });
          for (const sub of key.sk ?? []) {
            out.push({
              platformId: platform.id,
              layerId: layer.id,
              key: sub,
              address: touchSubKeyAddress(platform.id, layer.id, key.id, "sk", sub.id),
            });
          }
          for (const sub of key.multitap ?? []) {
            out.push({
              platformId: platform.id,
              layerId: layer.id,
              key: sub,
              address: touchSubKeyAddress(platform.id, layer.id, key.id, "multitap", sub.id),
            });
          }
          if (key.flick) {
            for (const [direction, sub] of Object.entries(key.flick)) {
              if (!sub) continue;
              out.push({
                platformId: platform.id,
                layerId: layer.id,
                key: sub,
                address: touchFlickAddress(
                  platform.id,
                  layer.id,
                  key.id,
                  direction as keyof NonNullable<TouchKeyIR["flick"]>,
                ),
              });
            }
          }
        }
      }
    }
  }
  return out;
}

/** Coverage's documented reachability: "default" + nextlayer chains, per platform. */
function reachableLayers(layout: TouchLayoutIR): Map<string, ReadonlySet<string>> {
  const per = new Map<string, ReadonlySet<string>>();
  for (const platform of layout.platforms) {
    const byId = new Map(platform.layers.map((l) => [l.id, l] as const));
    const reach = new Set<string>();
    const queue: string[] = [];
    if (byId.has("default")) {
      reach.add("default");
      queue.push("default");
    }
    while (queue.length > 0) {
      const layer = byId.get(queue.shift()!);
      if (!layer) continue;
      const next = new Set<string>();
      const collect = (key: TouchKeyIR): void => {
        if (key.nextlayer) next.add(key.nextlayer);
        for (const s of key.sk ?? []) collect(s);
        for (const s of key.multitap ?? []) collect(s);
        if (key.flick) for (const s of Object.values(key.flick)) if (s) collect(s);
      };
      for (const row of layer.rows) for (const key of row.keys) collect(key);
      for (const n of next) {
        if (!reach.has(n) && byId.has(n)) {
          reach.add(n);
          queue.push(n);
        }
      }
    }
    per.set(platform.id, reach);
  }
  return per;
}

/** The crediting shape coverage itself uses for a resolver record (T025). */
function creditedUnits(record: TouchKeyProduction): string[] {
  const units: string[] = [];
  for (const entry of record.productions) {
    if (entry.output.kind !== "text") continue;
    if (entry.viaFallback === true || record.source !== "rule") {
      units.push(entry.output.text.normalize("NFC"));
    } else {
      for (const ch of entry.output.text) units.push(ch.normalize("NFC"));
    }
  }
  return units;
}

const keyboards = discoverKeyboards();

describe.skipIf(!available)("spec 104 T021 — corpus resolver⇔consumer equivalence gate", () => {
  it("discovers a non-empty corpus (a gate that sweeps nothing must not pass)", () => {
    expect(keyboards.length).toBeGreaterThan(0);
  });

  for (const kb of keyboards) {
    it(
      `${kb.id}: consumers agree with the resolver`,
      () => {
        const failures: string[] = [];
        const ir: KeyboardIR = parse(readFileSync(kb.kmnPath, "utf8"), kb.id).ir;
        const layout: TouchLayoutIR = parseTouchLayoutString(readFileSync(kb.layoutPath, "utf8"));
        const ruleIndex = buildTouchKeyRuleIndex(ir);
        const inputs = { ir, ruleIndex };

        const occurrences = allOccurrences(layout);
        const records = occurrences.map((o) =>
          resolveTouchProduction(inputs, o.key, touchKeyStateFromLayerId(o.layerId)),
        );

        // ---- Arm 1: dead-key agreement (zero tolerance) ----
        const diagDead = new Set(
          findDeadTouchKeys({ ir, layout, ruleIndex }).map((f) =>
            String(normalizeTouchKeyId(String(f.fields.keyId))),
          ),
        );
        // Resolver side: diagnostics' own candidate scope and dead test
        // (T006), gathered with its exported predicates over the deep walk.
        const candidates = new Map<string, TouchKeyProduction[]>();
        const candidateTexts = new Map<string, boolean>();
        walkTouchKeysDeep(layout, ({ layer, key }) => {
          if (!isCustomTouchKeyId(key.id)) return;
          // No `nextlayer` gate: the scope mirrors findDeadTouchKeys'
          // candidate gates as they now stand (spec 104 FR-006 — a
          // producing key's layer return is a property, not an
          // exemption; the pre-fix scope here carried the same blanket
          // skip and the two sides agreed on the wrong population).
          if (!isProducingKeyClass(key.sp)) return;
          if (isSpacerKeyClass(key.sp)) return;
          if (isFrameKeyLabel(key.text)) return;
          if (isRulelessByConvention(key.id)) return;
          const norm = String(normalizeTouchKeyId(key.id));
          const record = resolveTouchProduction(inputs, key, touchKeyStateFromLayerId(layer.id));
          const list = candidates.get(norm) ?? [];
          list.push(record);
          candidates.set(norm, list);
          candidateTexts.set(norm, (candidateTexts.get(norm) ?? false) || (key.text ?? "").length > 0);
        });
        const resolverDead = new Set<string>();
        for (const [norm, recs] of candidates) {
          if (recs.every((r) => r.source === "none" && r.ruleRefs.length === 0)) {
            resolverDead.add(norm);
          }
        }
        for (const id of diagDead) {
          if (!resolverDead.has(id)) {
            failures.push(`arm1: diagnostics reports ${id} dead but the resolver does not`);
          }
        }
        for (const id of resolverDead) {
          if (!diagDead.has(id)) {
            failures.push(`arm1: resolver reports ${id} dead but diagnostics does not`);
          }
        }

        // ---- Arm 4: the flip population, enumerated ----
        const flips = [...resolverDead]
          .filter((id) => id.startsWith("T_") && candidateTexts.get(id) === true)
          .sort();

        // ---- Arm 2: coverage loses no production ----
        const reach = reachableLayers(layout);
        const produced = new Map<string, { reachable: boolean }>();
        occurrences.forEach((o, i) => {
          const onReachable = reach.get(o.platformId)?.has(o.layerId) ?? false;
          for (const unit of creditedUnits(records[i]!)) {
            const slot = produced.get(unit) ?? { reachable: false };
            slot.reachable = slot.reachable || onReachable;
            produced.set(unit, slot);
          }
        });
        const inventory = [...produced.keys()];
        const uncovered = computeTouchCoverage(layout, inventory, { ir, ruleIndex }).uncovered;
        let coverageUnreachableUnits = 0;
        for (const unit of uncovered) {
          if (produced.get(unit)?.reachable === false) {
            coverageUnreachableUnits++; // COV-UNREACHABLE-LAYER, classified
          } else {
            failures.push(
              `arm2: coverage does not credit resolver-produced ${JSON.stringify(unit)} (produced on a reachable layer)`,
            );
          }
        }

        // ---- Arm 3: enumeration agreement (zero tolerance) ----
        const chars = new Set<string>();
        for (const record of records) {
          for (const unit of creditedUnits(record)) {
            if ([...unit].length === 1) chars.add(unit);
          }
        }
        for (const ch of chars) {
          const expected = new Set<string>();
          occurrences.forEach((o, i) => {
            // Enumeration never offers an emulation-class key (K_BKSP,
            // K_ENTER, K_TAB, …): candidateMatchesViaProduction refuses
            // them, since a context rule on one rewrites text rather than
            // typing a character.
            if (isEmulationKeyId(o.key.id)) return;
            if (productionMatchesRemovalSet(records[i]!, new Set([ch]))) expected.add(o.address);
          });
          const actual = new Set(
            enumerateTouchMethodsForChar(layout, ch, { production: inputs }).map((d) => d.id),
          );
          for (const a of expected) {
            if (!actual.has(a)) failures.push(`arm3: ${JSON.stringify(ch)} produced at ${a} but not enumerated`);
          }
          for (const a of actual) {
            if (!expected.has(a)) failures.push(`arm3: ${JSON.stringify(ch)} enumerated at ${a} but the resolver does not produce it there`);
          }
        }

        // ---- Delta pins for verified keyboards ----
        const pin = PINNED_DELTAS[kb.id];
        if (pin !== undefined) {
          expect(flips, `${kb.id}: flip population drifted`).toEqual([...pin.flips]);
          expect(
            coverageUnreachableUnits,
            `${kb.id}: COV-UNREACHABLE-LAYER count drifted`,
          ).toBe(pin.coverageUnreachableUnits);
        } else if (flips.length > 0 || coverageUnreachableUnits > 0) {
          // Unverified keyboard: enumerated, not failed — see the header's
          // pinning policy. (Printed so the first full-corpus run's output
          // IS the enumeration to pin from.)
          console.log(
            `T021 delta enumeration (unpinned) ${kb.id}: flips=${JSON.stringify(flips)} coverageUnreachableUnits=${coverageUnreachableUnits}`,
          );
        }

        expect(failures, failures.join("\n")).toEqual([]);
      },
      240_000,
    );
  }
});
