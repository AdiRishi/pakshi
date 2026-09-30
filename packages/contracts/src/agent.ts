import { Schema } from "effect";

import { BlockId, BlockType, PageId, SourceId, TurnId } from "./ids.ts";
import { Focus } from "./live.ts";
import { PagePath } from "./page.ts";
import { PreflightIssue } from "./publishing.ts";
import { Timestamp } from "./release.ts";

/*
 * A person's conversation with the agent in one draft, and the messages
 * between the chat panel and their SiteAgent. A conversation is a list of
 * turns: something the person said or chose, and everything the agent did
 * for it. The agent streams a turn as it works, and every connection to the
 * conversation follows it.
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

/** What started a turn: something the person wrote, or an answer they chose. */
export const Request = Schema.Struct({
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8000)),
  sources: Schema.Array(Source),
  selected: Schema.NullOr(Selected),
  at: Timestamp,
});
export type Request = typeof Request.Type;

/** What the agent did with a tool, in words, and how it went. */
export const Activity = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(["running", "done", "failed"]),
  /** Whether it changed the draft, so it counts among the turn's changes. */
  changed: Schema.Boolean,
  /** The page and block it changed, for the chat panel to show on the page. */
  at: Schema.NullOr(Schema.Struct({ page: PageId, block: Schema.NullOr(BlockId) })),
});
export type Activity = typeof Activity.Type;

/** One part of a turn, in the order the agent produced them. */
export const Part = Schema.TaggedUnion({
  Text: { id: Schema.String, text: Schema.String },
  Activity: Activity.fields,
  /** A question with choices. The person answers by choosing one, or by writing. */
  Question: {
    id: Schema.String,
    question: Schema.String,
    choices: Schema.Array(Schema.String),
    answer: Schema.NullOr(Schema.String),
  },
  /** A site plan to build or change. */
  Plan: {
    id: Schema.String,
    plan: SitePlan,
    status: Schema.Literals(["proposed", "building", "replaced"]),
  },
  /** Pre-flight's findings, and whether the draft can be submitted. A person submits it. */
  Submission: { id: Schema.String, issues: Schema.Array(PreflightIssue), behind: Schema.Boolean },
  /** A block the agent asked the platform team for. */
  BlockRequest: { id: Schema.String, need: Schema.String },
});
export type Part = typeof Part.Type;

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

export const Turn = Schema.Struct({
  id: TurnId,
  request: Request,
  parts: Schema.Array(Part),
  status: TurnStatus,
  /** Whether the person undid everything the turn changed. */
  undone: Schema.Boolean,
});
export type Turn = typeof Turn.Type;

/** What the chat panel sends. */
export const AgentClientMessage = Schema.TaggedUnion({
  /** Opens every connection; the agent answers with the conversation. */
  Sync: {},
  Send: {
    text: Request.fields.text,
    sources: Schema.Array(SourceId),
    /** The page the person has open. */
    page: PageId,
    selected: Schema.NullOr(Selected),
  },
  /** Answers a question in a turn, which starts the next turn. */
  Answer: { turn: TurnId, part: Schema.String, answer: Request.fields.text, page: PageId },
  /** Builds a proposed plan, which starts the next turn. */
  Build: { turn: TurnId, part: Schema.String, page: PageId },
  /** Stops the turn under way. What it committed stays. */
  Stop: {},
  /** Undoes everything a turn changed, except what someone has changed since. */
  Undo: { turn: TurnId },
  /** Starts the conversation again. The draft keeps what the agent did. */
  Clear: {},
});
export type AgentClientMessage = typeof AgentClientMessage.Type;

/** What SiteAgent sends. */
export const AgentServerMessage = Schema.TaggedUnion({
  /** The answer to Sync: the conversation so far, a turn under way included. */
  Synced: { turns: Schema.Array(Turn), sources: Schema.Array(Source) },
  /** A turn as it now stands, when it starts, changes or ends. */
  TurnChanged: { turn: Turn },
  /** More text for a text part of the turn under way. */
  TextDelta: { turn: TurnId, part: Schema.String, delta: Schema.String },
  /** A source someone attached, now ready to send with a message. */
  SourceAdded: { source: Source },
  Cleared: {},
  /** Something the agent couldn't do for a message, such as undo a turn that changed nothing. */
  Notice: { message: Schema.String },
});
export type AgentServerMessage = typeof AgentServerMessage.Type;

export const AgentClientMessageJson = Schema.fromJsonString(AgentClientMessage);
export const AgentServerMessageJson = Schema.fromJsonString(AgentServerMessage);
