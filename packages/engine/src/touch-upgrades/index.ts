// Touch layout upgrade fixers (spec 111 T059a-T059c), after the owner's
// Template Cleanup scripts. The caps fixer is `syncTouchCapsLayerRaw`
// (../caps); this folder holds the modifier-key and symbols-layer fixers.
export { fixTouchModifierKeysRaw } from "./fixTouchModifierKeys.js";
export { addTouchSymbolsLayerRaw } from "./addTouchSymbolsLayer.js";
