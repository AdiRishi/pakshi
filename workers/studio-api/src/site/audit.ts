import { AuditEntry, type AuditEvent, AuditId } from "@repo/contracts/audit";
import { type DraftId, randomId, type TurnId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import { now, Timestamp } from "@repo/contracts/release";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { type SqlError, SqlClient, SqlSchema } from "effect/unstable/sql";

import { SiteIdentity, turnUndoId } from "./drafts.ts";
import { Outbox } from "./outbox.ts";

/*
 * What happens in the site, for the audit log. Entries go to D1 through the
 * outbox, written in the same storage turn as the change they record.
 */

type StorageError = SqlError.SqlError | Schema.SchemaError;

/** A run of a person's edits ends after this long without one. */
const sessionGap = 30 * 60 * 1000;

const SessionRow = Schema.Struct({
  id: AuditId,
  started_at: Timestamp,
  last_at: Timestamp,
  batches: Schema.Int,
});

export interface DraftRef {
  readonly id: DraftId;
  readonly name: string;
}

export class SiteAudit extends Context.Service<
  SiteAudit,
  {
    /** Records that someone, or the site itself with null, did something just now. */
    readonly record: (
      actor: Collaborator | null,
      event: AuditEvent,
    ) => Effect.Effect<void, StorageError>;
    /** Notes a batch a person committed, in the editing session it starts or continues. */
    readonly edited: (actor: Collaborator, draft: DraftRef) => Effect.Effect<void, StorageError>;
    /** Notes a batch the agent committed for its person in a turn. */
    readonly agentChanged: (
      actor: Collaborator,
      draft: DraftRef,
      turn: TurnId,
    ) => Effect.Effect<void, StorageError>;
  }
>()("Pakshi/StudioApi/SiteAudit") {
  static readonly layer = Layer.effect(
    SiteAudit,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const outbox = yield* Outbox;
      const { site } = yield* SiteIdentity;
      const send = (entry: AuditEntry) => outbox.send({ _tag: "Audit", entry });
      const findSession = SqlSchema.findOneOption({
        Request: Schema.Struct({ draft: Schema.String, person: Schema.String }),
        Result: SessionRow,
        execute: ({ draft, person }) => sql`select id, started_at, last_at, batches
          from editing_sessions where draft_id = ${draft} and person = ${person}`,
      });
      return SiteAudit.of({
        record: (actor, event) =>
          send({
            id: AuditId.make(randomId("aud")),
            at: now(),
            actor: actor === null ? null : { id: actor.id, name: actor.name },
            site,
            brand: null,
            event,
          }),
        edited: Effect.fn("SiteAudit.edited")(function* (actor, draft) {
          const at = now();
          const found = yield* findSession({ draft: draft.id, person: actor.id });
          const continues = Option.filter(
            found,
            (session) => Date.parse(at) - Date.parse(session.last_at) < sessionGap,
          );
          const session = Option.match(continues, {
            onNone: () => ({ id: AuditId.make(randomId("aud")), started_at: at, batches: 1 }),
            onSome: (session) => ({ ...session, batches: session.batches + 1 }),
          });
          yield* sql`insert into editing_sessions
              (draft_id, person, id, started_at, last_at, batches)
            values (${draft.id}, ${actor.id}, ${session.id}, ${session.started_at}, ${at},
              ${session.batches})
            on conflict (draft_id, person) do update set id = excluded.id,
              started_at = excluded.started_at, last_at = excluded.last_at,
              batches = excluded.batches`;
          yield* send({
            id: session.id,
            at,
            actor: { id: actor.id, name: actor.name },
            site,
            brand: null,
            event: {
              _tag: "EditingSession",
              draft,
              batches: session.batches,
              startedAt: session.started_at,
            },
          });
        }),
        agentChanged: Effect.fn("SiteAudit.agentChanged")(function* (actor, draft, turn) {
          const [counted] = yield* sql<{ readonly batches: number }>`select count(*) as batches
            from batches where draft_id = ${draft.id} and turn = ${turn}
              and id <> ${turnUndoId(turn)}`;
          yield* send({
            id: AuditId.make(`aud_${turn}`),
            at: now(),
            actor: { id: actor.id, name: actor.name },
            site,
            brand: null,
            event: { _tag: "AgentTurn", draft, turn, batches: counted?.batches ?? 1 },
          });
        }),
      });
    }),
  );
}
