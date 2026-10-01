import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Each test file runs on storage of its own, so each starts from an empty core database.
await applyD1Migrations(env.CORE, env.TEST_MIGRATIONS);
