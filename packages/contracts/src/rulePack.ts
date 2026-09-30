// Rule pack contract — spec 082 Track B (rule builder), FR-005..FR-010.
//
// A RulePack is a curated, script-keyed set of Behaviour records plus canned
// demo pairs and a provenance bundle. Packs are Behaviour records, NEVER raw
// `.kmn` snippets (FR-005): every behaviour carries structured `parameters`
// (plain data) alongside the compiled KMN rule texts kept for auditability.
//
// `ownedByBehaviour` now exists on the KeyboardIR (`IRRule` / `IRStore` in
// keyboard-ir.ts, stamped by rule-pack install per 082 FR-015); this module
// still defines the pack's behaviour records as their own versioned JSON
// schema because the pack is the portable artifact, not the IR. The kind set
// is CLOSED — no new kinds may be added without a spec amendment.
//
// Versioning: `packVersion` is a literal. Bump it (and add a migration) when
// the schema changes incompatibly; readers reject unknown versions loudly.

import { z } from "zod";
import type { AssignableTo, DeepStripUndefined, Expect } from "./utils/schemaGuards";

/** Current pack schema version. Packs carrying any other version are rejected. */
export const PACK_VERSION = "1.0" as const;

/**
 * Closed set of behaviour kinds (spec 076's 7 kinds + `authored`).
 * The set is closed: `RulePackSchema` rejects any other kind string.
 */
export const BehaviourKinds = [
  "swallowUndefined",
  "markOnNonBase",
  "block",
  "replace",
  "canonicalOrder",
  "reorderTable",
  "contextOutput",
  "authored",
] as const;

export const BehaviourKindSchema = z.enum(BehaviourKinds);

export type BehaviourKind = z.infer<typeof BehaviourKindSchema>;

/**
 * A canned before/after demo pair (spec 082 FR-007, FR-010). Recorded in the
 * Track A demo pane; the pack gallery must run every pair green before the
 * pack's "accept" enables.
 */
export interface DemoPair {
  /**
   * Human description of the typed input, e.g. "type `5`, then press the
   * grave-accent key (K_QUOTE)". A description, not keystroke codes — the
   * pair must stay legible to a non-programmer.
   */
  input: string;
  /** The expected stored output after the input (code points as text). */
  expectedOutput: string;
  /** Optional author note, e.g. the host-layout condition the pair assumes. */
  note?: string;
  /**
   * True when the pair was recorded from the Track A demo pane — recording
   * implies the demo ran green, so the pair is proven. Manually added pairs
   * carry false (or omit the flag). Optional for backwards compatibility
   * with "1.0" packs exported before the flag existed; absent means
   * unverified.
   */
  verified?: boolean;
}

export const DemoPairSchema = z.object({
  input: z.string().min(1, "demo pair input description must not be empty"),
  expectedOutput: z.string().min(1, "demo pair expected output must not be empty"),
  note: z.string().optional(),
  verified: z.boolean().optional(),
});

/**
 * Per-idiom provenance (spec 082 FR-006): source keyboard id(s),
 * author/copyright line, license pointer, and corpus commit. Wired to the
 * facet index's `license-fork-eligibility` at install time. Packs without
 * complete provenance are spec violations and fail validation.
 */
export interface BehaviourProvenance {
  /** Keyboard id the behaviour was curated from, e.g. "sil_cameroon_qwerty". */
  sourceKeyboardId: string;
  /** Human keyboard name, e.g. "Cameroon QWERTY" (the `&NAME` store). */
  sourceKeyboardName: string;
  /** Copyright line, e.g. "© SIL Cameroon" (the `&COPYRIGHT` store). */
  copyright: string;
  /**
   * License pointer, e.g. "MIT". When the license cannot be confirmed from
   * the source, say so explicitly in the string (never silently claim one).
   */
  license: string;
  /**
   * Corpus commit the source was taken from. Entered manually in this build;
   * optional so a pack can be drafted before the commit is known.
   */
  corpusCommit?: string;
  /** Source keyboard version when known (the `&KEYBOARDVERSION` store). */
  sourceKeyboardVersion?: string;
}

