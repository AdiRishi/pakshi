import { BlockId, BlockType, PageId } from "@repo/contracts/ids";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  addAfter,
  type Command,
  duplicate,
  enterBlock,
  insert,
  moveDown,
  moveTo,
  moveUp,
  remove,
} from "../src/commands.ts";
import type { EditorUi, InsertSpot } from "../src/context.tsx";
import { runCommand } from "../src/run-command.ts";
import { EditorStore } from "../src/store.ts";
import { definitions, fakeSiteDoc, fixtureDraft, meera } from "./support/site-doc.ts";

const page = PageId.make("pg_home");
const id = (value: string) => BlockId.make(value);

/** An editor of the fixture draft, on the home page or another. */
const open = (at = page) => {
  const siteDoc = fakeSiteDoc();
  const store = new EditorStore({
    draft: fixtureDraft,
    live: fixtureDraft.base,
    page: at,
    contracts: definitions,
    person: meera,
    connection: siteDoc.connection(meera),
    onNotice: () => undefined,
  });
  const announced: Array<string> = [];
  const picked: Array<InsertSpot> = [];
  // The UI is Studio's seam: it records what the editor would show and say.
  const ui: EditorUi = {
    announce: (message) => announced.push(message),
    openPicker: (spot) => picked.push(spot),
    focusSelection: () => undefined,
    openMedia: () => undefined,
    openLink: () => undefined,
    openForm: () => undefined,
    openSetting: () => undefined,
    setActiveRichText: () => undefined,
    focusInCanvas: () => undefined,
    revealControl: () => undefined,
  };
  const choose = (block: string) => store.select({ kind: "block", target: page, block: id(block) });
  const run = <Args>(command: Command<Args>, args: Args) =>
    runCommand({ store, ui }, command, args, "canvas");
  const home = () => {
    const document = store.getState().view.pages[at];
    if (document === undefined) throw new Error(`${at} is gone.`);
    return document;
  };
  const slot = (section: string) => home().blocks[id(section)]?.slots?.["items"];
  return { store, siteDoc, announced, picked, choose, run, home, slot };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("moving a block by one", () => {
  test("a section swaps with its neighbour, and can't move past either end of the page", () => {
    const { choose, run, home } = open();
    choose("b_bentoplaceholder");
    expect(run(moveUp, undefined)).toBe(true);
    expect(home().root.slice(0, 2)).toEqual(["b_bentoplaceholder", "b_bentogrid"]);
    expect(run(moveUp, undefined)).toBe(false);
    const last = home().root.at(-1);
    if (last === undefined) throw new Error("The page has sections.");
    choose(last);
    expect(run(moveDown, undefined)).toBe(false);
  });

  test("an item at the end of its slot moves into the next section that can hold it", () => {
    const { choose, run, slot } = open();
    choose("b_featuregridplaceholderitems2");
    run(moveDown, undefined);
    expect(slot("b_featuregridplaceholder")).toHaveLength(2);
    expect(slot("b_featuregridsplit")?.[0]).toBe("b_featuregridplaceholderitems2");
  });

  test("an item at the start of its slot moves to the end of the previous section that can hold it", () => {
    const { choose, run, slot } = open();
    choose("b_featuregridlistitems0");
    run(moveUp, undefined);
    expect(slot("b_featuregridgrid")?.at(-1)).toBe("b_featuregridlistitems0");
  });

  test("an item stops at the first and last slots on the page that can hold it", () => {
    const { choose, run } = open();
    choose("b_featuregridgriditems0");
    expect(run(moveUp, undefined)).toBe(false);
    choose("b_featuregridsplititems3");
    expect(run(moveDown, undefined)).toBe(false);
  });

  test("says where the block landed", () => {
    const { choose, run, announced } = open();
    choose("b_featuregridplaceholderitems2");
    run(moveDown, undefined);
    expect(announced.at(-1)).toBe(
      "Moved Something to show for it down, 1 of 5 in Why the harbour.",
    );
  });
});

describe("moving an item to another section", () => {
  test("puts it at the end of that section's slot", () => {
    const { choose, run, slot } = open();
    choose("b_featuregridplaceholderitems0");
    const list = { block: id("b_featuregridsplit"), slot: "items" };
    expect(run(moveTo, { list })).toBe(true);
    expect(slot("b_featuregridsplit")?.at(-1)).toBe("b_featuregridplaceholderitems0");
  });

  test("refuses a section that can't hold it", () => {
    const { choose, run } = open();
    choose("b_featuregridplaceholderitems0");
    expect(run(moveTo, { list: { block: id("b_herostacked"), slot: "items" } })).toBe(false);
  });
});

describe("duplicating", () => {
  test("places a copy with new IDs for it and its items right after it, and chooses the copy", () => {
    const { store, choose, run, home } = open();
    choose("b_featuregridlist");
    run(duplicate, undefined);
    const copy = home().root[home().root.indexOf(id("b_featuregridlist")) + 1];
    if (copy === undefined) throw new Error("No copy was placed.");
    expect(copy).not.toBe("b_featuregridlist");
    expect(store.getState().selection).toEqual({ kind: "block", target: page, block: copy });
    const items = home().blocks[copy]?.slots?.["items"] ?? [];
    expect(items).toHaveLength(4);
    for (const item of items) expect(item).not.toMatch(/^b_featuregridlist/);
    expect(home().blocks[items[0] ?? id("b_missing")]?.props).toEqual(
      home().blocks[id("b_featuregridlistitems0")]?.props,
    );
  });
});

describe("removing", () => {
  test("chooses the block that takes its place", () => {
    const { store, choose, run } = open();
    choose("b_bentogrid");
    run(remove, undefined);
    expect(store.getState().selection?.block).toBe("b_bentoplaceholder");
  });

  test("chooses the block before it at the end of a list, and the section once its last item goes", () => {
    const { store, choose, run } = open();
    choose("b_eventcardsgridtwoevents1");
    run(remove, undefined);
    expect(store.getState().selection?.block).toBe("b_eventcardsgridtwoevents0");
    run(remove, undefined);
    expect(store.getState().selection?.block).toBe("b_eventcardsgridtwo");
  });
});

describe("adding", () => {
  test("a new block starts with its placeholder content and is chosen", () => {
    const { store, run, home } = open();
    const list = { block: id("b_featuregridsplit"), slot: "items" };
    run(insert, { list, after: null, type: BlockType.make("feature-item") });
    const added = home().blocks[id("b_featuregridsplit")]?.slots?.["items"]?.[0];
    if (added === undefined) throw new Error("Nothing was added.");
    expect(home().blocks[added]?.props["title"]).toBe("A short title");
    expect(store.getState().selection).toEqual({ kind: "block", target: page, block: added });
  });

  test("refuses a block the spot doesn't allow", () => {
    const { run, home } = open();
    const before = home();
    const list = { block: id("b_featuregridsplit"), slot: "items" };
    expect(run(insert, { list, after: null, type: BlockType.make("hero") })).toBe(false);
    expect(run(insert, { list: "root", after: null, type: BlockType.make("feature-item") })).toBe(
      false,
    );
    expect(home()).toBe(before);
  });

  test("a post header goes only on a post", () => {
    const type = BlockType.make("post-header");
    expect(open().run(insert, { list: "root", after: null, type })).toBe(false);
    expect(open(PageId.make("pg_dates")).run(insert, { list: "root", after: null, type })).toBe(
      true,
    );
  });

  test("a new blog list on a blog lists that blog", () => {
    const { run, home } = open(PageId.make("pg_news"));
    run(insert, { list: "root", after: null, type: BlockType.make("post-list") });
    const [added] = home().root;
    if (added === undefined) throw new Error("Nothing was added.");
    expect(home().blocks[added]?.props["collection"]).toEqual({ $ref: "page", id: "pg_news" });
  });

  test("adding after a block opens the picker for the spot right after it", () => {
    const { choose, run, picked } = open();
    choose("b_featuregridgriditems1");
    run(addAfter, undefined);
    expect(picked).toEqual([
      {
        list: { block: "b_featuregridgrid", slot: "items" },
        after: "b_featuregridgriditems1",
      },
    ]);
  });
});

describe("structure commands", () => {
  test("act only on a chosen block of the page, not a field or the header", () => {
    const { store, run } = open();
    store.select({
      kind: "field",
      target: page,
      block: id("b_herostacked"),
      path: ["heading"],
    });
    expect(run(remove, undefined)).toBe(false);
    store.select({ kind: "block", target: "site", block: fixtureDraft.parts.header });
    expect(run(duplicate, undefined)).toBe(false);
    expect(run(moveDown, undefined)).toBe(false);
  });

  test("undo reverses an insert, a move, a duplicate and a removal, one at a time", () => {
    const { store, choose, run, home } = open();
    const snapshots = [home()];
    const step = (block: string | null, command: () => void) => {
      if (block !== null) choose(block);
      command();
      snapshots.push(home());
    };
    step(null, () => run(insert, { list: "root", after: null, type: BlockType.make("hero") }));
    step("b_featuregridplaceholderitems2", () => run(moveDown, undefined));
    step("b_gallerygrid", () => run(duplicate, undefined));
    step("b_splitstandard", () => run(remove, undefined));
    for (const expected of snapshots.toReversed().slice(1)) {
      store.undo();
      expect(home()).toEqual(expected);
    }
  });
});

describe("entering a block", () => {
  test("reaches a field inside a list when the block has none of its own", () => {
    const { store, choose, run } = open();
    store.run(
      ["kicker", "heading", "headingRest"].map((field) => ({
        op: "setProp",
        target: page,
        block: id("b_gallerygrid"),
        path: [field],
      })),
    );
    choose("b_gallerygrid");
    expect(run(enterBlock, undefined)).toBe(true);
    expect(store.getState().selection).toEqual({
      kind: "field",
      target: page,
      block: "b_gallerygrid",
      path: ["images", "it_evening", "image"],
    });
  });
});
