import type { StudioEnv } from "@repo/infra/worker-bindings";

import type { ShownPreview } from "./features/preview/serve";

declare global {
  namespace Cloudflare {
    interface Env extends StudioEnv {}
  }
}

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      /** The page of a draft's preview or a submission's review the request shows, if any. */
      requestContext: { readonly preview: ShownPreview | null };
    };
  }
}

export {};
