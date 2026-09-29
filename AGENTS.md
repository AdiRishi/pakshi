# Working in this repository

Read `docs/adr/` before changing repository layout, build wiring, or test setup.

Pakshi is built checkpoint by checkpoint from `docs/build-plan.mdx`. A
checkpoint links to the parts of `docs/product-spec.mdx` and
`docs/technical-design.mdx` that define it; those two docs are the source of
truth. A checkpoint is done when its "Done when" checks pass.

`docs/` is a Blume site. Run `pnpm docs:dev` to browse it locally and
`pnpm docs:build` after changing pages or documentation configuration.

Infrastructure belongs in `infra/`; Worker bindings are defined once in
`infra/src/worker-bindings.ts` and imported by each runtime.

Run `pnpm check`, `pnpm typecheck`, and `pnpm test` before committing.

`.repos/` contains read-only source references. When writing Effect code, read
`.repos/effect/LLMS.md` and inspect the matching version there before choosing
an API or project idiom.
