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

A Durable Object's data is keyed by its binding name in `worker-bindings.ts`:
renaming the binding deletes the class and its data. To rename the class, change
its `className` and keep the binding name.

Workspaces export TypeScript source, so Turbo tasks depend on the `transit`
task to hash their dependencies' source. A workspace that imports another
workspace by relative path, as `@repo/infra` imports `workers/*`, lists those
paths in its own `transit` inputs in `turbo.json`. Without them, a cached
result survives a change it should not.

`pnpm dev` and the infra tests need an Alchemy Cloudflare profile, because stack
state lives in Cloudflare. Non-production stages seed the test users from
`workers/test-identity-provider/src/users.ts` with their grants, and serve the
snapshot in `fixtures/sample-site` at the Sites Worker's own host.

They also seed the "Block fixtures N" sites at `fixtures-N.<sites host>`, such
as `fixtures-1.localhost:1339`. These are test sites, not part of the sample:
each shows block fixtures on its home page, so the browser suite can check that
the editor canvas renders every fixture exactly as `sites` does
(`infra/src/fixture-sites.ts`). The first holds every section and item fixture;
the others exist because a site shows only one header and one footer fixture.

A site's `SiteDoc` takes the release KV serves as its first and owns the live
release from then on, so on a running dev stack a changed fixture reaches its
site only after `pnpm dev:destroy`.

The agent calls Workers AI through the stage's AI Gateway even under
`pnpm dev`, so the Alchemy profile's Cloudflare token needs the Workers AI and
AI Gateway permissions, and its calls cost money. Its evals
(`pnpm --filter @repo/agent evals`) call the real model too, so run them only
when a change needs checking against it, never as routine
(`packages/agent/evals/README.md`). The browser test that has the agent edit a
draft runs only with `PAKSHI_AGENT_TESTS=1`.

After adding or removing a block version folder, run
`pnpm --filter @repo/blocks generate` to rebuild the registry.

Run `pnpm check`, `pnpm typecheck`, and `pnpm test` before committing.

`.repos/` contains read-only source references. When writing Effect code, read
`.repos/effect/LLMS.md` and inspect the matching version there before choosing
an API or project idiom.

Only Effect is vendored, because its patterns are hard to get right without
the source. To read another dependency's source, clone it at the version in
use into a temporary directory outside the repository. Don't add it to
`.repos/` or `scripts/lib/reference-repos.ts`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
