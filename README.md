# Pakshi

Branded websites that non-technical teams build and run themselves. Describe the site you want, and an AI agent assembles it from a library of professionally designed blocks. You review it, approve it, and it goes live on your domain. No developer in the loop.

> [!NOTE]
> Pakshi is in early development. The design is complete and Phase 0 has not started, so this repository still runs the sample app from the [application platform starter](https://github.com/AdiRishi/application-platform-starter) it builds on. Follow along in the [product spec](docs/product-spec.mdx).

## Why Pakshi

Every website project rebuilds the same things: a content system, forms, email, publishing to a domain, and some way for non-technical people to make changes. Visual builders charge per seat and lock you in. Headless CMSs give editors form fields but no real control over the page. Either way, a developer ends up doing the work.

Pakshi takes a different bet. The hard design work happens once, as a library of blocks, themes, and composition rules. After that, editors and the agent only arrange pieces that already look good.

- **Sites look designed, not generated.** The agent picks from well-designed blocks and a brand's theme. It never starts from a blank canvas, so even a cheap model produces a good page.
- **Nothing reaches production unseen.** Every change starts as a draft and can be previewed. Each site sets its own approval workflow, and any release rolls back in about a minute.
- **The agent edits content, never code.** Pages are structured data. Every agent change is validated and can be undone in one click, and the agent can't publish.
- **Improvements reach every site without surprises.** Sites pin their block versions and upgrade deliberately, through a preview.
- **Brands stay in control.** Each brand owns its theme, its voice, and which settings its sites are allowed to change.
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

Alchemy runs the whole stack locally, with emulated databases, storage, and Durable Objects. On the first run, it may ask you to sign in to Cloudflare. Open the URL it prints.

To read the documentation locally, run `pnpm docs:dev`. It needs no Cloudflare credentials.

## Learn more

- [Vision](docs/vision.mdx): the problem, who Pakshi is for, and its principles.
- [Product spec](docs/product-spec.mdx): what the MVP does, and the plan to get there.
- [Technical design](docs/technical-design.mdx): how Pakshi is built on Cloudflare.

## Contributing

Contributions are welcome. For anything larger than a small fix, open an issue first so we can agree on the approach.

Before you open a pull request, make sure these pass:

```sh
pnpm check
pnpm typecheck
pnpm test
```

Read [`AGENTS.md`](AGENTS.md) for repository conventions, and [`docs/adr/`](docs/adr/index.mdx) before changing the repository layout or test setup.
