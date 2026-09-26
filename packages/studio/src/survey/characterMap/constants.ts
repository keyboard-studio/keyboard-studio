// Shared constants for the CharacterMapPane extraction.

// "Produced by the base keyboard, not yet in your alphabet" chip outline — a
// muted DASHED border, paired with an accessible-name hint (never colour or
// line style alone). It used to be a solid amber border, which read as
// "selected": on a basic_kbdus base the whole Basic Latin block looked already
// chosen. A dashed muted line says "available" without looking picked.
export const BASE_OUTPUT_BORDER = "1px dashed var(--app-text-muted)";
