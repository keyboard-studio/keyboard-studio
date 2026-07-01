// Runtime (zod) schemas mirroring the locked contract types in spec §5
// (Pattern) and §11 (Criterion). These make the Day-1 TS contract
// self-enforcing at runtime: the checked-in data files (criteria.json and the
// pattern-library YAML) are parsed through these schemas at their load
// boundaries, so a malformed record fails loudly instead of flowing into the
// engine as a silently-wrong value.
//
// Source-of-truth rule: the hand-written interfaces in pattern.ts / criteria.ts
// stay canonical (their JSDoc carries the spec references). These schemas
// MIRROR those interfaces; the compile-time drift guards at the bottom of this
// file fail the build if a schema and its interface diverge, so the two cannot
// drift apart silently. This is reinforcement of the existing contract, not a
// schema change — no field is renamed, retyped, or removed (spec §17 / §18).
//
// @see packages/contracts/src/pattern.ts — canonical Pattern type (this mirrors it)
// @see specs/005-pattern-schema/spec.md — §5 prose spec (Day-1 reference)
// @see spec.md §11 / §14 Decision 4 (Criterion four-band model)

import { z } from "zod";
import type { Pattern, PatternQuestion, TestVector, DemoObject } from "./pattern";
import type { Criterion } from "./criteria";
import type { RemovalCapability } from "./removalCapability";
import type { TouchKeyProvenance, TouchKeyIR, TouchLayoutIR } from "./keyboard-ir";
import type { AxisFill, AxisFillSource } from "./axisFill";
import type { Scale, ScriptClass } from "./axes";

// ---------------------------------------------------------------------------
// Leaf enums — mirror the string-literal unions in the contract types.
// ---------------------------------------------------------------------------

export const StrategyIdSchema = z.enum([
  "S-01", "S-02", "S-03", "S-04", "S-05", "S-06", "S-07",
  "S-08", "S-09", "S-10", "S-11", "S-12", "S-13",
]);

export const PatternCategorySchema = z.enum([
  "desktop", "touch", "reorder", "substitute", "transliteration", "ime", "validation",
]);

export const AnswerTypeSchema = z.enum([
  "char-list", "char-single", "key-name", "store-content", "boolean", "select", "text",
]);

export const DiscusPrincipleSchema = z.enum([
  "discoverability", "intuition", "simplicity", "consistency", "usability", "standards",
]);

export const RemovalCapabilitySchema = z.enum([
  "removable:simple",
  "removable:slot-fill",
  "not-removable:opaque",
  "not-removable:context-sensitive",
  "not-removable:unknown",
]);

// ---------------------------------------------------------------------------
// AxisFill (spec §7.2 script-class default-fill prior) — provenance primitive
// plus the on-disk prior record it is derived from (axis-priors.json).
// ---------------------------------------------------------------------------

export const ScaleSchema = z.enum(["tiny", "small", "medium", "large", "massive"]);

export const ScriptClassSchema = z.enum([
  "alphabetic",
  "abugida",
  "abjad",
  "syllabary",
  "logographic",
]);

export const AxisFillSourceSchema = z.enum(["script-class-prior"]);

/**
 * Mirror of {@link AxisFill}. `axis`/`value` are loosely typed (`z.string()` /
 * `z.unknown()`) here because the schema's job is validating the on-disk prior
 * data (see {@link AxisPriorCellSchema}) and the `_AxisFillGuard` drift guard
 * below, not re-deriving the full `DiscoveryAxisVector` key/value union.
 */
export const AxisFillSchema = z.object({
  axis: z.string(),
  value: z.unknown(),
  source: AxisFillSourceSchema,
});

/**
 * One scriptClass x scale cell of `axis-priors.json` — the phase-gated axes
 * the script-class default-fill prior can supply. Every field is optional
 * because A3a/A7a are alphabetic-only (§7.1); non-alphabetic cells omit them.
 *
 * LOAD-BEARING: `markInputOrder` must be `"prefix"` when present — the prior
 * must never emit `"postfix"` (spec §7.2 rule 3a intercept invariant). This is
 * enforced structurally by the literal below, not just by convention.
 */
export const AxisPriorCellSchema = z.object({
  markInputOrder: z.literal("prefix").optional(),
  diacriticBehavior: z.literal("none"),
  multiMode: z.literal("single"),
  constraintEnforcement: z.literal("none"),
  remapPosture: z.literal("addition").optional(),
});

