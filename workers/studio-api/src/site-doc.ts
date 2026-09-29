import { SqliteClient } from "@effect/sql-sqlite-do";
import type { Draft } from "@repo/contracts/draft";
import { SiteId } from "@repo/contracts/ids";
import type { Batch } from "@repo/contracts/ops";
import { LiveRelease, routingKeys, snapshotReader } from "@repo/contracts/snapshot";
import type { BatchOutcome } from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";
import { Server } from "partyserver";

import { type LiveSnapshot, migrations, SiteDrafts, SiteSource } from "./drafts.ts";

/** The site's live release, its snapshot and every page in it, read from KV and R2. */
const readLiveSnapshot = async (env: StudioApiEnv, site: SiteId): Promise<LiveSnapshot> => {
  const value = await env.ROUTING.get(routingKeys.site(site));
  if (value === null) throw new Error(`${site} has no live release to start a draft from.`);
  const live = Schema.decodeSync(Schema.fromJsonString(LiveRelease))(value);
  const snapshots = snapshotReader(async (key) => (await env.CONTENT.get(key))?.text() ?? null);
  const manifest = await snapshots.manifest(site, live.snapshot);
  const pages = await Promise.all(manifest.pages.map((page) => snapshots.page(site, page.object)));
  return { live, manifest, pages };
};

/** A site's drafts over its SiteDoc's SQLite storage, with the storage schema applied first. */
const draftsRuntime = (storage: DurableObjectStorage, env: StudioApiEnv, site: SiteId) =>
  ManagedRuntime.make(
    SiteDrafts.layer.pipe(
      Layer.provide(Layer.effectDiscard(Migrator.make({})({ loader: migrations }))),
      Layer.provide(
        Layer.succeed(SiteSource)({
          site,
          liveSnapshot: Effect.promise(() => readLiveSnapshot(env, site)),
        }),
      ),
      Layer.provide(SqliteClient.layer({ storage })),
      Layer.orDie,
    ),
  );

/**
 * A site's drafts, submissions and live release, edited live by people and the agent.
 * Other code reaches it through PartyServer's `getServerByName`, named by site ID.
 *
 * PartyServer requires its env to extend the global `Cloudflare.Env`. Other
 * Workers' programs include this file through the binding types and declare
 * their own global env, so the intersection keeps the constraint true in all of
 * them; in this Worker it is just StudioApiEnv.
 */
export class SiteDoc extends Server<StudioApiEnv & Cloudflare.Env> {
  static override options = { hibernate: true };

  #drafts: ReturnType<typeof draftsRuntime> | undefined;

  #run<A>(
    use: (
      drafts: SiteDrafts["Service"],
    ) => Effect.Effect<A, SqlError.SqlError | Schema.SchemaError>,
  ) {
    this.#drafts ??= draftsRuntime(
      this.ctx.storage,
      this.env,
      Schema.decodeSync(SiteId)(this.name),
    );
    return this.#drafts.runPromise(SiteDrafts.use(use));
  }

  /** The site's draft, started from the live release the first time it's opened. */
  async draft(): Promise<Draft> {
    return this.#run((drafts) => drafts.draft);
  }

  /** Commits a batch for a person whose permission studio-api has checked. */
  async applyBatch(actor: string, batch: Batch): Promise<BatchOutcome> {
    return this.#run((drafts) => drafts.applyBatch(actor, batch));
  }
}
