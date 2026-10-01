import { readFile } from "node:fs/promises";

import { noIdentity } from "@repo/contracts/brand";
import { BlockId, BlockType, ItemId, MediaId } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import type { BlockInstance } from "@repo/contracts/page";
import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { fixturesSource, registrySource } from "../scripts/generate-registry.ts";
import type { BlockDefinition } from "../src/block.tsx";
import { SiteDataProvider } from "../src/components.tsx";
import { blockKey } from "../src/contract.ts";
import { propsSchema } from "../src/fields.ts";
import { blockFixtures, fixtureSite, fixtureTree } from "../src/fixtures.ts";
import { placeholderForm, placeholderPaths, placeholderTree } from "../src/placeholders.ts";
import { registry } from "../src/registry.gen.ts";
import { latestLockfile, loadBlocks, renderBlock } from "../src/render.tsx";
import { siteData } from "../src/site-data.ts";

const load = async (type: string, version: number) => {
  const entry = registry[blockKey(type, version)];
  if (entry === undefined) throw new Error(`${type}@${version} is not registered`);
  return (await entry()).default;
};

const site = siteData({
  ...fixtureSite,
  identity: noIdentity,
  media: (id) => {
    const file = fixtureSite.media[id];
    return file === undefined ? undefined : { src: `/_media/${id}`, ...file };
  },
});

const markup = (element: React.ReactElement) =>
  renderToStaticMarkup(<SiteDataProvider value={site}>{element}</SiteDataProvider>);

/** A block tree as the flat blocks a page stores. */
const flatten = (tree: BlockTree): Record<BlockId, BlockInstance> => {
  const { id, slots, ...block } = tree;
  const items = Object.values(slots ?? {}).flat();
  return {
    [id]: {
      ...block,
      ...(slots && {
        slots: Object.fromEntries(
          Object.entries(slots).map(([slot, list]) => [slot, list.map((item) => item.id)]),
        ),
      }),
    },
    ...Object.fromEntries(items.map(({ id: itemId, ...item }) => [itemId, item])),
  };
};

/** Renders a block at a version, with the items in its slots at their newest. */
const renderTree = async (tree: BlockTree, version: number) => {
  const definitions = await loadBlocks({ ...latestLockfile, [tree.type]: version });
  return markup(renderBlock(definitions, flatten(tree), tree.id));
};

const renderProps = (
  block: BlockDefinition,
  props: Readonly<Record<string, Json>>,
  variant: string,
) => block.render({ id: BlockId.make("b_test"), props, variant, surface: undefined, slots: {} });

test("the generated registry and fixture list match the block version folders", async () => {
  expect(await readFile(new URL("../src/registry.gen.ts", import.meta.url), "utf8")).toBe(
    await registrySource(),
  );
  expect(await readFile(new URL("../src/fixtures.gen.ts", import.meta.url), "utf8")).toBe(
    await fixturesSource(),
  );
});

test("every block version has fixtures", () => {
  const covered = new Set(blockFixtures.map((entry) => blockKey(entry.type, entry.version)));
  expect(covered).toEqual(new Set(Object.keys(registry)));
});

describe.each(
  blockFixtures.map((entry) => [entry.type, entry.version, entry.name, entry] as const),
)("%s v%i fixture %s", (type, version, _name, entry) => {
  test("renders, with a section's surface on its root", async () => {
    const block = await load(type, version);
    const html = await renderTree(fixtureTree(entry), version);
    expect(html).toMatch(
      block.placement === "item" ? /^<li / : `data-surface="${entry.fixture.surface}"`,
    );
  });

  test("is complete, so it could be published", async () => {
    const block = await load(type, version);
    expect(Schema.is(propsSchema(block.fields, "complete"))(entry.fixture.props)).toBe(true);
  });
});

describe("field components", () => {
  test("render plain markup, with alt text from the placement and page links following the page", async () => {
    const hero = await load("hero", 1);
    const result = renderProps(
      hero,
      {
        heading: "Learn by building",
        image: { $ref: "media", id: "med_harbour", alt: "Boats moored in a calm harbour" },
        cta: { label: "See the programme", link: { $ref: "page", id: "pg_programme" } },
      },
      "split-image",
    );
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain(">Learn by building</h1>");
    expect(html).toContain('alt="Boats moored in a calm harbour"');
    expect(html).toContain('href="/programme"');
    expect(html).not.toContain("field");
  });

  test("render rich text with the field's extensions", async () => {
    const entry = blockFixtures.find((candidate) => candidate.type === "rich-text");
    const block = await load("rich-text", 1);
    const result = renderProps(block, entry?.fixture.props ?? {}, "narrow");
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain("<em>small teams</em>");
    expect(html).toContain("<h3>Bring with you</h3>");
    expect(html).toContain('<a href="https://example.org/faq">frequently asked questions</a>');
  });

  test("render a form's fields with labels tied to their inputs", async () => {
    const block = await load("form-section", 1);
    const result = renderProps(
      block,
      { heading: "Register", form: { $ref: "form", id: "frm_register" } },
      "plain",
    );
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain('<label for="b_test-ff_email"');
    const email = html.match(/<input id="b_test-ff_email"[^>]*>/)?.[0] ?? "";
    expect(email).toContain('name="ff_email"');
    expect(email).toContain('type="email"');
    expect(email).toContain('required=""');
    expect(html).toContain('<input type="hidden" name="ff_source" value="website"/>');
    expect(html).toContain(">Register</button>");
  });
});

