import {
  agentBasePath,
  type AgentClientMessage,
  AgentClientMessageJson,
  Selected,
  Source,
  sourcesSegment,
} from "@repo/contracts/agent";
import { type DraftId, PageId, type SiteId, SourceId } from "@repo/contracts/ids";
import type { SubscribeConnectionAdapter, UIMessage } from "@tanstack/ai-react";
import type { StreamChunk } from "@tanstack/ai/client";
import { DateTime, Option, Predicate, Schema } from "effect";
import PartySocket from "partysocket";

/*
 * The chat panel's line to a person's SiteAgent, through Studio's own
 * origin: TanStack AI's chat follows the conversation over it, and the panel
 * stops, undoes and clears turns and attaches documents through it.
 */

const encode = Schema.encodeSync(AgentClientMessageJson);
const decodeSource = Schema.decodeUnknownOption(Source);

/** What the chat panel sends with a message, besides its words. */
export const SendDetails = Schema.Struct({
  sources: Schema.Array(SourceId),
  /** The page the person has open. */
  page: PageId,
  selected: Schema.NullOr(Selected),
  /** The propose_plan call whose plan the person chose to build. */
  builds: Schema.NullOr(Schema.String),
});
export type SendDetails = typeof SendDetails.Type;
const decodeDetails = Schema.decodeUnknownSync(SendDetails);

/**
 * An event of the conversation, as SiteAgent sends them. They're TanStack
 * AI's events, which its chat client reads, so only their kind is checked here.
 */
const ChatEvent = Schema.declare(
  (frame: unknown): frame is StreamChunk =>
    Predicate.hasProperty(frame, "type") && Predicate.isString(frame.type),
);
const readEvent = Schema.decodeUnknownOption(Schema.fromJsonString(ChatEvent));

const textOf = (message: UIMessage | undefined) =>
  (message?.parts ?? []).flatMap((part) => (part.type === "text" ? [part.content] : [])).join("");

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface AgentConnection extends SubscribeConnectionAdapter {
  readonly status: () => ConnectionStatus;
  readonly onStatus: (listener: () => void) => () => void;
  /** Stops the turn under way. What it committed stays. */
  readonly stop: () => void;
  /** Undoes everything a turn changed, except what someone has changed since. */
  readonly undo: (turn: Extract<AgentClientMessage, { _tag: "Undo" }>["turn"]) => void;
  /** Starts the conversation again. The draft keeps what the agent did. */
  readonly clear: () => void;
  /** Attaches a document to the conversation, or says why it couldn't be. */
  readonly attach: (
    file: File,
  ) => Promise<
    { readonly ok: true; readonly source: Source } | { readonly ok: false; readonly reason: string }
  >;
}

/**
 * The connection to a person's conversation in a draft. It opens when the
 * chat subscribes, and SiteAgent sends the conversation each time it does,
 * so nothing is resent after a drop.
 */
export const agentConnection = (site: SiteId, draft: DraftId): AgentConnection => {
  const path = `${agentBasePath}/${site}/${draft}`;
  const listeners = new Set<() => void>();
  let status: ConnectionStatus = "connecting";
  let socket: PartySocket | null = null;
  const setStatus = (next: ConnectionStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };
  const sendFrame = (message: AgentClientMessage) => socket?.send(encode(message));

  return {
    async *subscribe(signal) {
      const opened = new PartySocket({
        host: window.location.host,
        protocol: window.location.protocol === "https:" ? "wss" : "ws",
        basePath: path.slice(1),
        maxEnqueuedMessages: 0,
        minReconnectionDelay: 500,
        maxReconnectionDelay: 10_000,
      });
      socket = opened;
      const events: Array<StreamChunk> = [];
      let wake: (() => void) | null = null;
      const woken = () => new Promise<void>((resolve) => (wake = resolve));
      opened.addEventListener("open", () => setStatus("open"));
      opened.addEventListener("close", () => setStatus("closed"));
      opened.addEventListener("message", (event) => {
        Option.match(readEvent(String(event.data)), {
          onNone: () => {
            // SiteAgent and Studio share one contract, so this is a deploy in progress: start again.
            console.error("Studio couldn't read a message from the agent", event.data);
            opened.reconnect();
          },
          onSome: (found) => {
            events.push(found);
            wake?.();
          },
        });
      });
      signal?.addEventListener("abort", () => wake?.());
      try {
        while (signal?.aborted !== true) {
          const event = events.shift();
          if (event === undefined) await woken();
          else yield event;
        }
      } finally {
        opened.close();
        if (socket === opened) socket = null;
      }
    },
    async send(messages, data, _signal, run) {
      const message = messages.findLast((found) => found.role === "user");
      if (message === undefined || run === undefined || !("parts" in message)) return;
      const details = decodeDetails(data);
      sendFrame({
        _tag: "Send",
        run: run.runId,
        message: { id: message.id, text: textOf(message) },
        timeZone: DateTime.zoneMakeLocal(),
        ...details,
      });
    },
    status: () => status,
    onStatus: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop: () => sendFrame({ _tag: "Stop" }),
    undo: (turn) => sendFrame({ _tag: "Undo", turn }),
    clear: () => sendFrame({ _tag: "Clear" }),
    async attach(file) {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(`${path}/${sourcesSegment}`, { method: "POST", body });
      const refused = "The file couldn't be attached.";
      if (!response.ok) return { ok: false, reason: (await response.text()) || refused };
      return Option.match(decodeSource(await response.json()), {
        onNone: () => ({ ok: false, reason: refused }),
        onSome: (source) => ({ ok: true, source }),
      });
    },
  };
};
