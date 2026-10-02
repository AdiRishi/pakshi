import { BlockId, BlockType } from "@repo/contracts/ids";
import type { ServerMessage } from "@repo/contracts/live";
import type { Op } from "@repo/contracts/ops";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup } from "vitest-browser-react";
import { userEvent } from "vitest/browser";

import { insertOp, moveOp } from "../src/structure.ts";
import { home, openEditor } from "./support/mount.tsx";
import { definitions, fakeSiteDoc, fixtureDraft, meera, sam } from "./support/site-doc.ts";

/*
 * The rules for other people's changes, from the editor spec: each one
 * holds while the person is working in the field or view the change reaches.
 */

const hero = BlockId.make("b_herocentered");
const original = "Summer school at the harbour";

const setHeading = (value: string): Op => ({
  op: "setProp",
  target: home,
  block: hero,
  path: ["heading"],
  value,
});

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const setBody = (text: string): Op => ({
  op: "setProp",
  target: home,
  block: hero,
  path: ["body"],
  value: paragraph(text),
});

const field = (canvas: Document, name: string) => {
  const element = canvas.querySelector<HTMLElement>(
    `[data-pakshi-block='${hero}'] [data-pakshi-field='${name}']`,
  );
  if (element === null) throw new Error(`The hero has no ${name} field.`);
  return element;
};

/** The selection in an element, as offsets into its text. */
const selectionIn = (element: HTMLElement) => {
  const selection = element.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const offset = (node: Node, at: number) => {
    const before = element.ownerDocument.createRange();
    before.selectNodeContents(element);
    before.setEnd(node, at);
    return before.toString().length;
  };
  return {
    start: offset(range.startContainer, range.startOffset),
    end: offset(range.endContainer, range.endOffset),
  };
};

/** Puts the caret after `count` characters of an element's text. */
const caretAt = (element: HTMLElement, count: number) => {
  element.focus();
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = count;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      element.ownerDocument.getSelection()?.collapse(node, remaining);
      return;
    }
    remaining -= length;
  }
};

afterEach(async () => {
  await cleanup();
});

