import { isBehind } from "@repo/contracts/draft";
import { BatchId, BlockId, BlockType, PageId, ReleaseId, SnapshotId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import type { Op } from "@repo/contracts/ops";
import { LiveRelease } from "@repo/contracts/snapshot";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Notice } from "../src/notices.ts";
import { EditorStore, fieldKey } from "../src/store.ts";
import { insertOp } from "../src/structure.ts";
import { definitions, fakeSiteDoc, fixtureDraft, meera, sam } from "./support/site-doc.ts";

const page = PageId.make("pg_home");
const hero = BlockId.make("b_herocentered");
const original = "Summer school at the harbour";

const setHeading = (value: string): Op => ({
  op: "setProp",
  target: page,
  block: hero,
  path: ["heading"],
  value,
});

/** The burst key typing in the hero's heading shares, as the canvas gives it. */
const typingInHeading = fieldKey(page, hero, ["heading"]);

const headingOf = (store: EditorStore) =>
  store.getState().view.pages[page]?.blocks[hero]?.props["heading"];

const serverHeading = (siteDoc: ReturnType<typeof fakeSiteDoc>) =>
  siteDoc.draft().pages[page]?.blocks[hero]?.props["heading"];

/** An editor for `person`, connected to the SiteDoc. */
const open = (siteDoc: ReturnType<typeof fakeSiteDoc>, person: Collaborator = meera) => {
  const notices: Array<Notice> = [];
  const store = new EditorStore({
    draft: fixtureDraft,
    live: fixtureDraft.base,
    page,
    contracts: definitions,
    person,
    connection: siteDoc.connection(person),
    onNotice: (notice) => notices.push(notice),
  });
  store.connect();
  return { store, notices };
};

/** Lets typing's timers run and every message arrive. */
const settle = () => vi.advanceTimersByTimeAsync(5000);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a command", () => {
  test("shows at once and reaches SiteDoc, which then confirms it", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    expect(store.run([setHeading("Build and sail")])).toEqual([]);
    expect(headingOf(store)).toBe("Build and sail");
    await settle();
    expect(serverHeading(siteDoc)).toBe("Build and sail");
    expect(store.getState().confirmed.revision).toBe(1);
    expect(store.getState().status).toBe("saved");
  });

  test("that breaks a rule is refused locally and never sent", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    expect(store.run([setHeading("x".repeat(81))])).toEqual([
      expect.objectContaining({ rule: "value", path: ["heading"] }),
    ]);
    await settle();
    expect(siteDoc.log()).toEqual([]);
    expect(store.getState().canUndo).toBe(false);
  });
});

describe("typing", () => {
  test("a burst in one field is one undo step and one batch", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    await settle();
    for (const heading of ["S", "Sa", "Sai", "Sail"]) store.run([setHeading(heading)], "heading");
    await settle();
    expect(siteDoc.log().map((batch) => batch.ops)).toEqual([[setHeading("Sail")]]);
    store.undo();
    expect(headingOf(store)).toBe(original);
  });

  test("keystrokes reach SiteDoc within half a second while the burst goes on", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    await settle();
    store.run([setHeading("S")], "heading");
    await vi.advanceTimersByTimeAsync(400);
    expect(serverHeading(siteDoc)).toBe("S");
    store.run([setHeading("Sa")], "heading");
    await settle();
    expect(siteDoc.log().map((batch) => batch.ops)).toEqual([
      [setHeading("S")],
      [setHeading("Sa")],
    ]);
    store.undo();
    expect(headingOf(store)).toBe(original);
  });

  test("typing waiting to be sent counts as saving, until SiteDoc has it", async () => {
    const { store } = open(fakeSiteDoc());
    await settle();
    store.run([setHeading("Sail")], "heading");
    expect(store.getState().status).toBe("saving");
    await settle();
    expect(store.getState().status).toBe("saved");
  });

  test("a required heading can be emptied and typed again", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    expect(store.run([setHeading("")], "heading")).toEqual([]);
    expect(store.run([setHeading("B")], "heading")).toEqual([]);
    await settle();
    expect(serverHeading(siteDoc)).toBe("B");
  });

  test("cancelling a burst puts the field back as it was", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    store.run([setHeading("Sail")], "heading");
    store.cancelBurst();
    await settle();
    expect(headingOf(store)).toBe(original);
    expect(serverHeading(siteDoc)).toBe(original);
    expect(store.getState().canUndo).toBe(false);
  });
});

