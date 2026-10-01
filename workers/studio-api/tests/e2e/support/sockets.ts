import { exports } from "cloudflare:workers";
import { Effect, Schema } from "effect";

import { studioOrigin } from "./studio.ts";

/** A WebSocket opened through studio-api as Studio forwards a browser's, and the messages it has received. */
export interface Socket<Message> {
  readonly status: number;
  readonly send: (message: string) => void;
  /** The next message received that `matches` accepts, waiting for it if needed. */
  readonly next: <A>(matches: (message: Message) => A | undefined) => Effect.Effect<A>;
  /** Waits until the other end closes the socket, with the code it gave. */
  readonly closed: Effect.Effect<number>;
  readonly close: () => void;
}

/**
 * Opens a WebSocket at a studio-api path with the person's session, from
 * Studio's origin unless another is given, reading messages with the
 * protocol's schema. A refused upgrade has the response's status and no
 * messages.
 */
export const openSocket = <Message>(
  messages: Schema.Codec<Message, string>,
  path: string,
  session: string | undefined,
  headers: Readonly<Record<string, string>> = {},
) => {
  const decode = Schema.decodeSync(messages);
  return Effect.acquireRelease(
    Effect.promise(async (): Promise<Socket<Message>> => {
      const request = new Headers({ upgrade: "websocket", origin: studioOrigin, ...headers });
      if (session !== undefined) request.set("cookie", session);
      const response = await exports.default.fetch(
        new Request(`${studioOrigin}${path}`, { headers: request }),
      );
      const socket = response.webSocket;
      if (socket === null) return refused(response.status);
      socket.accept();
      const received: Array<Message> = [];
      const waiting = new Set<() => void>();
      let closedWith: number | null = null;
      socket.addEventListener("message", (event) => {
        received.push(decode(String(event.data)));
        for (const wake of waiting) wake();
      });
      socket.addEventListener("close", (event) => {
        closedWith = event.code;
        for (const wake of waiting) wake();
      });
      const settle = <A>(found: () => A | undefined) =>
        Effect.callback<A>((resume) => {
          const check = () => {
            const value = found();
            if (value === undefined) return;
            waiting.delete(check);
            resume(Effect.succeed(value));
          };
          waiting.add(check);
          check();
          return Effect.sync(() => waiting.delete(check));
        }).pipe(Effect.timeout("5 seconds"), Effect.orDie);
      return {
        status: response.status,
        send: (message) => socket.send(message),
        next: (matches) =>
          settle(() => {
            for (const [index, message] of received.entries()) {
              const value = matches(message);
              if (value === undefined) continue;
              received.splice(0, index + 1);
              return value;
            }
            return undefined;
          }),
        closed: settle(() => closedWith ?? undefined),
        close: () => {
          if (closedWith === null) socket.close(1000, "Test over");
        },
      };
    }),
    (socket) => Effect.sync(socket.close),
  );
};

const refused = <Message>(status: number): Socket<Message> => ({
  status,
  send: () => undefined,
  next: () => Effect.die(`The socket was refused with ${status}.`),
  closed: Effect.succeed(status),
  close: () => undefined,
});
