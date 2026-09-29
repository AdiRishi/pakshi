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

Production data is never deleted by a deploy. D1, R2, KV and the Workers that
host Durable Objects are retained in production, and `pnpm plan:check` fails a
plan that deletes a D1 database, an R2 bucket or a Durable Object class. A
Durable Object's data is keyed by its binding name in `worker-bindings.ts`:
renaming the binding deletes the class, so rename with `className` instead.

`pnpm dev` and the infra tests need an Alchemy Cloudflare profile, because stack
state lives in Cloudflare. Non-production stages seed the test users from
`workers/test-identity-provider/src/users.ts` with their grants, and serve the
snapshot in `fixtures/sample-site` at the Sites Worker's own host.

After adding or removing a block version folder, run
`pnpm --filter @repo/blocks generate` to rebuild the registry.

Run `pnpm check`, `pnpm typecheck`, and `pnpm test` before committing.

`.repos/` contains read-only source references. When writing Effect code, read
`.repos/effect/LLMS.md` and inspect the matching version there before choosing
an API or project idiom.
