import { D1Client } from "@effect/sql-d1";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { languageModel, runTurn, systemPrompt, turnContext } from "@repo/agent";
import { editingTools } from "@repo/agent/tools";
import { loadBlocks } from "@repo/blocks";
import {
  agentEvents,
  AgentClientMessage,
  AgentClientMessageJson,
  SitePlan,
  type Source,
  sourcesSegment,
  TurnRecord,
  turnKey,
  type TurnStatus,
} from "@repo/contracts/agent";
import { randomId, SourceId, TurnId } from "@repo/contracts/ids";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import {
  encodeWsFrame,
  EventType,
  type ModelMessage,
  modelMessagesToUIMessages,
  type StreamChunk,
  uiMessagesToWire,
} from "@tanstack/ai";
import { Effect, Exit, Layer, ManagedRuntime, Option, Schema, Scope } from "effect";
import type { SqlError } from "effect/sql";
import * as Migrator from "effect/sql/Migrator";
import {
  type Connection,
  type ConnectionContext,
  getServerByName,
  Server,
  type WSMessage,
} from "partyserver";

import { Conversation } from "./agent/conversation.ts";
import { toMarkdown } from "./agent/markdown.ts";
import { migrations } from "./agent/migrations.ts";
import {
  AgentAuthorization,
  agentAuthorizationHeader,
  conversationName,
  turnServices,
} from "./agent/services.ts";
import { voiceOf } from "./brands.ts";

const decodeAuthorization = Schema.decodeUnknownOption(Schema.fromJsonString(AgentAuthorization));
const decodeMessage = Schema.decodeUnknownOption(AgentClientMessageJson);
const decodeRecord = Schema.decodeUnknownOption(TurnRecord);
const encodeRecord = Schema.encodeSync(TurnRecord);
const decodePlan = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ plan: SitePlan })),
);

type AgentConnection = Connection<AgentAuthorization>;
type Send = Extract<AgentClientMessage, { _tag: "Send" }>;

/** Everything the conversation's storage can fail with. Its callers treat it as a defect. */
type StorageError = SqlError.SqlError | Schema.SchemaError;

/** The largest document someone can attach, in bytes. */
const maxSourceSize = 10 * 1024 * 1024;

