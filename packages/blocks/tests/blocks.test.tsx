import { readFile } from "node:fs/promises";

import { noIdentity } from "@repo/contracts/brand";
import { BlockId, BlockType, ItemId, MediaId, PageId } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import { listingsOf } from "@repo/contracts/snapshot";
import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  fixturesSource,
  presentationsSource,
  registrySource,
  samplesSource,
} from "../scripts/generate-registry.ts";
import type { BlockDefinition } from "../src/block.tsx";
import { type SiteData, SiteDataProvider } from "../src/components.tsx";
import { blockKey, type StoredProps } from "../src/contract.ts";
import { propsSchema } from "../src/fields.ts";
import { blockFixtures, fixtureSite, fixtureTree } from "../src/fixtures.ts";
import {
  placeholderCollection,
  placeholderForm,
  placeholderPaths,
  placeholderTree,
} from "../src/placeholders.ts";
import { registry } from "../src/registry.gen.ts";
import {
  latestLockfile,
  loadBlock,
  loadBlocks,
  registeredVersions,
  renderTree,
} from "../src/render.tsx";
import { siteData } from "../src/site-data.ts";

const load = (type: string, version: number) => loadBlock(type, { [type]: version });

/** A block type's newest version, for behaviour every version has. */
const newest = (type: string) => loadBlock(type, latestLockfile);

/** Whether props are complete for a block: they decode, a left-out choice reading as its default. */
const completes = (block: BlockDefinition) => {
  const decode = Schema.decodeUnknownExit(propsSchema(block.fields, "complete"));
  return (props: StoredProps) => decode(props)._tag === "Success";
};

const site = siteData({
  ...fixtureSite,
  pages: listingsOf(fixtureSite.pages),
  identity: noIdentity,
  media: (id) => {
    const file = fixtureSite.media[id];
    return file === undefined ? undefined : { src: `/_media/${id}`, ...file };
  },
});

const markup = (element: React.ReactElement) =>
  renderToStaticMarkup(<SiteDataProvider value={site}>{element}</SiteDataProvider>);

/** Renders a block at a version, with the items in its slots at their newest. */
const renderAt = async (tree: BlockTree, version: number) => {
  const definitions = await loadBlocks({ ...latestLockfile, [tree.type]: version });
  return markup(renderTree(definitions, tree));
};

const renderProps = (
  block: BlockDefinition,
  props: Readonly<Record<string, Json>>,
  variant: string,
) => block.render({ id: BlockId.make("b_test"), props, variant, surface: undefined, slots: {} });

test("the generated registry and lists match the block folders", async () => {
  expect(await readFile(new URL("../src/registry.gen.ts", import.meta.url), "utf8")).toBe(
    await registrySource(),
  );
  expect(await readFile(new URL("../src/fixtures.gen.ts", import.meta.url), "utf8")).toBe(
    await fixturesSource(),
  );
  expect(await readFile(new URL("../src/presentation.gen.ts", import.meta.url), "utf8")).toBe(
    await presentationsSource(),
  );
  expect(await readFile(new URL("../src/samples.gen.ts", import.meta.url), "utf8")).toBe(
    await samplesSource(),
  );
});

test("every block version has fixtures", () => {
  const covered = new Set(blockFixtures.map((entry) => blockKey(entry.type, entry.version)));
  expect(covered).toEqual(new Set(Object.keys(registry)));
});

// A version whose previous one has been removed has no fixtures of it to take.
test.each(
  registeredVersions
    .filter(({ type, version }) => version > 1 && blockKey(type, version - 1) in registry)
    .map(({ type, version }) => [blockKey(type, version), type, version] as const),
)(
  "%s says what it changes and takes the content and layouts of the version before it",
  async (_key, type, version) => {
    const block = await load(type, version);
    expect(block.changes).not.toBeNull();
    if (block.migrate === null) throw new Error(`${type}@${version} has no migration.`);
    const migrate = block.migrate;
    // A choice left out reads as its first option, so completeness is what decodes.
    const decodeComplete = Schema.decodeUnknownExit(propsSchema(block.fields, "complete"));
    const complete = (props: StoredProps) => decodeComplete(props)._tag === "Success";
    const previous = blockFixtures.filter(
      (entry) => entry.type === type && entry.version === version - 1,
    );
    expect(previous.length).toBeGreaterThan(0);
    expect(
      previous
        .filter((entry) => !complete(migrate(entry.fixture.props, entry.fixture.variant)))
        .map((entry) => entry.name),
    ).toEqual([]);
    const before = await load(type, version - 1);
    expect(
      before.variants.filter(
        (variant) => !block.variants.includes(block.renamedVariants[variant] ?? variant),
      ),
    ).toEqual([]);
  },
);

