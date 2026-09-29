# Studio

## Commands

```bash
pnpm dev
pnpm --filter @repo/studio build
pnpm exec turbo test --filter @repo/studio
pnpm --filter @repo/studio typecheck
pnpm check
```

Run development through the root Alchemy stack so Cloudflare bindings are
available to TanStack's server runtime.

Alchemy injects the Cloudflare Vite integration during development and
deployment. Do not add `@cloudflare/vite-plugin` or another deployment adapter
to `vite.config.ts`.

Studio has no data bindings of its own. It reaches `studio-api` through the
`STUDIO_API` service binding: RPC for data, and `/api/auth/*` forwarded
unchanged so sign-in cookies belong to Studio's host.

Screens follow the [Studio designs](https://claude.ai/artifact/Soz1iX7Fw3M1KnotJgL5QU).
