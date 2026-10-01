import { DraftName } from "@repo/contracts/draft";
import { DraftId } from "@repo/contracts/ids";
import { Release } from "@repo/contracts/release";
import { ShareAccess } from "@repo/contracts/sharing";
import { Lockfile } from "@repo/contracts/snapshot";
import { Submission } from "@repo/contracts/submission";
import { Context, Effect, Layer, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

/** A release as D1 keeps it: with its place in the site's history, whose last release is live. */
export const IndexedRelease = Schema.Struct({ seq: Schema.Int, release: Release });
export type IndexedRelease = typeof IndexedRelease.Type;

/** Who a notification email goes to: the approvers of a submission's current step, or its submitter. */
export const Notification = Schema.TaggedUnion({
  StepStarted: {},
  Published: {},
  ChangesRequested: {},
  NeedsUpdate: {},
});
export type Notification = typeof Notification.Type;

/**
 * Something SiteDoc sends outside its storage after a change: a copy of what
 * it holds for D1, or an email. Each is written in the same transaction as
 * the change, and the alarm delivers it, again if it fails.
 */
export const OutboxMessage = Schema.TaggedUnion({
  Release: { release: IndexedRelease },
  Submission: { submission: Submission },
  /** The people an open draft is shared with, or none once it's closed. */
  Shares: {
    draft: DraftId,
    name: DraftName,
    people: Schema.Array(Schema.Struct({ id: Schema.String, access: ShareAccess })),
  },
  /**
   * The block versions one of the site's holders renders with: the live
   * release, or an open draft. A null lockfile means the draft closed.
   */
  Blocks: {
    holder: Schema.Union([Schema.Literal("live"), DraftId]),
    lockfile: Schema.NullOr(Lockfile),
  },
  /** The newest brand revision the site has taken in. */
  BrandTaken: { number: Schema.Int },
  Notify: {
    notification: Notification,
    submission: Submission,
    /** Studio's address, for the links in the email. */
    studio: Schema.String,
  },
});
export type OutboxMessage = typeof OutboxMessage.Type;

const OutboxRow = Schema.Struct({
  id: Schema.Int,
  message: Schema.fromJsonString(OutboxMessage),
});

const encodeMessage = Schema.encodeSync(Schema.fromJsonString(OutboxMessage));

type StorageError = SqlError.SqlError | Schema.SchemaError;

/** What SiteDoc still has to send outside its storage, in its SQLite storage. */
export class Outbox extends Context.Service<
  Outbox,
  {
    /** Queues a message. Call it in the transaction that makes the change it reports. */
    readonly send: (message: OutboxMessage) => Effect.Effect<void, StorageError>;
    /** The messages not yet delivered, oldest first, each with its outbox ID. */
    readonly pending: Effect.Effect<
      ReadonlyArray<{ readonly id: number; readonly message: OutboxMessage }>,
      StorageError
    >;
    readonly delivered: (id: number) => Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/Outbox") {
  static readonly layer = Layer.effect(
    Outbox,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return Outbox.of({
        send: (message) =>
          Effect.asVoid(sql`insert into outbox (message) values (${encodeMessage(message)})`),
        pending: SqlSchema.findAll({
          Request: Schema.Void,
          Result: OutboxRow,
          execute: () => sql`select id, message from outbox order by id`,
        })(undefined),
        delivered: (id) => Effect.asVoid(sql`delete from outbox where id = ${id}`),
      });
    }),
  );
}