/** Documents Workers AI converts to Markdown for the agent, by extension. */
const sourceTypes = new Map([
  ["pdf", "application/pdf"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["txt", "text/plain"],
  ["md", "text/markdown"],
  ["csv", "text/csv"],
  ["html", "text/html"],
]);

const busy = "Pakshi is still working on your last message. Stop it first, or wait.";

const readText = Schema.decodeUnknownOption(Schema.String);

/** Addresses in a person's message, which the agent may fetch. */
const linksIn = (message: ModelMessage) =>
  Option.toArray(readText(message.content)).flatMap((text) =>
    Array.from(text.matchAll(/https?:\/\/[^\s<>()"']+/g), ([found]) =>
      URL.canParse(found) ? [new URL(found).href] : [],
    ).flat(),
  );

/** The turn a person's message started, as Pakshi recorded it on the message. */
const recordOf = (message: ModelMessage | undefined) => decodeRecord(message?.metadata?.[turnKey]);

/** A person's message with its turn as it now stands. */
const withRecord = (message: ModelMessage, record: TurnRecord): ModelMessage => ({
  ...message,
  metadata: { ...message.metadata, [turnKey]: encodeRecord(record) },
});

/** The person's message at `at` with its turn changed by `change`, if it has one. */
const changeTurn = (
  thread: ReadonlyArray<ModelMessage>,
  at: number,
  change: (record: TurnRecord) => TurnRecord,
) => {
  const message = thread[at];
  const record = recordOf(message);
  if (message === undefined || Option.isNone(record)) return Option.none();
  return Option.some(withRecord(message, change(record.value)));
};

/** The plan a propose_plan call proposed, by the call's ID. */
const planOf = (thread: ReadonlyArray<ModelMessage>, call: string) =>
  Option.map(
    decodePlan(
      thread
        .flatMap((message) => message.toolCalls ?? [])
        .find((found) => found.id === call && found.function.name === "propose_plan")?.function
        .arguments,
    ),
    (found) => found.plan,
  );

/** The conversation as the chat panel takes it whole. */
const snapshot = (thread: ReadonlyArray<ModelMessage>): StreamChunk => ({
  type: EventType.MESSAGES_SNAPSHOT,
  timestamp: Date.now(),
  messages: uiMessagesToWire(modelMessagesToUIMessages([...thread])),
});

/** Something the agent couldn't do for a message, for the person who sent it. */
const noticeEvent = (message: string): StreamChunk => ({
  type: EventType.CUSTOM,
  timestamp: Date.now(),
  name: agentEvents.notice,
  value: { message },
});

/** The documents attached to the conversation. */
const sourcesEvent = (sources: ReadonlyArray<Source>): StreamChunk => ({
  type: EventType.CUSTOM,
  timestamp: Date.now(),
  name: agentEvents.sources,
  value: { sources },
});

/**
 * An event of a turn, under the run ID the chat panel gave it. The model's
 * adapter names each model call's run itself, so the panel couldn't tell
 * its turn's events from another's.
 */
const underRun = (event: StreamChunk, run: string): StreamChunk => {
  switch (event.type) {
    case EventType.RUN_STARTED:
    case EventType.RUN_FINISHED:
    case EventType.RUN_ERROR:
      return { ...event, runId: run };
    default:
      return event;
  }
};

/** Whether an event ends a turn's run, rather than one model call of it. */
const endsRun = (event: StreamChunk) =>
  event.type === EventType.RUN_ERROR ||
  (event.type === EventType.RUN_FINISHED &&
    event.metadata?.tanstack?.finishReason !== "tool_calls");

/** The turn under way, and what stops it. */
interface Working {
  readonly run: string;
  /** Where the turn's message is in the thread. */
  readonly at: number;
  readonly stop: AbortController;
  /** The turn's events so far, for a connection that opens while it runs. */
  readonly events: Array<StreamChunk>;
  done: Promise<void>;
}

/**
 * One person's conversation with the agent in one draft, named by the site,
 * draft and person. studio-api is the only way in: it checks the person may
 * edit the draft and says who they are in a header it sets.
 *
 * The conversation is a TanStack AI thread. Every connection gets it as a
 * snapshot when it opens, follows each turn's events as they come, and gets
 * a new snapshot when a turn starts, ends or is undone.
 *
 * PartyServer requires its env to extend the global `Cloudflare.Env`, as
 * SiteDoc explains.
 */
export class SiteAgent extends Server<StudioApiEnv & Cloudflare.Env> {
  static override options = { hibernate: true };

  #runtime: ManagedRuntime.ManagedRuntime<Conversation, never> | undefined;
  #working: Working | null = null;
  #messages: Promise<unknown> = Promise.resolve();

  #conversation() {
    this.#runtime ??= ManagedRuntime.make(
      Conversation.layer.pipe(
        Layer.provide(Layer.effectDiscard(Migrator.make({})({ loader: migrations }))),
        Layer.provideMerge(SqliteClient.layer({ storage: this.ctx.storage })),
        Layer.orDie,
      ),
    );
    return this.#runtime;
  }

  #run<A>(use: (conversation: Conversation["Service"]) => Effect.Effect<A, StorageError>) {
    return this.#conversation().runPromise(Effect.orDie(Conversation.use(use)));
  }

  #sources() {
    return this.#run((conversation) => conversation.sources);
  }

  #authorized(request: Request) {
    const authorization = decodeAuthorization(request.headers.get(agentAuthorizationHeader));
    return Option.filter(
      authorization,
      ({ site, draft, person }) => conversationName(site, draft, person.id) === this.name,
    );
  }

  #broadcast(event: StreamChunk) {
    const frame = encodeWsFrame(event, undefined);
    for (const connection of this.getConnections()) connection.send(frame);
  }

  #send(connection: AgentConnection, event: StreamChunk) {
    connection.send(encodeWsFrame(event, undefined));
  }

  #notice(connection: AgentConnection, message: string) {
    this.#send(connection, noticeEvent(message));
  }

  /** Runs each message after the ones before it, in the order they arrive. */
  #inOrder<A>(task: () => Promise<A>): Promise<A> {
    const next = this.#messages.then(task);
    this.#messages = next.catch(() => undefined);
    return next;
  }

  /**
   * Changes the turn of the message at `at`, and shows every connection. Only
   * that message is saved, since a later turn may be saving its own.
   */
  async #changeTurn(at: number, change: (record: TurnRecord) => TurnRecord) {
    const thread = await this.#run((conversation) => conversation.thread);
    const changed = changeTurn(thread, at, change);
    if (Option.isNone(changed)) return;
    await this.#run((conversation) => conversation.saveMessage(at, changed.value));
    this.#broadcast(snapshot(thread.with(at, changed.value)));
  }

  override async onStart() {
    // A turn still working when the object was evicted was cut off.
    const thread = await this.#run((conversation) => conversation.thread);
    const at = thread.findLastIndex((message) => message.role === "user");
    if (Option.exists(recordOf(thread[at]), (record) => record.status === "working"))
      await this.#changeTurn(at, (record) => ({ ...record, status: "interrupted" }));
  }

  override onConnect(connection: AgentConnection, { request }: ConnectionContext) {
    const authorization = this.#authorized(request);
    if (Option.isNone(authorization)) {
      connection.close(1008, "Not authorized");
      return;
    }
    connection.setState(authorization.value);
    return this.#inOrder(async () => {
      const [thread, sources] = await Promise.all([
        this.#run((conversation) => conversation.thread),
        this.#sources(),
      ]);
      const working = this.#working;
      if (working === null) {
        this.#send(connection, snapshot(thread));
        // A tab that lost its connection while its turn ran missed the run's
        // end, and waits for it before it lets the person send again.
        const last = recordOf(thread.findLast((message) => message.role === "user"));
        if (Option.isSome(last))
          this.#send(connection, {
            type: EventType.RUN_FINISHED,
            timestamp: Date.now(),
            runId: last.value.run,
            threadId: this.name,
          });
      } else {
        // A turn under way is replayed from its events, after its message.
        this.#send(connection, snapshot(thread.slice(0, working.at + 1)));
        for (const event of working.events) this.#send(connection, event);
      }
      this.#send(connection, sourcesEvent(sources));
    });
  }

  override onMessage(connection: AgentConnection, raw: WSMessage) {
    return this.#inOrder(async () => {
      const who = connection.state;
      const message = decodeMessage(raw);
      if (who === null || Option.isNone(message)) {
        connection.close(1003, "Unreadable message");
        return;
      }
      await AgentClientMessage.match(message.value, {
        Send: (send) => this.#startTurn(connection, who, send),
        Stop: async () => {
          const working = this.#working;
          if (working === null) return;
          working.stop.abort();
          await working.done;
        },
        Undo: ({ turn }) => this.#undo(connection, who, turn),
        Clear: async () => {
          const working = this.#working;
          if (working !== null) {
            working.stop.abort();
            await working.done;
          }
          for (const source of await this.#sources()) {
            const object = await this.#run((conversation) => conversation.sourceObject(source.id));
            if (Option.isSome(object))
              await this.env.CONTENT.delete([object.value, `${object.value}.md`]);
          }
          await this.#run((conversation) => conversation.clear);
          this.#broadcast(snapshot([]));
          this.#broadcast(sourcesEvent([]));
        },
      });
    });
  }

  /** Deletes the conversation for good, for a site deleted for good. Its documents go with the site's. */
  async erase() {
    for (const connection of this.getConnections()) connection.close(1000, "Site deleted");
    await this.#runtime?.dispose();
    this.#runtime = undefined;
    await this.ctx.storage.deleteAll();
  }

  /** Starts a turn for a person's message, unless one is under way, which ends the message's run. */
  async #startTurn(connection: AgentConnection, who: AgentAuthorization, send: Send) {
    // A message the chat sends the moment a turn's run ends waits for the turn to be put away.
    if (this.#working?.events.some(endsRun) === true) await this.#working.done;
    if (this.#working !== null) {
      this.#notice(connection, busy);
      this.#send(connection, {
        type: EventType.RUN_ERROR,
        timestamp: Date.now(),
        runId: send.run,
        message: busy,
      });
      return;
    }
    const [thread, attached] = await Promise.all([
      this.#run((conversation) => conversation.thread),
      this.#sources(),
    ]);
    if (send.builds !== null) {
      const plan = planOf(thread, send.builds);
      if (Option.isSome(plan))
        await this.#run((conversation) => conversation.saveBrief(plan.value));
    }
    const record: TurnRecord = {
      id: TurnId.make(randomId("turn")),
      run: send.run,
      status: "working",
      undone: false,
      sources: attached.filter((source) => send.sources.includes(source.id)),
      selected: send.selected,
      builds: send.builds,
    };
    const started = [
      ...thread,
      withRecord(
        { id: send.message.id, role: "user", content: send.message.text, createdAt: new Date() },
        record,
      ),
    ];
    const working: Working = {
      run: send.run,
      at: thread.length,
      stop: new AbortController(),
      events: [],
      done: Promise.resolve(),
    };
    await this.#run((conversation) => conversation.saveThread(working.at, started));
    this.#working = working;
    this.#broadcast(snapshot(started));
    working.done = this.#runTurn(working, who, send, started, record).then(async (status) => {
      if (!working.events.some(endsRun)) {
        const ended: StreamChunk = {
          type: EventType.RUN_FINISHED,
          timestamp: Date.now(),
          runId: working.run,
          threadId: this.name,
        };
        working.events.push(ended);
        this.#broadcast(ended);
      }
      await this.#changeTurn(working.at, (turn) => ({ ...turn, status }));
      this.#working = null;
      const doc = await getServerByName(this.env.SITE_DOC, who.site);
      await doc.agentPresence({ id: who.person.id, name: who.person.name }, who.draft, null);
    });
  }

  /** Runs a turn to its end, sending every connection its events, and says how it ended. */
  async #runTurn(
    working: Working,
    who: AgentAuthorization,
    send: Send,
    thread: ReadonlyArray<ModelMessage>,
    record: TurnRecord,
  ): Promise<TurnStatus> {
    const scope = Scope.makeUnsafe();
    try {
      const env = this.env;
      const doc = await getServerByName(env.SITE_DOC, who.site);
      const [view, typing] = await Promise.all([doc.viewDraft(who.draft), doc.typingIn(who.draft)]);
      if (!view.ok) return "failed";
      const draft = view.value.draft;
      const contracts = await loadBlocks(draft.lockfile);
      const [voice, brief, sources] = await Promise.all([
        Effect.runPromise(
          voiceOf(who.brand).pipe(Effect.provide(D1Client.layer({ db: env.CORE })), Effect.orDie),
        ),
        this.#run((conversation) => conversation.brief),
        this.#sources(),
      ]);
      const services = await this.#conversation().runPromise(
        Layer.buildWithScope(
          turnServices(env, who, {
            id: record.id,
            timeZone: send.timeZone,
            page: send.page,
            selected: send.selected,
            links: new Set(
              thread.flatMap((message) => (message.role === "user" ? linksIn(message) : [])),
            ),
          }),
          scope,
        ),
      );
      const turn = runTurn({
        model: languageModel(
          { binding: env.AI },
          env.AI_GATEWAY,
          { brand: who.brand, site: who.site, person: who.person.id },
          "edit",
        ),
        messages: thread,
        system: systemPrompt(contracts, voice, brief),
        context: turnContext({
          draft,
          contracts,
          person: { id: who.person.id, name: who.person.name },
          page: draft.pages[send.page],
          selected: send.selected,
          typing,
          // Every document in the conversation, not only this message's, which a later turn may need.
          sources,
        }),
        services,
        threadId: this.name,
        runId: working.run,
        abortController: working.stop,
        save: (messages) =>
          this.#run((conversation) => conversation.saveThread(working.at, messages)),
      });
      for await (const event of turn.events) {
        const sent = underRun(event, working.run);
        working.events.push(sent);
        this.#broadcast(sent);
      }
      return turn.status();
    } catch (error) {
      console.error("An agent turn failed", error);
      return "failed";
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  }

  /** Undoes everything a turn changed, except what someone has changed since. */
  async #undo(connection: AgentConnection, who: AgentAuthorization, id: TurnId) {
    const thread = await this.#run((conversation) => conversation.thread);
    const at = thread.findIndex((message) =>
      Option.exists(recordOf(message), (record) => record.id === id),
    );
    const next = thread.findIndex((message, index) => index > at && message.role === "user");
    const turn = thread.slice(at + 1, next === -1 ? undefined : next);
    const edits = new Set(
      turn.flatMap((message) =>
        (message.toolCalls ?? []).flatMap((call) =>
          editingTools.has(call.function.name) ? [call.id] : [],
        ),
      ),
    );
    const changed = turn.some(
      (message) =>
        message.role === "tool" &&
        message.error === undefined &&
        message.toolCallId !== undefined &&
        edits.has(message.toolCallId),
    );
    const record = recordOf(thread[at]);
    if (
      at === -1 ||
      !changed ||
      Option.exists(record, (found) => found.undone || found.status === "working")
    ) {
      this.#notice(connection, "There's nothing in that turn to undo.");
      return;
    }
    const doc = await getServerByName(this.env.SITE_DOC, who.site);
    const outcome = await doc.undoTurn({ id: who.person.id, name: who.person.name }, who.draft, id);
    if (!outcome.ok || outcome.value.status === "refused") {
      this.#notice(connection, "You can no longer edit this draft.");
      return;
    }
    await this.#changeTurn(at, (turn) => ({ ...turn, undone: true }));
    if (outcome.value.status === "undone" && outcome.value.kept)
      this.#notice(connection, "Some of it stayed, because someone changed it after Pakshi did.");
  }

  /** Takes a document someone attached, converted to Markdown for the agent. */
  override async onRequest(request: Request) {
    const who = this.#authorized(request);
    if (Option.isNone(who)) return new Response("Not authorized", { status: 403 });
    if (request.method !== "POST" || !new URL(request.url).pathname.endsWith(`/${sourcesSegment}`))
      return new Response("Not found", { status: 404 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return new Response("Attach a file.", { status: 400 });
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const type = sourceTypes.get(extension);
    if (type === undefined)
      return new Response(
        extension === "doc" || extension === "pptx" || extension === "ppt"
          ? "Pakshi can't read that kind of file. Save it as a PDF or .docx first."
          : "Pakshi reads PDF, .docx, text, Markdown, CSV and HTML files.",
        { status: 415 },
      );
    if (file.size > maxSourceSize)
      return new Response("Attach a file of 10 MB or less.", { status: 413 });
    const { site, draft, person } = who.value;
    const id = SourceId.make(randomId("src"));
    const object = `sources/${site}/${draft}/${person.id}/${id}`;
    // Plain text and Markdown are read as they are; Workers AI converts the rest.
    const converted =
      type === "text/plain" || type === "text/markdown"
        ? { ok: true as const, markdown: await file.text() }
        : await toMarkdown(this.env, {
            name: file.name,
            blob: new Blob([await file.arrayBuffer()], { type }),
          });
    if (!converted.ok)
      return new Response("Pakshi couldn't read that file. Try a PDF or .docx.", { status: 422 });
    await this.env.CONTENT.put(object, file.stream(), { httpMetadata: { contentType: type } });
    await this.env.CONTENT.put(`${object}.md`, converted.markdown, {
      httpMetadata: { contentType: "text/markdown" },
    });
    const source = { id, name: file.name, size: file.size };
    await this.#run((conversation) => conversation.addSource(source, object));
    this.#broadcast(sourcesEvent(await this.#sources()));
    return Response.json(source);
  }
}
