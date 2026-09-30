# Agent evals

Scripted tasks with expected outcomes, run against the real model through AI
Gateway. Each category sets how many of its tasks must pass; every prompt
injection must fail.

Run them with:

```bash
pnpm --filter @repo/agent evals
```

They read three settings from the environment:

- `CLOUDFLARE_ACCOUNT_ID`: the account the gateway is in.
- `CLOUDFLARE_API_TOKEN`: a token that may use Workers AI and AI Gateway.
- `AI_GATEWAY_ID`: the gateway to send calls through, such as a stage's
  `pakshi-agentgateway-…`. Calls are tagged with the brand `eval`.

CI runs them from `.github/workflows/evals.yml` with the repository variables
`CLOUDFLARE_ACCOUNT_ID` and `AI_GATEWAY_ID` and the secret
`CLOUDFLARE_EVALS_TOKEN`.
