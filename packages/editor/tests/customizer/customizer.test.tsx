import { latestLockfile, loadBlocks, presentations } from "@repo/blocks";
import type { BlockType } from "@repo/contracts/ids";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";

import { BlockCustomizer } from "../../src/index.ts";

import siteCss from "@repo/blocks/site.css?url";

const definitions = await loadBlocks(latestLockfile);

const colors = { accent: "blue", warning: "darkorange", presence: ["teal"] };

afterEach(async () => {
  await cleanup();
});

/** The customizer for one block type, as Studio's block page lays it out. */
const open = async (type: BlockType) => {
  await page.viewport(1280, 1000);
  await render(
    <BlockCustomizer type={type} definitions={definitions} siteCss={siteCss} colors={colors} />,
  );
  const canvas = () => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe[title^='The block']");
    const content = frame?.contentDocument;
    if (content === null || content === undefined) throw new Error("The stage has no frame.");
    return content;
  };
  await expect
    .poll(() => canvas().querySelectorAll("[data-pakshi-block]").length)
    .toBeGreaterThan(0);
  const find = (selector: string) => {
    const element = canvas().querySelector<HTMLElement>(selector);
    if (element === null) throw new Error(`The block has no ${selector}.`);
    return element;
  };
  /** Points at an element on the block, as moving the mouse onto it does. */
  const point = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const view = element.ownerDocument.defaultView;
    if (view === null) throw new Error("The element isn't on a page.");
    element.dispatchEvent(
      new view.PointerEvent("pointermove", {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  };
  const parts = page.getByRole("complementary", { name: "Everything in this block" });
  return { canvas, find, point, parts };
};

const types = Array.from(presentations.keys());
const fieldless = (type: BlockType) =>
  Object.keys(definitions.get(type)?.fields ?? {}).length === 0;

describe("every block", () => {
  test.each(types.filter((type) => !fieldless(type)))(
    "%s has a page to try it on",
    async (type) => {
      const { canvas, parts } = await open(type);
      await expect.element(parts).toBeVisible();
      expect(canvas().querySelector("[data-pakshi-field], [data-pakshi-add]")).not.toBeNull();
    },
  );

  test.each(types.filter(fieldless))(
    "%s, with no parts of its own, says what it shows from the site",
    async (type) => {
      const { parts } = await open(type);
      await expect.element(parts.getByText("From your site")).toBeVisible();
    },
  );
});

describe("a list", () => {
  test("adds an item where the last one ends, until it's full", async () => {
    const { canvas, find, point, parts } = await open("hero");
    await expect.element(parts.getByText("2 of 2")).toBeVisible();
    await expect.element(parts.getByText("That's the most: 2 buttons")).toBeVisible();
    expect(canvas().querySelector("[data-pakshi-add^='actions.']")).toBeNull();

    point(find("a[data-pakshi-field^='actions.']"));
    await userEvent.click(
      page.getByRole("toolbar", { name: "Button 1" }).getByRole("button", { name: "Remove" }),
    );
    await expect.element(parts.getByText("1 of 2")).toBeVisible();
    await expect
      .poll(() => canvas().querySelectorAll("a[data-pakshi-field^='actions.']").length)
      .toBe(1);

    find("[data-pakshi-add^='actions.']").click();
    await expect.element(parts.getByText("2 of 2")).toBeVisible();
    await expect
      .poll(() => canvas().querySelectorAll("a[data-pakshi-field^='actions.']").length)
      .toBe(2);
    expect(canvas().querySelector("[data-pakshi-add^='actions.']")).toBeNull();
  });

  test("moves an item later, and can't remove it below the fewest it needs", async () => {
    const { canvas, point, parts } = await open("logo-strip");
    const logos = () =>
      Array.from(
        canvas().querySelectorAll<HTMLImageElement>("img[data-pakshi-field^='logos.']"),
        (logo) => logo.alt,
      );
    const [first, second] = logos();
    const logo = (index: number) => {
      const image = canvas().querySelectorAll("img[data-pakshi-field^='logos.']")[index];
      if (image === undefined) throw new Error(`There's no logo ${index + 1}.`);
      return image;
    };

    point(logo(0));
    await userEvent.click(
      page.getByRole("toolbar", { name: "Logo 1" }).getByRole("button", { name: "Move later" }),
    );
    await expect.poll(() => logos().slice(0, 2)).toEqual([second, first]);

    while (logos().length > 2) {
      const count = logos().length;
      point(logo(0));
      await userEvent.click(
        page.getByRole("toolbar", { name: "Logo 1" }).getByRole("button", { name: "Remove" }),
      );
      await expect.poll(() => logos().length).toBe(count - 1);
    }
    await expect.element(parts.getByText("2 of 12")).toBeVisible();
    point(logo(0));
    const toolbar = page.getByRole("toolbar", { name: "Logo 1" });
    await expect.element(toolbar.getByRole("button", { name: /^Remove/ })).toBeDisabled();
    await expect.element(toolbar.getByText("Needs at least 2")).toBeVisible();
  });
});

describe("a part the block can leave out", () => {
  test("is removed with its ×, and added back from where it was", async () => {
    const { canvas, find, point, parts } = await open("hero");
    point(find("[data-pakshi-field='kicker']"));
    await userEvent.click(page.getByRole("button", { name: "Remove this part" }));
    await expect.poll(() => canvas().querySelector("[data-pakshi-field='kicker']")).toBeNull();
    await expect.element(parts.getByText("Not shown")).toBeVisible();

    find("[data-pakshi-add='kicker']").click();
    await expect
      .poll(() => canvas().querySelector("[data-pakshi-field='kicker']")?.textContent)
      .toBe("Summer 2027");
  });

  test("is turned on by a layout that needs it, which keeps it while it's chosen", async () => {
    const { canvas, find, point } = await open("hero");
    const layouts = page.getByRole("group", { name: "Layout" });
    await userEvent.click(layouts.getByRole("button", { name: /Text in the middle/ }));
    point(find("img[data-pakshi-field='image']"));
    await userEvent.click(page.getByRole("button", { name: "Remove this part" }));
    await expect.poll(() => canvas().querySelector("img[data-pakshi-field='image']")).toBeNull();

    await userEvent.click(layouts.getByRole("button", { name: /Text over a photo/ }));
    await expect
      .poll(() => canvas().querySelector("img[data-pakshi-field='image']"))
      .not.toBeNull();
    point(find("img[data-pakshi-field='image']"));
    await expect.element(page.getByText("This layout needs it")).toBeVisible();
    expect(document.querySelector("[aria-label='Remove this part']")).toBeNull();
  });
});

describe("a setting the block doesn't draw", () => {
  test("opens from its row, and the block follows what's chosen", async () => {
    const { canvas, parts } = await open("post-list");
    await expect.element(parts.getByRole("button", { name: /^Blog\s*News/ })).toBeVisible();
    await expect.poll(() => canvas().body.textContent).not.toContain("See all posts");

    await userEvent.click(parts.getByRole("button", { name: /^How many/ }));
    await userEvent.fill(page.getByRole("spinbutton", { name: "How many" }), "1");
    await expect.poll(() => canvas().body.textContent).toContain("See all posts");
    await expect.element(parts.getByRole("button", { name: /^How many\s*1/ })).toBeVisible();
  });
});
