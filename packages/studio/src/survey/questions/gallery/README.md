# Gallery decision modules (spec 090)

One module file per decision a gallery/editor step settles — the fourteen
`settles` ids in `steps/stepDependencies.ts`. Each file's name is its module
id (`windowsLayout.ts` → `windowsLayout`), and its module's
`definition.id` must match: the shared contract suite
(`src/test/questionModuleContract.ts`) globs `survey/questions/*/*.ts`
eagerly and treats every file here as a LIVE module (only `reserve/` is
demoted), so each file must satisfy the full module contract — `inputs` /
`writes` arrays, at least one field-shaped fixture, and a
`definitionContract` snapshot line.

Rules of the folder:

- **No `index.ts` / group file in here** — it would be globbed as a module
  named `index`. The group list (`galleryModules`) lives in
  `../registry.ts`, mirroring `reserveOnlyModules`.
- **No store imports** (FR-003): a gallery module is a pure descriptor —
  `provides` / `requires`, a typed `apply(value, ctx)` returning a
  `WorkingCopyPatch`, and a `renderer` component that receives the decision
  value through `DecisionRendererProps` and reports changes through
  `onChange` only. Enforced by the `gallery-modules-no-store-writes`
  dependency-cruiser rule and the ESLint overlay.
- Modules are typed `GalleryModule<V>` (see `survey/types.ts`): `apply` and
  `renderer` work on the decision's real value type `V`, not the
  answer-shaped `string | string[]`. The gallery host
  (`steps/galleryHost.tsx`) records the decision and invokes `apply`
  directly, reusing 089's channel authorization and patch sink (research
  addendum D-090-1).
