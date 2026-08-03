// ESLint flat config (ESLint v10). The `lint` script targets
// `packages/*/src/**/*.{ts,tsx}`; this config applies the typescript-eslint
// recommended rule set to those files. Type-aware rules are intentionally
// not enabled — `pnpm typecheck` already runs the full strict tsc pass, so
// lint stays fast and focuses on lint-only concerns.

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import lingui from "eslint-plugin-lingui";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      // Generated recognizer rules — codegen output, not hand-edited.
      "**/recognizer/rules/generated/**",
      // Vendored upstream Keyman code (see simulator/vendor/.../PROVENANCE.md):
      // third-party, not ours to lint.
      "**/simulator/vendor/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // React Hooks correctness for the studio SPA. rules-of-hooks catches real
      // bugs; exhaustive-deps is advisory (warn) — several call sites opt out
      // deliberately via inline eslint-disable, which now resolves.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The codebase marks intentionally-unused bindings with a leading
      // underscore (destructure-omit, placeholder params, type-only imports
      // kept for documentation). Honour that convention.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Disallow console.* calls in shipped code — route intentional
      // diagnostics through the `devLog` helper (@keyboard-studio/contracts/
      // dev-log), which prints in dev/test/CLI and goes inert in a production
      // build. That helper holds the single sanctioned console sink; every
      // other call site should use it, so a warning here means a stray call.
      "no-console": "warn",
    },
  },
  {
    // Tests, codegen determinism harnesses, and other *.test.ts files run
    // only under vitest/Node and log freely for diagnostics — they never
    // reach a production bundle, so the no-console gate does not apply.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Accessibility gate for shipped studio JSX (spec 056 FR-002; house
    // rules in docs/accessibility.md). Recommended ruleset at error
    // severity — a defect this plugin detects (missing label, invalid
    // ARIA, click-without-key) fails `pnpm lint`. Any rule demoted or
    // disabled here needs an inline justification per FR-002. Tests are
    // out of scope: fixture JSX never ships.
    files: ["packages/studio/src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "**/test/**"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // ignoreNonDOM: only flag autoFocus on real DOM elements. A custom
      // component's autoFocus prop (e.g. CharChipEditor autoFocus={false})
      // is an API the component resolves internally — any DOM autoFocus it
      // renders is still caught at that DOM site. Deliberate in-dialog focus
      // placement per APG carries a per-site disable instead (ConfirmDialog).
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
      // Not a demotion — teach the rule which house primitives (packages/
      // studio/src/ui) render a real form control, so a wrapping <label>
      // counts as associated. Plain <label> next to plain <div> still errors.
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: [
            "Checkbox",
            "TextField",
            "Textarea",
            "SelectMenu",
            "MultiSelect",
            "RadioGroup",
          ],
        },
      ],
    },
  },
  {
    // Unlocalized-string SCAN for the studio's Tier-A UI surface.
    //
    // Scope is deliberately narrow — studio COMPONENT files (`.tsx`) only:
    //   - Tier-B content (survey/questions/*.ts, localized via the content
    //     extraction pipeline, NOT <Trans>) is `.ts`, so it is out of scope
    //     here and never false-flagged.
    //   - Data maps / enums (iso3166Names, keyOptions, scriptAxes — also `.ts`)
    //     are likewise out of scope.
    // Level is `warn`, never `error`: this is a periodic "what did we forget to
    // internationalize" signal, not a merge gate. It must not turn CI red — the
    // codebase's heavy inline CSS-in-JS guarantees residual noise the ignore
    // list below can only partly tame. Genuine hits get wrapped in <Trans>/t();
    // legitimate non-UI strings get an inline `// eslint-disable-next-line`.
    files: ["packages/studio/src/**/*.tsx"],
    ignores: [
      "**/*.test.tsx",
      "**/test/**",
      // Dev-only demo route (/?demo=lint) — not production UI.
      "**/lint/LintDemo.tsx",
    ],
    plugins: { lingui },
    rules: {
      "lingui/no-unlocalized-strings": [
        "warn",
        {
          ignore: [
            "^(?![A-Z])\\S+$", // single lowercase token (css keyword, identifier, hex, url)
            "^[A-Z0-9_ ./-]+$", // ALL-CAPS / codes / paths / short tokens
            "^[#.@/{]", // css selector, hex colour, path, template fragment
            "\\d", // contains a digit (css sizes, versions) — pragmatic noise cut
            "->", // example key-mappings ("a -> A")
            "system-ui|-apple-system|monospace|sans-serif|Segoe|Roboto|Consolas|Cascadia|Playfair", // font stacks
            "^(GitHub|Google)$", // brand names — never translated
          ],
          ignoreNames: [
            { regex: { pattern: "className", flags: "i" } },
            "style", "styleName", "src", "srcSet", "type", "id", "width", "height",
            "displayName", "key", "role", "name", "data-testid", "testId", "viewBox",
            "xmlns", "d", "fill", "stroke", "href", "rel", "target", "htmlFor",
            "autoComplete", "inputMode", "fontFamily", "font", "background", "color",
            "transform", "transition", "boxShadow", "gridTemplateColumns",
          ],
          ignoreFunctions: [
            "console.*", "devLog.*", "Error", "*.addEventListener",
            "*.removeEventListener", "*.postMessage", "*.getElementById",
            "*.querySelector", "*.querySelectorAll", "*.setAttribute",
            "*.getAttribute", "*.setProperty", "*.includes", "*.indexOf",
            "*.endsWith", "*.startsWith", "*.matchMedia", "require",
            "slugify*", "normalize*",
          ],
        },
      ],
    },
  },
];
