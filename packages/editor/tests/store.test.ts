import { BlockId, PageId } from "@repo/contracts/ids";
import type { Op } from "@repo/contracts/ops";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EditorStore, type Notice } from "../src/store.ts";
import { definitions, fakeSiteDoc, fixtureDraft } from "./support/site-doc.ts";

const page = PageId.make("pg_home");
const hero = BlockId.make("b_herocentered");

const setHeading = (value: string): Op => ({
  op: "setProp",
  target: page,
  block: hero,
  path: ["heading"],
  value,
});

const headingOf = (store: EditorStore) =>
  store.getState().view.pages[page]?.blocks[hero]?.props["heading"];

const confirmedHeading = (store: EditorStore) =>
  store.getState().confirmed.pages[page]?.blocks[hero]?.props["heading"];

const open = (siteDoc = fakeSiteDoc()) => {
  const notices: Array<Notice> = [];
  const store = new EditorStore({
    draft: fixtureDraft,
    page,
    contracts: definitions,
    connection: siteDoc.connection,
    onNotice: (notice) => notices.push(notice),
  });
  return { store, siteDoc, notices };
};

/** Lets pending sends and their answers run. */
const settle = () => vi.advanceTimersByTimeAsync(20_000);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a command", () => {
  test("shows at once and reaches SiteDoc, which then confirms it", async () => {
    const { store, siteDoc } = open();
    expect(store.run([setHeading("Build and sail")])).toEqual([]);
    expect(headingOf(store)).toBe("Build and sail");
    await settle();
    expect(siteDoc.draft().pages[page]?.blocks[hero]?.props["heading"]).toBe("Build and sail");
    expect(confirmedHeading(store)).toBe("Build and sail");
    expect(store.getState().status).toBe("saved");
  });

  test("that breaks a rule is refused locally and never sent", async () => {
    const { store, siteDoc } = open();
    expect(store.run([setHeading("x".repeat(81))])).toEqual([
      expect.objectContaining({ rule: "value", path: ["heading"] }),
    ]);
    await settle();
    expect(siteDoc.received).toEqual([]);
    expect(store.getState().canUndo).toBe(false);
  });
});

describe("typing", () => {
  test("a burst in one field is one undo step and one batch", async () => {
    const { store, siteDoc } = open();
    for (const heading of ["S", "Sa", "Sai", "Sail"]) store.run([setHeading(heading)], "heading");
    await settle();
    expect(siteDoc.received).toHaveLength(1);
    expect(siteDoc.received[0]?.ops).toEqual([setHeading("Sail")]);
    store.undo();
    expect(headingOf(store)).toBe("Summer school at the harbour");
  });

  test("keystrokes reach SiteDoc within half a second while the burst goes on", async () => {
    const { store, siteDoc } = open();
    store.run([setHeading("S")], "heading");
    await vi.advanceTimersByTimeAsync(400);
    expect(siteDoc.received).toHaveLength(1);
    store.run([setHeading("Sa")], "heading");
    await settle();
    expect(siteDoc.received.map((batch) => batch.ops)).toEqual([
      [setHeading("S")],
      [setHeading("Sa")],
    ]);
    store.undo();
    expect(headingOf(store)).toBe("Summer school at the harbour");
  });

  test("a clearable required heading can be emptied and typed again", async () => {
    const { store, siteDoc } = open();
    expect(store.run([setHeading("")], "heading")).toEqual([]);
    expect(store.run([setHeading("B")], "heading")).toEqual([]);
    await settle();
    expect(siteDoc.draft().pages[page]?.blocks[hero]?.props["heading"]).toBe("B");
  });

  test("cancelling a burst puts the field back as it was", async () => {
    const { store, siteDoc } = open();
    store.run([setHeading("Sail")], "heading");
    store.cancelBurst();
    await settle();
    expect(headingOf(store)).toBe("Summer school at the harbour");
    expect(siteDoc.draft().pages[page]?.blocks[hero]?.props["heading"]).toBe(
      "Summer school at the harbour",
    );
    expect(store.getState().canUndo).toBe(false);
  });
});

describe("undo", () => {
  test("reverses one command at a time, and redo brings them back", async () => {
    const { store, siteDoc } = open();
    store.run([setHeading("First")]);
    store.run([{ op: "setVariant", target: page, block: hero, variant: "split-image" }]);
    store.undo();
    expect(store.getState().view.pages[page]?.blocks[hero]?.variant).toBe("centered");
    expect(headingOf(store)).toBe("First");
    store.undo();
    expect(headingOf(store)).toBe("Summer school at the harbour");
    store.redo();
    expect(headingOf(store)).toBe("First");
    await settle();
    expect(siteDoc.draft().pages[page]?.blocks[hero]?.props["heading"]).toBe("First");
    expect(siteDoc.draft().pages[page]?.blocks[hero]?.variant).toBe("centered");
  });

  test("a new command clears what redo could bring back", () => {
    const { store } = open();
    store.run([setHeading("First")]);
    store.undo();
    store.run([setHeading("Second")]);
    expect(store.getState().canRedo).toBe(false);
  });
});

describe("the connection", () => {
  test("sends one batch at a time, in order", async () => {
    const { store, siteDoc } = open();
    siteDoc.hold();
    store.run([setHeading("One")]);
    store.run([setHeading("Two")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(siteDoc.received).toHaveLength(1);
    siteDoc.release();
    await vi.advanceTimersByTimeAsync(0);
    siteDoc.release();
    await settle();
    expect(siteDoc.received.map((batch) => batch.ops)).toEqual([
      [setHeading("One")],
      [setHeading("Two")],
    ]);
    expect(siteDoc.draft().pages[page]?.blocks[hero]?.props["heading"]).toBe("Two");
  });

  test("resends a batch that didn't arrive with the same ID, and it applies once", async () => {
    const { store, siteDoc } = open();
    siteDoc.failNext(2);
    store.run([setHeading("Sail")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().status).toBe("retrying");
    await settle();
    expect(new Set(siteDoc.received.map((batch) => batch.id)).size).toBe(1);
    expect(siteDoc.received).toHaveLength(3);
    expect(siteDoc.draft().revision).toBe(1);
    expect(store.getState().status).toBe("saved");
  });

  test("a batch SiteDoc refuses is taken back out of the page, and the person is told", async () => {
    const siteDoc = fakeSiteDoc();
    const { store, notices } = open(siteDoc);
    // SiteDoc's copy lost the hero, as it would after someone else removed it.
    const { [hero]: _, ...blocks } = fixtureDraft.pages[page]?.blocks ?? {};
    const home = fixtureDraft.pages[page];
    if (home === undefined) throw new Error("The fixture draft has no home page.");
    siteDoc.replace({
      ...fixtureDraft,
      pages: { [page]: { ...home, root: home.root.filter((id) => id !== hero), blocks } },
    });
    store.run([setHeading("Sail")]);
    await settle();
    expect(headingOf(store)).toBe("Summer school at the harbour");
    expect(notices).toEqual([
      expect.objectContaining({ errors: [expect.objectContaining({ rule: "unknown-block" })] }),
    ]);
  });
});