describe("other people's changes", () => {
  test("never replace a field while the person's own edit to it is unconfirmed", async () => {
    const siteDoc = fakeSiteDoc({ auto: false });
    const canvas = (await openEditor({ siteDoc })).canvas();
    siteDoc.deliver();
    const heading = field(canvas, "heading");
    caretAt(heading, original.length);
    await userEvent.keyboard("!");
    // Typing is sent after a short pause; until SiteDoc confirms it, it's pending.
    await new Promise((resolve) => setTimeout(resolve, 400));
    siteDoc.commit(sam, [setHeading("Sam's heading")]);
    siteDoc.receive();
    expect(heading.textContent).toBe(`${original}!`);
    siteDoc.deliver();
    await expect
      .poll(() => siteDoc.draft().pages[home]?.blocks[hero]?.props["heading"])
      .toBe(`${original}!`);
    expect(heading.textContent).toBe(`${original}!`);
  });

  test("keep the caret in a plain text field where it was in the text", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const heading = field(canvas, "heading");
    // After "Summer".
    caretAt(heading, 6);
    siteDoc.commit(sam, [setHeading(`Our ${original}`)]);
    await expect.poll(() => heading.textContent).toBe(`Our ${original}`);
    expect(canvas.activeElement).toBe(heading);
    expect(selectionIn(heading)).toEqual({ start: 10, end: 10 });
  });

  test("keep the caret in a settings panel field where it was in the text", async () => {
    const siteDoc = fakeSiteDoc();
    await openEditor({ siteDoc });
    const title = document.querySelector<HTMLInputElement>("aside[aria-label='Settings'] input");
    if (title === null) throw new Error("The settings panel shows no page title.");
    const original = title.value;
    title.focus();
    title.setSelectionRange(2, 2);
    siteDoc.commit(sam, [{ op: "setMeta", page: home, field: "title", value: `Our ${original}` }]);
    await expect.poll(() => title.value).toBe(`Our ${original}`);
    expect(document.activeElement).toBe(title);
    expect([title.selectionStart, title.selectionEnd]).toEqual([6, 6]);
  });

  test("reach a focused rich text field as a small edit, keeping the cursor in the text", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const body = field(canvas, "body");
    const text = body.textContent ?? "";
    // After "Five days".
    caretAt(body, 9);
    await expect.poll(() => canvas.activeElement).toBe(body);
    siteDoc.commit(sam, [setBody(`Today: ${text}`)]);
    await expect.poll(() => body.textContent).toBe(`Today: ${text}`);
    expect(canvas.activeElement).toBe(body);
    expect(selectionIn(body)).toEqual({ start: 16, end: 16 });
  });

  test("wait for an input method to finish composing, then apply around what it composed", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const heading = field(canvas, "heading");
    caretAt(heading, original.length);
    heading.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    // What an input method does as it composes: text appears at the caret, and input fires.
    canvas.getSelection()?.getRangeAt(0).insertNode(canvas.createTextNode(" 夏"));
    heading.normalize();
    heading.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: " 夏" }),
    );
    siteDoc.commit(sam, [setHeading(`Our ${original}`)]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(heading.textContent).toBe(`${original} 夏`);
    heading.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: " 夏" }));
    expect(heading.textContent).toBe(`Our ${original} 夏`);
    await expect
      .poll(() => siteDoc.draft().pages[home]?.blocks[hero]?.props["heading"], { timeout: 3000 })
      .toBe(`Our ${original} 夏`);
  });

  test("leave the person's selection and focus alone when blocks are added or moved elsewhere", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const heading = field(canvas, "heading");
    caretAt(heading, 3);
    const page = fixtureDraft.pages[home];
    const [first, second] = page?.root ?? [];
    if (page === undefined || first === undefined || second === undefined)
      throw new Error("The fixture page needs two sections.");
    const move = moveOp(page, definitions, second, "root", null);
    if (move === undefined) throw new Error("The second section can't move to the top.");
    const insert = insertOp(
      definitions,
      fixtureDraft.pages,
      home,
      "root",
      null,
      BlockType.make("rich-text"),
    );
    siteDoc.commit(sam, [insert, move]);
    await expect
      .poll(() => canvas.querySelector(`[data-pakshi-block='${insert.block.id}']`))
      .not.toBeNull();
    expect(canvas.activeElement).toBe(heading);
    expect(heading.hasAttribute("data-pakshi-selected")).toBe(true);
    expect(selectionIn(heading)).toEqual({ start: 3, end: 3 });
  });

  test("keep what the person is looking at in place when content is added above it", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const view = canvas.defaultView;
    const page = fixtureDraft.pages[home];
    const target = page?.root.at(-3);
    if (view === null || target === undefined) throw new Error("The canvas has no window.");
    const block = canvas.querySelector(`[data-pakshi-block='${target}']`);
    block?.scrollIntoView({ block: "start" });
    const before = block?.getBoundingClientRect().top;
    siteDoc.commit(sam, [
      insertOp(definitions, fixtureDraft.pages, home, "root", null, BlockType.make("gallery")),
    ]);
    await expect
      .poll(() => canvas.querySelectorAll("[data-pakshi-block]").length)
      .toBeGreaterThan(Object.keys(page?.blocks ?? {}).length + 2);
    expect(Math.abs((block?.getBoundingClientRect().top ?? 0) - (before ?? 0))).toBeLessThan(1);
  });

  test("leave the view where the person scrolled it after a reconnect that missed nothing", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const view = canvas.defaultView;
    if (view === null) throw new Error("The canvas has no window.");
    view.scrollTo(0, 200);
    siteDoc.drop(meera);
    await new Promise((resolve) => setTimeout(resolve, 200));
    view.scrollTo(0, 600);
    const title = document.querySelector<HTMLInputElement>("aside[aria-label='Settings'] input");
    title?.focus();
    await userEvent.keyboard("!");
    await expect.poll(() => siteDoc.draft().pages[home]?.meta.title).toBe("Harbour Summer School!");
    expect(view.scrollY).toBe(600);
  });

  test("wait for an input method in a settings field, then apply around what it composed", async () => {
    const siteDoc = fakeSiteDoc();
    await openEditor({ siteDoc });
    const title = document.querySelector<HTMLInputElement>("aside[aria-label='Settings'] input");
    if (title === null) throw new Error("The settings panel shows no page title.");
    title.focus();
    title.setSelectionRange(title.value.length, title.value.length);
    title.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    // What an input method does as it composes: the text changes, and input fires.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      title,
      "Harbour Summer School 夏",
    );
    title.dispatchEvent(new InputEvent("input", { bubbles: true, data: " 夏", isComposing: true }));
    siteDoc.commit(sam, [
      { op: "setMeta", page: home, field: "title", value: "Our Harbour Summer School" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(title.value).toBe("Harbour Summer School 夏");
    expect(siteDoc.log().map((batch) => batch.actor.id)).toEqual([sam.id]);
    title.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: " 夏" }));
    expect(title.value).toBe("Our Harbour Summer School 夏");
    await expect
      .poll(() => siteDoc.draft().pages[home]?.meta.title, { timeout: 3000 })
      .toBe("Our Harbour Summer School 夏");
  });

  test("never enter the person's undo, in the editor or in a rich text field", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    siteDoc.commit(sam, [setHeading("Sam's heading")]);
    await expect.poll(() => field(canvas, "heading").textContent).toBe("Sam's heading");
    canvas.querySelector<HTMLElement>(`[data-pakshi-block='${hero}']`)?.focus();
    await userEvent.keyboard("{ControlOrMeta>}z{/ControlOrMeta}");
    expect(field(canvas, "heading").textContent).toBe("Sam's heading");

    const body = field(canvas, "body");
    caretAt(body, 4);
    await expect.poll(() => canvas.activeElement).toBe(body);
    siteDoc.commit(sam, [setBody("Sam's words")]);
    await expect.poll(() => body.textContent).toBe("Sam's words");
    await userEvent.keyboard("{ControlOrMeta>}z{/ControlOrMeta}");
    expect(body.textContent).toBe("Sam's words");
    expect(siteDoc.log()).toHaveLength(2);
  });
});