/** The full on-disk prior: scriptClass -> scale -> {@link AxisPriorCellSchema}. */
export const AxisPriorTableSchema = z.record(
  ScriptClassSchema,
  z.record(ScaleSchema, AxisPriorCellSchema),
);

/**
 * Mirror of `TouchKeyIR.provenance` (keyboard-ir.ts) — the per-touch-key
 * placement origin (spec-014 FR-008). Optional on the key (use
 * `TouchKeyProvenanceSchema.optional()` where a TouchKeyIR is validated);
 * an absent value deserializes to the conservative `"hand-set"` default.
 *
 * NOTE: distinct from the import-attribution `ProvenanceEntrySchema` in
 * provenance.ts — this is per-touch-key placement provenance, not source
 * attribution.
 */
export const TouchKeyProvenanceSchema = z.enum([
  "base-derived",
  "physical-suggested",
  "hand-set",
]);

export const IRNodeRefSchema = z.object({
  kind: z.enum(["rule", "store", "group", "touchKey", "kvksKey", "comment", "raw"]),
  nodeId: z.string(),
});

// ---------------------------------------------------------------------------
// Touch layout (spec-014 US3 — durable per-key provenance round-trip).
//
// These mirror `TouchKeyIR` / `TouchLayoutIR` (keyboard-ir.ts). The provenance
// field is `.optional()` and, when absent, deserializes to the conservative
// `"hand-set"` default (FR-009/SC-007) via the `defaultProvenance()` convention
// — encoded here as a `.transform()` so a parsed key always carries a tag.
//
// `TouchKeyIRSchema` is self-recursive (`sk`/`flick`/`multitap`), so it is
// declared with an explicit z.ZodType annotation + a `z.lazy()` getter.
// ---------------------------------------------------------------------------

/** The conservative default provenance for an untagged/legacy touch key (FR-009). */
const DEFAULT_TOUCH_PROVENANCE: TouchKeyProvenance = "hand-set";

/**
 * Add `| undefined` to every optional (`?:`) property of `T`, recursively.
 *
 * `TouchKeyIR` is self-recursive, so `TouchKeyIRSchema` needs an explicit type
 * annotation (a `z.lazy()` self-reference is otherwise inferred as `any`). But
 * under `exactOptionalPropertyTypes`, zod's `.optional()` produces `T | undefined`
 * on the OUTPUT, which the contract's bare `?:` fields reject as an annotation
 * target. This helper bridges that single representational gap: the annotation
 * is `z.ZodType<LooseOptional<TouchKeyIR>>`, which accepts the zod output yet is
 * still structurally pinned to `TouchKeyIR` (a renamed/removed/retyped field
 * fails the annotation → build error = the drift guard). The `_TouchKeyIRGuard`
 * alias below additionally asserts the inferred output stays assignable to the
 * exact contract via `DeepStripUndefined`.
 */
type LooseOptional<T> = T extends (infer U)[]
  ? LooseOptional<U>[]
  : T extends object
    ? {
        // Required keys stay exact; optional keys (detected by comparing the
        // single-key Pick against its Required form — a key is optional iff
        // making it required changes the type) gain `| undefined` to match zod
        // `.optional()` output under exactOptionalPropertyTypes.
        [K in keyof T]: Pick<T, K> extends Required<Pick<T, K>>
          ? LooseOptional<T[K]>
          : LooseOptional<T[K]> | undefined;
      }
    : T;