describe("undo", () => {
  test("reverses one command at a time, and redo brings them back", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    store.run([setHeading("First")]);
    store.run([{ op: "setVariant", target: page, block: hero, variant: "split-image" }]);
    store.undo();
    expect(store.getState().view.pages[page]?.blocks[hero]?.variant).toBe("centered");
    expect(headingOf(store)).toBe("First");
    store.undo();
    expect(headingOf(store)).toBe(original);
    store.redo();
    expect(headingOf(store)).toBe("First");
    await settle();
    expect(serverHeading(siteDoc)).toBe("First");
    expect(siteDoc.draft().pages[page]?.blocks[hero]?.variant).toBe("centered");
  });

  test("a new command clears what redo could bring back", () => {
    const { store } = open(fakeSiteDoc());
    store.run([setHeading("First")]);
    store.undo();
    store.run([setHeading("Second")]);
    expect(store.getState().canRedo).toBe(false);
  });

  test("never removes another person's edit, and says what it left", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    const theirs = open(siteDoc, sam);
    mine.store.run([setHeading("Meera's heading")]);
    await settle();
    theirs.store.run([setHeading("Sam's heading")]);
    await settle();
    mine.store.undo();
    await settle();
    expect(serverHeading(siteDoc)).toBe("Sam's heading");
    expect(headingOf(mine.store)).toBe("Sam's heading");
    expect(headingOf(theirs.store)).toBe("Sam's heading");
    expect(mine.notices).toContainEqual(
      expect.objectContaining({ title: "Some of that couldn't be undone." }),
    );
  });

  test("never takes back someone else's change it received", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    open(siteDoc, sam);
    await settle();
    siteDoc.commit(sam, [setHeading("Sam's heading")]);
    await settle();
    expect(mine.store.getState().canUndo).toBe(false);
    mine.store.undo();
    await settle();
    expect(serverHeading(siteDoc)).toBe("Sam's heading");
  });
});

