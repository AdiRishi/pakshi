import type { SitesApiEnv, StudioApiEnv } from "./worker-bindings.ts";

/*
 * What each Worker's bindings become when its E2E tests run it on the
 * Cloudflare Vitest plugin, which reads Miniflare options rather than this
 * repository's Alchemy graph. Each list is checked against the Worker's env,
 * so a binding added in worker-bindings.ts must be given a stand-in here.
 */

/** How one binding is stood in for under Miniflare. */
export type TestBinding =
  | { readonly kind: "d1" }
  | { readonly kind: "kv" }
  | { readonly kind: "r2" }
  | { readonly kind: "durableObject"; readonly className: string; readonly worker?: string }
  /** Another Worker in the test, or one of its named entrypoints. */
  | { readonly kind: "service"; readonly worker: string; readonly entrypoint?: string }
  | { readonly kind: "text"; readonly value: string };

type TestBindings<Env> = { readonly [Name in keyof Env]-?: TestBinding };

/** The auxiliary Workers E2E tests run beside the Worker under test. */
export const testWorkers = {
  sitesApi: "sites-api",
  /** Stands in for Email Service, keeping each message for tests to read. */
  mailbox: "test-mailbox",
  /** Stands in for Workers AI, which only runs on Cloudflare's network. */
  workersAi: "test-workers-ai",
} as const;

/** The host E2E tests give every site's platform subdomain. */
export const testSitesHost = "sites.pakshi.test";

export const studioApiTestBindings = {
  EMAIL: { kind: "service", worker: testWorkers.mailbox, entrypoint: "Mailbox" },
  EMAIL_SENDER: { kind: "text", value: "notifications@pakshi.test" },
  SITE_DOC: { kind: "durableObject", className: "SiteDoc" },
  SITE_AGENT: { kind: "durableObject", className: "SiteAgent" },
  AI: { kind: "service", worker: testWorkers.workersAi, entrypoint: "WorkersAi" },
  AI_GATEWAY: { kind: "text", value: "pakshi-test" },
  SITE_SUBMISSIONS: {
    kind: "durableObject",
    className: "SiteSubmissions",
    worker: testWorkers.sitesApi,
  },
  SITES_API: { kind: "service", worker: testWorkers.sitesApi },
  CORE: { kind: "d1" },
  CONTENT: { kind: "r2" },
  ROUTING: { kind: "kv" },
  ENVIRONMENT: { kind: "text", value: "test" },
  AUTH_SECRET: { kind: "text", value: "a-test-secret-that-is-long-enough-for-better-auth" },
  SITES_HOST: { kind: "text", value: testSitesHost },
} as const satisfies TestBindings<StudioApiEnv>;

export const sitesApiTestBindings = {
  SITE_SUBMISSIONS: { kind: "durableObject", className: "SiteSubmissions" },
  ENVIRONMENT: { kind: "text", value: "test" },
} as const satisfies TestBindings<SitesApiEnv>;

interface MiniflareBindings {
  readonly d1Databases: Array<string>;
  readonly kvNamespaces: Array<string>;
  readonly r2Buckets: Array<string>;
  readonly durableObjects: Record<
    string,
    { className: string; scriptName?: string; useSQLite: true }
  >;
  readonly serviceBindings: Record<string, { name: string; entrypoint?: string }>;
  readonly bindings: Record<string, string>;
}

/**
 * Miniflare's options for a set of bindings. Stores of the same name are
 * shared by every Worker in the test that binds them, as they are on
 * Cloudflare.
 */
export const miniflareBindings = (bindings: Readonly<Record<string, TestBinding>>) => {
  const options: MiniflareBindings = {
    d1Databases: [],
    kvNamespaces: [],
    r2Buckets: [],
    durableObjects: {},
    serviceBindings: {},
    bindings: {},
  };
  for (const [name, binding] of Object.entries(bindings)) {
    switch (binding.kind) {
      case "d1":
        options.d1Databases.push(name);
        break;
      case "kv":
        options.kvNamespaces.push(name);
        break;
      case "r2":
        options.r2Buckets.push(name);
        break;
      case "durableObject":
        // Every Durable Object in Pakshi keeps its storage in SQLite.
        options.durableObjects[name] =
          binding.worker === undefined
            ? { className: binding.className, useSQLite: true }
            : { className: binding.className, scriptName: binding.worker, useSQLite: true };
        break;
      case "service":
        options.serviceBindings[name] =
          binding.entrypoint === undefined
            ? { name: binding.worker }
            : { name: binding.worker, entrypoint: binding.entrypoint };
        break;
      case "text":
        options.bindings[name] = binding.value;
        break;
    }
  }
  return options;
};
