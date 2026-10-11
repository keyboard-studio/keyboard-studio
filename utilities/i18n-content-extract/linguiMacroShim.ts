// linguiMacroShim — runtime stand-ins for "@lingui/core/macro" and
// "@lingui/react/macro" when this tool loads the studio question registry
// under plain Node (tsx CLI, or this utility's vitest run) with no Vite
// compilation step.
//
// Why this exists: the registry's import graph reaches studio component
// modules (spec 090's gallery modules import their renderers), and those
// modules import Lingui macros. In the app and in studio's own tests,
// @lingui/vite-plugin compiles every macro away, so the macro package's
// runtime entry — which throws when a macro is *executed* uncompiled — is
// never reached. Under Node there is no compilation, so the guard fires at
// module load (top-level `msg({...})` descriptor constants are an endorsed
// authoring pattern in the studio; see lib/i18nResolve.ts). This shim is
// wired ONLY into this tool's runtimes: via macroShimHooks.ts + the
// --import preload in the content-i18n-freshness / extract scripts, and via
// resolve.alias in this utility's vitest.config.ts. The studio app and its
// tests never see it.
//
// Fidelity, per export (the registry graph imports exactly these four):
//   msg(descriptor) -> the descriptor itself. That is exactly what the
//     compiled macro emits, so extraction results are unaffected.
//   plural(value, forms) -> a descriptor-shaped stand-in carrying the
//     forms verbatim. The compiled form embeds an ICU message keyed on the
//     source expression's name, which no runtime function can reproduce;
//     plural() is only called at render time in this graph, never at
//     module load, and the extractor never reads plural descriptors.
//   Trans -> a component that renders nothing. Components are never
//     rendered by this tool; the stand-in exists so module-level element
//     creation (`<Trans/>` inside other components' bodies) links.
//   useLingui() -> throws. Reaching it means component render code is
//     executing inside a data-extraction tool, which must fail loudly
//     rather than silently stub the i18n context.

interface DescriptorLike {
  id?: string;
  message?: string;
  [key: string]: unknown;
}

export function msg(descriptor: DescriptorLike): DescriptorLike {
  return descriptor;
}

export function plural(
  value: unknown,
  forms: Record<string, unknown>,
): DescriptorLike {
  return { message: undefined, _pluralValue: value, _pluralForms: forms };
}

export function Trans(): null {
  return null;
}

export function useLingui(): never {
  throw new Error(
    "linguiMacroShim: useLingui() called in the i18n-content-extract tool, " +
      "which loads studio modules for data extraction only and never renders.",
  );
}
