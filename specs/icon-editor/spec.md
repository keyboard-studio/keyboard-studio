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

The pipeline half landed with #1550 (2026-11-07): Continue records the
payload in the working-copy store (`setIcon`); `projectWorkingCopyVfs`
applies it after the id-rename pass, writing the bytes to
`source/<id>.ico` as a flagged binary VFS entry and ensuring
`store(&BITMAP)` — byte-identical, never re-encoded — so the `.zip` and
the fork+PR tree carry the author's icon. The icon step also offers an
opt-in initials generator (initials over a flat background) and the
Output screen previews the authored icon.

## Placement

The `icon` step sits on the manifest spine after Documentation (`html`) and
before Package. Advance: `html` → `icon` → `done` (navigate `output`). The
gallery decision module is `icon` (`provides: ["icon"]`,
`requires: ["welcome-htm"]`, `screen: "icon"`); recording is step-side via
onComplete on Continue. The module's `apply` is a no-op — the icon data
lands in the decision record for downstream serialization paths.

## Decisions (Matthew, 2026-11-03, revised 2026-11-06)

- Unskippable step; three options, chosen up front — Keep is the default
  when the template has an icon. Keep passes the template's `.ico`
  through byte-for-byte; Edit source icon loads it into the pixel
  editor; Create icon starts from a blank white canvas. When the
  template has no usable `.ico`, only Create is offered.
- Big pixel editor at 48×48 — the largest size an `.ico` entry ever
  needs — shown large with hard pixels (what you draw is what ships).
  No high-res working canvas.
- Import-first for Edit/Create: drag-drop or pick SVG/PNG/ICO,
  rasterized to the working canvas. SVG `<text>` rasterizes as-is.
- Hand-rolled ICO codec (`icoCodec.ts`), no new dependencies.

## Scope

- Pixel editor at 48×48 — shown 480px with hard pixels.
- Tools: pen, eraser, line, fill, box, boxFill, circle, circleFill, text,
  picker. Text tool uses a low-res-friendly monospace font, crisp at 16×16.
- Live multi-size preview (16 / 32 / 48 px).
- 1-bit transparency via the alpha channel + AND mask on ICO encode.
- Undo history capped at 30 snapshots.
- Import: SVG, PNG, ICO (decoded and resampled to 48px).
- On Continue: passes `{ iconIcoBase64, iconPngDataUrl }` via onComplete —
  Keep passes the source `.ico` bytes through with a 48px PNG; Edit/Create
  encode the working canvas at 16 / 32 / 48 with a 48px PNG. Continue ALSO
  records the payload in the working-copy store (`setIcon`); the output
  projection applies it after the id-rename pass, writing the bytes to
  `source/<id>.ico` and ensuring `store(&BITMAP)`. Re-entering the step
  shows the recorded icon, not the template's; a resumed draft restores
  it from the draft snapshot.
- Initials generator (opt-in, never a default): initials derived from the
  display name over a flat background colour, drawn with the text tool's
  monospace raster.
- Output screen previews the authored icon (48px PNG) with a Change link
  back to the icon step.
- Out of scope: bitmap export beyond the `.ico` + PNG payload, dotted-circle
  diacritic base handling.
