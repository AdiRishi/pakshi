import type { BlockDefinition, RichTextDocument } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import { BlockId, BlockType, MediaId, PageId } from "@repo/contracts/ids";
import { Schema } from "effect";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";

import { home, openEditor as open, pattern } from "./support/mount.tsx";
import { definitions, fakeSiteDoc, fixtureDraft, sam } from "./support/site-doc.ts";

const heroField = (canvas: Document, field: string) =>
  canvas.querySelector<HTMLElement>(
    `[data-pakshi-block='b_herocentered'] [data-pakshi-field='${field}']`,
  );

const savedButton = (siteDoc: ReturnType<typeof fakeSiteDoc>) => () =>
  siteDoc.draft().pages[home]?.blocks[BlockId.make("b_herocentered")]?.props["cta"];

const heroHeading = (siteDoc: ReturnType<typeof fakeSiteDoc>) =>
  siteDoc.draft().pages[home]?.blocks[BlockId.make("b_herocentered")]?.props["heading"];

afterEach(async () => {
  await cleanup();
});

describe("editing text in place", () => {
  test("a heading over its maximum length is refused while typing", async () => {
    const { siteDoc, canvas } = await open();
    heroField(canvas(), "heading")?.focus();
    await userEvent.keyboard("{End}");
    await userEvent.keyboard("x".repeat(70));
    const shown =
      canvas().querySelector("[data-pakshi-block='b_herocentered'] h1")?.textContent ?? "";
    expect(shown).toHaveLength(80);
    await expect.poll(() => heroHeading(siteDoc)).toBe(shown);
  });

  test("a required heading can be cleared and typed again", async () => {
    const { siteDoc, canvas } = await open();
    heroField(canvas(), "heading")?.focus();
    await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}{Backspace}");
    await expect.poll(() => heroHeading(siteDoc)).toBe("");
    await userEvent.keyboard("Build");
    await expect.poll(() => heroHeading(siteDoc)).toBe("Build");
  });
});

/** The text of a rich text value's first paragraph. */
const firstParagraph = (document: RichTextDocument) => {
  const [first] = document.content;
  return first?.type === "paragraph"
    ? (first.content ?? []).map((inline) => (inline.type === "text" ? inline.text : "")).join("")
    : "";
};

describe("undo", () => {
  test("reverses one action at a time: typing on the page, then typing in the settings panel", async () => {
    const { siteDoc, canvas } = await open();
    const heading = heroField(canvas(), "heading");
    if (heading === null) throw new Error("The hero has no heading.");
    const label = page.getByRole("textbox", { name: "Label", exact: true });
    const savedLabel = () =>
      siteDoc.draft().pages[home]?.blocks[BlockId.make("b_herocentered")]?.props["cta"];
    heading.focus();
    canvas().getSelection()?.selectAllChildren(heading);
    canvas().getSelection()?.collapseToEnd();
    await userEvent.keyboard(" this July");
    await userEvent.click(label);
    await userEvent.keyboard("{End} now");
    await expect.poll(() => heroHeading(siteDoc)).toBe("Summer school at the harbour this July");
    await expect.poll(savedLabel).toMatchObject({ label: "See the programme now" });

    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    await expect.element(label).toHaveValue("See the programme");
    expect(heading.textContent).toBe("Summer school at the harbour this July");
    await userEvent.click(page.getByRole("button", { name: "Undo" }));
    await expect.poll(() => heading.textContent).toBe("Summer school at the harbour");
    await expect.poll(() => heroHeading(siteDoc)).toBe("Summer school at the harbour");
    await expect.poll(savedLabel).toMatchObject({ label: "See the programme" });
  });

  test("in formatted text on the page leaves the text showing what the draft holds", async () => {
    const { siteDoc, canvas } = await open();
    const block = BlockId.make("b_richtextnarrow");
    const paragraph = canvas().querySelector<HTMLElement>(
      `[data-pakshi-block='${block}'] [data-pakshi-field='body'] p`,
    );
    const editable = paragraph?.closest<HTMLElement>("[contenteditable='true']");
    const field = definitions.get(BlockType.make("rich-text"))?.fields["body"];
    if (paragraph == null || editable == null || field?.kind !== "richText")
      throw new Error("The rich text has no paragraph.");
    const saved = () =>
      firstParagraph(
        Schema.decodeSync(field.draft)(siteDoc.draft().pages[home]?.blocks[block]?.props["body"]),
      );
    editable.focus();
    const selection = canvas().getSelection();
    selection?.selectAllChildren(paragraph);
    selection?.collapseToEnd();
    await userEvent.keyboard(" Alpha");
    await expect.poll(saved).toBe(paragraph.textContent);
    // TipTap starts a new undo step after half a second without typing.
    await new Promise((resolve) => setTimeout(resolve, 800));
    await userEvent.keyboard(" beta");
    await expect.poll(saved).toBe(paragraph.textContent);
    const mod = navigator.platform.startsWith("Mac") ? "Meta" : "Control";
    await userEvent.keyboard(`{${mod}>}z{/${mod}}`);
    await expect.poll(() => paragraph.textContent.includes(" beta")).toBe(false);
    await expect.poll(saved).toBe(paragraph.textContent);
  });
});

