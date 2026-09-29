# Mobile adaptation guidance

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

## Binding constraints

- **KeymanWeb stays.** The typing keyboard is the existing KeymanWeb engine +
  OSK iframe on every viewport. Change host layout/lifecycle only — never the
  engine internals, iframe internals, or `postMessage` channel.
  - *Exception (pending sign-off):* the OSK frame (`public/osk-frame.*`) now
    sizes the keyboard to its host box's **current** width, re-sizes on width
    change (ResizeObserver), scales the height below the device profile's
    width, and posts one new frame→host event, `CONTENT_HEIGHT`, so the host
    iframe shows the whole keyboard. KeymanWeb itself is untouched. Without it
    the keyboard rendered at a stale width and its bottom rows were cropped at
    phone widths.
- **OSK visibility is lifecycle, not a switch.** On narrow viewports the OSK
  lives in a `PreviewSheet` and is mounted only while the sheet is open —
  dismissing it unmounts the iframe (unloading KeymanWeb). There is no in-pane
  show/hide toggle.
- **Choice copy is symmetric.** When presenting Allow/Block (or any tradeoff),
  state both risks plainly. Never sell one side.

## Narrow-viewport patterns

- **Chrome is one top row.** `NavBar` on narrow shows the ☰ menu (route links
  first, then Contents, locale, theme, account, reset) and, on the survey, the
  compact phase summary in place of the wordmark. There is no bottom tab bar;
  the journey footer (Back / Next / Contents) is the only bottom chrome, and the
  shell uses `100dvh` so the footer is never pushed below the visible screen.
- **Secondary views open from a button, not a tab.** A live preview (or the
  character map) opens from the floating `PreviewButton` into a `PreviewSheet`
  (`flush` for an edge-to-edge keyboard). The button renders only when there is
  something to show, so a step with nothing to preview is just its questions.
  Use `placement="sticky"` on pages that scroll as a whole. Survey, assign-loop
  galleries and touch-seed all use this one pattern.
- **Progress is a labelled list, not bare dots.** Phones have no hover, so the
  footer's dot row becomes a "Contents" button opening `JourneyContents`: the
  same marks as `buildProgressDots`, each beside its label, with the current
  stage expanded into its questions. Also reachable from the ☰ menu.
- **Lead with the outcome.** Where a page's purpose is one action (Output), put
  that action first and collapse supporting detail behind a disclosure.
