import { type AgentToolName, agentTools } from "@repo/agent/tools";
import {
  agentEvents,
  Notice,
  type Source,
  Sources,
  TurnRecord,
  turnKey,
} from "@repo/contracts/agent";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import { type UIMessage, useChat } from "@tanstack/ai-react";
import { Option, Schema } from "effect";
import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { agentConnection, type SendDetails } from "./connection";

const decodeNotice = Schema.decodeUnknownOption(Notice);
const decodeSources = Schema.decodeUnknownOption(Sources);
const decodeRecord = Schema.decodeUnknownOption(TurnRecord);

export type AgentMessage = UIMessage<typeof agentTools>;
export type AgentPart = AgentMessage["parts"][number];
export type ToolPart<Name extends AgentToolName = AgentToolName> = Extract<
  AgentPart,
  { type: "tool-call"; name: Name }
>;

/** One turn: what the person said, how the turn stands, and everything Pakshi did for it. */
export interface Turn {
  readonly id: string;
  readonly text: string;
  /** How the turn stands, once SiteAgent has recorded it. A message just sent has none yet. */
  readonly record: TurnRecord | null;
  readonly parts: ReadonlyArray<AgentPart>;
}

/** The conversation as turns: each of the person's messages, with Pakshi's after it. */
export const turnsOf = (messages: ReadonlyArray<AgentMessage>): ReadonlyArray<Turn> =>
  messages.reduce<Array<Turn>>((turns, message) => {
    if (message.role === "user")
      return [
        ...turns,
        {
          id: message.id,
          text: message.parts
            .flatMap((part) => (part.type === "text" ? [part.content] : []))
            .join(""),
          record: Option.getOrNull(decodeRecord(message.metadata?.[turnKey])),
          parts: [],
        },
      ];
    const last = turns.at(-1);
    if (last === undefined) return turns;
    return turns.with(-1, { ...last, parts: [...last.parts, ...message.parts] });
  }, []);

/** How a plan stands: the latest one proposed, the one being built, or one replaced since. */
export type PlanStatus = "proposed" | "building" | "replaced";

/** How each plan in the conversation stands, by the propose_plan call that proposed it. */
export const plansOf = (turns: ReadonlyArray<Turn>): ReadonlyMap<string, PlanStatus> => {
  const plans = turns.flatMap((turn) =>
    turn.parts.flatMap((part) =>
      part.type === "tool-call" && part.name === "propose_plan" && part.state === "complete"
        ? [part.id]
        : [],
    ),
  );
  const built = new Set(turns.flatMap((turn) => turn.record?.builds ?? []));
  return new Map(
    plans.map((plan, index): [string, PlanStatus] => [
      plan,
      built.has(plan) ? "building" : index === plans.length - 1 ? "proposed" : "replaced",
    ]),
  );
};

/**
 * A person's conversation with Pakshi in a draft: the chat, followed live
 * from their SiteAgent, and what they can do in it. Studio keeps one per
 * editor, which the chat panel and the checks share.
 */
export const useAgent = (site: SiteId, draft: DraftId) => {
  const [connection] = useState(() => agentConnection(site, draft));
  const [sources, setSources] = useState<ReadonlyArray<Source>>([]);
  const status = useSyncExternalStore(connection.onStatus, connection.status);
  const chat = useChat({
    connection,
    live: true,
    threadId: `${site}/${draft}`,
    tools: agentTools,
    devtools: { name: "Pakshi" },
    onCustomEvent: (name, value) => {
      if (name === agentEvents.notice)
        Option.map(decodeNotice(value), ({ message }) => toast.info(message));
      if (name === agentEvents.sources)
        Option.map(decodeSources(value), (found) => setSources(found.sources));
    },
  });
  const turns = useMemo(() => turnsOf(chat.messages), [chat.messages]);
  const last = turns.at(-1);
  return {
    status,
    turns,
    sources,
    /** Whether Pakshi is working on a turn, and so takes no new message until it's done or stopped. */
    working: chat.isLoading || last?.record?.status === "working",
    error: chat.error,
    send: (text: string, details: SendDetails) => {
      chat
        .sendMessage(text, { body: details })
        .catch(() => toast.error("Pakshi couldn't take that message. Try again."));
    },
    stop: () => {
      connection.stop();
      chat.stop();
    },
    undo: connection.undo,
    clear: connection.clear,
    attach: connection.attach,
  };
};

export type Agent = ReturnType<typeof useAgent>;