describe("the keyboard alone", () => {
  test("reaches every field on the page with Tab", async () => {
    const { canvas } = await open();
    const fields = Array.from(canvas().querySelectorAll<HTMLElement>("[data-pakshi-field]"));
    const reached = new Set<EventTarget | null>();
    canvas().addEventListener("focusin", (event) => reached.add(event.target));
    await userEvent.click(page.getByTitle(/^Canvas:/));
    const missing = () => fields.filter((field) => !reached.has(field));
    // Presses go in batches, because a keyboard call per press is slower than the test may take.
    for (let pressed = 0; pressed < fields.length * 3 && missing().length > 0; pressed += 20)
      await userEvent.keyboard("{Tab}".repeat(20));
    expect(missing().map((field) => field.dataset["pakshiField"])).toEqual([]);
  });

  test("edits a field from a selected block: arrows, Enter, typing and Escape", async () => {
    const { siteDoc, canvas } = await open();
    const grid = canvas().querySelector<HTMLElement>(
      "[data-pakshi-block='b_featuregridthreecolumns']",
    );
    grid?.focus();
    // The page opens with feature grids, and the first grid's three items come before the next section.
    await userEvent.keyboard("{Escape}");
    const order = Array.from(canvas().querySelectorAll("[data-pakshi-block]"), (block) =>
      block.getAttribute("data-pakshi-block"),
    );
    grid?.focus();
    const steps = order.indexOf("b_herocentered") - order.indexOf("b_featuregridthreecolumns");
    grid?.click();
    await userEvent.keyboard("{ArrowDown}".repeat(steps));
    expect(canvas().activeElement?.getAttribute("data-pakshi-block")).toBe("b_herocentered");
    await userEvent.keyboard("{Enter}");
    expect(canvas().activeElement?.getAttribute("data-pakshi-field")).toBe("heading");
    await userEvent.keyboard("{End} today{Escape}");
    expect(canvas().activeElement?.getAttribute("data-pakshi-block")).toBe("b_herocentered");
    expect(heroField(canvas(), "heading")?.textContent).toBe("Summer school at the harbour");
    // Typing reaches SiteDoc within half a second, so by then any that Escape left would be saved.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(heroHeading(siteDoc)).toBe("Summer school at the harbour");
  });

  test("opens an image's popover with Enter", async () => {
    const { canvas } = await open();
    canvas().querySelector<HTMLElement>("img[data-pakshi-field]")?.focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("dialog")).toBeVisible();
  });

  test("types a button's words on the page, where Escape puts back what it had", async () => {
    const { siteDoc, canvas } = await open();
    const button = heroField(canvas(), "cta");
    if (button === null) throw new Error("The hero has no button.");
    button.focus();
    canvas().getSelection()?.selectAllChildren(button);
    canvas().getSelection()?.collapseToEnd();
    await userEvent.keyboard(" now");
    await expect.poll(savedButton(siteDoc)).toMatchObject({ label: "See the programme now" });
    await userEvent.keyboard("{Enter} today{Escape}");
    await expect.poll(() => button?.textContent).toBe("See the programme now");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(savedButton(siteDoc)()).toMatchObject({ label: "See the programme now" });
  });
});

