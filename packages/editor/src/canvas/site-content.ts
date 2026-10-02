import { entryShown, type SiteData } from "@repo/blocks";

import { partsOf } from "./regions.ts";

/*
 * What a block shows from the site rather than from its own parts: the
 * site's name and logo, its menus, a blog's newest posts, and the details of
 * the post being shown. Blocks read them through shared hooks and render
 * them as markup of their own, so they're found on the page by what they
 * show, matched against the site's data. They can't be changed on the
 * block, only where the site keeps them.
 */

/** One kind of the site's content a block shows, and where it comes from. */
interface Shown {
  readonly key: string;
  readonly name: string;
  readonly from: string;
  /** Whether it's the same on every page, such as a menu, rather than one page's own. */
  readonly sitewide: boolean;
  /** Where it comes when a block shows several kinds. */
  readonly rank: number;
}

const logo: Shown = {
  key: "logo",
  rank: 0,
  name: "Logo",
  from: "Your logo comes from your brand.",
  sitewide: true,
};
const siteName: Shown = {
  key: "name",
  rank: 1,
  name: "Name",
  from: "Your site's name comes from Site settings.",
  sitewide: true,
};
const menu: Shown = {
  key: "menu",
  rank: 2,
  name: "Menu",
  from: "The menu comes from Pages and menus.",
  sitewide: true,
};
const footer: Shown = {
  key: "footer",
  rank: 3,
  name: "Links",
  from: "The links come from the footer menu, in Pages and menus.",
  sitewide: true,
};
const post: Shown = {
  key: "post",
  rank: 4,
  name: "Post details",
  from: "The post's title, date, author, excerpt and cover photo come from its settings.",
  sitewide: false,
};

/** The posts of one of the site's blogs, or the sample posts a new list shows. */
const posts = (
  collection: { readonly id: string; readonly title: string },
  sample: boolean,
): Shown => ({
  key: `posts:${collection.id}`,
  rank: 5,
  name: "Blog posts",
  from: sample
    ? "Sample posts show here until you choose one of your blogs in the list's settings."
    : `The newest posts from ${collection.title || "the blog"} show here by themselves, as they're published.`,
  sitewide: false,
});

/** What a block shows from the site, and where on the page. */
export interface SiteContent {
  /** What it's called, such as "Name and menu". */
  readonly label: string;
  /** Where it comes from, and how it changes. */
  readonly explanation: string;
  readonly elements: ReadonlyArray<Element>;
  /** Whether it comes before the block's own parts on the page. */
  readonly first: boolean;
}

const textOf = (element: Element) => element.textContent?.trim() ?? "";

/** Which of the site's data an element shows, if any. */
const shownBy = (element: Element, data: SiteData): Shown | undefined => {
  if (element.tagName === "IMG") {
    const source = element.getAttribute("src") ?? "";
    if (data.logo !== null && [data.logo.light.src, data.logo.onDark?.src].includes(source))
      return logo;
  }
  const href = element.getAttribute("href");
  if (element.tagName === "A" && href !== null) {
    const linked = (items: SiteData["menus"]["main"]) =>
      items.some(
        (item) =>
          (item.href === href && item.label === textOf(element)) ||
          item.children.some((child) => child.href === href && child.label === textOf(element)),
      );
    if (linked(data.menus.main)) return menu;
    if (linked(data.menus.footer)) return footer;
    const collection = Array.from(data.collections.values()).find((candidate) =>
      candidate.entries.some(
        (entry) => entry.href === href && textOf(element) === entry.meta.title,
      ),
    );
    if (collection !== undefined) return posts(collection, collection.href === "#");
  }
  if (element.children.length > 0) return undefined;
  if (element.tagName === "H1" && textOf(element) === entryShown(data).meta.title) return post;
  return textOf(element) === data.name ? siteName : undefined;
};

/**
 * The site's own content in a block on the page: each element showing it,
 * grown to the largest element around it that holds none of the block's own
 * parts, so a menu's links are found as the whole menu.
 */
export const siteContentIn = (block: Element, data: SiteData): SiteContent | null => {
  const parts = partsOf(block).map((part) => part.element);
  const holdsPart = (element: Element) => parts.some((part) => element.contains(part));
  const found = new Map<Element, Map<string, Shown>>();
  for (const element of Array.from(block.querySelectorAll("*"))) {
    if (element.closest("[data-pakshi-field], [data-pakshi-add]") !== null) continue;
    if (element.closest("[data-pakshi-block]") !== block) continue;
    const shown = shownBy(element, data);
    if (shown === undefined) continue;
    let region = element;
    for (
      let parent = region.parentElement;
      parent !== null && parent !== block && !holdsPart(parent);
      parent = parent.parentElement
    )
      region = parent;
    found.set(region, (found.get(region) ?? new Map()).set(shown.key, shown));
  }
  const elements = Array.from(found.keys()).filter(
    (element) =>
      !Array.from(found.keys()).some((other) => other !== element && other.contains(element)),
  );
  const shown = new Map(Array.from(found.values()).flatMap((kinds) => Array.from(kinds)));
  const named = Array.from(shown.values()).toSorted((a, b) => a.rank - b.rank);
  // A logo stands for the name, so a header showing a logo is the logo's.
  const listed = shown.has(logo.key) ? named.filter((entry) => entry !== siteName) : named;
  const [first, ...more] = listed;
  const [firstElement] = elements;
  if (first === undefined || firstElement === undefined) return null;
  const label = [first.name, ...more.map((entry) => entry.name.toLowerCase())].join(" and ");
  const [firstPart] = parts;
  const changed = listed.some((entry) => entry.sitewide)
    ? " Change them there, and every page updates."
    : "";
  return {
    label,
    explanation: `${listed.map((entry) => entry.from).join(" ")}${changed}`,
    elements,
    first:
      firstPart === undefined ||
      Boolean(firstElement.compareDocumentPosition(firstPart) & Node.DOCUMENT_POSITION_FOLLOWING),
  };
};