describe("other people's changes", () => {
  test("arrive as SiteDoc commits them", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    const theirs = open(siteDoc, sam);
    theirs.store.run([setHeading("Sail")]);
    await settle();
    expect(headingOf(mine.store)).toBe("Sail");
    expect(mine.store.getState().confirmed.revision).toBe(1);
  });

  test("don't replace a field while this person's own edit to it is unconfirmed", async () => {
    const siteDoc = fakeSiteDoc({ auto: false });
    const mine = open(siteDoc, meera);
    open(siteDoc, sam);
    siteDoc.deliver();
    mine.store.run([setHeading("Mine")]);
    siteDoc.commit(sam, [setHeading("Theirs")]);
    // Sam's commit reaches this editor before its own batch reaches SiteDoc.
    const committed = siteDoc.waiting();
    expect(committed).toHaveLength(1);
    siteDoc.step(1);
    expect(headingOf(mine.store)).toBe("Mine");
    siteDoc.deliver();
    expect(headingOf(mine.store)).toBe("Mine");
    expect(serverHeading(siteDoc)).toBe("Mine");
  });

  test("the person whose write is replaced is told who replaced it", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    const theirs = open(siteDoc, sam);
    mine.store.run([setHeading("Mine")]);
    await settle();
    theirs.store.run([setHeading("Theirs")]);
    await settle();
    expect(mine.notices).toEqual([
      {
        title: "Sam Okafor replaced your change.",
        description: expect.stringContaining("Heading"),
      },
    ]);
    expect(theirs.notices).toEqual([]);
  });

  test("a person isn't told about replacements of what they wrote before opening the editor", async () => {
    const siteDoc = fakeSiteDoc();
    siteDoc.commit(meera, [setHeading("Mine, from yesterday")]);
    const mine = open(siteDoc, meera);
    await settle();
    siteDoc.commit(sam, [setHeading("Theirs")]);
    await settle();
    expect(headingOf(mine.store)).toBe("Theirs");
    expect(mine.notices).toEqual([]);
  });

  test("someone still typing in a field that was replaced is told when they stop", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    const theirs = open(siteDoc, sam);
    mine.store.run([setHeading("Mine")], typingInHeading);
    await settle();
    theirs.store.run([setHeading("Theirs")]);
    await settle();
    expect(mine.notices).toEqual([]);
    mine.store.endBurst();
    expect(mine.notices).toEqual([
      expect.objectContaining({ title: "Sam Okafor replaced your change." }),
    ]);
  });

  test("two people typing in the page's title are each told once, when they stop", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    const theirs = open(siteDoc, sam);
    const setTitle = (value: string): Op => ({ op: "setMeta", page, field: "title", value });
    const typingInTitle = `meta:${page}:title`;
    for (const title of ["M", "Me", "Mee"]) {
      mine.store.run([setTitle(title)], typingInTitle);
      await vi.advanceTimersByTimeAsync(350);
      theirs.store.run([setTitle(title.replace("M", "S"))], typingInTitle);
      await vi.advanceTimersByTimeAsync(350);
    }
    await settle();
    expect(mine.notices).toEqual([]);
    expect(theirs.notices).toEqual([]);
    mine.store.endBurst();
    theirs.store.endBurst();
    // Sam's was the last write, so only Meera lost hers.
    expect(siteDoc.draft().pages[page]?.meta.title).toBe("See");
    expect(mine.notices).toEqual([
      expect.objectContaining({ title: "Sam Okafor replaced your change." }),
    ]);
    expect(theirs.notices).toEqual([]);
  });

  test("typing over someone's replacement tells them instead", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    const theirs = open(siteDoc, sam);
    mine.store.run([setHeading("Mine")], typingInHeading);
    await settle();
    theirs.store.run([setHeading("Theirs")]);
    await settle();
    mine.store.run([setHeading("Mine again")], typingInHeading);
    await settle();
    mine.store.endBurst();
    expect(mine.notices).toEqual([]);
    expect(theirs.notices).toEqual([
      expect.objectContaining({ title: "Meera Kapoor replaced your change." }),
    ]);
    expect(serverHeading(siteDoc)).toBe("Mine again");
  });

  test("an edit to a block someone removed is dropped, and its author is told", async () => {
    const siteDoc = fakeSiteDoc({ auto: false });
    const mine = open(siteDoc, meera);
    siteDoc.deliver();
    mine.store.run([setHeading("Sail")]);
    siteDoc.commit(sam, [{ op: "removeBlock", page, block: hero }]);
    siteDoc.deliver();
    expect(mine.store.getState().view.pages[page]?.blocks[hero]).toBeUndefined();
    expect(mine.notices).toEqual([
      {
        title: "Your change to Heading in Hero was dropped.",
        description: "Sam Okafor removed what it changed.",
      },
    ]);
    expect(mine.store.getState().status).toBe("saved");
  });

  test("removing the selected block clears the selection with a notice", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    await settle();
    mine.store.select({ kind: "block", target: page, block: hero });
    siteDoc.commit(sam, [{ op: "removeBlock", page, block: hero }]);
    await settle();
    expect(mine.store.getState().selection).toBeNull();
    expect(mine.notices).toEqual([{ title: "Sam Okafor removed the block you had selected." }]);
  });
});