describe("choosing an image", () => {
  test("stores empty alt text for a library image with none suggested, marking it decorative", async () => {
    const { siteDoc, canvas } = await open();
    const split = BlockId.make("b_splitimageleft");
    canvas()
      .querySelector<HTMLElement>(`[data-pakshi-block='${split}'] [data-pakshi-field='image']`)
      ?.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(page.getByRole("button", { name: pattern.id }));
    await expect
      .poll(() => siteDoc.draft().pages[home]?.blocks[split]?.props["image"])
      .toEqual({ $ref: "media", id: pattern.id, alt: "" });
  });
});

describe("uploading an image", () => {
  test("adds it to the library and puts it in the block, waiting for alt text", async () => {
    const uploaded: Array<string> = [];
    const { siteDoc, canvas } = await open({
      uploadImage: async (file) => {
        uploaded.push(file.name);
        return {
          id: MediaId.make("med_upload"),
          contentType: "image/png",
          width: 1200,
          height: 800,
          alt: "",
        };
      },
    });
    const split = BlockId.make("b_splitimageleft");
    canvas()
      .querySelector<HTMLElement>(`[data-pakshi-block='${split}'] [data-pakshi-field='image']`)
      ?.focus();
    await userEvent.keyboard("{Enter}");
    const chooser = document.querySelector<HTMLInputElement>("input[type='file']");
    if (chooser === null) throw new Error("The popover has no file chooser.");
    await userEvent.upload(chooser, new File(["png"], "reading-room.png", { type: "image/png" }));
    await expect
      .poll(() => siteDoc.draft().pages[home]?.blocks[split]?.props["image"])
      .toEqual({ $ref: "media", id: "med_upload" });
    expect(uploaded).toEqual(["reading-room.png"]);
    await expect
      .element(page.getByRole("button", { name: "med_upload", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
  });
});

describe("where a button goes", () => {
  test("is chosen under the button while it's selected: a page, or a web address typed without https://", async () => {
    const { siteDoc, canvas } = await open();
    heroField(canvas(), "cta")?.focus();
    const panel = page.getByRole("region", { name: "Where the button goes" });
    await userEvent.click(panel.getByRole("button", { name: "News" }));
    await expect
      .poll(savedButton(siteDoc))
      .toEqual({ label: "See the programme", link: { $ref: "page", id: "pg_news" } });
    await userEvent.fill(
      panel.getByRole("textbox", { name: "Or a web address" }),
      "example.org/apply",
    );
    await userEvent.keyboard("{Tab}");
    await expect
      .poll(savedButton(siteDoc))
      .toEqual({ label: "See the programme", link: "https://example.org/apply" });
  });
});

describe("a link with no element of its own", () => {
  test("shows its mark only on the selected block, so the page looks as it will on the site", async () => {
    const { canvas } = await open();
    const marks = () => document.querySelectorAll("button[title='Where it goes']").length;
    const logos = canvas().querySelector<HTMLElement>("[data-pakshi-block='b_logostripgrid']");
    if (logos === null) throw new Error("The page has no logo strip.");
    expect(logos.querySelector("a[href] img")).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(marks()).toBe(0);
    logos.click();
    await expect.poll(marks).toBeGreaterThan(0);
  });
});

describe("a form's settings", () => {
  test("start a new form for a block, then rename it and change its questions", async () => {
    const { siteDoc, canvas } = await open();
    canvas()
      .querySelector<HTMLElement>(
        "[data-pakshi-block='b_formsectioncard'] [data-pakshi-field='heading']",
      )
      ?.focus();
    await userEvent.selectOptions(page.getByLabelText("Form", { exact: true }), "Start a new form");
    const shownForm = () => {
      const chosen =
        siteDoc.draft().pages[home]?.blocks[BlockId.make("b_formsectioncard")]?.props["form"];
      return Object.values(siteDoc.draft().forms).find(
        (form) => JSON.stringify({ $ref: "form", id: form.id }) === JSON.stringify(chosen),
      );
    };
    await expect.poll(() => shownForm()?.name).toBe("New form");

    await userEvent.fill(page.getByRole("textbox", { name: "Form name" }), "Room booking");
    await userEvent.keyboard("{Tab}");
    await userEvent.fill(page.getByRole("textbox", { name: "Question" }).first(), "Full name");
    await userEvent.keyboard("{Tab}");
    await userEvent.click(page.getByRole("button", { name: "Add a field" }));
    await expect
      .poll(() => shownForm())
      .toMatchObject({
        name: "Room booking",
        fields: [
          { kind: "shortText", label: "Full name" },
          { kind: "email", label: "Email" },
          { kind: "checkbox", label: "I agree to the privacy policy" },
          { kind: "shortText", label: "New question" },
        ],
      });
  });
});

describe("a post's settings", () => {
  test("edit its date, tags and cover image", async () => {
    const post = PageId.make("pg_launch");
    const draft: Draft = {
      ...fixtureDraft,
      pages: {
        ...fixtureDraft.pages,
        [post]: {
          schema: "pakshi.page/1",
          id: post,
          type: "post",
          path: "/blog/launch",
          meta: {
            title: "We're open",
            description: "",
            date: "2027-03-02",
            author: "Meera Kapoor",
            tags: [],
            excerpt: "",
          },
          root: [],
          blocks: {},
        },
      },
    };
    const { siteDoc } = await open({ draft, page: post });
    const meta = () => {
      const page = siteDoc.draft().pages[post];
      return page?.type === "post" ? page.meta : undefined;
    };

    await userEvent.fill(page.getByLabelText("Date"), "2027-04-01");
    await expect.poll(() => meta()?.date).toBe("2027-04-01");

    await userEvent.fill(page.getByLabelText("Tags"), "news, july,  news");
    await userEvent.keyboard("{Tab}");
    await expect.poll(() => meta()?.tags).toEqual(["news", "july"]);

    await userEvent.click(
      page.getByRole("list", { name: "Library for the cover image" }).getByRole("button").first(),
    );
    await expect.poll(() => meta()?.cover?.id).toBe("med_harbour");
    await userEvent.fill(page.getByLabelText("Alt text"), "The harbour at dawn");
    await expect.poll(() => meta()?.cover?.alt).toBe("The harbour at dawn");

    await userEvent.click(page.getByRole("button", { name: "Remove" }));
    await expect.poll(() => meta()?.cover).toBeUndefined();
  });
});

/** A draft whose home page holds 150 blocks: 30 feature grids of a section and four items. */
const largeDraft = (): Draft => {
  const base = fixtureDraft.pages[home];
  if (base === undefined) throw new Error("The fixture draft has no home page.");
  const blocks: Record<BlockId, Draft["pages"][PageId]["blocks"][BlockId]> = {};
  const root: Array<BlockId> = [];
  for (let section = 0; section < 30; section += 1) {
    const id = BlockId.make(`b_grid${section}`);
    const items = [0, 1, 2, 3].map((item) => BlockId.make(`b_grid${section}item${item}`));
    root.push(id);
    blocks[id] = {
      type: "feature-grid",
      variant: "three-columns",
      surface: "default",
      props: { heading: `Section ${section}` },
      slots: { items },
    };
    for (const item of items)
      blocks[item] = {
        type: "feature-item",
        variant: "default",
        props: { title: "Workshops", body: "Every day." },
      };
  }
  return { ...fixtureDraft, pages: { [home]: { ...base, root, blocks } } };
};

/** The block definitions, each recording the IDs of the blocks it renders. */
const countingRenders = () => {
  const rendered: Array<BlockId> = [];
  const counting = new Map(
    Array.from(definitions, ([type, definition]) => [
      type,
      {
        ...definition,
        render: (input: Parameters<BlockDefinition["render"]>[0]) => {
          rendered.push(input.id);
          return definition.render(input);
        },
      },
    ]),
  );
  return { rendered, counting };
};

describe("performance budgets, on a page with 150 blocks", () => {
  test("the canvas shows the page within a second of the draft arriving", async () => {
    const started = performance.now();
    const { canvas } = await open({ draft: largeDraft() });
    await expect.poll(() => canvas().querySelectorAll("[data-pakshi-block]").length).toBe(152);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a keystroke renders only its own block and paints in the next frame", async () => {
    const { rendered, counting } = countingRenders();
    const { canvas } = await open({ draft: largeDraft(), definitions: counting });
    const heading = canvas().querySelector<HTMLElement>(
      "[data-pakshi-block='b_grid10'] [data-pakshi-field='heading']",
    );
    heading?.focus();
    // Choosing the block opens its settings, whose layout previews render as they load.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    rendered.length = 0;
    const typed = performance.now();
    await userEvent.keyboard("x");
    const painted = await new Promise<number>((resolve) =>
      requestAnimationFrame(() => resolve(performance.now())),
    );
    expect(new Set(rendered)).toEqual(new Set(["b_grid10"]));
    expect(painted - typed).toBeLessThan(100);
  });

  test("someone else's batch renders only the blocks it touches", async () => {
    const { rendered, counting } = countingRenders();
    const { siteDoc, canvas } = await open({ draft: largeDraft(), definitions: counting });
    await new Promise((resolve) => setTimeout(resolve, 500));
    rendered.length = 0;
    siteDoc.commit(sam, [
      {
        op: "setProp",
        target: home,
        block: BlockId.make("b_grid20item2"),
        path: ["title"],
        value: "Mentors",
      },
    ]);
    await expect
      .poll(
        () =>
          canvas().querySelector("[data-pakshi-block='b_grid20item2'] [data-pakshi-field='title']")
            ?.textContent,
      )
      .toBe("Mentors");
    expect(new Set(rendered)).toEqual(new Set(["b_grid20item2"]));
  });
});

/** The fixture draft with nothing on its home page, as a new page starts. */
const emptyDraft = (): Draft => {
  const base = fixtureDraft.pages[home];
  if (base === undefined) throw new Error("The fixture draft has no home page.");
  return { ...fixtureDraft, pages: { [home]: { ...base, root: [], blocks: {} } } };
};

/** The fixture draft with only its hero on the home page, under the header. */
const heroOnly = (): Draft => {
  const base = fixtureDraft.pages[home];
  const hero = BlockId.make("b_herocentered");
  const block = base?.blocks[hero];
  if (base === undefined || block === undefined) throw new Error("The fixture draft has no hero.");
  return {
    ...fixtureDraft,
    pages: { [home]: { ...base, root: [hero], blocks: { [hero]: block } } },
  };
};

/** What the editor last told a screen reader. */
const announced = () => document.querySelector(".sr-only[aria-live]")?.textContent ?? "";

/** Presses a key until focus lands on an element that matches, as a keyboard user would. */
const pressUntil = async (key: string, reached: (element: Element) => boolean) => {
  for (let step = 0; step < 20; step += 1) {
    const active = document.activeElement;
    if (active !== null && reached(active)) return;
    await userEvent.keyboard(key);
  }
  throw new Error(`Pressing ${key} never reached the element.`);
};

const center = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/**
 * Presses the pointer on an element, moves it through points in small steps,
 * and releases it at the last one, as a person dragging would.
 */
const pointerPath = async (
  element: Element,
  points: ReadonlyArray<{ readonly x: number; readonly y: number }>,
) => {
  // Events are made in the element's own window, which for the canvas is its frame.
  const Pointer = element.ownerDocument.defaultView?.PointerEvent ?? PointerEvent;
  const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, bubbles: true };
  let at = center(element);
  element.dispatchEvent(
    new Pointer("pointerdown", {
      ...pointer,
      button: 0,
      buttons: 1,
      clientX: at.x,
      clientY: at.y,
    }),
  );
  for (const point of points) {
    for (let step = 1; step <= 10; step += 1) {
      const x = at.x + ((point.x - at.x) * step) / 10;
      const y = at.y + ((point.y - at.y) * step) / 10;
      element.ownerDocument.dispatchEvent(
        new Pointer("pointermove", { ...pointer, buttons: 1, clientX: x, clientY: y }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    at = point;
  }
  element.ownerDocument.dispatchEvent(
    new Pointer("pointerup", { ...pointer, button: 0, buttons: 0, clientX: at.x, clientY: at.y }),
  );
};

const outlineRow = (block: string) =>
  document.querySelector<HTMLElement>(`[data-pakshi-outline-block="${block}"]`);

describe("editing structure", () => {
  test("builds a page from an empty draft with the keyboard alone, announcing each change", async () => {
    const { siteDoc } = await open({ draft: emptyDraft() });
    const draftPage = () => siteDoc.draft().pages[home];
    const types = () => (draftPage()?.root ?? []).map((id) => draftPage()?.blocks[id]?.type);
    const items = () => {
      const grid = draftPage()?.root.find((id) => draftPage()?.blocks[id]?.type === "feature-grid");
      return grid === undefined ? [] : (draftPage()?.blocks[grid]?.slots?.["items"] ?? []);
    };

    await pressUntil("{Tab}", (element) => element.textContent === "Add a section");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByPlaceholder("Search blocks")).toHaveFocus();
    await userEvent.keyboard("Hero{Enter}");
    await expect.poll(types).toEqual(["hero"]);
    await expect.poll(announced).toBe("Added Hero, 1 of 1 on the page.");

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await pressUntil("{ArrowDown}", (element) => element.textContent === "Add after");
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByPlaceholder("Search blocks")).toHaveFocus();
    await userEvent.keyboard("Features{Enter}");
    await expect.poll(types).toEqual(["hero", "feature-grid"]);
    await expect.poll(announced).toBe("Added Features, 2 of 2 on the page.");

    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await expect.poll(types).toEqual(["feature-grid", "hero"]);
    await expect.poll(announced).toBe("Moved Why people come back up, 1 of 2 on the page.");

    await userEvent.keyboard("{ArrowRight}");
    const [first] = items();
    await expect.poll(() => document.activeElement === outlineRow(first ?? "")).toBe(true);
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await expect.poll(() => items().indexOf(first ?? BlockId.make("b_none"))).toBe(1);
    await expect
      .poll(announced)
      .toBe("Moved Made for beginners down, 2 of 3 in Why people come back.");

    await userEvent.keyboard("{Control>}d{/Control}");
    await expect.poll(() => items().length).toBe(4);
    await expect.poll(announced).toMatch(/^Duplicated Made for beginners\. The copy is 3 of 4/);

    await userEvent.keyboard("{Delete}");
    await expect.poll(() => items().length).toBe(3);
    await expect.poll(announced).toBe("Removed Made for beginners.");
  });

  test("a drag in the outline or the canvas and the matching move command produce the same ops", async () => {
    const movedDown = [
      {
        op: "moveBlock",
        page: home,
        block: "b_calltoactionbanner",
        list: "root",
        after: "b_calltoactioncentered",
      },
    ];
    /** The ops of the one batch an action in a freshly opened editor sends. */
    const opsOf = async (act: (canvas: Document) => Promise<void>) => {
      const { siteDoc, canvas } = await open();
      await act(canvas());
      await expect.poll(() => siteDoc.log().length).toBe(1);
      const ops = siteDoc.log()[0]?.ops;
      await cleanup();
      return ops;
    };

    const moveCommand = await opsOf(async () => {
      outlineRow("b_calltoactionbanner")?.focus();
      await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    });
    expect(moveCommand).toEqual(movedDown);

    const outlineDrag = await opsOf(async () => {
      const source = outlineRow("b_calltoactionbanner")?.firstElementChild;
      const target = outlineRow("b_calltoactioncentered")?.firstElementChild;
      if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement))
        throw new Error("The outline has no rows for the calls to action.");
      await userEvent.dragAndDrop(page.elementLocator(source), page.elementLocator(target), {
        targetPosition: { x: 40, y: target.offsetHeight - 6 },
        steps: 12,
      });
    });
    expect(outlineDrag).toEqual(movedDown);

    const canvasDrag = await opsOf(async (canvas) => {
      const block = (id: string) =>
        canvas.querySelector<HTMLElement>(`[data-pakshi-block="${id}"]`);
      const source = block("b_calltoactionbanner");
      const target = block("b_calltoactioncentered");
      if (source === null || target === null) throw new Error("The canvas has no calls to action.");
      const FramePointer = source.ownerDocument.defaultView?.PointerEvent ?? PointerEvent;
      source.dispatchEvent(new FramePointer("pointermove", { bubbles: true }));
      await expect.poll(() => canvas.querySelector(".pakshi-handle")).not.toBeNull();
      const handle = canvas.querySelector(".pakshi-handle");
      if (handle === null) throw new Error("The section shows no handle.");
      const below = target.getBoundingClientRect();
      await pointerPath(handle, [{ x: below.left + below.width / 2, y: below.bottom - 12 }]);
    });
    expect(canvasDrag).toEqual(movedDown);
  });

  test("releasing a drag outside the canvas and the outline moves nothing", async () => {
    const { siteDoc } = await open();
    const source = outlineRow("b_calltoactionbanner")?.firstElementChild;
    const over = outlineRow("b_featuregridplaceholder")?.firstElementChild;
    const outside = document.querySelector("aside[aria-label='Settings']");
    if (!(source instanceof HTMLElement) || !(over instanceof HTMLElement) || outside === null)
      throw new Error("The editor is missing a row or the settings panel.");
    // Over another row first, which chooses where the block would land, then out.
    await pointerPath(source, [center(over), center(outside)]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(siteDoc.log()).toEqual([]);
  });

  test("adding to an empty slot from the outline chooses the new item there", async () => {
    const { siteDoc } = await open();
    const grid = BlockId.make("b_featuregridtwocolumns");
    const items = () => siteDoc.draft().pages[home]?.blocks[grid]?.slots?.["items"] ?? [];
    outlineRow("b_featuregridtwocolumnsitems0")?.focus();
    await userEvent.keyboard("{Delete}");
    // Focus moves to the next item once the removal has rendered.
    await expect
      .poll(() => document.activeElement === outlineRow("b_featuregridtwocolumnsitems1"))
      .toBe(true);
    await userEvent.keyboard("{Delete}");
    await expect.poll(() => items().length).toBe(0);
    await expect.poll(() => document.activeElement === outlineRow(grid)).toBe(true);

    // An open section with no items keeps focus on the right arrow.
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(outlineRow(grid));

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await pressUntil("{ArrowDown}", (element) => element.textContent === "Add to Features");
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("Feature{Enter}");
    await expect.poll(() => items().length).toBe(1);
    await expect.poll(() => document.activeElement === outlineRow(items()[0] ?? "")).toBe(true);
  });

  test("an item dragged in the canvas onto an empty section lands in its slot", async () => {
    const { siteDoc, canvas } = await open();
    const grid = BlockId.make("b_featuregridtwocolumns");
    const moving = BlockId.make("b_featuregridthreecolumnsitems0");
    const items = () => siteDoc.draft().pages[home]?.blocks[grid]?.slots?.["items"] ?? [];
    outlineRow("b_featuregridtwocolumnsitems0")?.focus();
    await userEvent.keyboard("{Delete}");
    // Focus moves to the next item once the removal has rendered.
    await expect
      .poll(() => document.activeElement === outlineRow("b_featuregridtwocolumnsitems1"))
      .toBe(true);
    await userEvent.keyboard("{Delete}");
    await expect.poll(() => items().length).toBe(0);

    const block = (id: string) =>
      canvas().querySelector<HTMLElement>(`[data-pakshi-block="${id}"]`);
    block(grid)?.scrollIntoView({ block: "center" });
    const item = block(moving);
    if (item === null) throw new Error("The canvas has no item to drag.");
    const FramePointer = item.ownerDocument.defaultView?.PointerEvent ?? PointerEvent;
    item.dispatchEvent(new FramePointer("pointermove", { bubbles: true }));
    const featureHandle = () =>
      Array.from(canvas().querySelectorAll(".pakshi-handle")).find(
        (candidate) => candidate.textContent === "Feature",
      );
    await expect.poll(featureHandle).toBeDefined();
    const handle = featureHandle();
    const target = block(grid);
    if (handle === undefined || target === null) throw new Error("No handle or empty section.");
    await pointerPath(handle, [center(target)]);
    await expect.poll(items).toEqual([moving]);
  });

  test("the picker offers only the blocks a spot allows", async () => {
    await open();
    const options = async () => {
      await expect.element(page.getByRole("option").first()).toBeVisible();
      return page
        .getByRole("option")
        .elements()
        .map((option) => option.textContent);
    };
    await userEvent.click(page.getByRole("button", { name: "Add to Features" }).first());
    expect(await options()).toEqual(["Feature"]);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(page.getByRole("button", { name: "Add a section" }));
    const sections = await options();
    expect(sections).toContain("Hero");
    for (const excluded of ["Feature", "Header", "Footer"])
      expect(sections).not.toContain(excluded);
  });

  test("the picker opens beside a point on the page and stays there, fitting a short window", async () => {
    const { canvas } = await open({ draft: heroOnly() });
    await page.viewport(1000, 450);
    const hero = canvas().querySelector("[data-pakshi-block='b_herocentered']");
    const Pointer = canvas().defaultView?.PointerEvent ?? PointerEvent;
    hero?.dispatchEvent(new Pointer("pointermove", { bubbles: true }));
    await expect.poll(() => canvas().querySelector(".pakshi-insert")).not.toBeNull();
    const [point] = Array.from(canvas().querySelectorAll(".pakshi-insert")).toSorted(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
    );
    if (point === undefined) throw new Error("The hero shows no insert point.");
    const frame = document.querySelector("iframe")?.getBoundingClientRect();
    const drawn = point.getBoundingClientRect();
    const top = (frame?.top ?? 0) + drawn.top;
    const bottom = top + drawn.height;
    await userEvent.click(page.getByTitle(/^Canvas:/), { position: center(point) });

    const search = page.getByPlaceholder("Search blocks");
    const onScreen = (rect: DOMRect) => rect.top >= 0 && rect.bottom <= window.innerHeight;
    const placement = () => {
      const box = page.getByRole("dialog").element().getBoundingClientRect();
      const gap = Math.min(Math.abs(box.top - bottom), Math.abs(top - box.bottom));
      return {
        onScreen: onScreen(box) && onScreen(search.element().getBoundingClientRect()),
        besidePoint: gap <= 8,
      };
    };
    await expect.element(search).toBeVisible();
    await expect.poll(placement).toEqual({ onScreen: true, besidePoint: true });

    // Moving onto the picker hides the point, and searching resizes the picker.
    await userEvent.hover(search);
    await expect.poll(() => point.isConnected).toBe(false);
    await userEvent.keyboard("Her");
    await expect.element(page.getByRole("option")).toHaveLength(1);
    await expect.poll(placement).toEqual({ onScreen: true, besidePoint: true });
  });

  test("a press on the page closes the picker, as a press anywhere else in Studio does", async () => {
    await open();
    await userEvent.click(page.getByRole("button", { name: "Add a section" }));
    await expect.element(page.getByPlaceholder("Search blocks")).toBeVisible();
    await userEvent.click(page.getByTitle(/^Canvas:/), { position: { x: 900, y: 600 } });
    await expect.element(page.getByPlaceholder("Search blocks")).not.toBeInTheDocument();
  });
});