export const BehaviourProvenanceSchema = z.object({
  sourceKeyboardId: z.string().min(1, "provenance.sourceKeyboardId is required (FR-006)"),
  sourceKeyboardName: z.string().min(1, "provenance.sourceKeyboardName is required (FR-006)"),
  copyright: z.string().min(1, "provenance.copyright is required (FR-006)"),
  license: z.string().min(1, "provenance.license is required (FR-006)"),
  corpusCommit: z.string().optional(),
  sourceKeyboardVersion: z.string().optional(),
});

/**
 * Parameter keys that are never structured data — a pack whose parameters
 * are only a raw KMN snippet under one of these keys is a spec violation
 * (FR-005) and fails validation. The check is case-insensitive.
 */
const RAW_KMN_PARAMETER_KEYS = new Set([
  "kmn",
  "kmntext",
  "rawkmn",
  "rawtext",
  "snippet",
  "kmnsnippet",
]);

/**
 * Reserved parameter keys written by family-aware exporters (spec 082
 * FR-018): when a pack is built from family-level rule selection (see the
 * rule builder's `families` prop), the source rule family's id and name are
 * recorded here so the pack round-trips the grouping. Ordinary packs omit
 * them. This is an additive, optional convention only — `parameters` is an
 * open record, so schema version "1.0" files exported before families
 * existed validate unchanged, and packs carrying these keys validate on
 * readers that predate families (the keys are inert plain data).
 */
export const FAMILY_ID_PARAMETER_KEY = "familyId";
export const FAMILY_NAME_PARAMETER_KEY = "familyName";

/**
 * One behaviour record in a pack: a closed-kind intent with structured
 * parameters, provenance, the compiled KMN rule texts (auditability only),
 * and canned demo pairs.
 */
export interface BehaviourRecord {
  /** Closed behaviour kind. */
  kind: BehaviourKind;
  /** Stable snake_case id, e.g. "cameroon_diacritic_blocking". */
  id: string;
  /**
   * Structured parameters as plain data (character classes, store refs,
   * table rows). MUST be non-empty and MUST NOT be a raw KMN snippet
   * stashed under a text key (FR-005).
   *
   * Family-aware exporters additionally record the source rule family here
   * under {@link FAMILY_ID_PARAMETER_KEY} / {@link FAMILY_NAME_PARAMETER_KEY}
   * (spec 082 FR-018); both are optional and inert to older readers.
   */
  parameters: Record<string, unknown>;
  /** Per-idiom provenance (FR-006). */
  provenance: BehaviourProvenance;
  /** Compiled KMN rule texts, for auditability. Never the source of truth. */
  rules: string[];
  /** At least one canned demo pair (FR-007, FR-010). */
  demoPairs: DemoPair[];
}

const STABLE_ID = /^[a-z0-9][a-z0-9_]*$/;

export const BehaviourRecordSchema = z.object({
  kind: BehaviourKindSchema,
  id: z
    .string()
    .min(1, "behaviour id must not be empty")
    .regex(STABLE_ID, "behaviour id must be stable snake_case (lowercase letters, digits, underscores)"),
  parameters: z
    .record(z.string(), z.unknown())
    .refine(
      p => Object.keys(p).length > 0,
      "parameters must carry structured data, not just KMN text (FR-005): object is empty",
    )
    .superRefine((p, ctx) => {
      for (const key of Object.keys(p)) {
        if (RAW_KMN_PARAMETER_KEYS.has(key.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `parameters must be structured data, not raw KMN text (FR-005): key "${key}" is not allowed`,
          });
        }
      }
    }),
  provenance: BehaviourProvenanceSchema,
  rules: z
    .array(z.string().min(1, "rule text must not be empty"))
    .min(1, "behaviour must carry at least one compiled rule text"),
  demoPairs: z
    .array(DemoPairSchema)
    .min(1, "behaviour must carry at least one canned demo pair (FR-007)"),
});

