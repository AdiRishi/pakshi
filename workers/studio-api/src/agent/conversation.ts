import { SitePlan, Source, Turn } from "@repo/contracts/agent";
import { SourceId } from "@repo/contracts/ids";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

/*
 * One person's conversation in one draft, in its SiteAgent's SQLite storage:
 * the turns the chat panel shows, the model's own history, the brief, and
 * the documents attached.
 */

type StorageError = SqlError.SqlError | Schema.SchemaError;

const json = Schema.fromJsonString;

const encodeTurn = Schema.encodeSync(json(Turn));
const encodeBrief = Schema.encodeSync(json(SitePlan));

const ConversationRow = Schema.Struct({
  prompt: Schema.NullOr(Schema.String),
  brief: Schema.NullOr(json(SitePlan)),
});

const SourceRow = Schema.Struct({
  id: SourceId,
  name: Schema.String,
  size: Schema.Int,
  object: Schema.String,
});

export class Conversation extends Context.Service<
  Conversation,
  {
    readonly turns: Effect.Effect<ReadonlyArray<Turn>, StorageError>;
    /** Adds a turn, or saves one that's already there as it now stands. */
    readonly saveTurn: (turn: Turn) => Effect.Effect<void, StorageError>;
    /** The model's history, as Effect AI's Chat exports it, once there is one. */
    readonly prompt: Effect.Effect<Option.Option<string>, StorageError>;
    readonly savePrompt: (prompt: string) => Effect.Effect<void, StorageError>;
    readonly brief: Effect.Effect<SitePlan | null, StorageError>;
    readonly saveBrief: (brief: SitePlan) => Effect.Effect<void, StorageError>;
    readonly sources: Effect.Effect<ReadonlyArray<Source>, StorageError>;
    /** Where a source's file is in R2. Its Markdown is beside it. */
    readonly sourceObject: (id: SourceId) => Effect.Effect<Option.Option<string>, StorageError>;
    readonly addSource: (source: Source, object: string) => Effect.Effect<void, StorageError>;
    /** Forgets the conversation: its turns, history, brief and sources. */
    readonly clear: Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/Conversation") {
  static readonly layer = Layer.effect(
    Conversation,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const findTurns = SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ turn: json(Turn) }),
        execute: () => sql`select turn from turns order by seq`,
      });
      const findConversation = SqlSchema.findOneOption({
        Request: Schema.Void,
        Result: ConversationRow,
        execute: () => sql`select prompt, brief from conversation where id = 1`,
      });
      const findSources = SqlSchema.findAll({
        Request: Schema.Void,
        Result: SourceRow,
        execute: () => sql`select id, name, size, object from sources order by seq`,
      });
      const findSource = SqlSchema.findOneOption({
        Request: SourceId,
        Result: SourceRow,
        execute: (id) => sql`select id, name, size, object from sources where id = ${id}`,
      });
      const row = Effect.map(findConversation(undefined), Option.getOrUndefined);
      const ensureRow = sql`insert into conversation (id) values (1) on conflict (id) do nothing`;

      return Conversation.of({
        turns: Effect.map(findTurns(undefined), (rows) => rows.map((found) => found.turn)),
        saveTurn: (turn: Turn) =>
          Effect.asVoid(sql`insert into turns (id, turn) values (${turn.id}, ${encodeTurn(turn)})
            on conflict (id) do update set turn = excluded.turn`),
        prompt: Effect.map(row, (found) => Option.fromNullishOr(found?.prompt)),
        savePrompt: (prompt) =>
          Effect.asVoid(
            Effect.andThen(ensureRow, sql`update conversation set prompt = ${prompt} where id = 1`),
          ),
        brief: Effect.map(row, (found) => found?.brief ?? null),
        saveBrief: (brief) =>
          Effect.asVoid(
            Effect.andThen(
              ensureRow,
              sql`update conversation set brief = ${encodeBrief(brief)} where id = 1`,
            ),
          ),
        sources: Effect.map(findSources(undefined), (rows) =>
          rows.map(({ id, name, size }) => ({ id, name, size })),
        ),
        sourceObject: (id) =>
          Effect.map(
            findSource(id),
            Option.map((found) => found.object),
          ),
        addSource: (source, object) =>
          Effect.asVoid(sql`insert into sources (id, name, size, object)
            values (${source.id}, ${source.name}, ${source.size}, ${object})`),
        clear: sql.withTransaction(
          Effect.asVoid(
            Effect.all([
              sql`delete from turns`,
              sql`delete from conversation`,
              sql`delete from sources`,
            ]),
          ),
        ),
      });
    }),
  );
}
