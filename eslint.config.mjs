// ESLint flat config (ESLint v10). The `lint` script targets
// `packages/*/src/**/*.{ts,tsx}`; this config applies the typescript-eslint
// recommended rule set to those files. Type-aware rules are intentionally
// not enabled — `pnpm typecheck` already runs the full strict tsc pass, so
// lint stays fast and focuses on lint-only concerns.

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

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
];
