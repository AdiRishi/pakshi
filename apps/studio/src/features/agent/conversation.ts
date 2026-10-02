import {
  agentBasePath,
  AgentClientMessageJson,
  type AgentClientMessage,
  type AgentServerMessage,
  AgentServerMessageJson,
  Source,
  sourcesSegment,
  type Turn,
} from "@repo/contracts/agent";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import { Option, Schema } from "effect";
import PartySocket from "partysocket";

const encode = Schema.encodeSync(AgentClientMessageJson);
const decode = Schema.decodeUnknownOption(AgentServerMessageJson);
const decodeSource = Schema.decodeUnknownOption(Source);

export interface ConversationState {
  /** Whether the chat panel is connected, and has the conversation. */
  readonly status: "connecting" | "open" | "closed";
  readonly turns: ReadonlyArray<Turn>;
  /** Documents attached to the conversation, which a message can send along. */
  readonly sources: ReadonlyArray<Source>;
}

/** Whether Pakshi is working on a turn, and so takes no new message until it's done or stopped. */
export const isWorking = (state: ConversationState) =>
  state.turns.some((turn) => turn.status === "working");

/** Adds a turn, or replaces the one with its ID. */
const withTurn = (turns: ReadonlyArray<Turn>, turn: Turn) => {
  const index = turns.findIndex((found) => found.id === turn.id);
  return index === -1 ? [...turns, turn] : turns.with(index, turn);
};

/**
 * The chat panel's side of a person's conversation with the agent in a
 * draft, through Studio's own origin. SiteAgent sends the conversation each
 * time the connection opens, so nothing is resent after a drop.
 */
export class Conversation {
  readonly #site: SiteId;
  readonly #draft: DraftId;
  readonly #onNotice: (message: string) => void;
  readonly #listeners = new Set<() => void>();
  #state: ConversationState = { status: "connecting", turns: [], sources: [] };
  #socket: PartySocket | null = null;

  constructor(options: {
    readonly site: SiteId;
    readonly draft: DraftId;
    readonly onNotice: (message: string) => void;
  }) {
    this.#site = options.site;
    this.#draft = options.draft;
    this.#onNotice = options.onNotice;
  }

  getState = () => this.#state;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(next: Partial<ConversationState>) {
    this.#state = { ...this.#state, ...next };
    for (const listener of this.#listeners) listener();
  }

  /** Connects, and returns what disconnects. */
  connect = () => {
    const socket = new PartySocket({
      host: window.location.host,
      protocol: window.location.protocol === "https:" ? "wss" : "ws",
      basePath: `${agentBasePath.slice(1)}/${this.#site}/${this.#draft}`,
      maxEnqueuedMessages: 0,
      minReconnectionDelay: 500,
      maxReconnectionDelay: 10_000,
    });
    socket.addEventListener("open", () => socket.send(encode({ _tag: "Sync" })));
    socket.addEventListener("close", () => this.#set({ status: "closed" }));
    socket.addEventListener("message", (event) => {
      const message = decode(event.data);
      if (Option.isSome(message)) return this.#received(message.value);
      // SiteAgent and Studio share one contract, so this is a deploy in progress: start again.
      console.error("Studio couldn't read a message from the agent", event.data);
      socket.reconnect();
    });
    this.#socket = socket;
    return () => {
      socket.close();
      if (this.#socket === socket) this.#socket = null;
    };
  };

  #received(message: AgentServerMessage) {
    switch (message._tag) {
      case "Synced":
        return this.#set({ status: "open", turns: message.turns, sources: message.sources });
      case "TurnChanged":
        return this.#set({ turns: withTurn(this.#state.turns, message.turn) });
      case "TextDelta": {
        const turn = this.#state.turns.find((found) => found.id === message.turn);
        if (turn === undefined) return;
        return this.#set({
          turns: withTurn(this.#state.turns, {
            ...turn,
            parts: turn.parts.map((part) =>
              part._tag === "Text" && part.id === message.part
                ? { ...part, text: part.text + message.delta }
                : part,
            ),
          }),
        });
      }
      case "SourceAdded":
        return this.#set({
          sources: this.#state.sources.some((source) => source.id === message.source.id)
            ? this.#state.sources
            : [...this.#state.sources, message.source],
        });
      case "Cleared":
        return this.#set({ turns: [], sources: [] });
      case "Notice":
        return this.#onNotice(message.message);
    }
  }

  send(message: AgentClientMessage) {
    this.#socket?.send(encode(message));
  }

  /** Attaches a document to the conversation, or says why it couldn't be. */
  async attach(
    file: File,
  ): Promise<
    { readonly ok: true; readonly source: Source } | { readonly ok: false; readonly reason: string }
  > {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(
      `${agentBasePath}/${this.#site}/${this.#draft}/${sourcesSegment}`,
      { method: "POST", body },
    );
    const refused = "The file couldn't be attached.";
    if (!response.ok) return { ok: false, reason: (await response.text()) || refused };
    const source = decodeSource(await response.json());
    return Option.isSome(source)
      ? { ok: true, source: source.value }
      : { ok: false, reason: refused };
  }
}
