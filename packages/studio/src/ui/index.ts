// ui/ primitive library — public export surface.
// Re-exports the primitives by named export + the theme namespace.

export { Button } from "./Button.tsx";
export { Card } from "./Card.tsx";
export { TextField } from "./TextField.tsx";
export { Textarea } from "./Textarea.tsx";
export { RadioGroup } from "./RadioGroup.tsx";
export { MultiSelect } from "./MultiSelect.tsx";
export { SelectMenu } from "./SelectMenu.tsx";
export { Checkbox } from "./Checkbox.tsx";
export { Label } from "./Label.tsx";
export { ErrorText } from "./ErrorText.tsx";
export { Notice } from "./Notice.tsx";
export { Field } from "./Field.tsx";
export { Badge } from "./Badge.tsx";
export { KeyCap } from "./KeyCap.tsx";
export { Dialog } from "./Dialog.tsx";
export { ResponsiveSplit } from "./ResponsiveSplit.tsx";
export { Switch } from "./Switch.tsx";
export { BREAKPOINTS } from "./breakpoints.ts";
export { DiffHunkList } from "./DiffHunkList.tsx";
export * as theme from "./theme.ts";

// Type-only re-exports so call sites need not import from primitive source files.
export type { BadgeTone } from "./Badge.tsx";
export type { DialogProps } from "./Dialog.tsx";
export type { ResponsiveSplitProps } from "./ResponsiveSplit.tsx";
export type { SwitchProps } from "./Switch.tsx";
export type { BreakpointName } from "./breakpoints.ts";
export type { RadioOption } from "./RadioGroup.tsx";
export type { MultiSelectOption } from "./MultiSelect.tsx";
export type { SelectMenuOption } from "./SelectMenu.tsx";
