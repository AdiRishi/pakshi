import { expect, test } from "vitest";

import type { BlockDefinition } from "../src/block.tsx";
import { fieldAt, type Fields } from "../src/fields.ts";
import { galleryBlocks, presentationOf, presentations } from "../src/presentation.ts";
import { latestLockfile, loadBlock, loadBlocks, registeredVersions } from "../src/render.tsx";

/*
 * Presentations are written against each type's newest version, which the
 * compiler checks. These catch one written against an older version, or a
 * new version that drops or adds something its presentation names.
 */

const newest = await loadBlocks(latestLockfile);
const latest = Array.from(newest.values(), (block) => [block.type, block] as const);

/** The field a presentation path such as `questions.answer` names. */
const fieldOf = (fields: Fields, path: string) => {
  const [name = "", item] = path.split(".");
  const field = fields[name];
  if (item === undefined || field === undefined) return field;
  return field.kind === "list" ? fieldAt(field.item, [item]) : undefined;
};

const listsOf = (block: BlockDefinition) =>
  Object.entries(block.fields).flatMap(([name, field]) =>
    field.kind === "list" ? [[name, field] as const] : [],
  );

test("every block type has a presentation, and every presentation is a block type's", () => {
  expect(new Set(presentations.keys())).toEqual(new Set(Object.keys(latestLockfile)));
});

test.each(latest)(
  "%s's presentation labels its newest version's layouts and no others",
  (type, block) => {
    expect(Object.keys(presentationOf(type).variants).toSorted()).toEqual(
      block.variants.toSorted(),
    );
  },
);

test.each(registeredVersions.map(({ type, version }) => [`${type}@${version}`, type, version]))(
  "every layout of %s has a label",
  async (_key, type, version) => {
    const block = await loadBlock(type, { [type]: version });
    expect(Object.keys(presentationOf(type).variants)).toEqual(
      expect.arrayContaining([...block.variants]),
    );
  },
);

test.each(latest)("%s's presentation names the items of each of its lists", (type, block) => {
  const lists = listsOf(block);
  const named = presentationOf(type).lists;
  expect(Object.keys(named).toSorted()).toEqual(lists.map(([name]) => name).toSorted());
  expect(
    lists.filter(([name, field]) => field.item[named[name]?.titleField ?? ""] === undefined),
  ).toEqual([]);
});

test.each(latest)("%s's labels, hints and layouts' needs name its fields", (type, block) => {
  const presentation = presentationOf(type);
  expect(
    Object.keys(presentation.fields).filter((path) => fieldOf(block.fields, path) === undefined),
  ).toEqual([]);
  expect(block.variants).toEqual(expect.arrayContaining(Object.keys(presentation.needs)));
  const needed = Object.values(presentation.needs).flat();
  expect(needed.filter((name) => block.fields[name]?.optional !== true)).toEqual([]);
});

test("a presentation's names and labels become the contract's titles", () => {
  const hero = newest.get("hero");
  expect(hero?.title).toBe(presentationOf("hero").name);
  expect(hero?.fields["image"]?.title).toBe("Photo");
  expect(newest.get("timeline")?.fields["entries"]).toMatchObject({
    title: "Steps",
    item: { when: { title: "Time or day" } },
  });
});

test.each(latest.filter(([, block]) => block.placement === "item"))(
  "%s says how sections name it, and has no place in the gallery",
  (type, block) => {
    const presentation = presentationOf(type);
    expect(presentation.order).toBeNull();
    expect(block.fields[presentation.item?.titleField ?? ""]).toBeDefined();
  },
);

test.each(latest.filter(([, block]) => block.placement !== "item"))(
  "%s has a place in the gallery",
  (type) => {
    expect(presentationOf(type)).toMatchObject({ item: null, order: expect.any(Number) });
  },
);

test("the gallery runs the way a page does, from header to footer", () => {
  const types = galleryBlocks.map((block) => block.type);
  expect(types.at(0)).toBe("header");
  expect(types.at(-1)).toBe("footer");
  expect(new Set(galleryBlocks.map((block) => block.order)).size).toBe(galleryBlocks.length);
});
