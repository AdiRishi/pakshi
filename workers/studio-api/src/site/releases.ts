import { Release } from "@repo/contracts/release";
import type { Lockfile } from "@repo/contracts/snapshot";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

import { type IndexedRelease, Outbox } from "./outbox.ts";

/*
 * A site's releases, in its SiteDoc's SQLite storage: the source of truth for
 * what the site serves. D1 keeps a copy for queries across sites, fed through
 * the outbox in the same transaction as each release.
 */

const ReleaseRow = Schema.Struct({
  seq: Schema.Int,
  release: Schema.fromJsonString(Release),
});

const encodeRelease = Schema.encodeSync(Schema.fromJsonString(Release));

type StorageError = SqlError.SqlError | Schema.SchemaError;

export class SiteReleases extends Context.Service<
  SiteReleases,
  {
    /** Every release, oldest first. */
    readonly history: Effect.Effect<ReadonlyArray<IndexedRelease>, StorageError>;
    /** The release the site serves, if it has ever served one. */
    readonly live: Effect.Effect<Option.Option<IndexedRelease>, StorageError>;
    /**
     * Records a release as the live one, and queues its copy for D1, with the
     * block versions its snapshot pins.
     */
    readonly append: (
      release: Release,
      lockfile: Lockfile,
    ) => Effect.Effect<IndexedRelease, StorageError>;
    /** Queues a release's copy for D1 again. */
    readonly resend: (release: IndexedRelease) => Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/SiteReleases") {
  static readonly layer = Layer.effect(
    SiteReleases,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const outbox = yield* Outbox;
      const findAll = SqlSchema.findAll({
        Request: Schema.Void,
        Result: ReleaseRow,
        execute: () => sql`select seq, release from releases order by seq`,
      });
      const findLatest = SqlSchema.findOneOption({
        Request: Schema.Void,
        Result: ReleaseRow,
        execute: () => sql`select seq, release from releases order by seq desc limit 1`,
      });
      const send = (release: IndexedRelease) => outbox.send({ _tag: "Release", release });

      return SiteReleases.of({
        history: findAll(undefined),
        live: findLatest(undefined),
        append: (release, lockfile) =>
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`insert into releases (id, release)
                values (${release.id}, ${encodeRelease(release)})`;
              const latest = yield* findLatest(undefined);
              if (Option.isNone(latest)) return yield* Effect.die("A release was just recorded.");
              yield* send(latest.value);
              yield* outbox.send({ _tag: "Blocks", holder: "live", lockfile });
              return latest.value;
            }),
          ),
        resend: send,
      });
    }),
  );
}