// `TouchKeyIR` is self-recursive (`sk`/`flick`/`multitap`); `z.lazy()` carries
// the self-reference and the `LooseOptional` annotation breaks the inference
// cycle while staying pinned to the contract shape (see helper doc above).
export const TouchKeyIRSchema: z.ZodType<LooseOptional<TouchKeyIR>> = z.lazy(() =>
  z.object({
    nodeId: z.string(),
    id: z.string(),
    text: z.string().optional(),
    // Optional on the wire; absent ⇒ the conservative `hand-set` default on
    // parse (FR-009). The transform makes the resolved value always present so
    // the no-clobber rule (US2) reads a concrete tag.
    provenance: TouchKeyProvenanceSchema.optional().transform(
      (p) => p ?? DEFAULT_TOUCH_PROVENANCE,
    ),
    hint: z.string().optional(),
    output: z.string().optional(),
    nextlayer: z.string().optional(),
    sk: z.array(TouchKeyIRSchema).optional(),
    // Explicit per-direction shape (not Object.fromEntries) so the inferred
    // output keeps the literal direction keys, matching the contract's
    // `Partial<Record<"n"|"s"|..., TouchKeyIR>>` exactly (drift guard).
    flick: z
      .object({
        n: TouchKeyIRSchema.optional(),
        s: TouchKeyIRSchema.optional(),
        e: TouchKeyIRSchema.optional(),
        w: TouchKeyIRSchema.optional(),
        ne: TouchKeyIRSchema.optional(),
        nw: TouchKeyIRSchema.optional(),
        se: TouchKeyIRSchema.optional(),
        sw: TouchKeyIRSchema.optional(),
      })
      .optional(),
    multitap: z.array(TouchKeyIRSchema).optional(),
    sp: z.number().optional(),
    width: z.number().optional(),
    pad: z.number().optional(),
  }),
);

export const TouchLayoutIRSchema = z.object({
  platforms: z.array(
    z.object({
      id: z.enum(["phone", "tablet", "desktop"]),
      font: z.string().optional(),
      layers: z.array(
        z.object({
          id: z.string(),
          rows: z.array(z.object({ keys: z.array(TouchKeyIRSchema) })),
        }),
      ),
    }),
  ),
  nodeIds: z.array(z.tuple([z.string(), IRNodeRefSchema])),
});

// ---------------------------------------------------------------------------
// Pattern leaves (spec §5).
// ---------------------------------------------------------------------------

export const DemoObjectSchema = z.object({
  filled_kmn: z.string().nullable().optional(),
  touch_layout_fragment: z.string().nullable().optional(),
  sample_keys: z.array(z.string()).nullable().optional(),
  sample_output: z.array(z.string()).nullable().optional(),
});

export const PatternQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  answerType: AnswerTypeSchema,
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  default: z.string().optional(),
  required: z.boolean().optional(),
});

export const TestVectorSchema = z.object({
  input: z.array(z.string()),
  expectedOutput: z.string(),
  description: z.string().optional(),
});

const ProvenanceEntrySchema = z.object({
  keyboard: z.string(),
  rule: z.string().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Pattern — the Day-1 contract (spec §5). Strict: unknown keys are stripped,
// `category` is the closed PatternCategory enum.
// ---------------------------------------------------------------------------

export const PatternSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: PatternCategorySchema,
  appliesTo: z.array(z.string()),
  strategyId: StrategyIdSchema.optional(),
  combinesWith: z.array(StrategyIdSchema).optional(),
  origin: z.enum(["survey", "imported", "recognized"]).optional(),
  ownedNodes: z.array(IRNodeRefSchema).optional(),
  authorModified: z.boolean().optional(),
  questions: z.array(PatternQuestionSchema),
  kmnFragment: z.string(),
  touchLayoutFragment: z.string().optional(),
  reorderRules: z.string().optional(),
  tests: z.array(TestVectorSchema),
  validatedForFamilies: z.array(z.string()),
  sourceKeyboards: z.array(z.string()),
  reviewedBy: z.string(),
  reviewDate: z.string(),
  frequencyInCorpus: z.number().optional(),
  provenance: z.array(ProvenanceEntrySchema).optional(),
  demo: z.union([z.string(), DemoObjectSchema, z.null()]).optional(),
  group_visibility: z.string().optional(),
  priority: z.number().optional(),
});

// ---------------------------------------------------------------------------
// KeyboardIR — top-level runtime schema (spec-014 US3).
//
// The full IR carries many node types (header/stores/groups/comments/raw/
// recognizedPatterns) that do not yet have hand-written zod mirrors; minting a
// strict schema for all of them is out of scope for this cycle (and would risk
// rejecting valid in-memory IRs the rest of the pipeline produces). This schema
// therefore validates the touch surface PRECISELY — the spec-014 durability
// target — via `TouchLayoutIRSchema`, and is permissive (`.passthrough()`) on
// the remaining top-level fields so existing IRs round-trip unchanged. As those
// other node types gain schemas they can be tightened here without a breaking
// change to the touch contract.
//
// `touchLayout` is `.optional()` (additive — an IR with no touch layout is
// valid); when present, every touch key's provenance is materialised to its
// `hand-set` default if absent (FR-009).
// ---------------------------------------------------------------------------

