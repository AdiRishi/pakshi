import { Permission } from "@repo/contracts/access";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

/*
 * What each person may do on the site, as studio-api last found it, in the
 * SiteDoc's SQLite storage. studio-api records it when someone opens a live
 * connection or a conversation with the agent, and again whenever a grant,
 * an override or a role changes it, so every batch is checked against it
 * without a D1 read.
 */

type StorageError = SqlError.SqlError | Schema.SchemaError;

const Permissions = Schema.fromJsonString(Schema.Array(Permission));
const encodePermissions = Schema.encodeEffect(Permissions);

export class SitePermissions extends Context.Service<
  SitePermissions,
  {
    /** What a person may do on the site, or nothing when studio-api never said. */
    readonly of: (person: string) => Effect.Effect<ReadonlyArray<Permission>, StorageError>;
    /** Records what a person may do on the site now. */
    readonly hold: (
      person: string,
      permissions: ReadonlyArray<Permission>,
    ) => Effect.Effect<void, StorageError>;
    /**
     * Records what people may do now, for those the site already holds
     * permissions for, and returns them. Anyone else gets theirs when they
     * next connect.
     */
    readonly refresh: (
      people: ReadonlyArray<{
        readonly id: string;
        readonly permissions: ReadonlyArray<Permission>;
      }>,
    ) => Effect.Effect<ReadonlyArray<string>, StorageError>;
  }
>()("Pakshi/StudioApi/SitePermissions") {
  static readonly layer = Layer.effect(
    SitePermissions,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const find = SqlSchema.findOneOption({
        Request: Schema.String,
        Result: Schema.Struct({ permissions: Permissions }),
        execute: (person) => sql`select permissions from permissions where person = ${person}`,
      });
      return SitePermissions.of({
        of: (person) =>
          Effect.map(find(person), (row) =>
            Option.match(row, { onNone: () => [], onSome: ({ permissions }) => permissions }),
          ),
        hold: Effect.fn("SitePermissions.hold")(function* (person, permissions) {
          yield* sql`insert into permissions (person, permissions)
            values (${person}, ${yield* encodePermissions(permissions)})
            on conflict (person) do update set permissions = excluded.permissions`;
        }),
        refresh: Effect.fn("SitePermissions.refresh")(function* (people) {
          const refreshed: Array<string> = [];
          for (const person of people) {
            const updated = yield* sql`update permissions
              set permissions = ${yield* encodePermissions(person.permissions)}
              where person = ${person.id} returning person`;
            if (updated.length > 0) refreshed.push(person.id);
          }
          return refreshed;
        }),
      });
    }),
  );
}
