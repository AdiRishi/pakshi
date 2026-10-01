import { D1Client } from "@effect/sql-d1";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { runTurn, systemPrompt, turnContext } from "@repo/agent";
import { loadBlocks } from "@repo/blocks";
import {
  AgentClientMessage,
  AgentClientMessageJson,
  type AgentServerMessage,
  AgentServerMessageJson,
  type Part,
  type Request as TurnRequest,
  type Selected,
  sourcesSegment,
  type Turn,
  type TurnStatus,
} from "@repo/contracts/agent";
import { type PageId, randomId, SourceId, TurnId } from "@repo/contracts/ids";
import { now } from "@repo/contracts/release";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Cause, Effect, Exit, Layer, ManagedRuntime, Option, Schema } from "effect";
import { Chat } from "effect/unstable/ai";
import type { SqlError } from "effect/unstable/sql";
import * as Migrator from "effect/unstable/sql/Migrator";
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
const encodeMessage = Schema.encodeSync(AgentServerMessageJson);

type AgentConnection = Connection<AgentAuthorization>;

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

/** Addresses in a person's words, which the agent may fetch. */
const linksIn = (text: string) =>
  Array.from(text.matchAll(/https?:\/\/[^\s<>()"']+/g), ([found]) =>
    URL.canParse(found) ? [new URL(found).href] : [],
  ).flat();

/** A turn's part replaced, or added when the turn has none with its ID. */
const withPart = (turn: Turn, part: Part): Turn => {
  const index = turn.parts.findIndex((found) => found.id === part.id);
  return {
    ...turn,
    parts: index === -1 ? [...turn.parts, part] : turn.parts.with(index, part),
  };
};

/** A turn as it ends: anything still running when it stopped didn't finish. */
const ended = (turn: Turn, status: TurnStatus): Turn => ({
  ...turn,
  status,
  parts: turn.parts.map((part) =>
    part._tag === "Activity" && part.status === "running" ? { ...part, status: "failed" } : part,
  ),
});

/** The turn under way, and what stops it. */
interface Working {
  turn: Turn;
  readonly stop: AbortController;
  done: Promise<void>;
}

/**
 * One person's conversation with the agent in one draft, named by the site,
 * draft and person. studio-api is the only way in: it checks the person may
 * edit the draft and says who they are in a header it sets.
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

  #authorized(request: Request) {
    const authorization = decodeAuthorization(request.headers.get(agentAuthorizationHeader));
    return Option.filter(
      authorization,
      ({ site, draft, person }) => conversationName(site, draft, person.id) === this.name,
    );
  }

  #broadcast(message: AgentServerMessage) {
    const text = encodeMessage(message);
    for (const connection of this.getConnections()) connection.send(text);
  }

  #send(connection: AgentConnection, message: AgentServerMessage) {
    connection.send(encodeMessage(message));
  }

  /** Runs each message after the ones before it, in the order they arrive. */
  #inOrder<A>(task: () => Promise<A>): Promise<A> {
    const next = this.#messages.then(task);
    this.#messages = next.catch(() => undefined);
    return next;
  }

  #saveTurn(turn: Turn) {
    this.#broadcast({ _tag: "TurnChanged", turn });
    return this.#run((conversation) => conversation.saveTurn(turn));
  }

  override async onStart() {
    // A turn still working when the object was evicted was cut off.
    const turns = await this.#run((conversation) => conversation.turns);
    for (const turn of turns)
      if (turn.status === "working")
        await this.#run((conversation) => conversation.saveTurn(ended(turn, "interrupted")));
  }

  override onConnect(connection: AgentConnection, { request }: ConnectionContext) {
    const authorization = this.#authorized(request);
    if (Option.isNone(authorization)) {
      connection.close(1008, "Not authorized");
      return;
    }
    connection.setState(authorization.value);
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
        Sync: async () => {
          const [turns, sources] = await Promise.all([
            this.#run((conversation) => conversation.turns),
            this.#run((conversation) => conversation.sources),
          ]);
          const working = this.#working?.turn;
          this.#send(connection, {
            _tag: "Synced",
            turns: turns.map((turn) => (turn.id === working?.id ? working : turn)),
            sources,
          });
        },
        Send: ({ text, sources, page, selected }) =>
          this.#startTurn(connection, who, { text, sources, page, selected }),
        Answer: async ({ turn: id, part, answer, page }) => {
          const turn = (await this.#run((conversation) => conversation.turns)).find(
            (found) => found.id === id,
          );
          const question = turn?.parts.find((found) => found.id === part);
          if (turn === undefined || question?._tag !== "Question" || question.answer !== null)
            return;
          if (this.#busy(connection)) return;
          await this.#saveTurn(withPart(turn, { ...question, answer }));
          await this.#startTurn(connection, who, {
            text: answer,
            sources: [],
            page,
            selected: null,
          });
        },
        Build: async ({ turn: id, part, page }) => {
          const turns = await this.#run((conversation) => conversation.turns);
          const plan = turns
            .find((found) => found.id === id)
            ?.parts.find((found) => found.id === part);
          if (plan?._tag !== "Plan" || plan.status !== "proposed") return;
          if (this.#busy(connection)) return;
          for (const turn of turns) {
            const proposed = turn.parts.filter(
              (found) => found._tag === "Plan" && found.status === "proposed",
            );
            if (proposed.length === 0) continue;
            await this.#saveTurn(
              proposed.reduce(
                (changed, found) =>
                  found._tag === "Plan"
                    ? withPart(changed, {
                        ...found,
                        status: found.id === part ? "building" : "replaced",
                      })
                    : changed,
                turn,
              ),
            );
          }
          await this.#run((conversation) => conversation.saveBrief(plan.plan));
          await this.#startTurn(connection, who, {
            text: "Build the plan.",
            sources: [],
            page,
            selected: null,
          });
        },
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
          const sources = await this.#run((conversation) => conversation.sources);
          for (const source of sources) {
            const object = await this.#run((conversation) => conversation.sourceObject(source.id));
            if (Option.isSome(object))
              await this.env.CONTENT.delete([object.value, `${object.value}.md`]);
          }
          await this.#run((conversation) => conversation.clear);
          this.#broadcast({ _tag: "Cleared" });
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

  /** Whether a turn is under way, which the person is told, since the conversation takes one at a time. */
  #busy(connection: AgentConnection) {
    if (this.#working === null) return false;
    this.#send(connection, {
      _tag: "Notice",
      message: "Pakshi is still working on your last message. Stop it first, or wait.",
    });
    return true;
  }

  /** Starts a turn for a person's message, unless one is under way. */
  async #startTurn(
    connection: AgentConnection,
    who: AgentAuthorization,
    message: {
      readonly text: string;
      readonly sources: ReadonlyArray<SourceId>;
      readonly page: PageId;
      readonly selected: Selected | null;
    },
  ) {
    if (this.#busy(connection)) return;
    const [turns, attached] = await Promise.all([
      this.#run((conversation) => conversation.turns),
      this.#run((conversation) => conversation.sources),
    ]);
    const request: TurnRequest = {
      text: message.text,
      sources: attached.filter((source) => message.sources.includes(source.id)),
      selected: message.selected,
      at: now(),
    };
    const turn: Turn = {
      id: TurnId.make(randomId("turn")),
      request,
      parts: [],
      status: "working",
      undone: false,
    };
    const stop = new AbortController();
    const links = new Set(
      [...turns.map((found) => found.request.text), message.text].flatMap(linksIn),
    );
    const working: Working = { turn, stop, done: Promise.resolve() };
    this.#working = working;
    await this.#saveTurn(turn);

    const show = (part: Part) => {
      working.turn = withPart(working.turn, part);
      return this.#saveTurn(working.turn);
    };
    const write = (id: string, delta: string) => {
      const part = working.turn.parts.find((found) => found.id === id);
      if (part?._tag !== "Text") return;
      working.turn = withPart(working.turn, { ...part, text: part.text + delta });
      this.#broadcast({ _tag: "TextDelta", turn: turn.id, part: id, delta });
    };
    const env = this.env;
    const services = turnServices(env, who, {
      id: turn.id,
      page: message.page,
      selected: message.selected,
      links,
      show,
      write,
    });
    const program = Effect.gen(function* () {
      const conversation = yield* Conversation;
      const history = yield* conversation.prompt;
      const chat = Option.isSome(history)
        ? yield* Effect.orDie(Chat.fromJson(history.value))
        : yield* Chat.empty;
      const doc = yield* Effect.promise(() => getServerByName(env.SITE_DOC, who.site));
      const [view, typing] = yield* Effect.promise(() =>
        Promise.all([doc.viewDraft(who.draft), doc.typingIn(who.draft)]),
      );
      if (!view.ok) return "failed" as const;
      const draft = view.value.draft;
      const contracts = yield* Effect.promise(() => loadBlocks(draft.lockfile));
      const context = turnContext({
        draft,
        contracts,
        person: { id: who.person.id, name: who.person.name },
        page: draft.pages[message.page],
        selected: message.selected,
        typing,
        sources: attached,
      });
      const saveHistory = Effect.flatMap(Effect.orDie(chat.exportJson), (json) =>
        Effect.orDie(conversation.savePrompt(json)),
      );
      return yield* runTurn({
        chat,
        system: systemPrompt(
          contracts,
          yield* voiceOf(who.brand).pipe(
            Effect.provide(D1Client.layer({ db: env.CORE })),
            Effect.orDie,
          ),
          yield* conversation.brief,
        ),
        message: `${context}\n\n${message.text}`,
        afterStep: saveHistory,
      }).pipe(Effect.ensuring(saveHistory));
    }).pipe(Effect.provide(services));

    working.done = this.#conversation()
      .runPromiseExit(Effect.orDie(program), { signal: stop.signal })
      .then(async (exit) => {
        if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
          console.error("An agent turn failed", Cause.pretty(exit.cause));
        const status: TurnStatus = Exit.isSuccess(exit)
          ? exit.value
          : Cause.hasInterruptsOnly(exit.cause)
            ? "stopped"
            : "failed";
        this.#working = null;
        await this.#saveTurn(ended(working.turn, status));
        const doc = await getServerByName(env.SITE_DOC, who.site);
        await doc.agentPresence({ id: who.person.id, name: who.person.name }, who.draft, null);
      });
  }

  /** Undoes everything a turn changed, except what someone has changed since. */
  async #undo(connection: AgentConnection, who: AgentAuthorization, id: TurnId) {
    const turn = (await this.#run((conversation) => conversation.turns)).find(
      (found) => found.id === id,
    );
    const changed = turn?.parts.some((part) => part._tag === "Activity" && part.changed) ?? false;
    if (turn === undefined || turn.undone || !changed || this.#working?.turn.id === id) {
      this.#send(connection, { _tag: "Notice", message: "There's nothing in that turn to undo." });
      return;
    }
    const doc = await getServerByName(this.env.SITE_DOC, who.site);
    const outcome = await doc.undoTurn({ id: who.person.id, name: who.person.name }, who.draft, id);
    if (!outcome.ok || outcome.value.status === "refused") {
      this.#send(connection, { _tag: "Notice", message: "You can no longer edit this draft." });
      return;
    }
    await this.#saveTurn({ ...turn, undone: true });
    if (outcome.value.status === "undone" && outcome.value.kept)
      this.#send(connection, {
        _tag: "Notice",
        message: "Some of it stayed, because someone changed it after Pakshi did.",
      });
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
    this.#broadcast({ _tag: "SourceAdded", source });
    return Response.json(source);
  }
}
