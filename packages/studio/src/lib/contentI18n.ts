// Tier B (content) i18n loader with English fallback (spec 046 T028; seam
// decision in specs/046-i18n-localization/research.md D8's "Loader /
// resolution semantics" section). The content-YAML loaders themselves
// (browserPatternLibrary.ts, criteriaData.ts, the engine pattern loader) stay
// English-only, zero-arg singletons exactly as before — resolution happens at
// the render call site instead, mirroring how `resolveMessage` resolves a
// Tier A Lingui descriptor against the live `i18n` instance
// (./i18nResolve.ts), just sourcing from a locale-keyed sidecar JSON lookup
// (a `(type, id, field)` triple) rather than a Lingui MessageDescriptor.
import type { I18n } from "@lingui/core";
import type { Locale } from "./i18n.ts";

// Mirrors ./i18n.ts's DEFAULT_LOCALE by value (not a value-import of it) so
// this module has no runtime dependency on i18n.ts — i18n.ts imports THIS
// module (to call activateContentLocale from activateLocale), and a
// value-level import cycle back would make init-order fragile for no benefit
// (this constant can't drift: both are English, the one and only source
// locale, see D6/D2).
const DEFAULT_LOCALE: Locale = "en";

/** The three sidecar catalogs extracted by utilities/i18n-content-extract (T027). */
export type ContentCatalogType = "patterns" | "adaptationQuestions" | "criteria";

const CONTENT_CATALOG_TYPES: readonly ContentCatalogType[] = [
  "patterns",
  "adaptationQuestions",
  "criteria",
];

/** The catalog-key namespace segment for each type (D8 id derivation). */
const NAMESPACE: Record<ContentCatalogType, string> = {
  patterns: "pattern",
  adaptationQuestions: "adaptationQuestion",
  criteria: "criteria",
};

type ContentCatalog = Record<string, string>;

/**
 * A record id may itself contain literal dots (e.g. a criterion id like
 * "4.3-copyright-holder-is-authorized"). D8: replace them with `_` when
 * forming a catalog-key segment only — the same rule
 * utilities/i18n-content-extract/extract.ts's `slugifyIdSegment` applies at
 * extraction time. Kept as a small local copy rather than a cross-package
 * import: `utilities/*` is excluded from the pnpm workspace and isn't part of
 * the shipped browser bundle.
 */
function slugifyIdSegment(id: string): string {
  return id.replace(/\./g, "_");
}

function buildContentKey(type: ContentCatalogType, id: string, field: string): string {
  return `content.${NAMESPACE[type]}.${slugifyIdSegment(id)}.${field}`;
}

const localeCatalogs = new Map<Locale, Partial<Record<ContentCatalogType, ContentCatalog>>>();
const activating = new Map<Locale, Promise<void>>();

/**
 * Lazily load a locale's content-i18n sidecar catalogs (code-split the same
 * way as Tier A's per-locale Lingui catalogs, D6). English never needs a
 * fetch — callers already hold the English value in hand (it lives on the
 * loaded Pattern/Criterion/AdaptationQuestion record itself). A catalog that
 * hasn't been translated yet for this locale (T030 not yet run for it, or a
 * 404'd chunk after a deploy) is swallowed per-type, same fallback contract
 * as `activateLocale` in ./i18n.ts — resolveContentString falls back to the
 * English value already in hand rather than propagating a rejection.
 */
export function activateContentLocale(locale: Locale): Promise<void> {
  if (locale === DEFAULT_LOCALE) return Promise.resolve();
  const inFlight = activating.get(locale);
  if (inFlight !== undefined) return inFlight;
  if (localeCatalogs.has(locale)) return Promise.resolve();

  const promise = Promise.all(
    CONTENT_CATALOG_TYPES.map(async (type) => {
      try {
        const mod: unknown = await import(`@content-i18n/${locale}/${type}.json`);
        const catalog = (mod as { default?: unknown }).default ?? mod;
        return [type, catalog as ContentCatalog] as const;
      } catch {
        return [type, undefined] as const;
      }
    }),
  ).then((entries) => {
    const loaded: Partial<Record<ContentCatalogType, ContentCatalog>> = {};
    for (const [type, catalog] of entries) {
      if (catalog !== undefined) loaded[type] = catalog;
    }
    localeCatalogs.set(locale, loaded);
  });

  activating.set(locale, promise);
  return promise;
}

/**
 * Resolve a Tier B content string for the active locale, falling back to
 * `englishValue` when the locale is English, not yet activated, or has no
 * translation for this key — never blank. `i18n` is optional (same shape as
 * `resolveMessage`) so callers with no live `I18n` instance (unit tests) get
 * the English value back unconditionally.
 */
export function resolveContentString(
  type: ContentCatalogType,
  id: string,
  field: string,
  englishValue: string,
  i18n?: I18n,
): string {
  const locale = i18n?.locale;
  if (locale === undefined || locale === DEFAULT_LOCALE) return englishValue;
  const catalog = localeCatalogs.get(locale as Locale)?.[type];
  if (catalog === undefined) return englishValue;
  return catalog[buildContentKey(type, id, field)] ?? englishValue;
}

/**
 * Test-only: seed the locale-catalog cache directly, bypassing
 * `activateContentLocale`'s dynamic import entirely. Mirrors
 * `_setCorpusCacheForTesting` in BaseKeyboardPicker.tsx — mocking an aliased
 * dynamic import (`vi.mock("@content-i18n/...")`) is worker-fragile across
 * co-scheduled test files (see that function's #829 note), so tests seed the
 * cache directly instead of relying on the mock as the load-bearing mechanism.
 */
export function _setContentCatalogForTesting(
  locale: Locale,
  catalogs: Partial<Record<ContentCatalogType, ContentCatalog>>,
): void {
  localeCatalogs.set(locale, catalogs);
}

/** Test-only: clear cached catalogs + in-flight activations between tests. */
export function _resetContentI18nForTesting(): void {
  localeCatalogs.clear();
  activating.clear();
}
