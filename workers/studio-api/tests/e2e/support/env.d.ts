import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import type { D1Migration } from "cloudflare:test";

import type { Mailbox } from "./mailbox.ts";

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import("../../../src/index.ts");
      durableNamespaces: "SiteDoc" | "SiteAgent";
    }
    interface Env extends StudioApiEnv {
      /** The core database's migrations, which each test file applies to its own storage. */
      readonly TEST_MIGRATIONS: Array<D1Migration>;
      /** What Studio sent through Email Service. */
      readonly MAILBOX: Service<Mailbox>;
    }
  }
}
