import { agentTools } from "@repo/agent/tools";
import { type TurnRecord, turnKey } from "@repo/contracts/agent";
import { TurnId } from "@repo/contracts/ids";
import {
  EventType,
  type ModelMessage,
  modelMessagesToUIMessages,
  uiMessagesToWire,
} from "@tanstack/ai";
import { useChat } from "@tanstack/ai-react";
import type { Schema } from "effect";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { plansOf, turnsOf } from "@/features/agent/agent";
import { PersonMessage, Reply, type TurnActions } from "@/features/agent/turn-view";

/** A person's message as SiteAgent keeps it, with its turn. */
const said = (id: string, text: string, turn: Partial<TurnRecord> = {}): ModelMessage => ({
  id,
  role: "user",
  content: text,
  metadata: {
    [turnKey]: {
      id: TurnId.make(`turn_${id}`),
      run: `run_${id}`,
      status: "done",
      undone: false,
      sources: [],
      selected: null,
      builds: null,
      ...turn,
    },
  },
});

/** Pakshi calling a tool, and what came back, as SiteAgent keeps them. */
const called = (
  id: string,
  name: string,
  args: Schema.Json,
  result?: Schema.Json,
): Array<ModelMessage> => [
  {
    id: `${id}-message`,
    role: "assistant",
    content: null,
    toolCalls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
  },
  ...(result === undefined
    ? []
    : [{ role: "tool" as const, toolCallId: id, content: JSON.stringify(result) }]),
];

const answered = (text: string): ModelMessage => ({ role: "assistant", content: text });

const plan = (title: string) => ({
  plan: {
    summary: `A site for ${title}.`,
    pages: [
      {
        title,
        path: "/",
        recipe: "home",
        sections: [{ type: "hero", purpose: "Say what it is" }],
      },
    ],
  },
});

/**
 * The conversation `thread` as the chat panel shows it: SiteAgent's snapshot
 * of it, read by TanStack AI's chat, with each turn's reply.
 */
const renderConversation = async (thread: ReadonlyArray<ModelMessage>, working = false) => {
  const actions = {
    answer: vi.fn<TurnActions["answer"]>(),
    build: vi.fn<TurnActions["build"]>(),
    /** Undoes a turn, by the ID Pakshi recorded for it. */
    undo: vi.fn<(turn: string | null) => void>(),
    show: vi.fn<TurnActions["show"]>(),
    submit: vi.fn<TurnActions["submit"]>(),
  };
  function Conversation() {
    const chat = useChat({
      live: true,
      tools: agentTools,
      connection: {
        async *subscribe(signal) {
          yield {
            type: EventType.MESSAGES_SNAPSHOT,
            timestamp: Date.now(),
            messages: uiMessagesToWire(modelMessagesToUIMessages([...thread])),
          };
          await new Promise((resolve) => signal?.addEventListener("abort", resolve));
        },
        send: async () => undefined,
      },
    });
    const turns = turnsOf(chat.messages);
    const plans = plansOf(turns);
    return (
      <main className="flex w-96 flex-col gap-4 bg-background p-4 text-foreground">
        {turns.map((turn, index) => (
          <section key={turn.id} aria-label={`Turn ${index + 1}`}>
            <PersonMessage text={turn.text} sources={[]} about={null} />
            <Reply
              turn={turn}
              context={{
                last: index === turns.length - 1,
                working: working && index === turns.length - 1,
                answer: turns[index + 1]?.text ?? null,
                plans,
                blockTitle: (type) => (type === "hero" ? "Hero" : type),
              }}
              actions={{
                answer: actions.answer,
                build: actions.build,
                undo: () => actions.undo(turn.record?.id ?? null),
                show: actions.show,
                submit: actions.submit,
              }}
            />
          </section>
        ))}
      </main>
    );
  }
  await render(<Conversation />);
  return actions;
};

