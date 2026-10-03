import { Collaborator } from "@repo/contracts/live";
import { now } from "@repo/contracts/release";
import {
  SettingsChanges,
  type SettingsView,
  settingDefaults,
  SiteSettings,
} from "@repo/contracts/settings";
import { SettingsChanged } from "@repo/contracts/studio";
import { Context, Effect, Layer, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/sql";

import { Outbox } from "./outbox.ts";

/*
 * A site's settings, in its SiteDoc's SQLite storage: a row per setting
 * someone has saved, with the settings revision that saved it. Anything
 * nobody has set reads as its default. Settings aren't part of any draft.
 */

type StorageError = SqlError.SqlError | Schema.SchemaError;

const SettingRow = Schema.Struct({
  key: Schema.String,
  value: Schema.String,
  revision: Schema.Int,
});

const decodeStored = Schema.decodeUnknownEffect(SettingsChanges);
const encodeChanges = Schema.encodeEffect(SettingsChanges);
const encodeSavedBy = Schema.encodeEffect(Schema.NullOr(Schema.fromJsonString(Collaborator)));

export class SiteSettingsStore extends Context.Service<
  SiteSettingsStore,
  {
    /** Every setting's value now, and the revision of the latest save. */
    readonly current: Effect.Effect<SettingsView, StorageError>;
    /**
     * Saves some settings as a new revision, refusing a save made from a
     * revision someone else has moved on from, and queues them for the
     * runtimes that read them, with the Studio address the save came from,
     * which emails about the site link to. Call it in the storage turn.
     */
    readonly save: (
      /** Who saved them, or null when SiteDoc took them from a release it imported. */
      by: Collaborator | null,
      changes: SettingsChanges,
      seen: number,
      studio: string | null,
    ) => Effect.Effect<SettingsView, StorageError | SettingsChanged>;
  }
>()("Pakshi/StudioApi/SiteSettingsStore") {
  static readonly layer = Layer.effect(
    SiteSettingsStore,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const outbox = yield* Outbox;
      const findRows = SqlSchema.findAll({
        Request: Schema.Void,
        Result: SettingRow,
        execute: () => sql`select key, value, revision from settings`,
      });
      const current = Effect.gen(function* () {
        const rows = yield* findRows(undefined);
        const stored = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
        return {
          // A row whose setting the registry no longer has is left out by the decode.
          settings: { ...settingDefaults, ...(yield* decodeStored(stored)) },
          revision: Math.max(0, ...rows.map((row) => row.revision)),
        } satisfies SettingsView;
      });

      return SiteSettingsStore.of({
        current,
        save: Effect.fn("SiteSettingsStore.save")(function* (by, changes, seen, studio) {
          const before = yield* current;
          if (before.revision !== seen)
            return yield* new SettingsChanged({ revision: before.revision });
          const settings: SiteSettings = { ...before.settings, ...changes };
          const revision = before.revision + 1;
          const savedBy = yield* encodeSavedBy(by);
          const savedAt = now();
          const encoded = yield* encodeChanges(changes);
          yield* sql.withTransaction(
            Effect.gen(function* () {
              for (const [key, value] of Object.entries(encoded))
                yield* sql`insert into settings (key, value, revision, saved_by, saved_at)
                  values (${key}, ${JSON.stringify(value)}, ${revision}, ${savedBy}, ${savedAt})
                  on conflict (key) do update set value = excluded.value,
                    revision = excluded.revision, saved_by = excluded.saved_by,
                    saved_at = excluded.saved_at`;
              yield* outbox.send({ _tag: "Settings", settings, studio });
            }),
          );
          return { settings, revision };
        }),
      });
    }),
  );
}
