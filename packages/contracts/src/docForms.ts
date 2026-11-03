// Documentation forms (spec 102): one fill-in form per shipped documentation
// file plus the shared welcome/help body, and the explanatory paragraph for
// each input mechanism. Content-owned data in
// `packages/contracts/data/doc-forms.json`; this module is its type, schema
// and loader, mirroring axisPriors.ts.
//
// A form is plain text with two constructs, `{{id}}` and `{{#id}}…{{/id}}`.
// The engine renders them (`renderDocForm`) and its forms check test verifies
// that every slot a form names exists.

import { z } from "zod";
import data from "../data/doc-forms.json" with { type: "json" };

export type DocFormId = "readmeMd" | "readmeHtm" | "welcome" | "help" | "body" | "history" | "license";

export type DocMechanismId = "deadkeys" | "rightAlt" | "repeatToCycle" | "combiningOrder";

/** The variable sentences of README.md / readme.htm (spec 110); `{name}`-style placeholders are filled by the caller. */
export type DocReadmePhraseId =
  | "languageLine"
  | "languageLineNoScript"
  | "basedOn"
  | "basedOnWithLayout"
  | "useCaseLiteracy"
  | "useCaseMessaging"
  | "useCaseOfficial"
  | "compositionPrecomposed"
  | "compositionDecomposed"
  | "compositionMixed"
  | "fontGeneric"
  | "removedFrom"
  | "noteStartedFrom"
  | "noteAdaptedFrom"
  | "noteMethods"
  | "methodRightAlt"
  | "methodSequence"
  | "methodTouch"
  | "methodDirect"
  | "noteMarksPrefix"
  | "noteMarksPostfix"
  | "noteTouchFromDesktop"
  | "noteTouchAdapted"
  | "noteRemovedSwallow"
  | "noteRemovedPassThrough"
  | "noteRationale";

export interface DocForms {
  /** Each form joined from its JSON line array with "\n". */
  forms: Record<DocFormId, string>;
  /** One paragraph per mechanism, rendered in DOC_MECHANISM_ORDER for the mechanisms a keyboard uses. */
  mechanisms: Record<DocMechanismId, string>;
  readmePhrases: Record<DocReadmePhraseId, string>;
}

/** Fill a phrase's `{key}` placeholders. A placeholder with no value is left as written, so a missing value shows in review rather than vanishing. */
export function fillDocPhrase(phrase: string, values: Readonly<Record<string, string>>): string {
  return phrase.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** The fixed order mechanism paragraphs appear in. */
export const DOC_MECHANISM_ORDER: readonly DocMechanismId[] = ["deadkeys", "rightAlt", "repeatToCycle", "combiningOrder"];

const formLines = z.array(z.string());

/** The on-disk shape of doc-forms.json. Every form and mechanism key is required; any other key fails. */
export const DocFormsSchema = z
  .object({
    forms: z
      .object({
        readmeMd: formLines,
        readmeHtm: formLines,
        welcome: formLines,
        help: formLines,
        body: formLines,
        history: formLines,
        license: formLines,
      })
      .strict(),
    mechanisms: z
      .object({
        deadkeys: z.string().min(1),
        rightAlt: z.string().min(1),
        repeatToCycle: z.string().min(1),
        combiningOrder: z.string().min(1),
      })
      .strict(),
    readmePhrases: z
      .object({
        languageLine: z.string().min(1),
        languageLineNoScript: z.string().min(1),
        basedOn: z.string().min(1),
        basedOnWithLayout: z.string().min(1),
        useCaseLiteracy: z.string().min(1),
        useCaseMessaging: z.string().min(1),
        useCaseOfficial: z.string().min(1),
        compositionPrecomposed: z.string().min(1),
        compositionDecomposed: z.string().min(1),
        compositionMixed: z.string().min(1),
        fontGeneric: z.string().min(1),
        removedFrom: z.string().min(1),
        noteStartedFrom: z.string().min(1),
        noteAdaptedFrom: z.string().min(1),
        noteMethods: z.string().min(1),
        methodRightAlt: z.string().min(1),
        methodSequence: z.string().min(1),
        methodTouch: z.string().min(1),
        methodDirect: z.string().min(1),
        noteMarksPrefix: z.string().min(1),
        noteMarksPostfix: z.string().min(1),
        noteTouchFromDesktop: z.string().min(1),
        noteTouchAdapted: z.string().min(1),
        noteRemovedSwallow: z.string().min(1),
        noteRemovedPassThrough: z.string().min(1),
        noteRationale: z.string().min(1),
      })
      .strict(),
  })
  .strict();

function loadDocForms(raw: unknown): DocForms {
  const parsed = DocFormsSchema.parse(raw);
  const forms = Object.fromEntries(
    Object.entries(parsed.forms).map(([id, lines]) => [id, lines.join("\n")]),
  ) as Record<DocFormId, string>;
  return { forms, mechanisms: parsed.mechanisms, readmePhrases: parsed.readmePhrases };
}

/** The forms and mechanism paragraphs, parsed at module load: a malformed data file throws here. */
export const DOC_FORMS: DocForms = loadDocForms(data);
