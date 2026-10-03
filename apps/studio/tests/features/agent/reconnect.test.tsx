import { agentTools } from "@repo/agent/tools";
import { EventType, type StreamChunk } from "@tanstack/ai";
import { useChat } from "@tanstack/ai-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

test("a tab that missed its turn's end can send again once it reconnects", async () => {
  const received: Array<StreamChunk> = [];
  let deliver = (): void => undefined;
  const sent: Array<string> = [];
  function Composer() {
    const chat = useChat({
      live: true,
      tools: agentTools,
      connection: {
        async *subscribe(signal) {
          while (signal?.aborted !== true) {
            const event = received.shift();
            if (event === undefined) await new Promise<void>((resolve) => (deliver = resolve));
            else yield event;
          }
        },
        send: async (_messages, _data, _signal, run) => {
          sent.push(run?.runId ?? "");
        },
      },
    });
    return (
      <button type="button" disabled={chat.isLoading} onClick={() => void chat.sendMessage("Hi")}>
        Send
      </button>
    );
  }
  await render(<Composer />);
  await page.getByRole("button", { name: "Send" }).click();
  await expect.element(page.getByRole("button", { name: "Send" })).toBeDisabled();

  // The connection dropped while the turn ran. On reconnecting, SiteAgent
  // sends the conversation as it ended, and the end of the turn's run.
  received.push(
    { type: EventType.MESSAGES_SNAPSHOT, timestamp: Date.now(), messages: [] },
    {
      type: EventType.RUN_FINISHED,
      timestamp: Date.now(),
      runId: sent[0] ?? "",
      threadId: "thread",
    },
  );
  deliver();
  await expect.element(page.getByRole("button", { name: "Send" })).toBeEnabled();
});