describe("blocks that read the site", () => {
  test("the header shows the site's name and main menu, with links following their pages", async () => {
    const block = await load("header", 1);
    const result = block.render({
      id: BlockId.make("b_header"),
      props: {},
      variant: "simple",
      surface: "default",
      slots: {},
    });
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain(">Harbour Summer School</a>");
    expect(html).toContain('<a href="/programme"');
    expect(html).toContain(">Workshops</a>");
  });

  test("the blog list shows posts newest first", async () => {
    const block = await load("post-list", 1);
    const result = renderProps(block, { heading: "News" }, "list");
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html.indexOf("Meet this year&#x27;s mentors")).toBeLessThan(
      html.indexOf("Dates for this summer are out"),
    );
    expect(html).toContain('<time dateTime="2027-04-15">15 April 2027</time>');
  });
});

describe("drafts are checked against the block version's limits", () => {
  test("optional fields may be left out and required ones may not", async () => {
    const cta = await load("call-to-action", 1);
    const primary = { label: "Register", link: "https://example.org" };
    expect(renderProps(cta, { heading: "Places are limited", primary }, "banner").ok).toBe(true);
    expect(renderProps(cta, { heading: "Places are limited" }, "banner").ok).toBe(false);
  });

  test("maximum lengths and single lines apply, minimum lengths don't", async () => {
    const hero = await load("hero", 1);
    expect(renderProps(hero, { heading: "x".repeat(81) }, "centered").ok).toBe(false);
    expect(renderProps(hero, { heading: "Two\nlines" }, "centered").ok).toBe(false);
    expect(renderProps(hero, { heading: "" }, "centered").ok).toBe(true);
  });

  test("rich text allows only the field's marks and nodes, and safe links", async () => {
    const hero = await load("hero", 1);
    const body = (content: ReadonlyArray<Json>) => ({ type: "doc", content });
    const heading = {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Hi" }],
    };
    const result = renderProps(hero, { heading: "Welcome", body: body([heading]) }, "centered");
    expect(result.ok ? "" : result.problem).toContain("heading isn't allowed here");
    const script = {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Go",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    };
    expect(renderProps(hero, { heading: "Welcome", body: body([script]) }, "centered").ok).toBe(
      false,
    );
  });

  test("variants and surfaces must be the block's own", async () => {
    const hero = await load("hero", 1);
    expect(renderProps(hero, { heading: "Welcome" }, "sideways").ok).toBe(false);
    const item = await load("feature-item", 1);
    const surfaced = item.render({
      id: BlockId.make("b_item"),
      props: { title: "Workshops", body: "Every day" },
      variant: "default",
      surface: "brand",
      slots: {},
    });
    expect(surfaced.ok).toBe(false);
  });

  test("list items need their own IDs", async () => {
    const gallery = await load("gallery", 1);
    const image = { $ref: "media", id: "med_harbour", alt: "" };
    const items = [
      { id: "it_a", image },
      { id: "it_a", image },
    ];
    expect(renderProps(gallery, { images: items }, "grid").ok).toBe(false);
    expect(renderProps(gallery, { images: [{ image }] }, "grid").ok).toBe(false);
  });
});

describe("completeness is checked apart from drafts", () => {
  test("required text must be filled in and reach its minimum length", async () => {
    const hero = await load("hero", 1);
    const complete = Schema.is(propsSchema(hero.fields, "complete"));
    expect(complete({ heading: "Learn by building" })).toBe(true);
    expect(complete({ heading: "" })).toBe(false);
    expect(complete({ heading: "Hi" })).toBe(false);
  });

  test("images need alt text, which may be empty for a decorative image", async () => {
    const split = await load("split", 1);
    const complete = Schema.is(propsSchema(split.fields, "complete"));
    const props = (image: Json) => ({
      heading: "Afternoons on the water",
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Sail." }] }],
      },
      image,
    });
    expect(complete(props({ $ref: "media", id: "med_harbour", alt: "" }))).toBe(true);
    expect(complete(props({ $ref: "media", id: "med_harbour" }))).toBe(false);
  });

  test("required rich text needs some text", async () => {
    const block = await load("rich-text", 1);
    const complete = Schema.is(propsSchema(block.fields, "complete"));
    expect(complete({ body: { type: "doc", content: [{ type: "paragraph" }] } })).toBe(false);
  });

  test("a list needs its minimum number of items", async () => {
    const gallery = await load("gallery", 1);
    expect(Schema.is(propsSchema(gallery.fields, "complete"))({ images: [] })).toBe(false);
  });
});

