import { Schema } from "effect";

import { Draft } from "./draft.ts";
import { BatchId, BlockId, PageId } from "./ids.ts";
import { Batch, BatchError, Op, PropPath, Target } from "./ops.ts";

/*
 * The messages between the editor and its site's SiteDoc over a live
 * connection. Every batch SiteDoc commits reaches everyone connected, with
 * the ID its sender gave it, so a sender knows its batch by the broadcast and
 * everyone applies the same ops in the same order.
 */

/** A person editing the draft, as the others see them. */
export const Collaborator = Schema.Struct({ id: Schema.String, name: Schema.String });
export type Collaborator = typeof Collaborator.Type;

/** A block someone has selected, or one field in it. */
export const Focus = Schema.Struct({
  target: Target,
  block: BlockId,
  path: Schema.optionalKey(PropPath),
});
export type Focus = typeof Focus.Type;

/** Where a person is in the draft, and whether they're typing in the field they're on. */
export const Presence = Schema.Struct({
  page: PageId,
  focus: Schema.NullOr(Focus),
  typing: Schema.Boolean,
});
export type Presence = typeof Presence.Type;

/** Someone else connected to the draft. Their presence is null until their editor says where they are. */
export const Peer = Schema.Struct({
  connection: Schema.String,
  person: Collaborator,
  presence: Schema.NullOr(Presence),
});
export type Peer = typeof Peer.Type;

/** A batch as SiteDoc committed it: the ops that applied, and the revision they took the draft to. */
export const CommittedBatch = Schema.Struct({
  id: BatchId,
  revision: Schema.Int,
  actor: Collaborator,
  ops: Schema.Array(Op),
});
export type CommittedBatch = typeof CommittedBatch.Type;

/**
 * A committed batch as everyone connected receives it. For an undo batch,
 * `skipped` lists the positions of the ops passed over because someone else
 * had changed their part since. `replaced` names each person whose write an
 * op replaced, by the op's position in the committed ops.
 */
export const Commit = Schema.Struct({
  batch: CommittedBatch,
  skipped: Schema.Array(Schema.Int),
  replaced: Schema.Array(Schema.Struct({ person: Schema.String, op: Schema.Int })),
});
export type Commit = typeof Commit.Type;

/** What the editor sends. */
export const ClientMessage = Schema.TaggedUnion({
  /**
   * Opens every connection, with the revision the editor has. SiteDoc answers
   * with what it's missing, before anything else the editor sent.
   */
  Sync: { revision: Schema.Int },
  Batch: { batch: Batch },
  Presence: { presence: Presence },
});
export type ClientMessage = typeof ClientMessage.Type;

/** How an editor that was behind catches up: the batches it missed, or the whole draft. */
export const CatchUp = Schema.TaggedUnion({
  Batches: { batches: Schema.Array(CommittedBatch) },
  Draft: { draft: Draft },
});
export type CatchUp = typeof CatchUp.Type;

/** What SiteDoc sends. */
export const ServerMessage = Schema.TaggedUnion({
  /** The answer to Sync: what the editor missed, and who else is here. */
  Synced: { catchUp: CatchUp, peers: Schema.Array(Peer) },
  /** A batch SiteDoc committed, sent to everyone connected, its sender included. */
  Committed: Commit.fields,
  /** A batch SiteDoc refused, sent only to its sender. */
  Rejected: { batch: BatchId, errors: Schema.Array(BatchError) },
  PeerChanged: { peer: Peer },
  PeerLeft: { connection: Schema.String },
});
export type ServerMessage = typeof ServerMessage.Type;

/** Messages as the JSON text a WebSocket carries. */
export const ClientMessageJson = Schema.fromJsonString(ClientMessage);
export const ServerMessageJson = Schema.fromJsonString(ServerMessage);

/** Where Studio and studio-api serve live connections: a site's is at `${liveBasePath}/${site}`. */
export const liveBasePath = "/api/live";