describe.each(
  blockFixtures.map((entry) => [entry.type, entry.version, entry.name, entry] as const),
)("%s v%i fixture %s", (type, version, _name, entry) => {
  test("renders, with a section's surface on its root", async () => {
    const block = await load(type, version);
    const html = await renderAt(fixtureTree(entry), version);
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
    const hero = await newest("hero");
    const result = renderProps(
      hero,
      {
        heading: "Learn by building",
        image: { $ref: "media", id: "med_harbour", alt: "Boats moored in a calm harbour" },
        actions: [
          {
            id: "it_programme",
            button: { label: "See the programme", link: { $ref: "page", id: "pg_programme" } },
          },
        ],
        points: [],
      },
      "split",
    );
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toMatch(/<h1[^>]*>.*Learn by building.*<\/h1>/);
    expect(html).toContain('alt="Boats moored in a calm harbour"');
    expect(html).toContain('href="/programme"');
    expect(html).not.toContain("field");
  });

  test("render rich text with the field's extensions", async () => {
    const block = await newest("rich-text");
    const text = (value: string, marks?: ReadonlyArray<Json>) => ({
      type: "text",
      text: value,
      ...(marks !== undefined && { marks }),
    });
    const body = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [text("We work in "), text("small teams", [{ type: "italic" }])],
        },
        { type: "heading", attrs: { level: 3 }, content: [text("Bring with you")] },
        {
          type: "paragraph",
          content: [
            text("frequently asked questions", [
              { type: "link", attrs: { href: "https://example.org/faq" } },
            ]),
          ],
        },
      ],
    };
    const result = renderProps(block, { body }, "article");
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain("<em>small teams</em>");
    expect(html).toContain("<h3>Bring with you</h3>");
    expect(html).toContain('<a href="https://example.org/faq">frequently asked questions</a>');
  });

  test("render a form's fields with labels tied to their inputs", async () => {
    const block = await newest("form-section");
    const result = renderProps(
      block,
      { heading: "Register", points: [], form: { $ref: "form", id: "frm_register" } },
      "card",
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

  test("a form with a longer answer or a choice is stacked, even where a row is asked for", async () => {
    const block = await newest("form-section");
    const result = renderProps(
      block,
      { heading: "Register", points: [], form: { $ref: "form", id: "frm_register" } },
      "inline",
    );
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toMatch(/<select[^>]*name="ff_week"/);
    expect(html).toMatch(/<textarea[^>]*name="ff_notes"/);
  });
});

test("every hero layout with a sign-up form shows the form in place of its buttons", async () => {
  const block = await newest("hero");
  const shown = block.variants.map((variant) => {
    const result = renderProps(
      block,
      {
        heading: "Come and build a boat",
        actions: [
          { id: "it_more", button: { label: "Find out more", link: "https://example.org" } },
        ],
        points: [],
        signup: { $ref: "form", id: "frm_newsletter" },
      },
      variant,
    );
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    return {
      variant,
      form: html.includes('action="?form=frm_newsletter"'),
      buttons: html.includes("Find out more"),
    };
  });
  expect(shown).toEqual(block.variants.map((variant) => ({ variant, form: true, buttons: false })));
});

describe("blocks that read the site", () => {
  test("the header shows the site's name and main menu, with links following their pages", async () => {
    const block = await newest("header");
    const result = block.render({
      id: BlockId.make("b_header"),
      props: {},
      variant: "standard",
      surface: "default",
      slots: {},
    });
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain(">Harbour Summer School</a>");
    expect(html).toContain('<a href="/programme"');
    expect(html).toContain(">Workshops</a>");
  });
});

describe("blog lists and post headers", () => {
  const news = { $ref: "page", id: "pg_news" };
  const listOn = async (
    props: Readonly<Record<string, Json>>,
    current: SiteData["current"] = null,
    variant = "list",
  ) => {
    const block = await load("post-list", 3);
    const result = renderProps(block, { heading: "News", ...props }, variant);
    if (!result.ok) throw new Error(result.problem);
    return renderToStaticMarkup(
      <SiteDataProvider value={{ ...site, current }}>{result.element}</SiteDataProvider>,
    );
  };

  test("a blog list shows its blog's posts newest first", async () => {
    const html = await listOn({ collection: news, count: 12 });
    expect(html.indexOf("Meet this year&#x27;s mentors")).toBeLessThan(
      html.indexOf("Dates for this summer are out"),
    );
    expect(html).toContain('href="/news/meet-the-mentors"');
    expect(html).toMatch(/<time dateTime="2027-04-15"[^>]*>15 April 2027<\/time>/);
  });

  test("elsewhere, a blog list shows the newest posts and links to the blog for the rest", async () => {
    const html = await listOn(
      { collection: news, count: 1 },
      { page: PageId.make("pg_home"), number: 1 },
    );
    expect(html).toContain("Meet this year&#x27;s mentors");
    expect(html).not.toContain("Dates for this summer are out");
    expect(html).toMatch(/href="\/news"[^>]*>See all posts<\/a>/);
    expect(await listOn({ collection: news, count: 2 })).not.toContain("See all posts");
  });

  test("on its blog's own page, a blog list pages through every post", async () => {
    const blog = PageId.make("pg_news");
    const first = await listOn({ collection: news, count: 1 }, { page: blog, number: 1 });
    expect(first).toContain("Meet this year&#x27;s mentors");
    expect(first).toMatch(/href="\/news\?page=2" rel="next">Older posts/);
    expect(first).not.toContain("Newer posts");
    expect(first).not.toContain("See all posts");
    const second = await listOn({ collection: news, count: 1 }, { page: blog, number: 2 });
    expect(second).toContain("Dates for this summer are out");
    expect(second).not.toContain("Meet this year&#x27;s mentors");
    expect(second).toMatch(/href="\/news" rel="prev">Newer posts/);
    expect(second).not.toContain("Older posts");
  });

  test("a new blog list shows the sample posts until it's pointed at a blog", async () => {
    const html = await listOn(
      { collection: { $ref: "page", id: placeholderCollection }, count: 6 },
      null,
      "cards",
    );
    expect(html).toContain("Our plans for the year ahead");
    expect(html).toContain("data:image/svg+xml,");
  });

  test("a post header shows the post's title, date, author and cover from its settings", async () => {
    const block = await load("post-header", 2);
    const result = renderProps(block, {}, "cover");
    if (!result.ok) throw new Error(result.problem);
    const html = renderToStaticMarkup(
      <SiteDataProvider
        value={{ ...site, current: { page: PageId.make("pg_mentors"), number: 1 } }}
      >
        {result.element}
      </SiteDataProvider>,
    );
    expect(html).toContain(">Meet this year&#x27;s mentors</h1>");
    expect(html).toContain('<time dateTime="2027-04-15">15 April 2027</time>');
    expect(html).toContain(">Sam Okafor</span>");
    expect(html).toContain('src="/_media/med_harbour"');
    expect(html).toContain('alt="Boats moored in a calm harbour"');
  });

  test("off a post, a post header shows a sample post", async () => {
    const block = await load("post-header", 2);
    const result = renderProps(block, {}, "simple");
    if (!result.ok) throw new Error(result.problem);
    expect(markup(result.element)).toContain(">Our plans for the year ahead</h1>");
  });
});

describe("drafts are checked against the block version's limits", () => {
  test("optional fields may be left out and required ones may not", async () => {
    const cta = await newest("call-to-action");
    expect(renderProps(cta, { heading: "Places are limited", actions: [] }, "centered").ok).toBe(
      true,
    );
    expect(renderProps(cta, { heading: "Places are limited" }, "centered").ok).toBe(false);
  });

  test("maximum lengths and single lines apply, minimum lengths don't", async () => {
    const hero = await newest("hero");
    const lists = { actions: [], points: [] };
    expect(renderProps(hero, { ...lists, heading: "x".repeat(91) }, "stacked").ok).toBe(false);
    expect(renderProps(hero, { ...lists, heading: "Two\nlines" }, "stacked").ok).toBe(false);
    expect(renderProps(hero, { ...lists, heading: "" }, "stacked").ok).toBe(true);
  });

  test("rich text allows only the field's marks and nodes, and safe links", async () => {
    const hero = await newest("hero");
    const lists = { actions: [], points: [] };
    const body = (content: ReadonlyArray<Json>) => ({ type: "doc", content });
    const heading = {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Hi" }],
    };
    const result = renderProps(
      hero,
      { ...lists, heading: "Welcome", body: body([heading]) },
      "stacked",
    );
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
    expect(
      renderProps(hero, { ...lists, heading: "Welcome", body: body([script]) }, "stacked").ok,
    ).toBe(false);
  });

  test("variants and surfaces must be the block's own", async () => {
    const hero = await newest("hero");
    expect(renderProps(hero, { heading: "Welcome", actions: [], points: [] }, "sideways").ok).toBe(
      false,
    );
    const item = await newest("feature-item");
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
    const gallery = await newest("gallery");
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
    const complete = completes(await newest("hero"));
    const lists = { actions: [], points: [] };
    expect(complete({ ...lists, heading: "Learn by building" })).toBe(true);
    expect(complete({ ...lists, heading: "" })).toBe(false);
    expect(complete({ ...lists, heading: "Hi" })).toBe(false);
  });

  test("a choice left out reads as its first option", async () => {
    const hero = await newest("hero");
    const decoded = Schema.decodeSync(propsSchema(hero.fields, "complete"))({
      heading: "Learn by building",
      actions: [],
      points: [],
    });
    expect(decoded).toMatchObject({ align: "center", frame: "plain", backdrop: "none" });
  });

  test("images need alt text, which may be empty for a decorative image", async () => {
    const complete = completes(await newest("split"));
    const props = (image: Json) => ({
      heading: "Afternoons on the water",
      points: [],
      actions: [],
      image,
    });
    expect(complete(props({ $ref: "media", id: "med_harbour", alt: "" }))).toBe(true);
    expect(complete(props({ $ref: "media", id: "med_harbour" }))).toBe(false);
  });

  test("required rich text needs some text", async () => {
    const complete = completes(await newest("rich-text"));
    expect(complete({ body: { type: "doc", content: [{ type: "paragraph" }] } })).toBe(false);
  });

  test("a list needs its minimum number of items", async () => {
    const complete = completes(await newest("gallery"));
    expect(complete({ images: [] })).toBe(false);
  });
});

const contracts = await loadBlocks(latestLockfile);

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
    const blocks = [...ids(placed("feature-grid")), ...ids(placed("feature-grid"))];
    expect(new Set(blocks).size).toBe(blocks.length);
    const images = [placed("gallery"), placed("gallery")].flatMap((tree) =>
      itemIds(tree.props["images"]),
    );
    expect(images.length).toBeGreaterThan(0);
    expect(new Set(images).size).toBe(images.length);
  });

  test("every field of a new block holds placeholder content, settings aside", () => {
    const hero = placed("hero");
    const [first, second] = itemIds(hero.props["actions"]);
    expect(placeholderPaths(contracts, hero)).toEqual([
      ["kicker"],
      ["heading"],
      ["body"],
      ["actions", first, "button"],
      ["actions", second, "button"],
      ["image"],
    ]);
  });

  test("a field stops being a placeholder once it's changed", () => {
    const hero = placed("hero");
    const edited = {
      ...hero,
      props: { ...hero.props, heading: "Summer school at the harbour" },
    };
    expect(placeholderPaths(contracts, edited)).not.toContainEqual(["heading"]);
    expect(placeholderPaths(contracts, edited)).toContainEqual(["body"]);
  });

  test("a button is a placeholder while its link is, even after its label changes", () => {
    const hero = placed("hero");
    const [first] = itemIds(hero.props["actions"]);
    const withButton = (button: Json) => ({
      ...hero,
      props: { ...hero.props, actions: [{ id: first ?? "", button }] },
    });
    expect(
      placeholderPaths(contracts, withButton({ label: "Register", link: "https://example.com" })),
    ).toContainEqual(["actions", first, "button"]);
    expect(
      placeholderPaths(
        contracts,
        withButton({ label: "Find out more", link: "https://example.org" }),
      ),
    ).not.toContainEqual(["actions", first, "button"]);
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
      pages: listingsOf(fixtureSite.pages),
      identity: noIdentity,
      forms: {},
      media: () => undefined,
    });
    expect(bare.media(MediaId.make("med_pakshiHills"))?.src).toMatch(/^data:image\/svg\+xml,/);
    expect(bare.form(placeholderForm.id)?.submitLabel).toBe("Send message");
  });
});