export const KeyboardIRSchema = z
  .object({
    origin: z.enum(["scaffolded", "imported", "synthesized"]),
    touchLayout: TouchLayoutIRSchema.optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Criterion — the §11 four-band catalog (spec §14 Decision 4). Discriminated
// on `band`; each variant carries only its own automation hook.
// ---------------------------------------------------------------------------

const baseCriterionShape = {
  id: z.string(),
  section: z.string(),
  description: z.string(),
  principle: DiscusPrincipleSchema.optional(),
};

export const CriterionSchema = z.discriminatedUnion("band", [
  z.object({ ...baseCriterionShape, band: z.literal("scaffolder-bake"), scaffolderRule: z.string() }),
  z.object({ ...baseCriterionShape, band: z.literal("layer-c-enforce"), lintRuleId: z.string() }),
  z.object({ ...baseCriterionShape, band: z.literal("yellow-survey"), surveyQuestionId: z.string() }),
  z.object({ ...baseCriterionShape, band: z.literal("red-checklist"), preSubmitChecklistText: z.string() }),
]);

// ---------------------------------------------------------------------------
// Raw (YAML-tolerant) pattern input schema.
//
// Relocated here from engine/src/pattern-library/patternSchema.ts so the
// contract root owns the single definition; the engine re-exports this as
// `PatternSchema` for its `@keyboard-studio/engine/pattern-schema` subpath
// (consumed by the loader and the studio's browser pattern library).
//
// Permissive on purpose: authored YAML uses numeric ids/dates, raw category
// directory names, explicit `null` for absent fragments, and carries extra
// content-only keys. The loader's toPattern() normalises a parsed RawPattern
// into a strict Pattern (validate the result with PatternSchema above).
// ---------------------------------------------------------------------------

const RawPatternQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  answerType: z.string(),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }).passthrough())
    .optional(),
  default: z.string().optional(),
  required: z.boolean().optional(),
});

const RawTestVectorSchema = z.object({
  input: z.array(z.string()),
  expectedOutput: z.string(),
  description: z.string().optional(),
});

const RawProvenanceEntrySchema = z
  .object({
    keyboard: z.string(),
    rule: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const RawDemoSchema = z
  .union([z.string(), z.object({}).passthrough(), z.null()])
  .optional();

export const RawPatternSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    appliesTo: z.array(z.string()),
    strategyId: z.string().optional(),
    combinesWith: z.array(z.string()).optional(),
    questions: z.array(RawPatternQuestionSchema),
    kmnFragment: z.string(),
    // Authored YAML uses explicit `null` to mark "no touch/reorder fragment";
    // accept null (not just undefined) so those patterns load. toPattern()
    // coerces null -> omitted, since Pattern types these as `?: string`.
    touchLayoutFragment: z.string().nullish(),
    reorderRules: z.string().nullish(),
    tests: z.array(RawTestVectorSchema),
    validatedForFamilies: z.array(z.string()),
    sourceKeyboards: z.array(z.string()),
    reviewedBy: z.union([z.string(), z.number()]),
    reviewDate: z.union([z.string(), z.number()]),
    frequencyInCorpus: z.number().optional(),
    provenance: z.array(RawProvenanceEntrySchema).optional(),
    demo: RawDemoSchema,
    group_visibility: z.string().optional(),
    priority: z.number().optional(),
  })
  .passthrough();

export type RawPattern = z.infer<typeof RawPatternSchema>;

// ---------------------------------------------------------------------------
// Compile-time drift guards.
//
// Each canonical schema's inferred type must stay assignable to the locked
// interface it mirrors. If a field is added, removed, or retyped on the
// interface without the schema being updated to match, the corresponding alias
// resolves to `Expect<false>` and fails the build.
//
// DeepStripUndefined bridges zod's `.optional()` (which infers `T | undefined`)
// to the contract's exactOptionalPropertyTypes `?:` form, so the guard reacts
// to real drift rather than to that representational difference. The reverse
// direction — that the schema is not *stricter* than real data — is covered at
// runtime by schemas.test.ts, which parses every fixture and data record.
// ---------------------------------------------------------------------------

