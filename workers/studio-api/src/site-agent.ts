import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { DurableObject } from "cloudflare:workers";

/** One agent conversation. It becomes an AIChatAgent when the agent is built. */
export class SiteAgent extends DurableObject<StudioApiEnv> {}
