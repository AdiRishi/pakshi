<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="packages/brand/assets/logo-inverse.svg">
    <img src="packages/brand/assets/logo.svg" alt="Pakshi" height="72">
  </picture>
</h1>

Branded websites that non-technical teams build and run themselves. Describe the site you want, and an AI agent assembles it from a library of professionally designed blocks. You review it, approve it, and it goes live on your domain. No developer in the loop.

> [!NOTE]
> Pakshi is in early development. Studio edits a page's content and structure, and sites serve a published snapshot; live co-editing comes next. Follow along in the [build plan](docs/build-plan.mdx).

## Why Pakshi

Every website project rebuilds the same things: a content system, forms, email, publishing to a domain, and some way for non-technical people to make changes. Visual builders charge per seat and lock you in. Headless CMSs give editors form fields but no real control over the page. Either way, a developer ends up doing the work.

Pakshi takes a different bet. The hard design work happens once, as a library of blocks, themes, and composition rules. After that, editors and the agent only arrange pieces that already look good.

- **Sites look designed, not generated.** The agent picks from well-designed blocks and a brand's theme. It never starts from a blank canvas, so even a cheap model produces a good page.
- **Production changes only through a publish.** Every change starts in a draft that can be previewed and shared. Each publish follows the approval workflow its owners set, and a release rolls back in about a minute.
- **The agent edits content, never code.** Pages are structured data. Every agent change is validated and can be undone in one click, and the agent can't publish.
- **Improvements reach every site without surprises.** Sites pin their block versions and upgrade deliberately, through a draft.
- **Brands stay in control.** Each brand owns its theme and voice, and every site in the brand follows them.
- **No per-seat pricing.** Pakshi runs on your own Cloudflare account, on the Workers Paid plan.

Pakshi is built for large organizations that run many brands and many sites, where teams need to own their websites without waiting on a developer.

## Get started

You need Node.js 24 and a Cloudflare account.

```sh
git clone https://github.com/AdiRishi/pakshi.git
cd pakshi
corepack enable
pnpm install
pnpm dev
```

Alchemy runs the whole stack locally, with emulated databases, storage, and Durable Objects. It keeps the stack's state in your Cloudflare account, so it needs a Cloudflare profile: run `pnpm --filter @repo/infra exec alchemy profile edit --profile default --reconfigure Cloudflare` and give it an API token.

`pnpm dev` prints two addresses. Open Studio and set Pakshi up: name your organization and make your account. Then create a brand and a site, and invite people by email. Locally, emails land in `infra/.alchemy/local/email/text/`, and each site answers at its own subdomain of the sites address, such as `northbank-libraries.localhost:1339`.

To read the documentation locally, run `pnpm docs:dev`. It needs no Cloudflare credentials.

## Learn more

- [Vision](docs/vision.mdx): the problem, who Pakshi is for, and its principles.
- [Product spec](docs/product-spec.mdx): what Pakshi does, and for whom.
- [Technical design](docs/technical-design.mdx): how Pakshi is built on Cloudflare.
- [Editor](docs/editor.mdx): the specification for Studio's visual editor.
- [Build plan](docs/build-plan.mdx): the order Pakshi is built in, as checkpoints.
- [Studio designs](https://claude.ai/artifact/Soz1iX7Fw3M1KnotJgL5QU): every Studio screen, as a design canvas.

## Contributing

Contributions are welcome. For anything larger than a small fix, open an issue first so we can agree on the approach.

Before you open a pull request, make sure these pass:

```sh
pnpm check
pnpm typecheck
pnpm test
```

Turbo shares task results through a signed remote cache. If you have the shared credentials, copy [`.env.turbo.example`](.env.turbo.example) to `.env.turbo.local` and fill it in; the root scripts load it before running Turbo. Without it, tasks run against your local cache only. CI reads the same two values from repository secrets, which you can set or rotate from that file with `gh secret set --repo AdiRishi/pakshi --env-file .env.turbo.local`.

Read [`AGENTS.md`](AGENTS.md) for repository conventions, and [`docs/adr/`](docs/adr/index.mdx) before changing the repository layout or test setup.
