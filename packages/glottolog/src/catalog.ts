// Resolved-Languoid loader + catalog lookups (spec 036 US1, FR-007/008/009, D7).
//
// Reads the checked-in generated index, resolves compact LanguoidRecords into
// public Languoids (defaulting familyId to self, computing isPseudoFamily), and
// exposes the offline, synchronous, total catalog surface. Every function is
// total: unknown/empty inputs yield null/[], never exceptions.
//
// Lives in its own module (not index.ts) so relatedness.ts can consume the
// loader without a circular import; index.ts re-exports the public surface.

import { byIso, languoids } from "./generated/index.js";
import { PSEUDO_FAMILIES } from "./pseudo-families.js";
import type { Glottocode, Iso639P3, Languoid } from "./types.js";

/** Resolve a compact record into a public {@link Languoid}. `null` if absent. */
function resolve(glottocode: Glottocode): Languoid | null {
  const rec = languoids[glottocode];
  if (!rec) return null;
  // familyId defaults to self for a top-level family/isolate (data-model.md).
  const familyId = rec.familyId ?? glottocode;
  return {
    glottocode,
    name: rec.name,
    level: rec.level,
    ...(rec.iso639p3 !== undefined ? { iso639p3: rec.iso639p3 } : {}),
    ...(rec.parentId !== undefined ? { parentId: rec.parentId } : {}),
    familyId,
    isPseudoFamily: PSEUDO_FAMILIES.has(familyId),
  };
}

/** Resolve one languoid by Glottolog code; `null` when absent (FR-007). */
export function getLanguoid(glottocode: Glottocode): Languoid | null {
  return resolve(glottocode);
}

/**
 * Permissive ISO 639-3 → languoids (FR-008, D4). Case-insensitive input.
 * Returns all matching languoids, deduplicated by glottocode in deterministic
 * (glottocode-sorted) order; `[]` when the code maps to none.
 */
export function byIso639p3(iso: Iso639P3): Languoid[] {
  const codes = byIso[iso.toLowerCase()];
  if (!codes) return [];
  const out: Languoid[] = [];
  for (const gc of codes) {
    const l = resolve(gc);
    if (l) out.push(l);
  }
  return out;
}

/**
 * Root-first glottocodes of the classification path, excluding self (D7).
 * Reconstructs the path by walking the parentId chain. `[]` for a top-level
 * family/isolate or an unknown code. Internal — {@link ancestors} wraps it.
 */
export function ancestorCodes(glottocode: Glottocode): Glottocode[] {
  const rec = languoids[glottocode];
  if (!rec) return [];
  const chain: Glottocode[] = [];
  const seen = new Set<Glottocode>([glottocode]);
  let cur = rec.parentId;
  while (cur && !seen.has(cur)) {
    chain.push(cur);
    seen.add(cur);
    const next = languoids[cur];
    if (!next) break;
    cur = next.parentId;
  }
  return chain.reverse(); // leaf-first → root-first
}

/**
 * Root-first classification path as resolved languoids, excluding self
 * (FR-009, D7). `[]` for a top-level family/isolate or unknown code.
 */
export function ancestors(glottocode: Glottocode): Languoid[] {
  const out: Languoid[] = [];
  for (const gc of ancestorCodes(glottocode)) {
    const l = resolve(gc);
    if (l) out.push(l);
  }
  return out;
}

// Lazily-built family → members index for relatedness pre-filtering. Built once
// on first use; deterministic (each member list sorted by glottocode).
let familyIndex: Map<Glottocode, Glottocode[]> | null = null;

function getFamilyIndex(): Map<Glottocode, Glottocode[]> {
  if (familyIndex) return familyIndex;
  const m = new Map<Glottocode, Glottocode[]>();
  for (const gc of Object.keys(languoids)) {
    const rec = languoids[gc];
    if (!rec) continue;
    const fam = rec.familyId ?? gc;
    const arr = m.get(fam);
    if (arr) arr.push(gc);
    else m.set(fam, [gc]);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.localeCompare(b));
  familyIndex = m;
  return m;
}

/** Glottocodes sharing the given family root (sorted). Internal helper. */
export function familyMembers(familyId: Glottocode): Glottocode[] {
  return getFamilyIndex().get(familyId) ?? [];
}