/**
 * A versioned, script-keyed set of behaviour records: the export product of
 * the rule builder (spec 082 FR-007).
 */
export interface RulePack {
  /** Schema version; currently the literal "1.0". */
  packVersion: typeof PACK_VERSION;
  /** Stable kebab-case pack id, e.g. "cameroon-diacritic-blocking". */
  id: string;
  /** Human pack name, e.g. "Cameroon diacritic blocking". */
  name: string;
  /** What the pack does, in author language. */
  description: string;
  /** Script the pack applies to, e.g. "Latn". */
  scriptKey: string;
  /** The behaviour records in this pack. */
  behaviours: BehaviourRecord[];
}

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;

export const RulePackSchema = z.object({
  packVersion: z.literal(PACK_VERSION, `packVersion must be "${PACK_VERSION}"`),
  id: z
    .string()
    .min(1, "pack id must not be empty")
    .regex(PACK_ID, "pack id must be stable kebab-case (lowercase letters, digits, hyphens)"),
  name: z.string().min(1, "pack name must not be empty"),
  description: z.string().min(1, "pack description must not be empty"),
  scriptKey: z.string().min(1, "pack scriptKey must not be empty"),
  behaviours: z.array(BehaviourRecordSchema).min(1, "pack must contain at least one behaviour"),
});

// ---------------------------------------------------------------------------
// Validation entry point
// ---------------------------------------------------------------------------

/** One typed validation failure, with a dotted path to the offending field. */
export interface RulePackIssue {
  /** Dotted path, e.g. "behaviours.0.provenance.license". "" for the root. */
  path: string;
  message: string;
  code: string;
}

export type ValidateRulePackResult =
  | { ok: true; pack: RulePack }
  | { ok: false; issues: RulePackIssue[] };

// stripUndefinedDeep is the value-level twin of DeepStripUndefined (see
// utils/schemaGuards): it applies the same `.optional()` -> `?:` bridge to the
// parsed data, so the validated pack genuinely satisfies the interfaces above
// rather than relying on a cast.

/** Recursively drop `undefined`-valued keys (JSON has no undefined). */
function stripUndefinedDeep<T>(value: T): DeepStripUndefined<T> {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep) as DeepStripUndefined<T>;
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        out[key] = stripUndefinedDeep(entry);
      }
    }
    return out as DeepStripUndefined<T>;
  }
  return value as DeepStripUndefined<T>;
}

/**
 * Validate unknown data against the rule-pack schema.
 *
 * Returns a typed result rather than throwing: `{ ok: true, pack }` with the
 * zod-normalised pack (unknown keys stripped, undefineds dropped), or
 * `{ ok: false, issues }` with one entry per failed constraint.
 */
export function validateRulePack(data: unknown): ValidateRulePackResult {
  const result = RulePackSchema.safeParse(data);
  if (result.success) {
    return { ok: true, pack: stripUndefinedDeep(result.data) };
  }
  return {
    ok: false,
    issues: result.error.issues.map(issue => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
      code: String(issue.code),
    })),
  };
}

// ---------------------------------------------------------------------------
// Compile-time drift guards: each schema's inferred type must stay assignable
// to the hand-written interface it mirrors (same pattern as schemas.ts). If a
// field is added, removed, or retyped on an interface without updating the
// schema, the alias resolves to Expect<false> and fails the build.
// ---------------------------------------------------------------------------

// These aliases are intentionally unused at the value level — their
// declaration is the assertion. A failure surfaces as a constraint error.
type _PackGuard = Expect<AssignableTo<z.infer<typeof RulePackSchema>, RulePack>>;
type _BehaviourGuard = Expect<
  AssignableTo<z.infer<typeof BehaviourRecordSchema>, BehaviourRecord>
>;
type _ProvenanceGuard = Expect<
  AssignableTo<z.infer<typeof BehaviourProvenanceSchema>, BehaviourProvenance>
>;
type _DemoPairGuard = Expect<AssignableTo<z.infer<typeof DemoPairSchema>, DemoPair>>;
