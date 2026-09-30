import { Release } from "@repo/contracts/release";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

/*
 * A site's releases, in its SiteDoc's SQLite storage: the source of truth for
 * what the site serves. D1 keeps a copy for queries across sites, fed through
 * an outbox written in the same transaction as each release.
 */

/** A release as D1 keeps it: with its place in the site's history, whose last release is live. */
export const IndexedRelease = Schema.Struct({ seq: Schema.Int, release: Release });
export type IndexedRelease = typeof IndexedRelease.Type;

const ReleaseRow = Schema.Struct({
  seq: Schema.Int,
  release: Schema.fromJsonString(Release),
});

const OutboxRow = Schema.Struct({
  id: Schema.Int,
  message: Schema.fromJsonString(IndexedRelease),
});

const encodeRelease = Schema.encodeSync(Schema.fromJsonString(Release));
const encodeIndexed = Schema.encodeSync(Schema.fromJsonString(IndexedRelease));

type StorageError = SqlError.SqlError | Schema.SchemaError;

export class SiteReleases extends Context.Service<
  SiteReleases,
  {
    /** Every release, oldest first. */
    readonly history: Effect.Effect<ReadonlyArray<IndexedRelease>, StorageError>;
    /** The release the site serves, if it has ever served one. */
    readonly live: Effect.Effect<Option.Option<IndexedRelease>, StorageError>;
    /** Records a release as the live one, and queues its copy for D1. */
    readonly append: (release: Release) => Effect.Effect<IndexedRelease, StorageError>;
    /** Queues a release's copy for D1 again. */
    readonly resend: (release: IndexedRelease) => Effect.Effect<void, StorageError>;
    /** The copies D1 hasn't received yet, oldest first, each with its outbox ID. */
    readonly outbox: Effect.Effect<
      ReadonlyArray<{ readonly id: number; readonly message: IndexedRelease }>,
      StorageError
    >;
    readonly delivered: (id: number) => Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/SiteReleases") {
  static readonly layer = Layer.effect(
    SiteReleases,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
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
      const findOutbox = SqlSchema.findAll({
        Request: Schema.Void,
        Result: OutboxRow,
        execute: () => sql`select id, message from outbox order by id`,
      });
      const send = (message: IndexedRelease) =>
        sql`insert into outbox (message) values (${encodeIndexed(message)})`;

      return SiteReleases.of({
        history: findAll(undefined),
        live: findLatest(undefined),
        append: (release) =>
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`insert into releases (id, release)
                values (${release.id}, ${encodeRelease(release)})`;
              const latest = yield* findLatest(undefined);
              if (Option.isNone(latest)) return yield* Effect.die("A release was just recorded.");
              yield* send(latest.value);
              return latest.value;
            }),
          ),
        resend: (release) => Effect.asVoid(send(release)),
        outbox: findOutbox(undefined),
        delivered: (id) => Effect.asVoid(sql`delete from outbox where id = ${id}`),
      });
    }),
  );
}
