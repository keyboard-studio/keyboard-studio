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

export const IRNodeRefSchema = z.object({
  kind: z.enum(["rule", "store", "group", "touchKey", "kvksKey", "comment", "raw"]),
  nodeId: z.string(),
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