// Placeholders work the same at any version; hero's first holds its button in a plain field.
const contracts = await loadBlocks({ ...latestLockfile, hero: 1 });

/** The IDs of a list field's items. */
const itemIds = (list: Json | undefined) =>
  Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ id: ItemId })))(list).map(
    (item) => item.id,
  );

describe("placeholders", () => {
  const placed = (type: string) => placeholderTree(contracts, BlockType.make(type));

  test("a new block and its items get new IDs every time, list items included", () => {
    const ids = (tree: BlockTree) => [
      tree.id,
      ...Object.values(tree.slots ?? {})
        .flat()
        .map((item) => item.id),
    ];
    expect(new Set([...ids(placed("feature-grid")), ...ids(placed("feature-grid"))]).size).toBe(8);
    const images = [placed("gallery"), placed("gallery")].flatMap((tree) =>
      itemIds(tree.props["images"]),
    );
    expect(new Set(images).size).toBe(6);
  });

  test("every field of a new block holds placeholder content", () => {
    expect(placeholderPaths(contracts, placed("hero"))).toEqual([
      ["heading"],
      ["body"],
      ["image"],
      ["cta"],
    ]);
  });

  test("a field stops being a placeholder once it's changed", () => {
    const hero = placed("hero");
    const edited = {
      ...hero,
      props: { ...hero.props, heading: "Summer school at the harbour" },
    };
    expect(placeholderPaths(contracts, edited)).toEqual([["body"], ["image"], ["cta"]]);
  });

  test("a button is a placeholder while its link is, even after its label changes", () => {
    const hero = placed("hero");
    const withCta = (cta: Json) => ({ ...hero, props: { ...hero.props, cta } });
    expect(
      placeholderPaths(contracts, withCta({ label: "Register", link: "https://example.com" })),
    ).toContainEqual(["cta"]);
    expect(
      placeholderPaths(contracts, withCta({ label: "Find out more", link: "https://example.org" })),
    ).not.toContainEqual(["cta"]);
  });

  test("a placeholder image stays one until another image replaces it, whatever its alt text", () => {
    const split = placed("split");
    const paths = (id: string) =>
      placeholderPaths(contracts, {
        ...split,
        props: { ...split.props, image: { $ref: "media", id, alt: "A calm harbour" } },
      });
    expect(paths("med_pakshiArch")).toContainEqual(["image"]);
    expect(paths("med_harbour")).not.toContainEqual(["image"]);
  });

  test("items hold their section's placeholder content, and list items are found by ID", () => {
    const [item] = placed("feature-grid").slots?.["items"] ?? [];
    if (item === undefined) throw new Error("The feature grid's placeholder has no items.");
    expect(placeholderPaths(contracts, item)).toEqual([["title"], ["body"]]);
    const gallery = placed("gallery");
    const [first] = itemIds(gallery.props["images"]);
    expect(placeholderPaths(contracts, gallery)).toContainEqual(["images", first, "image"]);
    expect(placeholderPaths(contracts, gallery)).toContainEqual(["images", first, "caption"]);
  });

  test("real content holds no placeholders", async () => {
    for (const entry of blockFixtures.filter((fixture) => fixture.name !== "placeholder")) {
      const tree = fixtureTree(entry);
      const pinned = await loadBlocks({ ...latestLockfile, [entry.type]: entry.version });
      for (const block of [tree, ...Object.values(tree.slots ?? {}).flat()])
        expect(placeholderPaths(pinned, block)).toEqual([]);
    }
  });

  test("placeholder images and the placeholder form resolve on every site", () => {
    const bare = siteData({
      ...fixtureSite,
      identity: noIdentity,
      forms: {},
      media: () => undefined,
    });
    expect(bare.media(MediaId.make("med_pakshiHills"))?.src).toMatch(/^data:image\/svg\+xml,/);
    expect(bare.form(placeholderForm.id)?.submitLabel).toBe("Send message");
  });
});
