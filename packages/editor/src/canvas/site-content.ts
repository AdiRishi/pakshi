import type { SiteData } from "@repo/blocks";

import { partsOf } from "./regions.ts";

/*
 * What a block shows from the site rather than from its own parts: the
 * site's name and logo, its menus and its newest posts. Blocks read them
 * through shared hooks and render them as markup of their own, so they're
 * found on the page by what they show, matched against the site's data.
 * They can't be changed on the block, only where the site keeps them.
 */

export type SiteContentKind = "logo" | "name" | "menu" | "footer" | "posts";

const kinds: ReadonlyArray<{
  readonly kind: SiteContentKind;
  readonly name: string;
  readonly from: string;
}> = [
  { kind: "logo", name: "Logo", from: "Your logo comes from your brand." },
  { kind: "name", name: "Name", from: "Your site's name comes from Site settings." },
  { kind: "menu", name: "Menu", from: "The menu comes from Pages and menus." },
  {
    kind: "footer",
    name: "Links",
    from: "The links come from the footer menu, in Pages and menus.",
  },
  {
    kind: "posts",
    name: "Blog posts",
    from: "The newest blog posts show here by themselves, as they're published.",
  },
];

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
const kindOf = (element: Element, data: SiteData): SiteContentKind | undefined => {
  if (element.tagName === "IMG") {
    const logo = data.logo;
    return logo !== null &&
      [logo.light.src, logo.onDark?.src].includes(element.getAttribute("src") ?? "")
      ? "logo"
      : undefined;
  }
  const href = element.getAttribute("href");
  if (element.tagName === "A" && href !== null) {
    const linked = (items: SiteData["menus"]["main"]) =>
      items.some(
        (item) =>
          (item.href === href && item.label === textOf(element)) ||
          item.children.some((child) => child.href === href && child.label === textOf(element)),
      );
    if (linked(data.menus.main)) return "menu";
    if (linked(data.menus.footer)) return "footer";
    if (data.posts.some((post) => post.href === href)) return "posts";
  }
  return element.children.length === 0 && textOf(element) === data.name ? "name" : undefined;
};

/**
 * The site's own content in a block on the page: each element showing it,
 * grown to the largest element around it that holds none of the block's own
 * parts, so a menu's links are found as the whole menu.
 */
export const siteContentIn = (block: Element, data: SiteData): SiteContent | null => {
  const parts = partsOf(block).map((part) => part.element);
  const holdsPart = (element: Element) => parts.some((part) => element.contains(part));
  const found = new Map<Element, Set<SiteContentKind>>();
  for (const element of Array.from(block.querySelectorAll("*"))) {
    if (element.closest("[data-pakshi-field], [data-pakshi-add]") !== null) continue;
    if (element.closest("[data-pakshi-block]") !== block) continue;
    const kind = kindOf(element, data);
    if (kind === undefined) continue;
    let region = element;
    for (
      let parent = region.parentElement;
      parent !== null && parent !== block && !holdsPart(parent);
      parent = parent.parentElement
    )
      region = parent;
    found.set(region, (found.get(region) ?? new Set()).add(kind));
  }
  const elements = Array.from(found.keys()).filter(
    (element) =>
      !Array.from(found.keys()).some((other) => other !== element && other.contains(element)),
  );
  const shown = new Set(Array.from(found.values()).flatMap((set) => Array.from(set)));
  const named = kinds.filter((entry) => shown.has(entry.kind));
  // A logo stands for the name, so a header showing a logo is the logo's.
  const listed = shown.has("logo") ? named.filter((entry) => entry.kind !== "name") : named;
  const [first, ...more] = listed;
  const [firstElement] = elements;
  if (first === undefined || firstElement === undefined) return null;
  const label = [first.name, ...more.map((entry) => entry.name.toLowerCase())].join(" and ");
  const [firstPart] = parts;
  const changed = listed.some((entry) => entry.kind !== "posts")
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
