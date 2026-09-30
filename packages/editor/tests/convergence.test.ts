import { it } from "@effect/vitest";
import type { Draft } from "@repo/contracts/draft";
import { type BlockId, type BlockType, PageId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import type { Op } from "@repo/contracts/ops";
import { Schema } from "effect";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { EditorStore } from "../src/store.ts";
import { allowedTypes, insertOp, listOf, moveByOne, removeOp } from "../src/structure.ts";
import { definitions, fakeSiteDoc, fixtureDraft, meera, sam } from "./support/site-doc.ts";

const page = PageId.make("pg_home");
const jonah: Collaborator = { id: "user_jonah", name: "Jonah Reyes" };

/**
 * A run: the seed its choices come from, and how many things happen in it.
 * Each choice is an integer that picks from whatever is on offer at that moment.
 */
const Run = {
  seed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 ** 31 - 1 })),
  steps: Schema.Int.check(Schema.isBetween({ minimum: 50, maximum: 1500 })),
};

/** A small seeded generator (mulberry32), so a failing run can be repeated exactly. */
const choicesFrom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) % 10_000;
  };
};

/** Every block on the page, sections and items, in page order. */
const blocksOf = (draft: Draft) => {
  const document = draft.pages[page];
  return (document?.root ?? []).flatMap((id) => [
    id,
    ...Object.values(document?.blocks[id]?.slots ?? {}).flat(),
  ]);
};

/** The plain text fields of a block, which typing writes to. */
const textFieldsOf = (draft: Draft, block: BlockId) => {
  const type = draft.pages[page]?.blocks[block]?.type;
  const contract = type === undefined ? undefined : definitions.get(type);
  return Object.entries(contract?.fields ?? {}).flatMap(([name, field]) =>
    field.kind === "text" ? [{ name, max: field.max }] : [],
  );
};

const pick = <A>(items: ReadonlyArray<A>, choice: number) =>
  items.length === 0 ? undefined : items[choice % items.length];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it.prop(
  "editors making random concurrent edits all end showing SiteDoc's draft",
  Run,
  ({ seed, steps }) => {
    const next = choicesFrom(seed);
    const siteDoc = fakeSiteDoc({ auto: false });
    const editors = [meera, sam, jonah].map((person) => {
      const store = new EditorStore({
        draft: fixtureDraft,
        live: fixtureDraft.base,
        page,
        contracts: definitions,
        person,
        connection: siteDoc.connection(person),
        onNotice: () => undefined,
      });
      store.connect();
      return { person, store };
    });

    /** One person does one thing, as they would in the editor. */
    const act = (editor: (typeof editors)[number], action: number) => {
      const { store } = editor;
      const view = store.getState().view;
      const document = view.pages[page];
      if (document === undefined) return;
      const block = pick(blocksOf(view), next());
      const run = (ops: ReadonlyArray<Op> | undefined, burst: string | null = null) => {
        if (ops !== undefined) store.run(ops, burst);
      };
      switch (action) {
        case 0: {
          // Typing in a field, in bursts that share a batch until it's sent.
          if (block === undefined) return;
          const field = pick(textFieldsOf(view, block), next());
          if (field === undefined) return;
          const text = `${editor.person.name.slice(0, 1)}${next()}`.slice(0, field.max);
          return run(
            [{ op: "setProp", target: page, block, path: [field.name], value: text }],
            `${block}:${field.name}`,
          );
        }
        case 1:
          return store.endBurst();
        case 2:
          return store.endBurstBatch();
        case 3: {
          // A new block after one on the page, in whichever list that one sits in.
          const at = block === undefined ? undefined : listOf(document, block);
          const list = at?.list ?? "root";
          const type: BlockType | undefined = pick(
            allowedTypes(document, definitions, list),
            next(),
          );
          if (type === undefined) return;
          return run([insertOp(definitions, page, list, block ?? null, type)]);
        }
        case 4:
          return run(
            block === undefined
              ? undefined
              : [moveByOne(document, definitions, block, next() % 2 === 0 ? "up" : "down")].filter(
                  (op) => op !== undefined,
                ),
          );
        case 5:
          return run(block === undefined ? undefined : [removeOp(page, block)]);
        case 6:
          return store.undo();
        case 7:
          return store.redo();
        default:
          return siteDoc.drop(editor.person);
      }
    };

    for (let step = 0; step < steps; step += 1) {
      const choice = next();
      // Most of the time a message travels; otherwise someone does something.
      if (choice % 10 < 6) siteDoc.step(next());
      else {
        const editor = pick(editors, next());
        if (editor !== undefined) act(editor, next() % 9);
      }
    }

    for (const { store } of editors) store.endBurst();
    siteDoc.deliver();

    const server = siteDoc.draft();
    for (const { store } of editors) {
      const state = store.getState();
      expect(state.status).toBe("saved");
      expect(state.confirmed).toEqual(server);
      expect(state.view).toEqual(server);
    }
  },
  { arbitrary: { runs: 150 } },
);
