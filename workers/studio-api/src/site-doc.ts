import { SqliteClient } from "@effect/sql-sqlite-do";
import { Permission } from "@repo/contracts/access";
import type { BrandRevision } from "@repo/contracts/brand";
import type { DraftName } from "@repo/contracts/draft";
import {
  type BlockType,
  DraftId,
  type ReleaseId,
  SiteId,
  type SnapshotId,
  type SubmissionId,
  type TurnId,
} from "@repo/contracts/ids";
import {
  ClientMessage,
  ClientMessageJson,
  Collaborator,
  type Focus,
  type Peer,
  Presence,
  ServerMessage,
  ServerMessageJson,
} from "@repo/contracts/live";
import type { Resolutions } from "@repo/contracts/merge";
import type { Batch } from "@repo/contracts/ops";
import type { PagePath } from "@repo/contracts/page";
import type { DraftSharing } from "@repo/contracts/sharing";
import type { SiteSettings } from "@repo/contracts/site";
import {
  BlocksRemoved,
  CannotDecide,
  type Decision,
  DraftNotFound,
  NothingToRollBack,
  SubmissionNotFound,
} from "@repo/contracts/studio";
import type { Workflow } from "@repo/contracts/workflow";
import type { Approver } from "@repo/domain/approvals";
import type { Visitor } from "@repo/domain/sharing";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Layer, ManagedRuntime, Option, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";
import { type Connection, type ConnectionContext, Server, type WSMessage } from "partyserver";

import { SiteApprovals } from "./site/approvals.ts";
import { cloudflarePlatform } from "./site/cloudflare.ts";
import { SiteDrafts, SiteIdentity } from "./site/drafts.ts";
import { migrations } from "./site/migrations.ts";
import { Outbox } from "./site/outbox.ts";
import { LiveUpdates } from "./site/platform.ts";
import { SiteReleases } from "./site/releases.ts";
import { Site } from "./site/site.ts";

/** Who a live connection is for, and the draft it edits, as studio-api found them. */
export const LiveAuthorization = Schema.Struct({
  person: Collaborator,
  draft: DraftId,
  /** What the person may do on this site, which every batch they send is checked against. */
  permissions: Schema.Array(Permission),
});
export type LiveAuthorization = typeof LiveAuthorization.Type;

/** The header studio-api passes a live connection's authorization in. Only studio-api reaches SiteDoc. */
export const liveAuthorizationHeader = "x-pakshi-live";

const decodeAuthorization = Schema.decodeUnknownOption(Schema.fromJsonString(LiveAuthorization));
const decodeMessage = Schema.decodeUnknownOption(ClientMessageJson);
const encodeMessage = Schema.encodeSync(ServerMessageJson);

/** The failures SiteDoc's RPC methods report, which callers decode on their side. */
export const SiteDocError = Schema.Union([
  BlocksRemoved,
  DraftNotFound,
  NothingToRollBack,
  SubmissionNotFound,
  CannotDecide,
]);
export type SiteDocError = typeof SiteDocError.Type;

/**
 * A SiteDoc call's result as it crosses Durable Object RPC, which copies
 * plain data only: the value, or the failure encoded.
 */
export type Outcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly error: typeof SiteDocError.Encoded };

const encodeError = Schema.encodeSync(SiteDocError);

/** Everything a Site call can fail with. Storage failures are defects to its caller. */
type SiteFailure = SqlError.SqlError | Schema.SchemaError | SiteDocError;

/** What SiteDoc keeps on each connection. It lives in the socket's attachment, so it survives hibernation. */
interface LiveState extends LiveAuthorization {
  readonly presence: Presence | null;
}

type LiveConnection = Connection<LiveState>;

/** A field someone is typing in, which the agent leaves alone. */
export interface TypingIn extends Focus {
  readonly person: Collaborator;
}

/** The agent working in a draft for a person, as others see it. */
interface AgentPeer extends Peer {
  readonly draft: DraftId;
}

