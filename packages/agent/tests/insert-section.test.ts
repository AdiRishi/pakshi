import { expect, it } from "@effect/vitest";
import { emptyVoiceGuide } from "@repo/contracts/brand";
import { PageId } from "@repo/contracts/ids";
import { Effect, Schema } from "effect";

import { systemPrompt } from "../src/prompt.ts";
import { insertSection } from "../src/tools.ts";
import { toolParts } from "./support/chat.ts";
import { harbourDraft } from "./support/draft.ts";
import type { Reply } from "./support/model.ts";
import { turnWith } from "./support/turn.ts";
import { desk } from "./support/workspace.ts";

const home = PageId.make("pg_home");
const emptyHome = {
  ...harbourDraft,
  pages: Object.fromEntries(
    Object.entries(harbourDraft.pages).map(([id, page]) => [id, { ...page, root: [], blocks: {} }]),
  ),
};

const InsertionResult = Schema.Struct({
  role: Schema.Literal("tool"),
  content: Schema.fromJsonString(insertSection.outputSchema),
});
const readResult = Schema.decodeUnknownSync(InsertionResult);

/**
 * Has the agent build the empty homepage's three sections, the first
 * inserted with `firstAfter` and each after that after the block the last
 * insertion returned.
 */
const buildHome = (firstAfter: string | null | undefined) =>
  Effect.gen(function* () {
    const { contracts } = yield* Effect.promise(() => desk(emptyHome));
    const types = ["hero", "feature-grid", "call-to-action"];
    return yield* turnWith(
      (request, step): Reply => {
        const section = step - (firstAfter === null || step === 0 ? 0 : 1);
        const type = types[section];
        if (type === undefined) return { text: "I added the three sections." };
        const after =
          step === 0
            ? firstAfter
            : section === 0
              ? null
              : readResult(request.messages.at(-1)).content.block;
        return {
          calls: [{ name: "insert_section", params: { page: home, after, section: { type } } }],
        };
      },
      "Add a generic homepage with three sections.",
      { draft: emptyHome, system: systemPrompt(contracts, emptyVoiceGuide, null) },
    );
  });

it.effect("inserts first on an empty homepage, then after each returned section ID", () =>
  Effect.gen(function* () {
    const { state, requests, status } = yield* buildHome(null);
    const page = state.draft.pages[home];
    expect(status).toBe("done");
    expect(page?.root.map((id) => page.blocks[id]?.type)).toEqual([
      "hero",
      "feature-grid",
      "call-to-action",
    ]);
    expect(state.draft.parts).toEqual(harbourDraft.parts);
    expect(requests[0]?.tools).toContainEqual(
      expect.objectContaining({
        function: expect.objectContaining({
          name: "insert_section",
          parameters: expect.objectContaining({
            required: expect.arrayContaining(["after"]),
            properties: expect.objectContaining({
              after: expect.objectContaining({
                anyOf: expect.arrayContaining([{ type: "null" }]),
                description: expect.stringContaining("JSON null to insert first"),
              }),
            }),
          }),
        }),
      }),
    );
  }),
);

for (const [name, after] of [
  ["omitted", undefined],
  ["an empty string", ""],
  ["the string null", "null"],
] as const) {
  it.effect(`can repair after when it is ${name}, then build the empty homepage in order`, () =>
    Effect.gen(function* () {
      const { state, requests, chat, status } = yield* buildHome(after);
      expect(status).toBe("done");
      expect(JSON.stringify(requests[1]?.messages)).toContain(
        "Supply after: null to insert first, including on an empty page, or an existing block ID",
      );
      const page = state.draft.pages[home];
      expect(page?.root.map((id) => page.blocks[id]?.type)).toEqual([
        "hero",
        "feature-grid",
        "call-to-action",
      ]);
      expect(
        toolParts(chat, "insert_section").filter(
          (part) => part.type === "tool-call" && part.state === "complete",
        ),
      ).toHaveLength(3);
    }),
  );
}
