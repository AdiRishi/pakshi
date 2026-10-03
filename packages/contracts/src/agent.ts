import { Schema } from "effect";

import { BlockId, BlockType, PageId, SourceId, TurnId } from "./ids.ts";
import { Focus } from "./live.ts";
import { PagePath } from "./page.ts";

/*
 * A person's conversation with the agent in one draft, and the messages
 * between the chat panel and their SiteAgent. The conversation is a TanStack
 * AI thread: the person's messages, each starting a turn, and everything the
 * agent did for them. The agent streams a turn as it works, and every
 * connection to the conversation follows it.
 */

/** Where Studio and studio-api serve a person's conversation in a draft: at `${agentBasePath}/${site}/${draft}`. */
export const agentBasePath = "/api/agent";

/** Where a conversation takes source documents, below its own address. */
export const sourcesSegment = "sources";

/** A section of a planned page, and what it's for. */
export const PlannedSection = Schema.Struct({
  type: BlockType,
  purpose: Schema.String.check(Schema.isMaxLength(200)),
});
export type PlannedSection = typeof PlannedSection.Type;

/** A page in a plan. It reworks an existing page when `page` names one, and is new otherwise. */
export const PlannedPage = Schema.Struct({
  page: Schema.optionalKey(PageId),
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(70)),
  path: PagePath,
  recipe: Schema.String,
  sections: Schema.Array(PlannedSection).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
});
export type PlannedPage = typeof PlannedPage.Type;

/**
 * A site plan the agent proposes before building: the pages, a recipe for
 * each, and their sections. The plan a person builds becomes the agent's
 * brief for the rest of the conversation.
 */
export const SitePlan = Schema.Struct({
  summary: Schema.String.check(Schema.isMaxLength(500)),
  pages: Schema.Array(PlannedPage).check(Schema.isMinLength(1), Schema.isMaxLength(30)),
});
export type SitePlan = typeof SitePlan.Type;

/** A document someone attached, as the conversation lists it. */
export const Source = Schema.Struct({
  id: SourceId,
  name: Schema.String,
  size: Schema.Int,
});
export type Source = typeof Source.Type;

/** A block someone had selected when they wrote, so "make this shorter" means it. */
export const Selected = Schema.Struct({
  page: PageId,
  focus: Focus,
  /** The block's title, such as "Hero", for the chat panel to show. */
  title: Schema.String,
});
export type Selected = typeof Selected.Type;

/** What an edit of the agent's did, in words, and where it landed, for the chat to show on the page. */
export const Change = Schema.Struct({
  label: Schema.String,
  at: Schema.Struct({ page: PageId, block: Schema.NullOr(BlockId) }),
});
export type Change = typeof Change.Type;

/**
 * How a turn stands. A turn that ends early says why: the person stopped
 * it, it was cut off, something failed, or the product's AI spend limit
 * was reached.
 */
export const TurnStatus = Schema.Literals([
  "working",
  "done",
  "stopped",
  "interrupted",
  "failed",
  "unavailable",
]);
export type TurnStatus = typeof TurnStatus.Type;

/**
 * What Pakshi keeps about a turn, on the person's message that started it:
 * how it stands, whether the person undid it, and what they sent with it.
 */
export const TurnRecord = Schema.Struct({
  id: TurnId,
  /** The chat run that carried the turn, as the chat panel named it when it sent the message. */
  run: Schema.String,
  status: TurnStatus,
  /** Whether the person undid everything the turn changed. */
  undone: Schema.Boolean,
  sources: Schema.Array(Source),
  selected: Schema.NullOr(Selected),
  /** The propose_plan call whose plan the turn builds. */
  builds: Schema.NullOr(Schema.String),
});
export type TurnRecord = typeof TurnRecord.Type;

/** The key a person's message keeps its turn under, in the message's metadata. */
export const turnKey = "pakshi";

/** Where the person is, by an IANA name such as "Australia/Sydney". It dates the posts a turn writes. */
const TimeZone = Schema.TimeZoneNamedFromString;

/**
 * What the chat panel sends. SiteAgent answers with the conversation as
 * AG-UI events: a snapshot of its messages when a connection opens and
 * whenever a turn starts, ends or is undone, and each turn's events as it
 * runs, to every connection.
 */
export const AgentClientMessage = Schema.TaggedUnion({
  /** Starts a turn with the person's message, as the chat run `run`. */
  Send: {
    run: Schema.String,
    message: Schema.Struct({
      id: Schema.String,
      text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8000)),
    }),
    sources: Schema.Array(SourceId),
    /** The page the person has open. */
    page: PageId,
    selected: Schema.NullOr(Selected),
    timeZone: TimeZone,
    /** The propose_plan call whose plan the person chose to build. */
    builds: Schema.NullOr(Schema.String),
  },
  /** Stops the turn under way. What it committed stays. */
  Stop: {},
  /** Undoes everything a turn changed, except what someone has changed since. */
  Undo: { turn: TurnId },
  /** Starts the conversation again. The draft keeps what the agent did. */
  Clear: {},
});
export type AgentClientMessage = typeof AgentClientMessage.Type;

export const AgentClientMessageJson = Schema.fromJsonString(AgentClientMessage);

/** The AG-UI custom events SiteAgent sends besides a turn's own, by name. */
export const agentEvents = {
  /** Something the agent couldn't do for a message, such as undo a turn that changed nothing. */
  notice: "pakshi.notice",
  /** The documents attached to the conversation, sent when a connection opens and when one is added. */
  sources: "pakshi.sources",
} as const;

export const Notice = Schema.Struct({ message: Schema.String });
export const Sources = Schema.Struct({ sources: Schema.Array(Source) });