type DeepStripUndefined<T> =
  T extends (infer U)[]
    ? DeepStripUndefined<U>[]
    : T extends object
      ? { [K in keyof T]: DeepStripUndefined<Exclude<T[K], undefined>> }
      : T;

type Expect<T extends true> = T;
type AssignableTo<S, T> = [DeepStripUndefined<S>] extends [T] ? true : false;

// These aliases are intentionally unused at the value level — their declaration
// is the assertion. A failure surfaces here as a constraint error on `Expect`.
type _PatternGuard = Expect<AssignableTo<z.infer<typeof PatternSchema>, Pattern>>;
type _PatternQuestionGuard = Expect<
  AssignableTo<z.infer<typeof PatternQuestionSchema>, PatternQuestion>
>;
type _TestVectorGuard = Expect<AssignableTo<z.infer<typeof TestVectorSchema>, TestVector>>;
type _DemoObjectGuard = Expect<AssignableTo<z.infer<typeof DemoObjectSchema>, DemoObject>>;
type _CriterionGuard = Expect<AssignableTo<z.infer<typeof CriterionSchema>, Criterion>>;
type _RemovalCapabilityGuard = Expect<AssignableTo<z.infer<typeof RemovalCapabilitySchema>, RemovalCapability>>;
// AxisFill (spec §7.2). `axis`/`value` are validated loosely (see
// AxisFillSchema doc) so the guard only pins `source`, which is where real
// drift (a renamed/added fill-source literal) would occur.
type _AxisFillSourceGuard = Expect<
  AssignableTo<z.infer<typeof AxisFillSourceSchema>, AxisFillSource>
>;
type _AxisFillGuard = Expect<
  AssignableTo<Omit<z.infer<typeof AxisFillSchema>, "axis" | "value">, Omit<AxisFill, "axis" | "value">>
>;
type _ScaleGuard = Expect<AssignableTo<z.infer<typeof ScaleSchema>, Scale>>;
type _ScriptClassGuard = Expect<AssignableTo<z.infer<typeof ScriptClassSchema>, ScriptClass>>;
// The provenance enum schema and the TouchKeyProvenance contract union must
// stay in lockstep (spec-014 FR-008, Art. I drift guard). NonNullable strips
// the optional `?:` form so the guard compares the underlying union only.
type _TouchKeyProvenanceGuard = Expect<
  AssignableTo<z.infer<typeof TouchKeyProvenanceSchema>, NonNullable<TouchKeyProvenance>>
>;
// Touch IR schemas (spec-014 US3). `TouchKeyIRSchema` / `TouchLayoutIRSchema`
// carry an explicit `z.ZodType<LooseOptional<...>>` annotation (required for the
// self-recursive `z.lazy()`), so the PRIMARY drift guard is the annotation
// itself: a renamed/removed/retyped field makes the `z.object({...})` literal
// non-assignable to that ZodType and fails the build at the schema declaration
// (you cannot widen the annotation without also widening `LooseOptional<TouchKeyIR>`,
// which is pinned to the contract). These aliases pin the inferred OUTPUT back
// to the contract as belt-and-braces.
type _TouchKeyIRGuard = Expect<AssignableTo<z.infer<typeof TouchKeyIRSchema>, TouchKeyIR>>;
// TouchLayoutIR is guarded on its `platforms` slice (the touch-key + provenance
// payload — the spec-014 durability target). `nodeIds` is intentionally not run
// through DeepStripUndefined: that helper rewrites the `[string, IRNodeRef]`
// tuple as an array and broadens the element union, a representational artifact
// unrelated to real drift. `nodeIds` is still validated structurally by
// `z.tuple([z.string(), IRNodeRefSchema])` in the schema and at runtime by the
// round-trip test.
type _TouchLayoutPlatformsGuard = Expect<
  AssignableTo<z.infer<typeof TouchLayoutIRSchema>["platforms"], TouchLayoutIR["platforms"]>
>;
// The KeyboardIR schema validates the touch surface precisely + passes the rest
// through; its inferred `touchLayout` output must stay assignable to the
// contract's `touchLayout` field (again on the platforms slice, same tuple
// caveat as above).
type _KeyboardIRTouchGuard = Expect<
  AssignableTo<
    NonNullable<z.infer<typeof KeyboardIRSchema>["touchLayout"]>["platforms"],
    TouchLayoutIR["platforms"]
  >
>;
