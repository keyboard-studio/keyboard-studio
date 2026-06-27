# Contract: `ui/` Primitive Library Public Surface

This is the UI contract P2/P4 build against. Two parts: (1) the library's public exports + prop contracts, (2) the architecture-boundary contract.

## 1. Public exports (`packages/studio/src/ui/index.ts`)

```ts
// Primitives
export { Button } from "./Button.tsx";
export { Card } from "./Card.tsx";
export { TextField } from "./TextField.tsx";
export { Textarea } from "./Textarea.tsx";
export { Autocomplete } from "./Autocomplete.tsx";
export { Dropdown } from "./Dropdown.tsx";
export { RadioGroup } from "./RadioGroup.tsx";
export { MultiSelect } from "./MultiSelect.tsx";
export { Checkbox } from "./Checkbox.tsx";
export { Label } from "./Label.tsx";
export { ErrorText } from "./ErrorText.tsx";
export { Notice } from "./Notice.tsx";
export { Field } from "./Field.tsx";
export { Badge } from "./Badge.tsx";
// Theme
export * as theme from "./theme.ts";
```

> Explicit `.ts`/`.tsx` extensions are mandatory (repo Bundler-resolution convention).

## 2. Prop contracts (illustrative — finalized in implementation)

Each primitive extends the native element's props so existing call sites pass through unchanged (zero-diff). Examples:

```ts
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "back";   // default "secondary"
};

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
  mono?: boolean;
};

type RadioGroupProps = {
  mode?: "list" | "bool";                        // default "list"
  name: string;
  value: string | null;
  options: { value: string; label: string }[];   // bool mode: yes/no synthesized
  accent?: string;                                // bool mode preserves #3fb950
  onChange: (value: string) => void;
};

type ErrorTextProps = {
  tone: "error" | "warning" | "hint";            // error/warning -> role=alert, hint -> role=status
  children: React.ReactNode;
};

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;                            // renders the #e74c3c marker
};
```

**Contract invariants**:
- A primitive renders the **same element + `role` + resolved styles** as the inline control it replaces (FR-005).
- Style overrides via the native `style`/`className` props are honored so divergent call-site values survive exactly (Decision 2).
- No primitive reads global state or context from `survey/`/`steps/`/`stores/` (FR-004).

## 3. Architecture-boundary contract (dependency-cruiser)

Added to `.dependency-cruiser.cjs` `forbidden[]` — the first intra-`studio/src` rule:

```js
{
  name: 'ui-is-a-leaf',
  comment: 'studio ui/ primitives are a dependency leaf: no imports from survey/, steps/, or stores/ (feature 011).',
  severity: 'error',
  from: { path: '^packages/studio/src/ui/' },
  to:   { path: '^packages/studio/src/(survey|steps|stores)/' },
}
```

**Contract test (SC-003)**: introducing an import from any `ui/` module to `survey/`/`steps/`/`stores/` MUST make `pnpm depcruise` fail; the clean tree MUST pass. `ui/ → lib/` is permitted (theme/helpers).

## 4. Theme contract (`ui/theme.ts`)

- Exports semantic token accessors mapped to `index.css` CSS custom properties (canonical), **and** the legacy hex names (`BG_PAGE`, `BG_CARD`, `BORDER`, `ACCENT`, `TEXT_DIM`, `TEXT_MAIN`, `FONT`, `BLUE_ACTION`) for `lib/galleryTheme.ts` re-export compatibility.
- `lib/galleryTheme.ts` becomes `export { … } from "../ui/theme.ts";` — one definition, no second token source (FR-003).
