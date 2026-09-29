import type { BlockDefinition, RichTextDocument } from "@repo/blocks";
import { fixtureSite } from "@repo/blocks/fixtures";
import type { Draft } from "@repo/contracts/draft";
import { BlockId, BlockType, MediaId, PageId } from "@repo/contracts/ids";
import type { MediaSummary } from "@repo/contracts/studio";
import { Schema } from "effect";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";

import { EditorCanvas, EditorProvider, EditorSettings } from "../src/index.ts";
import { definitions, fakeSiteDoc, fixtureDraft } from "./support/site-doc.ts";

import siteCss from "@repo/blocks/site.css?url";

const home = PageId.make("pg_home");

/** An image the library suggests no alt text for, as for a decorative pattern. */
const pattern: MediaSummary = {
  id: MediaId.make("med_pattern"),
  contentType: "image/png",
  width: 1200,
  height: 800,
  alt: "",
};

const media: ReadonlyArray<MediaSummary> = [
  ...Object.entries(fixtureSite.media).map(([id, file]) => ({
    id: MediaId.make(id),
    ...file,
    alt: "Two sailing boats on a calm harbour at sunset",
  })),
  pattern,
];

/** A 1x1 image, so the canvas needs no media server. */
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const open = async (
  options: {
    readonly draft?: Draft;
    readonly page?: PageId;
    readonly definitions?: ReadonlyMap<BlockType, BlockDefinition>;
  } = {},
) => {
  const siteDoc = fakeSiteDoc(options.draft);
  await page.viewport(1440, 900);
  await render(
    <EditorProvider
      draft={options.draft ?? fixtureDraft}
      page={options.page ?? home}
      definitions={options.definitions ?? definitions}
      media={media}
      mediaSrc={() => pixel}
      siteCss={siteCss}
      scheme="light"
      connection={siteDoc.connection}
      onNotice={() => undefined}
    >
      <div style={{ display: "flex", height: 700 }}>
        <div style={{ flex: 1 }}>
          <EditorCanvas width={1024} accent="blue" />
        </div>
        <aside aria-label="Settings" style={{ width: 360, flexShrink: 0, overflowY: "auto" }}>
          <EditorSettings />
        </aside>
      </div>
    </EditorProvider>,
  );
  await expect.element(page.getByTitle(/^Canvas:/)).toBeVisible();
  const canvas = () => {
    const content = document.querySelector("iframe")?.contentDocument;
    if (content === null || content === undefined) throw new Error("The canvas has no document.");
    return content;
  };
  await expect
    .poll(() => canvas().querySelectorAll("[data-pakshi-block]").length)
    .toBeGreaterThan(0);
  return { siteDoc, canvas };
};

const heroField = (canvas: Document, field: string) =>
  canvas.querySelector<HTMLElement>(
    `[data-pakshi-block='b_herocentered'] [data-pakshi-field='${field}']`,
  );

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
    const reached = new Set<HTMLElement>();
    await userEvent.click(page.getByTitle(/^Canvas:/));
    for (let step = 0; step < 150 && reached.size < fields.length; step += 1) {
      await userEvent.keyboard("{Tab}");
      const focused = fields.find((field) => field === canvas().activeElement);
      if (focused !== undefined) reached.add(focused);
    }
    expect(
      fields.filter((field) => !reached.has(field)).map((field) => field.dataset["pakshiField"]),
    ).toEqual([]);
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
    await expect.poll(() => heroHeading(siteDoc)).toBe("Summer school at the harbour");
    expect(canvas().activeElement?.getAttribute("data-pakshi-block")).toBe("b_herocentered");
  });

  test("opens an image's popover with Enter", async () => {
    const { canvas } = await open();
    canvas().querySelector<HTMLElement>("img[data-pakshi-field]")?.focus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("dialog")).toBeVisible();
  });

  test("moves from a button on the page to its settings with Enter", async () => {
    const { canvas } = await open();
    heroField(canvas(), "cta")?.focus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement?.id).toMatch(/cta-label$/);
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

describe("a link's settings", () => {
  test("switch a button from a page on the site to an external address", async () => {
    const { siteDoc, canvas } = await open();
    heroField(canvas(), "cta")?.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.selectOptions(
      page.getByLabelText("Link: where it goes"),
      "An external address",
    );
    await userEvent.fill(
      page.getByRole("textbox", { name: "Link", exact: true }),
      "https://example.org/apply",
    );
    await userEvent.keyboard("{Tab}");
    await expect
      .poll(() => siteDoc.draft().pages[home]?.blocks[BlockId.make("b_herocentered")]?.props["cta"])
      .toEqual({ label: "See the programme", link: "https://example.org/apply" });
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

    await userEvent.click(page.getByRole("list", { name: "Library" }).getByRole("button").first());
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

describe("performance budgets, on a page with 150 blocks", () => {
  test("the canvas shows the page within a second of the draft arriving", async () => {
    const started = performance.now();
    const { canvas } = await open({ draft: largeDraft() });
    await expect.poll(() => canvas().querySelectorAll("[data-pakshi-block]").length).toBe(152);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a keystroke renders only its own block and paints in the next frame", async () => {
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
});
