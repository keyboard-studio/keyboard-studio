import { z } from "zod";

/**
 * Zod schema mirroring the Pattern interface from spec §5.
 *
 * Uses z.string() for `category` (permissive) because YAML files use directory
 * names like "substitute", "transliteration", "ime", "validation" which differ
 * from the PatternCategory union in contracts. The loader casts to PatternCategory
 * at construction time.
 *
 * The top-level schema uses .passthrough() so extra YAML-only fields (notes,
 * skeleton, notes_extended, frequency_in_corpus, provenance, etc.) do not
 * cause validation failure.
 */

const PatternQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  answerType: z.string(),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }).passthrough())
    .optional(),
  default: z.string().optional(),
  required: z.boolean().optional(),
});

const TestVectorSchema = z.object({
  input: z.array(z.string()),
  expectedOutput: z.string(),
  description: z.string().optional(),
});

const ProvenanceEntrySchema = z
  .object({
    keyboard: z.string(),
    rule: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

/**
 * demo accepts a filled_kmn string, an object (which may have filled_kmn),
 * or null, or be absent entirely.
 */
const DemoSchema = z
  .union([z.string(), z.object({}).passthrough(), z.null()])
  .optional();

export const PatternSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    appliesTo: z.array(z.string()),
    strategyId: z.string().optional(),
    combinesWith: z.array(z.string()).optional(),
    questions: z.array(PatternQuestionSchema),
    kmnFragment: z.string(),
    // Authored YAML uses explicit `null` to mark "no touch/reorder fragment";
    // accept null (not just undefined) so those patterns load. toPattern() in
    // loader.ts coerces null -> omitted, since Pattern types these as `?: string`.
    touchLayoutFragment: z.string().nullish(),
    reorderRules: z.string().nullish(),
    tests: z.array(TestVectorSchema),
    validatedForFamilies: z.array(z.string()),
    sourceKeyboards: z.array(z.string()),
    reviewedBy: z.union([z.string(), z.number()]),
    reviewDate: z.union([z.string(), z.number()]),
    frequencyInCorpus: z.number().optional(),
    provenance: z.array(ProvenanceEntrySchema).optional(),
    demo: DemoSchema,
    group_visibility: z.string().optional(),
    priority: z.number().optional(),
  })
  .passthrough();

export type RawPattern = z.infer<typeof PatternSchema>;
