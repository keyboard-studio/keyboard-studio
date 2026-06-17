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
      // Disallow console.* calls — use a structured logger instead. The
      // eslint-disable-next-line suppression comments previously guarding
      // deliberate console calls in compiler/index.ts were removed in #447;
      // this rule activates that removal.
      "no-console": "warn",
    },
  },
];