test("a turn shows what Pakshi changed and said, and undoes as a whole", async () => {
  const actions = await renderConversation([
    said("one", "Shorten the heading."),
    ...called(
      "call_heading",
      "apply_ops",
      { page: "pg_home", ops: [] },
      {
        added: [],
        change: {
          label: "Changed heading in the Hero block on Home",
          at: { page: "pg_home", block: "b_hero" },
        },
      },
    ),
    answered("I shortened it to **Learn by building**."),
  ]);
  const changes = page.getByRole("region", { name: "Changes" });
  await expect.element(changes.getByText("1 change to the draft")).toBeVisible();
  await expect
    .element(changes.getByText("Changed heading in the Hero block on Home"))
    .toBeVisible();
  await expect.element(page.getByText("Learn by building")).toBeVisible();
  await changes.getByRole("button", { name: "Undo" }).click();
  expect(actions.undo).toHaveBeenCalledWith("turn_one");
  await changes.getByRole("button", { name: "Show on page" }).click();
  expect(actions.show).toHaveBeenCalledWith({ page: "pg_home", block: "b_hero" });
});

const askedWhichHeading = [
  said("one", "Make it better."),
  ...called(
    "call_ask",
    "ask_user",
    { question: "Which heading?", choices: ["The hero's", "The about section's"] },
    "The question is shown with its choices.",
  ),
];

test("Pakshi's question is answered with one of its choices", async () => {
  const actions = await renderConversation(askedWhichHeading);
  await page.getByRole("radio", { name: "The about section's" }).click();
  await page.getByRole("button", { name: "Answer" }).click();
  expect(actions.answer).toHaveBeenCalledWith("The about section's");
});

test("Pakshi's question is answered in the person's own words", async () => {
  const actions = await renderConversation(askedWhichHeading);
  await page.getByRole("textbox", { name: "Another answer" }).fill("  Both of them ");
  await page.getByRole("button", { name: "Answer" }).click();
  expect(actions.answer).toHaveBeenCalledWith("Both of them");
});

test("a question answered since shows the answer and can't be answered again", async () => {
  await renderConversation([...askedWhichHeading, said("two", "The hero's")]);
  const chosen = page.getByRole("button", { name: "The hero's" });
  await expect.element(chosen).toHaveAttribute("aria-pressed", "true");
  await expect.element(chosen).toBeDisabled();
  await expect.element(page.getByRole("button", { name: "Answer" })).not.toBeInTheDocument();
});

test("only the newest plan can be built, and the one being built says so", async () => {
  const actions = await renderConversation([
    said("one", "Plan a site."),
    ...called("call_first", "propose_plan", plan("Harbour"), "The plan is shown."),
    said("two", "Call it the boatyard."),
    ...called("call_second", "propose_plan", plan("Boatyard"), "The plan is shown."),
  ]);
  const plans = page.getByRole("region", { name: "Site plan" });
  await expect.element(plans.first().getByText("Replaced")).toBeVisible();
  await page.getByRole("button", { name: "Build the site" }).click();
  expect(actions.build).toHaveBeenCalledWith("call_second");
});

test("a plan the person chose to build shows as building", async () => {
  await renderConversation([
    said("one", "Plan a site."),
    ...called("call_plan", "propose_plan", plan("Harbour"), "The plan is shown."),
    said("two", "Build the plan.", { builds: "call_plan" }),
  ]);
  await expect
    .element(page.getByRole("region", { name: "Site plan" }).getByText("Building"))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Build the site" }))
    .not.toBeInTheDocument();
});

test("a turn that ended early says why", async () => {
  await renderConversation([said("one", "Rebuild the site.", { status: "unavailable" })]);
  await expect.element(page.getByText(/Pakshi's AI has reached its spending limit/)).toBeVisible();
});

test("while Pakshi works, the chat shows what it's doing", async () => {
  await renderConversation(
    [
      said("one", "Shorten the heading.", { status: "working" }),
      ...called("call_read", "get_page", { page: "pg_home" }),
    ],
    true,
  );
  await expect.element(page.getByText("Reading a page")).toBeVisible();
});

test("Pakshi shows it's thinking before it has said or done anything", async () => {
  await renderConversation([said("one", "Shorten the heading.", { status: "working" })], true);
  await expect.element(page.getByText("Thinking")).toBeVisible();
});

test("between steps, while Pakshi waits on the model, the chat still shows it working", async () => {
  await renderConversation(
    [
      said("one", "Shorten the heading.", { status: "working" }),
      ...called("call_read", "get_page", { page: "pg_home" }, { blocks: [] }),
    ],
    true,
  );
  await expect.element(page.getByText("Read a page")).toBeVisible();
  await expect.element(page.getByText("Thinking")).toBeVisible();
});
