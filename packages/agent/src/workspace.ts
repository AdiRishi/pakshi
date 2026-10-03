import type { Selected, Source } from "@repo/contracts/agent";
import type { Draft } from "@repo/contracts/draft";
import type { PageId, SourceId, TurnId } from "@repo/contracts/ids";
import type { Collaborator, Focus, Presence } from "@repo/contracts/live";
import type { BatchError, Op } from "@repo/contracts/ops";
import type { PagePath } from "@repo/contracts/page";
import type { CheckIssue } from "@repo/contracts/publishing";
import type { BlockContracts } from "@repo/domain/document";
import { Context, type DateTime, type Effect, type Option } from "effect";

/*
 * What a turn's tools reach. Each is a service, so the same tools run in
 * SiteAgent against the site's SiteDoc, in tests, and in the evals against
 * an in-memory draft.
 */

/** Every service a turn's tools reach. */
export type TurnServices = Workspace | Sources | Web | BlockRequests | Turn;

/** A field someone is typing in, which the agent leaves alone. */
export interface TypingIn extends Focus {
  readonly person: Collaborator;
}

/** What became of a batch the agent sent. */
export type Committed =
  | { readonly status: "committed" }
  | { readonly status: "rejected"; readonly errors: ReadonlyArray<BatchError> };

/** The draft the conversation works in, through its site's SiteDoc. */
export class Workspace extends Context.Service<
  Workspace,
  {
    /** The draft as it stands now, other people's changes included. */
    readonly draft: Effect.Effect<Draft>;
    /** The block versions the draft pins. */
    readonly contracts: Effect.Effect<BlockContracts>;
    /**
     * Commits ops as part of the turn, held to completeness, and shows the
     * agent at `at` in presence.
     */
    readonly commit: (ops: ReadonlyArray<Op>, at: Presence) => Effect.Effect<Committed>;
    readonly typing: Effect.Effect<ReadonlyArray<TypingIn>>;
    /** What the checks find in the draft, and whether it's behind the live site. */
    readonly check: Effect.Effect<{
      readonly issues: ReadonlyArray<CheckIssue>;
      readonly behind: boolean;
    }>;
    /** Where anyone the draft is shared with sees a page of it. */
    readonly previewLink: (path: PagePath) => string;
  }
>()("Pakshi/Agent/Workspace") {}

/** Documents people attached to the conversation, converted to Markdown. */
export class Sources extends Context.Service<
  Sources,
  {
    readonly list: Effect.Effect<ReadonlyArray<Source>>;
    readonly read: (id: SourceId) => Effect.Effect<Option.Option<string>>;
  }
>()("Pakshi/Agent/Sources") {}

/** What fetching a web page found, or why it couldn't. */
export type Fetched =
  | { readonly ok: true; readonly markdown: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Web pages people link to. Only a GET within size and time limits, with no
 * redirect to another host and no request to Pakshi's own addresses.
 */
export class Web extends Context.Service<
  Web,
  { readonly read: (url: URL) => Effect.Effect<Fetched> }
>()("Pakshi/Agent/Web") {}

/** Requests for blocks the library doesn't have, for the platform team. */
export class BlockRequests extends Context.Service<
  BlockRequests,
  {
    /** Files a request for the person, or answers false when they may not ask for blocks here. */
    readonly file: (request: {
      readonly need: string;
      readonly example: string;
      readonly nearest: string | null;
    }) => Effect.Effect<boolean>;
  }
>()("Pakshi/Agent/BlockRequests") {}

/** The turn under way: whom it's for, where they are, and what they linked to. */
export class Turn extends Context.Service<
  Turn,
  {
    readonly id: TurnId;
    readonly person: Collaborator;
    /** The person's time zone, which dates the posts the turn writes. */
    readonly timeZone: DateTime.TimeZone;
    /** The page the person has open. */
    readonly page: PageId;
    readonly selected: Selected | null;
    /** Addresses in the person's own messages, the only ones the agent may fetch. */
    readonly links: ReadonlySet<string>;
  }
>()("Pakshi/Agent/Turn") {}