describe("other people's presence", () => {
  test("shows where each person is on the page, and when they're typing", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const link = siteDoc.connection(sam).open({
      onOpen: () => link.send({ _tag: "Sync", revision: 0 }),
      onMessage: () => undefined,
      onClose: () => undefined,
    });
    await expect.poll(() => siteDoc.log()).toEqual([]);
    link.send({
      _tag: "Presence",
      presence: {
        page: home,
        focus: { target: home, block: hero, path: ["heading"] },
        typing: true,
      },
    });
    const mark = () => canvas.querySelector(".pakshi-presence");
    await expect.poll(() => mark()?.textContent).toBe("Sam is typing");
    const heading = field(canvas, "heading").getBoundingClientRect();
    const outline = mark()?.getBoundingClientRect();
    expect(outline?.top).toBeLessThan(heading.top);
    expect(outline?.bottom).toBeGreaterThan(heading.bottom);
    link.close();
    await expect.poll(mark).toBeNull();
  });

  test("tells others which field someone is typing in from the settings panel", async () => {
    const siteDoc = fakeSiteDoc();
    const canvas = (await openEditor({ siteDoc })).canvas();
    const seen: Array<ServerMessage> = [];
    const link = siteDoc.connection(sam).open({
      onOpen: () => link.send({ _tag: "Sync", revision: 0 }),
      onMessage: (message) => seen.push(message),
      onClose: () => undefined,
    });
    canvas.querySelector<HTMLElement>(`[data-pakshi-block='${hero}']`)?.click();
    const control = await expect
      .poll(() => document.getElementById(`pakshi-control-${home}-${hero}-heading`))
      .toBeTruthy()
      .then(() => document.getElementById(`pakshi-control-${home}-${hero}-heading`));
    control?.focus();
    await userEvent.keyboard("!");
    const meeraNow = () =>
      seen
        .flatMap((message) =>
          message._tag === "PeerChanged" && message.peer.person.id === meera.id
            ? [message.peer.presence]
            : [],
        )
        .at(-1);
    await expect.poll(meeraNow).toEqual({
      page: home,
      focus: { target: home, block: hero, path: ["heading"] },
      typing: true,
    });
    link.close();
  });
});