describe("the connection", () => {
  test("edits made while it's down are sent once it's back, and apply once", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    await settle();
    siteDoc.drop(meera);
    store.run([setHeading("Sail")]);
    await settle();
    expect(serverHeading(siteDoc)).toBe("Sail");
    expect(siteDoc.log()).toHaveLength(1);
    expect(store.getState().status).toBe("saved");
  });

  test("a batch that arrived before the connection dropped is recognised, not applied again", async () => {
    const siteDoc = fakeSiteDoc({ auto: false });
    const { store } = open(siteDoc);
    siteDoc.deliver();
    const insert = insertOp(definitions, page, "root", null, BlockType.make("rich-text"));
    expect(store.run([insert])).toEqual([]);
    // SiteDoc commits it, but the confirmation is lost with the connection.
    siteDoc.step(0);
    siteDoc.drop(meera);
    siteDoc.deliver();
    expect(siteDoc.log()).toHaveLength(1);
    expect(store.getState().status).toBe("saved");
    expect(store.getState().view.pages[page]?.root[0]).toBe(insert.block.id);
  });

  test("an editor that joins late catches up on what it missed", async () => {
    const siteDoc = fakeSiteDoc();
    siteDoc.commit(sam, [setHeading("Sail")]);
    const { store } = open(siteDoc);
    await settle();
    expect(headingOf(store)).toBe("Sail");
    expect(store.getState().confirmed.revision).toBe(1);
  });

  test("while it's down the editor says so, and knows no one else is here", async () => {
    const siteDoc = fakeSiteDoc({ auto: false });
    const mine = open(siteDoc, meera);
    open(siteDoc, sam);
    siteDoc.deliver();
    expect(mine.store.getState().peers.map((peer) => peer.person)).toEqual([sam]);
    siteDoc.drop(meera);
    siteDoc.step(0);
    expect(mine.store.getState().status).toBe("offline");
    expect(mine.store.getState().peers).toEqual([]);
    siteDoc.deliver();
    expect(mine.store.getState().status).toBe("saved");
    expect(mine.store.getState().peers.map((peer) => peer.person)).toEqual([sam]);
  });
});

describe("presence", () => {
  test("others see which field a person is on, and when they're typing in it", async () => {
    const siteDoc = fakeSiteDoc();
    const mine = open(siteDoc, meera);
    const theirs = open(siteDoc, sam);
    await settle();
    mine.store.select({ kind: "field", target: page, block: hero, path: ["heading"] });
    await settle();
    const [peer] = theirs.store.getState().peers;
    expect(peer?.presence).toEqual({
      page,
      focus: { target: page, block: hero, path: ["heading"] },
      typing: false,
    });
    mine.store.run([setHeading("S")], "heading");
    await vi.advanceTimersByTimeAsync(100);
    expect(theirs.store.getState().peers[0]?.presence?.typing).toBe(true);
    await settle();
    expect(theirs.store.getState().peers[0]?.presence?.typing).toBe(false);
  });
});

describe("the draft's standing", () => {
  const release = LiveRelease.make({
    release: ReleaseId.make("rel_next"),
    snapshot: SnapshotId.make("snap_next"),
  });

  test("a release going live leaves the draft behind, until a merge moves it onto that release", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    await settle();
    siteDoc.announce({ _tag: "LiveChanged", live: release });
    await settle();
    expect(isBehind(store.getState().confirmed.base, store.getState().live)).toBe(true);
    const { base: _, ...values } = fixtureDraft;
    siteDoc.commitFromSite(sam, {
      id: BatchId.make("bat_merge"),
      ops: [
        {
          op: "rebase",
          base: release,
          lockfile: values.lockfile,
          theme: values.theme,
          settings: values.settings,
          forms: values.forms,
          menus: values.parts.menus,
        },
        setHeading("Merged from live"),
      ],
    });
    await settle();
    expect(store.getState().confirmed.base).toEqual(release);
    expect(isBehind(store.getState().confirmed.base, store.getState().live)).toBe(false);
    expect(headingOf(store)).toBe("Merged from live");
    expect(store.getState().canUndo).toBe(false);
  });

  test("a merge to other block versions asks for the draft to be opened again", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    await settle();
    siteDoc.commitFromSite(sam, {
      id: BatchId.make("bat_upgrade"),
      ops: [
        {
          op: "rebase",
          base: release,
          lockfile: { ...fixtureDraft.lockfile, hero: 2 },
          theme: fixtureDraft.theme,
          settings: fixtureDraft.settings,
          forms: fixtureDraft.forms,
          menus: fixtureDraft.parts.menus,
        },
      ],
    });
    await settle();
    expect(store.getState().outdated).toBe(true);
  });

  test("publishing or closing the draft is shown to everyone in it", async () => {
    const siteDoc = fakeSiteDoc();
    const { store } = open(siteDoc);
    await settle();
    siteDoc.announce({ _tag: "DraftClosed", by: sam, release: release.release });
    await settle();
    expect(store.getState().closed).toEqual({ by: sam, release: release.release });
  });
});
