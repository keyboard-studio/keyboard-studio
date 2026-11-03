// builderTemplates — the three vendored TIKE touch-layout templates,
// bundled via Vite `import.meta.glob` (eager, raw) — the same mechanism as
// adaptation/catalog.ts and lib/browserPatternLibrary.ts. Never fetched from
// the network at runtime. Sources: `packages/studio/tests/fixtures/
// touchLayouts/template-*.keyman-touch-layout`, vendored from
// keymanapp/keyman `developer/src/tike/xml/layoutbuilder/templates/` in
// Phase 0.
//
// NOTE: a static `import "...?raw"` breaks the i18n-content-extract
// freshness checker (tsx tries to load the .keyman-touch-layout file as a
// module); import.meta.glob is invisible to it.
//
// Display names/descriptions are rendered by `TouchBuilderPane`'s template
// dialog through literal `t()` calls (the Lingui macro cannot analyze
// dynamic message ids), so this module carries no i18n of its own.

// Lazy: import.meta.glob runs only when a template is first requested, never
// at module evaluation — the i18n-content-extract freshness checker imports
// this module graph under tsx, which implements neither `?raw` static imports
// nor import.meta.glob.
let cachedModules: Record<string, string> | undefined;

function templateModules(): Record<string, string> {
  if (cachedModules === undefined) {
    cachedModules = import.meta.glob(
      "../../../../tests/fixtures/touchLayouts/template-*.keyman-touch-layout",
      { eager: true, query: "?raw", import: "default" },
    ) as Record<string, string>;
  }
  return cachedModules;
}

export interface BuilderTemplateSource {
  readonly id: "basic" | "latin" | "traditional";
  readonly jsonText: string;
}

function templateText(id: BuilderTemplateSource["id"]): string {
  const path = Object.keys(templateModules()).find((p) =>
    p.endsWith(`template-${id}.keyman-touch-layout`),
  );
  if (path === undefined) {
    throw new Error(`touch builder template "${id}" is not bundled`);
  }
  return templateModules()[path]!;
}

/**
 * The three template sources. A function (not a module-level constant) so
 * merely importing this module never touches import.meta.glob — see above.
 */
export function builderTemplateSources(): readonly BuilderTemplateSource[] {
  return [
    { id: "basic", jsonText: templateText("basic") },
    { id: "latin", jsonText: templateText("latin") },
    { id: "traditional", jsonText: templateText("traditional") },
  ];
}
