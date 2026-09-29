# Mobile adaptation guidance (issue 1853)

This is the standing guidance for any agent (human or AI) changing studio UI.
Mobile is a **layout extension, not a reskin**: preserve desktop behavior and
markup unless a responsive branch is active.

## The five rules

1. **Review both form factors.** Every UI change needs an explicit mobile AND
   desktop impact review. "It looks fine on desktop" is not a review of the
   390px viewport. If the change touches layout, state which viewport branches
   were considered and which were tested.

2. **Share tokens, don't duplicate configs.** Colors, spacing, radii, and
   shadows live in one token set (`ui/` theme tokens, CSS variables). Form-factor
   differences become *shared tokens* (e.g. `--app-touch-target`), never a
   parallel mobile config. If you find yourself writing `mobileColors` or
   `desktopTheme`, stop — that's the bug.

3. **Separate geometry from pointer capability.** Layout branches read
   `useViewport()` / `useIsNarrow()` (width, height, orientation). Touch-sizing
   branches read `useIsCoarsePointer()` (`(pointer: coarse)`). A landscape phone
   (844×390) is wide AND coarse: it gets desktop layout with 44px touch targets.
   Never use width as a proxy for touch, or touch as a proxy for width.

4. **Cover both in tests.** Changed UI needs desktop (unchanged-behavior) AND
   mobile (new-branch) test coverage. The Playwright lanes enforce this at the
   e2e level: `--project=desktop` runs the existing specs, `--project=mobile`
   runs `mobile-*.spec.ts` on Pixel 7.

5. **Use the viewport API, don't hand-roll.** Every narrow-viewport branch reads
   through `hooks/useViewport.ts` (`useViewport`, `useIsNarrow`,
   `useIsCoarsePointer`) and `ui/breakpoints.ts` (`BREAKPOINTS`). Never write a
   `matchMedia` / `resize` listener at a call site, and never hard-code `390`,
   `479`, or `768` — import the breakpoint.

## Viewport API reference

```ts
import { useViewport, useIsNarrow, useIsCoarsePointer } from "../hooks/useViewport.ts";
import { BREAKPOINTS } from "../ui/breakpoints.ts";

// BREAKPOINTS:
//   mobileMax: 479    — isNarrow: stacked layouts, thumb-zone nav, sheets
//   tabletMax: 768    — isTabletOrNarrow: two-pane collapses needing more room
//   shortHeightMax: 500 — compact OSK sizing for scarce vertical space
```

- `useIsNarrow()` → `width <= 479`. Use for layout branches.
- `useIsCoarsePointer()` → `(pointer: coarse)`. Use for 44px targets, tap
  affordances. Independent of width.
- `useViewport()` → `{ width, height, orientation, isNarrow, isTabletOrNarrow,
  isCoarsePointer }`. Use when you need height or orientation (e.g. side-dock
  sheets in short landscape).

## Binding constraints (from issue 1853)

- **KeymanWeb stays.** The typing keyboard is the existing KeymanWeb engine +
  OSK iframe on every viewport. Change host layout/lifecycle only — never the
  engine internals, iframe internals, or `postMessage` channel.
- **OSK visibility is author-controlled.** Wherever the OSK shows, the author can
  hide it to reclaim workspace. Hiding unmounts the iframe (unloading KeymanWeb);
  showing remounts through normal initialization.
- **Choice copy is symmetric.** When presenting Allow/Block (or any tradeoff),
  state both risks plainly. Never sell one side.
