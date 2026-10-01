import { D1Client } from "@effect/sql-d1";
import {
  BlockRequests,
  type Committed,
  languageModel,
  Sources,
  Turn,
  Web,
  Workspace,
} from "@repo/agent";
import { loadBlocks } from "@repo/blocks";
import { Permission } from "@repo/contracts/access";
import type { Part, Selected } from "@repo/contracts/agent";
import {
  BatchId,
  BrandId,
  DraftId,
  type PageId,
  randomId,
  SiteId,
  type TurnId,
} from "@repo/contracts/ids";
import { previewBasePath } from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { getServerByName } from "partyserver";

import type { Outcome } from "../site-doc.ts";
import type { BatchResult } from "../site/drafts.ts";
import type { DraftView, Site } from "../site/site.ts";
import { Conversation } from "./conversation.ts";
import { sendThroughGateway } from "./gateway.ts";
import { readWebPage } from "./web.ts";

/** Whom a conversation is for, as studio-api found them, and where. */
export const AgentAuthorization = Schema.Struct({
  person: Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
  site: SiteId,
  brand: BrandId,
  draft: DraftId,
  permissions: Schema.Array(Permission),
  /** Studio's address, for preview links. */
  studio: Schema.String,
});
export type AgentAuthorization = typeof AgentAuthorization.Type;

/** The header studio-api passes a conversation's authorization in. Only studio-api reaches SiteAgent. */
export const agentAuthorizationHeader = "x-pakshi-agent";

/** A conversation's SiteAgent name: its site, draft and person. */
export const conversationName = (site: SiteId, draft: DraftId, person: string) =>
  `${site}/${draft}/${person}`;

/** The draft as SiteDoc answered, or a defect: a turn can't go on without its draft. */
const value = <A>(outcome: Outcome<A>) =>
  outcome.ok ? Effect.succeed(outcome.value) : Effect.die(outcome.error);

const closed: Committed = {
  status: "rejected",
  errors: [{ op: 0, path: [], rule: "closed", message: "The draft was published or closed." }],
};

/**
 * Everything a turn's tools reach, for one person's turn in their draft:
 * the draft through its site's SiteDoc, the conversation's documents, the
 * web, block requests in D1, and the model through AI Gateway.
 */
export const turnServices = (
  env: StudioApiEnv,
  who: AgentAuthorization,
  turn: {
    readonly id: TurnId;
    readonly page: PageId;
    readonly selected: Selected | null;
    readonly links: ReadonlySet<string>;
    readonly show: (part: Part) => Promise<void>;
    readonly write: (part: string, delta: string) => void;
  },
) => {
  const person = { id: who.person.id, name: who.person.name };
  const doc = Effect.promise(() => getServerByName(env.SITE_DOC, who.site));
  const workspace = Layer.effect(Workspace)(
    Effect.gen(function* () {
      const site = yield* doc;
      const draft = Effect.flatMap(
        Effect.promise(async (): Promise<Outcome<DraftView>> => site.viewDraft(who.draft)),
        value,
      ).pipe(Effect.map((view) => view.draft));
      const contracts = yield* Effect.cached(
        Effect.flatMap(draft, (current) => Effect.promise(() => loadBlocks(current.lockfile))),
      );
      return Workspace.of({
        draft,
        contracts,
        commit: (ops, at) =>
          Effect.promise(async (): Promise<Outcome<BatchResult>> =>
            site.applyAgentBatch(
              person,
              who.draft,
              { id: BatchId.make(randomId("bat")), ops },
              turn.id,
              at,
            ),
          ).pipe(
            Effect.map((outcome): Committed => {
              if (!outcome.ok) return closed;
              return outcome.value.status === "rejected"
                ? { status: "rejected", errors: outcome.value.errors }
                : { status: "committed" };
            }),
          ),
        typing: Effect.promise(() => site.typingIn(who.draft)),
        check: Effect.flatMap(
          Effect.promise(
            async (): Promise<Outcome<Effect.Success<ReturnType<Site["Service"]["check"]>>>> =>
              site.checkDraft(who.draft),
          ),
          value,
        ),
        previewLink: (path) => `${who.studio}${previewBasePath}/${who.site}/${who.draft}${path}`,
      });
    }),
  );
  const sources = Layer.effect(Sources)(
    Effect.gen(function* () {
      const conversation = yield* Conversation;
      return Sources.of({
        list: Effect.orDie(conversation.sources),
        read: (id) =>
          Effect.gen(function* () {
            const object = yield* Effect.orDie(conversation.sourceObject(id));
            if (Option.isNone(object)) return Option.none();
            const markdown = yield* Effect.promise(() => env.CONTENT.get(`${object.value}.md`));
            return markdown === null
              ? Option.none()
              : Option.some(yield* Effect.promise(() => markdown.text()));
          }),
      });
    }),
  );
  const web = Layer.succeed(Web)({
    read: (url) => Effect.promise(() => readWebPage(env, new URL(who.studio).hostname)(url)),
  });
  const blockRequests = Layer.effect(BlockRequests)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return BlockRequests.of({
        file: ({ need, example, nearest }) =>
          Effect.orDie(
            Effect.asVoid(sql`insert into block_requests
              (id, site_id, requested_by, need, example, nearest)
              values (${randomId("breq")}, ${who.site}, ${who.person.id},
                ${need}, ${example}, ${nearest})`),
          ),
      });
    }),
  ).pipe(Layer.provide(D1Client.layer({ db: env.CORE })));
  const current = Layer.succeed(Turn)({
    id: turn.id,
    person,
    page: turn.page,
    selected: turn.selected,
    links: turn.links,
    show: (part) => Effect.promise(() => turn.show(part)),
    write: (part, delta) => Effect.sync(() => turn.write(part, delta)),
  });
  return Layer.mergeAll(
    workspace,
    sources,
    web,
    blockRequests,
    current,
    languageModel(
      sendThroughGateway(env),
      { brand: who.brand, site: who.site, person: who.person.id },
      "edit",
    ),
  );
};
