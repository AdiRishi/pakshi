import type { SiteId } from "@repo/contracts/ids";
import { ClientMessageJson, liveBasePath, ServerMessageJson } from "@repo/contracts/live";
import type { Connection } from "@repo/editor";
import { Option, Schema } from "effect";
import PartySocket from "partysocket";

const encode = Schema.encodeSync(ClientMessageJson);
const decode = Schema.decodeUnknownOption(ServerMessageJson);

/**
 * The editor's live connection to a site's SiteDoc, through Studio's own
 * origin. PartySocket reconnects after a drop. It doesn't hold messages sent
 * while closed, because the editor sends again what SiteDoc hasn't confirmed
 * each time a connection opens.
 */
export const liveConnection = (site: SiteId): Connection => ({
  open: (events) => {
    const socket = new PartySocket({
      host: window.location.host,
      protocol: window.location.protocol === "https:" ? "wss" : "ws",
      basePath: `${liveBasePath.slice(1)}/${site}`,
      maxEnqueuedMessages: 0,
      minReconnectionDelay: 500,
      maxReconnectionDelay: 10_000,
    });
    socket.addEventListener("open", events.onOpen);
    socket.addEventListener("close", events.onClose);
    socket.addEventListener("message", (event) => {
      const message = decode(event.data);
      if (Option.isSome(message)) return events.onMessage(message.value);
      // SiteDoc and Studio share one contract, so this is a deploy in progress: start again.
      console.error("Studio couldn't read a message from SiteDoc", event.data);
      socket.reconnect();
    });
    return {
      send: (message) => socket.send(encode(message)),
      close: () => socket.close(),
    };
  },
});
