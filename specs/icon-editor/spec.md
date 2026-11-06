# Feature Specification: Icon editor step

**Feature Branch**: `km/icon-editor`

**Created**: 2026-11-04

**Status**: Draft (as-built)

**Owner**: Studio team

## Purpose

After Documentation, the author designs the keyboard's icon (`.ico`): a
modern reimagining of TIKE's bitmap editor, not a port. The step emits the
icon payload on Continue; the output pipeline writes the `.ico` file into
the package.

## Placement

The `icon` step sits on the manifest spine after Documentation (`html`) and
before Package. Advance: `html` → `icon` → `done` (navigate `output`). The
gallery decision module is `icon` (`provides: ["icon"]`,
`requires: ["welcome-htm"]`, `screen: "icon"`); recording is step-side via
onComplete on Continue. The module's `apply` is a no-op — the icon data
lands in the decision record for downstream serialization paths.

## Decisions (Matthew, 2026-11-03)

- Unskippable step; changing nothing keeps the template's icon.
- The base keyboard's icon is the starting point, loaded from the start
  VFS snapshot; when it carries no usable `.ico`, a generated default icon
  (from the keyboard name) is used instead.
- Import-first: drag-drop or pick SVG/PNG/ICO, rasterized to the working
  canvas. SVG `<text>` rasterizes as-is.
- Hand-rolled ICO codec (`icoCodec.ts`), no new dependencies.

## Scope

- Pixel editor at 256×256 — shown large with hard pixels (what you draw is
  what ships).
- Tools: pen, eraser, line, fill, box, boxFill, circle, circleFill, text,
  picker. Text tool uses a low-res-friendly monospace font, crisp at 16×16.
- Live multi-size preview (16 / 32 / 48 px).
- 1-bit transparency via the alpha channel + AND mask on ICO encode.
- Undo history capped at 30 snapshots.
- Import: SVG, PNG, ICO (decoded and resampled to 256px).
- On Continue: passes `{ iconIcoBase64, iconPngDataUrl }` via onComplete —
  the ICO is encoded at 16 / 32 / 48 / 256 px, the PNG data URL is the
  256px canvas. Continue with no pixels is a no-op.
- Out of scope: bitmap export beyond the `.ico` + PNG payload, dotted-circle
  diacritic base handling.
