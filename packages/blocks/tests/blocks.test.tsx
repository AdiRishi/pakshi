import { readFile } from "node:fs/promises";

import type { Json } from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { registrySource } from "../scripts/generate-registry.ts";
import { ReferencesProvider } from "../src/components.tsx";
import { registry } from "../src/registry.gen.ts";
import { blockKey } from "../src/render.tsx";
import { blockFixtures, fixtureReferences } from "./support/fixtures.ts";

const fixtures = await blockFixtures();

const load = async (type: string, version: number) => {
  const entry = registry[blockKey(type, version)];
  if (entry === undefined) throw new Error(`${type}@${version} is not registered`);
  return (await entry()).default;
};

const markup = (element: React.ReactElement) =>
  renderToStaticMarkup(
    <ReferencesProvider value={fixtureReferences}>{element}</ReferencesProvider>,
  );

test("the generated registry lists every block version folder", async () => {
  expect(await readFile(new URL("../src/registry.gen.ts", import.meta.url), "utf8")).toBe(
    await registrySource(),
  );
});

test("every block version has fixtures", () => {
  const covered = new Set(fixtures.map(([type, version]) => blockKey(type, version)));
  expect(covered).toEqual(new Set(Object.keys(registry)));
});

describe.each(fixtures)("%s v%i fixture %s", (type, version, _name, fixture) => {
  test("renders", async () => {
    const block = await load(type, version);
    const result = block.render(fixture.props, fixture.variant, fixture.surface);
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain(`<section data-surface="${fixture.surface}"`);
  });
});

describe("field components", () => {
  test("render plain markup, with page links following the page's address", async () => {
    const hero = await load("hero", 1);
    const result = hero.render(
      {
        heading: "Learn by building",
        image: { $ref: "media", id: "med_harbour" },
        cta: { label: "See the programme", link: { $ref: "page", id: "pg_programme" } },
      },
      "split-image",
      "default",
    );
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain(">Learn by building</h1>");
    expect(html).toContain('alt="Boats moored in a calm harbour"');
    expect(html).toContain('href="/programme"');
    expect(html).not.toContain("field");
  });

  test("render rich text with the field's extensions", async () => {
    const [, , , fixture] = fixtures.find(([type]) => type === "rich-text") ?? [];
    const block = await load("rich-text", 1);
    const result = block.render(fixture?.props ?? {}, "narrow", "default");
    if (!result.ok) throw new Error(result.problem);
    const html = markup(result.element);
    expect(html).toContain("<em>small teams</em>");
    expect(html).toContain("<h3>Bring with you</h3>");
    expect(html).toContain('<a href="https://example.org/faq">frequently asked questions</a>');
  });
});

describe("props are checked against the block version", () => {
  test("optional fields may be left out and required ones may not", async () => {
    const cta = await load("call-to-action", 1);
    const primary = { label: "Register", link: "https://example.org" };
    expect(cta.render({ heading: "Places are limited", primary }, "banner", "muted").ok).toBe(true);
    expect(cta.render({ heading: "Places are limited" }, "banner", "muted").ok).toBe(false);
  });

  test("text limits apply", async () => {
    const hero = await load("hero", 1);
    expect(hero.render({ heading: "x".repeat(81) }, "centered", "brand").ok).toBe(false);
    expect(hero.render({ heading: "Two\nlines" }, "centered", "brand").ok).toBe(false);
  });

  test("rich text allows only the field's marks and nodes", async () => {
    const hero = await load("hero", 1);
    const body = (content: ReadonlyArray<Json>) => ({ type: "doc", content });
    const heading = {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Hi" }],
    };
    const result = hero.render({ heading: "Welcome", body: body([heading]) }, "centered", "brand");
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
    expect(hero.render({ heading: "Welcome", body: body([script]) }, "centered", "brand").ok).toBe(
      false,
    );
  });

  test("variants and surfaces must be the block's own", async () => {
    const hero = await load("hero", 1);
    expect(hero.render({ heading: "Welcome" }, "sideways", "brand").ok).toBe(false);
  });
});
