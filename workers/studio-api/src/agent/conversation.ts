import { SitePlan, Source } from "@repo/contracts/agent";
import { SourceId } from "@repo/contracts/ids";
import type { ModelMessage } from "@tanstack/ai";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/sql";

/*
 * One person's conversation in one draft, in its SiteAgent's SQLite storage:
 * the thread of messages, as the model reads it, the brief, and the
 * documents attached.
 */

type StorageError = SqlError.SqlError | Schema.SchemaError;

const json = Schema.fromJsonString;

const ToolCall = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("function"),
  function: Schema.Struct({ name: Schema.String, arguments: Schema.String }),
});

/**
 * A message of the thread as TanStack AI's `ModelMessage` holds it, with the
 * fields the agent's conversations use. A thread outlives deploys, so it's
 * read back through this schema.
 */
const Message = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  role: Schema.Literals(["user", "assistant", "tool"]),
  content: Schema.NullOr(Schema.String),
  name: Schema.optionalKey(Schema.String),
  toolCalls: Schema.optionalKey(Schema.mutable(Schema.Array(ToolCall))),
  toolCallId: Schema.optionalKey(Schema.String),
  thinking: Schema.optionalKey(
    Schema.mutable(
      Schema.Array(
        Schema.Struct({
          content: Schema.String,
          signature: Schema.optionalKey(Schema.String),
          redacted: Schema.optionalKey(Schema.Boolean),
        }),
      ),
    ),
  ),
  error: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  createdAt: Schema.optionalKey(Schema.DateFromString),
});

const encodeMessage = Schema.encodeUnknownSync(json(Message));
const encodeBrief = Schema.encodeSync(json(SitePlan));

const SourceRow = Schema.Struct({
  id: SourceId,
  name: Schema.String,
  size: Schema.Int,
  object: Schema.String,
});

export class Conversation extends Context.Service<
  Conversation,
  {
    readonly thread: Effect.Effect<ReadonlyArray<ModelMessage>, StorageError>;
    /** Saves the thread from its message at `from` on, replacing what was there. */
    readonly saveThread: (
      from: number,
      messages: ReadonlyArray<ModelMessage>,
    ) => Effect.Effect<void, StorageError>;
    /** Saves the message at `at` as it now stands, leaving the rest of the thread alone. */
    readonly saveMessage: (at: number, message: ModelMessage) => Effect.Effect<void, StorageError>;
    readonly brief: Effect.Effect<SitePlan | null, StorageError>;
    readonly saveBrief: (brief: SitePlan) => Effect.Effect<void, StorageError>;
    readonly sources: Effect.Effect<ReadonlyArray<Source>, StorageError>;
    /** Where a source's file is in R2. Its Markdown is beside it. */
    readonly sourceObject: (id: SourceId) => Effect.Effect<Option.Option<string>, StorageError>;
    readonly addSource: (source: Source, object: string) => Effect.Effect<void, StorageError>;
    /** Forgets the conversation: its thread, brief and sources. */
    readonly clear: Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/Conversation") {
  static readonly layer = Layer.effect(
    Conversation,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const findThread = SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ message: json(Message) }),
        execute: () => sql`select message from messages order by seq`,
      });
      const findBrief = SqlSchema.findOneOption({
        Request: Schema.Void,
        Result: Schema.Struct({ brief: Schema.NullOr(json(SitePlan)) }),
        execute: () => sql`select brief from conversation where id = 1`,
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

      return Conversation.of({
        thread: Effect.map(findThread(undefined), (rows) => rows.map((row) => row.message)),
        saveThread: (from, messages) =>
          sql.withTransaction(
            Effect.andThen(
              sql`delete from messages where seq >= ${from}`,
              Effect.forEach(
                messages.slice(from),
                (message, index) =>
                  sql`insert into messages (seq, message) values (${from + index}, ${encodeMessage(message)})`,
                { discard: true },
              ),
            ),
          ),
        saveMessage: (at, message) =>
          Effect.asVoid(
            sql`update messages set message = ${encodeMessage(message)} where seq = ${at}`,
          ),
        brief: Effect.map(findBrief(undefined), (found) =>
          Option.match(found, { onNone: () => null, onSome: (row) => row.brief }),
        ),
        saveBrief: (brief) =>
          Effect.asVoid(sql`insert into conversation (id, brief) values (1, ${encodeBrief(brief)})
            on conflict (id) do update set brief = excluded.brief`),
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
              sql`delete from messages`,
              sql`delete from conversation`,
              sql`delete from sources`,
            ]),
          ),
        ),
      });
    }),
  );
}
