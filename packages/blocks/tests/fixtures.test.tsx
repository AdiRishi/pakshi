import { ItemId } from "@repo/contracts/ids";
import { MediaRef } from "@repo/contracts/references";
import { Schema } from "effect";
import type { Json } from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { SiteDataProvider } from "../src/components.tsx";
import { propsSchema } from "../src/fields.ts";
import { blockSamples, blockShowcase, placeholderItem, showcaseMediaSrc } from "../src/fixtures.ts";
import { presentationOf } from "../src/presentation.ts";
import { latestLockfile, loadBlocks, renderPage, renderTree } from "../src/render.tsx";

const newest = await loadBlocks(latestLockfile);
const types = Array.from(newest.keys());

const isMediaRef = Schema.is(MediaRef);
const isJsonArray = Schema.is(Schema.Array(Schema.Json));
const isJsonObject = Schema.is(Schema.JsonObject);

/** Every image a value places, however deep. */
const imagesIn = (value: Json): ReadonlyArray<MediaRef> =>
  isMediaRef(value)
    ? [value]
    : isJsonArray(value)
      ? value.flatMap(imagesIn)
      : isJsonObject(value)
        ? Object.values(value).flatMap(imagesIn)
        : [];

/** The page a section's or item's showcase puts it on. */
const showcasePage = (showcase: ReturnType<typeof blockShowcase>) => {
  const page = showcase.target === "site" ? undefined : showcase.draft.pages[showcase.target];
  if (page === undefined) throw new Error("This showcase isn't on a page.");
  return page;
};

test("every block type has a sample, and every sample is a block type's", () => {
  expect(new Set(blockSamples.keys())).toEqual(new Set(types));
});

test.each(types)("%s's sample is complete content for its newest version", (type) => {
  const block = newest.get(type);
  const sample = blockSamples.get(type);
  expect(block?.variants).toContain(sample?.variant);
  expect(() =>
    Schema.decodeSync(propsSchema(block?.fields ?? {}, "complete"))(sample?.props),
  ).not.toThrow();
  for (const [slot, items] of Object.entries(sample?.slots ?? {}))
    for (const item of items) {
      expect(block?.placement === "section" && block.slots[slot]?.accepts).toContain(item.type);
      expect(() =>
        Schema.decodeSync(propsSchema(newest.get(item.type)?.fields ?? {}, "complete"))(item.props),
      ).not.toThrow();
    }
});

test.each(types)("%s's sample has what each of its layouts needs", (type) => {
  const sample = blockSamples.get(type);
  const needed = Object.values(presentationOf(type).needs).flat();
  expect(needed.filter((name) => sample?.props[name] === undefined)).toEqual([]);
});

test.each(types)("%s's showcase renders in every layout, with every image it places", (type) => {
  const showcase = blockShowcase(newest, type);
  for (const variant of newest.get(showcase.tree.type)?.variants ?? []) {
    const markup = renderToStaticMarkup(
      <SiteDataProvider value={showcase.data}>
        {renderTree(newest, { ...showcase.tree, variant })}
      </SiteDataProvider>,
    );
    expect(markup).not.toBe("");
  }
  const holder =
    showcase.target === "site" ? showcase.draft.parts : showcase.draft.pages[showcase.target];
  const placed = Object.values(holder?.blocks ?? {}).flatMap((block) => imagesIn(block.props));
  const library = showcase.media.map((file) => file.id);
  expect(placed.filter((image) => showcase.data.media(image.id) === undefined)).toEqual([]);
  expect(library).toEqual(expect.arrayContaining(placed.map((image) => image.id)));
  for (const image of placed) expect(showcaseMediaSrc(image.id)).toMatch(/^data:image\/svg\+xml,/);
});

test("a section's showcase holds the section alone, between the sample header and footer", async () => {
  const showcase = blockShowcase(newest, "faq");
  const page = showcasePage(showcase);
  expect(page.root).toEqual([showcase.tree.id]);
  expect(page.blocks[showcase.tree.id]?.type).toBe("faq");
  const rendered = await renderPage(page, showcase.draft.parts, showcase.draft.lockfile);
  const markup = renderToStaticMarkup(
    <SiteDataProvider value={showcase.data}>
      {rendered.header}
      {rendered.sections}
      {rendered.footer}
    </SiteDataProvider>,
  );
  expect(markup).toContain("Questions from parents");
  expect(markup).toContain("Harbour Summer School");
});

test("an item's showcase shows it in the section that holds it", () => {
  const showcase = blockShowcase(newest, "team-member");
  const page = showcasePage(showcase);
  const section = page.blocks[showcase.tree.id];
  expect(section?.type).toBe("team-grid");
  const people = Object.values(section?.slots ?? {}).flat();
  expect(people.length).toBeGreaterThan(0);
  for (const id of people) expect(page.blocks[id]?.type).toBe("team-member");
});

test("a header's showcase is the site's header, on a page with nothing else", () => {
  const showcase = blockShowcase(newest, "header");
  expect(showcase.target).toBe("site");
  expect(showcase.draft.parts.header).toBe(showcase.tree.id);
  expect(Object.values(showcase.draft.pages).every((page) => page.root.length === 0)).toBe(true);
});

test("a new list item copies the sample's item at that place, with an ID of its own", () => {
  const faq = newest.get("faq");
  if (faq === undefined) throw new Error("faq isn't in the registry.");
  const questions = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ id: ItemId, question: Schema.String })),
  )(blockSamples.get("faq")?.props["questions"]);
  const first = Schema.decodeUnknownSync(Schema.Struct({ id: ItemId, question: Schema.String }))(
    placeholderItem(faq, "questions", 0),
  );
  expect(first.question).toBe(questions[0]?.question);
  expect(questions.map((question) => question.id)).not.toContain(first.id);
  const again = Schema.decodeUnknownSync(Schema.Struct({ id: ItemId, question: Schema.String }))(
    placeholderItem(faq, "questions", questions.length),
  );
  expect(again.question).toBe(first.question);
  expect(again.id).not.toBe(first.id);
});
