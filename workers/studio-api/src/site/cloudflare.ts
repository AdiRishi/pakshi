import { D1Client } from "@effect/sql-d1";
import { MediaId, type SiteId } from "@repo/contracts/ids";
import { PageDocument } from "@repo/contracts/page";
import {
  LiveRelease,
  MediaFile,
  objectKeys,
  routingKeys,
  SnapshotManifest,
  snapshotReader,
} from "@repo/contracts/snapshot";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Layer, Option, Schema } from "effect";

import { recordCopy } from "../copies.ts";
import { mailerFor, notify } from "../notifications.ts";
import { MediaLibrary, OutboxDelivery, Routing, Snapshots } from "./platform.ts";

const json = { httpMetadata: { contentType: "application/json" } };

const MediaRow = Schema.Struct({
  id: MediaId,
  content_type: MediaFile.fields.contentType,
  width: MediaFile.fields.width,
  height: MediaFile.fields.height,
});

const encodePage = Schema.encodeSync(Schema.fromJsonString(PageDocument));
const encodeManifest = Schema.encodeSync(Schema.fromJsonString(SnapshotManifest));
const liveJson = Schema.fromJsonString(LiveRelease);
const decodeLive = Schema.decodeSync(liveJson);
const encodeLive = Schema.encodeSync(liveJson);
const decodeMediaRows = Schema.decodeUnknownSync(Schema.Array(MediaRow));

/** A site's platform edges over studio-api's bindings: R2 for snapshots, KV for routing, D1 and email for the rest. */
export const cloudflarePlatform = (env: StudioApiEnv, site: SiteId) => {
  const core = D1Client.layer({ db: env.CORE });
  const mailer = mailerFor(env);
  const reader = snapshotReader(async (key) => (await env.CONTENT.get(key))?.text() ?? null);
  return Layer.mergeAll(
    Layer.succeed(Snapshots)({
      manifest: (snapshot) => Effect.promise(() => reader.manifest(site, snapshot)),
      page: (hash) => Effect.promise(() => reader.page(site, hash)),
      writePage: (hash, page) =>
        Effect.promise(() => env.CONTENT.put(objectKeys.page(site, hash), encodePage(page), json)),
      writeManifest: (manifest) =>
        Effect.promise(() =>
          env.CONTENT.put(objectKeys.manifest(site, manifest.id), encodeManifest(manifest), json),
        ),
    }),
    Layer.succeed(Routing)({
      read: Effect.promise(async () => {
        const value = await env.ROUTING.get(routingKeys.site(site));
        return value === null ? Option.none() : Option.some(decodeLive(value));
      }),
      write: (live) =>
        Effect.promise(() => env.ROUTING.put(routingKeys.site(site), encodeLive(live))),
    }),
    Layer.succeed(MediaLibrary)({
      files: (ids) =>
        Effect.promise(async () => {
          const { results } = await env.CORE.prepare(
            `select id, content_type, width, height from media
             where id in (select value from json_each(?))`,
          )
            .bind(JSON.stringify(ids))
            .all();
          const rows = decodeMediaRows(results);
          return new Map(
            rows.map((row) => [
              row.id,
              { contentType: row.content_type, width: row.width, height: row.height },
            ]),
          );
        }),
    }),
    Layer.succeed(OutboxDelivery)({
      deliver: (message) =>
        (message._tag === "Notify"
          ? notify(mailer, site, message.notification, message.submission, message.studio)
          : recordCopy(site, message)
        ).pipe(Effect.provide(core), Effect.orDie),
    }),
  );
};