/** The person an agent works for, and whether they edit the site's pages rather than a shared draft. */
interface AgentPrincipal {
  readonly person: Collaborator;
  readonly editsSite: boolean;
}

/** The connection ID the agent working for a person has in presence. It holds no socket. */
const agentConnection = (person: Collaborator) => `agent:${person.id}`;

/**
 * A site's drafts, releases and live connections. Other code reaches it
 * through PartyServer's `getServerByName`, named by site ID.
 *
 * PartyServer requires its env to extend the global `Cloudflare.Env`. Other
 * Workers' programs include this file through the binding types and declare
 * their own global env, so the intersection keeps the constraint true in all of
 * them; in this Worker it is just StudioApiEnv.
 */
export class SiteDoc extends Server<StudioApiEnv & Cloudflare.Env> {
  static override options = { hibernate: true };

  #runtime: ManagedRuntime.ManagedRuntime<Site, never> | undefined;
  #messages: Promise<unknown> = Promise.resolve();
  /**
   * The agents working in drafts, by connection ID. They're kept in memory
   * only: each agent says where it is again with every change it makes.
   */
  readonly #agents = new Map<string, AgentPeer>();

  /** The site's services over this object's storage, built the first time they're used. */
  #site() {
    const site = Schema.decodeSync(SiteId)(this.name);
    this.#runtime ??= ManagedRuntime.make(
      Site.layer.pipe(
        Layer.provide(Layer.mergeAll(SiteDrafts.layer, SiteReleases.layer, SiteApprovals.layer)),
        Layer.provideMerge(Outbox.layer),
        Layer.provide(Layer.effectDiscard(Migrator.make({})({ loader: migrations }))),
        Layer.provideMerge(SqliteClient.layer({ storage: this.ctx.storage })),
        Layer.provide(cloudflarePlatform(this.env, site)),
        Layer.provide(
          Layer.succeed(LiveUpdates)({
            send: (draft, message) =>
              Effect.sync(() => {
                const text = encodeMessage(message);
                for (const connection of this.getConnections(draft ?? undefined))
                  connection.send(text);
              }),
          }),
        ),
        Layer.provide(Layer.succeed(SiteIdentity)({ site })),
        Layer.orDie,
      ),
    );
    return this.#runtime;
  }

  #run<A>(use: (site: Site["Service"]) => Effect.Effect<A, SiteFailure>) {
    return this.#site().runPromise(Effect.orDie(Site.use(use)));
  }

  /** Runs a call whose failures its caller decodes, and returns its outcome as plain data. */
  #call<A>(use: (site: Site["Service"]) => Effect.Effect<A, SiteFailure>): Promise<Outcome<A>> {
    return this.#site().runPromise(
      Site.use(use).pipe(
        Effect.map((value): Outcome<A> => ({ ok: true, value })),
        Effect.catchIf(Schema.is(SiteDocError), (error) =>
          Effect.succeed<Outcome<A>>({ ok: false, error: encodeError(error) }),
        ),
        Effect.orDie,
      ),
    );
  }

  /** Delivers what the outbox holds soon, from the alarm, which retries when it fails. */
  async #deliverSoon() {
    if (await this.#run((site) => site.undelivered)) await this.ctx.storage.setAlarm(Date.now());
  }

  /** Runs each live message after the ones before it, in the order they arrive. */
  #inOrder<A>(task: () => Promise<A>): Promise<A> {
    const next = this.#messages.then(task);
    this.#messages = next.catch(() => undefined);
    return next;
  }

  #send(connection: LiveConnection, message: ServerMessage) {
    connection.send(encodeMessage(message));
  }

  /** Sends to everyone else in the same draft. */
  #toDraft(connection: LiveConnection, draft: DraftId, message: ServerMessage) {
    const text = encodeMessage(message);
    for (const other of this.getConnections(draft))
      if (other.id !== connection.id) other.send(text);
  }

  #peerOf(connection: LiveConnection): Peer | null {
    const state = connection.state;
    return state === null
      ? null
      : { connection: connection.id, person: state.person, agent: false, presence: state.presence };
  }

  override async onStart() {
    await this.#deliverSoon();
  }

  override async onAlarm() {
    await this.#run((site) => site.deliverOutbox);
  }

  override getConnectionTags(_connection: Connection, { request }: ConnectionContext) {
    const authorization = decodeAuthorization(request.headers.get(liveAuthorizationHeader));
    return Option.isSome(authorization) ? [authorization.value.draft] : [];
  }

  override onConnect(connection: LiveConnection, { request }: ConnectionContext) {
    const authorization = decodeAuthorization(request.headers.get(liveAuthorizationHeader));
    if (Option.isNone(authorization)) {
      connection.close(1008, "Not authorized");
      return;
    }
    connection.setState({ ...authorization.value, presence: null });
    const peer = this.#peerOf(connection);
    if (peer !== null)
      this.#toDraft(
        connection,
        authorization.value.draft,
        ServerMessage.cases.PeerChanged.make({ peer }),
      );
  }

  override onMessage(connection: LiveConnection, raw: WSMessage) {
    return this.#inOrder(async () => {
      const state = connection.state;
      const message = decodeMessage(raw);
      if (state === null || Option.isNone(message)) {
        connection.close(1003, "Unreadable message");
        return;
      }
      try {
        await ClientMessage.match(message.value, {
          Sync: ({ revision }) =>
            this.#run((site) =>
              site.sync(state.draft, revision, (catchUp) =>
                Effect.sync(() => {
                  const people = Array.from(this.getConnections<LiveState>(state.draft)).flatMap(
                    (other) => {
                      const peer = other.id === connection.id ? null : this.#peerOf(other);
                      return peer === null ? [] : [peer];
                    },
                  );
                  const agents = Array.from(this.#agents.values()).flatMap(({ draft, ...peer }) =>
                    draft === state.draft ? [peer] : [],
                  );
                  const peers = [...people, ...agents];
                  this.#send(connection, ServerMessage.cases.Synced.make({ catchUp, peers }));
                }),
              ),
            ),
          Batch: async ({ batch }) => {
            // A share can allow editing, and can be taken back while the connection is open.
            const editsSite = state.permissions.includes("page.edit");
            const access = editsSite
              ? "edit"
              : await this.#run((site) =>
                  site.access(state.draft, { id: state.person.id, editsSite }),
                );
            if (access !== "edit") {
              const errors = [
                {
                  op: 0,
                  path: [],
                  rule: "permission" as const,
                  message: "You can no longer edit this draft.",
                },
              ];
              this.#send(
                connection,
                ServerMessage.cases.Rejected.make({ batch: batch.id, errors }),
              );
              return;
            }
            const result = await this.#run((site) =>
              site.applyBatch(state.person, state.draft, batch),
            );
            if (result.status === "duplicate")
              this.#send(
                connection,
                ServerMessage.cases.Known.make({ batch: batch.id, revision: result.revision }),
              );
            if (result.status === "rejected")
              this.#send(
                connection,
                ServerMessage.cases.Rejected.make({ batch: batch.id, errors: result.errors }),
              );
          },
          Presence: async ({ presence }) => {
            connection.setState({ ...state, presence });
            const peer = this.#peerOf(connection);
            if (peer !== null)
              this.#toDraft(
                connection,
                state.draft,
                ServerMessage.cases.PeerChanged.make({ peer }),
              );
          },
        });
      } catch (error) {
        // The editor reconnects, catches up and sends what SiteDoc didn't confirm again.
        console.error("SiteDoc couldn't handle a live message", error);
        connection.close(1011, "Try again");
      }
    });
  }

  override onClose(connection: LiveConnection) {
    const draft = connection.state?.draft;
    if (draft !== undefined)
      this.#toDraft(
        connection,
        draft,
        ServerMessage.cases.PeerLeft.make({ connection: connection.id }),
      );
  }

  // Calls from studio-api, which has checked the person may make them.

  /** Runs a call that may queue outbox messages, and has them delivered soon, even if it fails partway. */
  async #changing<A>(call: () => Promise<A>) {
    try {
      return await call();
    } finally {
      await this.#deliverSoon();
    }
  }

  /** Starts a new site with its first release, and returns the draft it's built in. */
  start(by: Collaborator, settings: SiteSettings, brand: BrandRevision) {
    return this.#changing(() => this.#run((site) => site.start(by, settings, brand)));
  }

  live() {
    return this.#run((site) => site.live);
  }

  releases() {
    return this.#run((site) => site.releases);
  }

  drafts() {
    return this.#run((site) => site.drafts);
  }

  createDraft(by: Collaborator, name: DraftName) {
    return this.#changing(() => this.#run((site) => site.createDraft(by, name)));
  }

  renameDraft(id: DraftId, name: DraftName) {
    return this.#changing(() => this.#call((site) => site.renameDraft(id, name)));
  }

  closeDraft(by: Collaborator, id: DraftId) {
    return this.#changing(() => this.#call((site) => site.closeDraft(by, id)));
  }

  viewDraft(id: DraftId) {
    return this.#call((site) => site.view(id));
  }

  /** Opens a draft, merging the live release in first when that needs no one. */
  openDraft(by: Collaborator, id: DraftId) {
    return this.#changing(() => this.#call((site) => site.open(by, id)));
  }

  applyBatch(actor: Collaborator, id: DraftId, batch: Batch) {
    return this.#call((site) => site.applyBatch(actor, id, batch));
  }

  previewUpdate(id: DraftId, resolutions: Resolutions) {
    return this.#call((site) => site.previewUpdate(id, resolutions));
  }

  updateDraft(actor: Collaborator, id: DraftId, resolutions: Resolutions, seen: ReleaseId) {
    return this.#changing(() => this.#call((site) => site.update(actor, id, resolutions, seen)));
  }

  access(id: DraftId, visitor: Visitor) {
    return this.#run((site) => site.access(id, visitor));
  }

  /** Replaces a draft's sharing, and disconnects anyone it no longer lets edit the draft. */
  shareDraft(id: DraftId, sharing: DraftSharing) {
    return this.#changing(async () => {
      const outcome = await this.#call((site) => site.share(id, sharing));
      if (outcome.ok)
        for (const connection of this.getConnections<LiveState>(id)) {
          const state = connection.state;
          if (state === null || state.permissions.includes("page.edit")) continue;
          const access = await this.#run((site) =>
            site.access(id, { id: state.person.id, editsSite: false }),
          );
          if (access === "edit") continue;
          this.#send(connection, ServerMessage.cases.AccessEnded.make({}));
          connection.close(1008, "No longer shared for editing");
        }
      return outcome;
    });
  }

  // Calls from a person's agent, which studio-api let them talk to.

  /**
   * Commits a batch the agent made for a person in one turn, if the person
   * may still edit the draft, and shows the agent where it made the change.
   */
  async applyAgentBatch(
    by: AgentPrincipal,
    id: DraftId,
    batch: Batch,
    turn: TurnId,
    presence: Presence,
  ) {
    if (!(await this.#agentMayEdit(by, id)))
      return {
        ok: true as const,
        value: {
          status: "rejected" as const,
          errors: [
            {
              op: 0,
              path: [],
              rule: "permission" as const,
              message: "The person can no longer edit this draft.",
            },
          ],
        },
      };
    const outcome = await this.#call((site) => site.applyAgentBatch(by.person, id, batch, turn));
    if (outcome.ok && outcome.value.status === "committed")
      this.agentPresence(by.person, id, presence);
    return outcome;
  }

  /** Undoes a turn the agent made for a person, if the person may still edit the draft. */
  async undoTurn(by: AgentPrincipal, id: DraftId, turn: TurnId) {
    if (!(await this.#agentMayEdit(by, id)))
      return { ok: true as const, value: { status: "refused" as const } };
    return this.#call((site) => site.undoTurn(by.person, id, turn));
  }

  /** Whether the person an agent works for may edit a draft now, since a share can end mid-conversation. */
  async #agentMayEdit(by: AgentPrincipal, id: DraftId) {
    const access = await this.#run((site) =>
      site.access(id, { id: by.person.id, editsSite: by.editsSite }),
    );
    return access === "edit";
  }

  /** Shows the agent working for a person at a place in a draft, or with null, gone from it. */
  agentPresence(person: Collaborator, draft: DraftId, presence: Presence | null) {
    const connection = agentConnection(person);
    const text =
      presence === null
        ? encodeMessage(ServerMessage.cases.PeerLeft.make({ connection }))
        : encodeMessage(
            ServerMessage.cases.PeerChanged.make({
              peer: { connection, person, agent: true, presence },
            }),
          );
    if (presence === null) this.#agents.delete(connection);
    else this.#agents.set(connection, { connection, person, agent: true, presence, draft });
    for (const other of this.getConnections(draft)) other.send(text);
  }

  /** The fields people in a draft are typing in now. */
  typingIn(draft: DraftId): ReadonlyArray<TypingIn> {
    return Array.from(this.getConnections<LiveState>(draft)).flatMap((connection) => {
      const presence = connection.state?.presence;
      const person = connection.state?.person;
      return presence?.typing === true && presence.focus !== null && person !== undefined
        ? [{ ...presence.focus, person }]
        : [];
    });
  }

  checkDraft(id: DraftId) {
    return this.#call((site) => site.check(id));
  }

  // A release is recorded before KV is written, so delivery is scheduled
  // even when a call fails after that: D1's copy is what lets the
  // reconcile job see KV is behind.

  submit(actor: Collaborator, id: DraftId, note: string, steps: Workflow, studio: string) {
    return this.#changing(() => this.#call((site) => site.submit(actor, id, note, steps, studio)));
  }

  submission(id: SubmissionId) {
    return this.#call((site) => site.submission(id));
  }

  review(id: SubmissionId) {
    return this.#call((site) => site.review(id));
  }

  draftView(id: DraftId, path: PagePath) {
    return this.#call((site) => site.draftView(id, path));
  }

  submissionView(
    id: SubmissionId,
    snapshot: SnapshotId,
    version: "submitted" | "live",
    path: PagePath,
  ) {
    return this.#call((site) => site.submissionView(id, snapshot, version, path));
  }

  decide(
    approver: Approver,
    id: SubmissionId,
    snapshot: SnapshotId,
    decision: Decision,
    note: string,
    studio: string,
  ) {
    return this.#changing(() =>
      this.#call((site) => site.decide(approver, id, snapshot, decision, note, studio)),
    );
  }

  rollBack(actor: Collaborator, studio: string) {
    return this.#changing(() => this.#call((site) => site.rollBack(actor, studio)));
  }

  restore(by: Collaborator, release: ReleaseId, name: DraftName) {
    return this.#changing(() =>
      this.#call((site) => Effect.map(site.restore(by, release, name), Option.getOrNull)),
    );
  }

  /** Brings a brand revision to the site, through a Brand update draft when it needs one. */
  takeBrandRevision(by: Collaborator, revision: BrandRevision) {
    return this.#changing(() => this.#run((site) => site.takeBrandRevision(by, revision)));
  }

  /** A draft that upgrades one block to a newer version, or null when the site needs none. */
  adoptUpgrade(by: Collaborator, type: BlockType, version: number) {
    return this.#changing(() =>
      this.#run((site) => Effect.map(site.adoptUpgrade(by, type, version), Option.getOrNull)),
    );
  }

  blocksInUse() {
    return this.#run((site) => site.blocksInUse);
  }

  /** Copies the block versions the site pins to D1 again. */
  reportBlocks() {
    return this.#changing(() => this.#run((site) => site.reportBlocks));
  }

  /** Writes the live release to KV and D1 again, for the reconcile job. */
  reconcile() {
    return this.#changing(() => this.#run((site) => site.reconcile));
  }
}
