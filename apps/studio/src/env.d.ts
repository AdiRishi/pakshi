import type { StudioEnv } from "@repo/infra/worker-bindings";

declare global {
  namespace Cloudflare {
    interface Env extends StudioEnv {}
  }
}

export {};
