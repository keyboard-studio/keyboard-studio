// ui/ primitive library — public export surface.
// Re-exports all 14 primitives by named export + the theme namespace.

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
export * as theme from "./theme.ts";

// Type-only re-exports so call sites need not import from primitive source files.
export type { BadgeTone } from "./Badge.tsx";
export type { DropdownOption } from "./Dropdown.tsx";
export type { RadioOption } from "./RadioGroup.tsx";
export type { MultiSelectOption } from "./MultiSelect.tsx";
