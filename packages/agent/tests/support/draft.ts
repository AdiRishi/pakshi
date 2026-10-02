import { latestLockfile } from "@repo/blocks";
import { placeholderCollection } from "@repo/blocks/placeholders";
import { noIdentity } from "@repo/contracts/brand";
import { Draft } from "@repo/contracts/draft";
import type { PageDocument } from "@repo/contracts/page";
import { defaultTheme, resolveTheme } from "@repo/tokens";
import { Schema } from "effect";

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/** A draft of the Harbour site: a home page with a hero and some writing, and every block the library has. */
export const harbourDraft: Draft = Schema.decodeSync(Draft)({
  id: "dr_harbour",
  site: "site_harbour",
  base: { release: "rel_sample1", snapshot: "snap_sample1" },
  revision: 0,
  parts: {
    header: "b_header",
    footer: "b_footer",
    blocks: {
      b_header: { type: "header", variant: "standard", surface: "default", props: {} },
      b_footer: { type: "footer", variant: "simple", surface: "muted", props: {} },
    },
    menus: { main: [], footer: [] },
  },
  forms: {},
  redirects: {},
  lockfile: latestLockfile,
  brand: {
    brand: "brand_harbour",
    number: 1,
    theme: resolveTheme(defaultTheme).theme,
    identity: noIdentity,
  },
  pages: {
    pg_home: {
      schema: "pakshi.page/1",
      id: "pg_home",
      type: "page",
      path: "/",
      meta: { title: "Harbour Summer School", description: "Five days at the harbour." },
      root: ["b_hero", "b_about"],
      blocks: {
        b_hero: {
          type: "hero",
          variant: "stacked",
          surface: "brand",
          props: {
            heading: "Learn by building",
            body: paragraph("Five days of workshops."),
            image: { $ref: "media", id: "med_harbour", alt: "Boats in the harbour" },
            actions: [
              {
                id: "it_register",
                button: { label: "Register", link: "https://harbour.example/register" },
              },
            ],
            points: [],
          },
        },
        b_about: {
          type: "rich-text",
          variant: "article",
          surface: "default",
          props: { heading: "About", body: paragraph("We build boats.") },
        },
      },
    },
  },
});

/**
 * The Harbour draft with one of each kind of issue a person meets: a hero
 * image without alt text, a placeholder image, a page without a description,
 * a contact form that asks for an email address and emails no one, and a menu
 * item that links to an unpublished page.
 */
export const draftToFix: Draft = Schema.decodeSync(Draft)({
  ...Schema.encodeSync(Draft)(harbourDraft),
  parts: {
    ...Schema.encodeSync(Draft)(harbourDraft).parts,
    menus: {
      main: [{ id: "mi_old", label: "Old programme", target: { $ref: "page", id: "pg_old" } }],
      footer: [],
    },
  },
  forms: {
    frm_contact: {
      id: "frm_contact",
      name: "Contact",
      fields: [{ kind: "email", id: "ff_email", label: "Email", required: true }],
      submitLabel: "Send",
    },
  },
  pages: {
    pg_home: {
      schema: "pakshi.page/1",
      id: "pg_home",
      type: "page",
      path: "/",
      meta: { title: "Harbour Summer School", description: "" },
      root: ["b_hero", "b_visit", "b_contact"],
      blocks: {
        b_hero: {
          type: "hero",
          variant: "stacked",
          surface: "brand",
          props: {
            heading: "Learn by building",
            body: paragraph("Five days of workshops."),
            image: { $ref: "media", id: "med_harbour" },
            actions: [
              {
                id: "it_register",
                button: { label: "Register", link: "https://harbour.example/register" },
              },
            ],
            points: [],
          },
        },
        b_visit: {
          type: "split",
          variant: "standard",
          surface: "default",
          props: {
            heading: "Visit the yard",
            body: paragraph("Open daily."),
            points: [],
            actions: [],
            image: { $ref: "media", id: "med_pakshiArch", alt: "" },
          },
        },
        b_contact: {
          type: "form-section",
          variant: "card",
          surface: "muted",
          props: {
            heading: "Ask us anything",
            intro: "We reply within a day.",
            points: [],
            form: { $ref: "form", id: "frm_contact" },
          },
        },
      },
    },
    pg_old: {
      schema: "pakshi.page/1",
      id: "pg_old",
      type: "page",
      path: "/old",
      status: "unpublished",
      meta: { title: "Old programme", description: "Last year's workshops." },
      root: [],
      blocks: {},
    },
  },
});

/** A post in the News blog, with no sections yet. */
export const newsPost = (
  id: string,
  slug: string,
  title: string,
  date: string,
): typeof PageDocument.Encoded => ({
  schema: "pakshi.page/1",
  id,
  type: "entry",
  kind: "blog",
  collection: "pg_news",
  slug,
  meta: { title, description: `${title}.`, date, author: "Sam Okafor", tags: [], excerpt: "" },
  root: [],
  blocks: {},
});

/** The Harbour draft with a News blog at /news, listing itself, and two posts. */
export const newsDraft: Draft = Schema.decodeSync(Draft)({
  ...Schema.encodeSync(Draft)(harbourDraft),
  pages: {
    ...Schema.encodeSync(Draft)(harbourDraft).pages,
    pg_news: {
      schema: "pakshi.page/1",
      id: "pg_news",
      type: "collection",
      kind: "blog",
      path: "/news",
      recipe: "blog",
      meta: { title: "News", description: "News from the harbour." },
      root: ["b_newsList"],
      blocks: {
        b_newsList: {
          type: "post-list",
          variant: "list",
          surface: "default",
          props: {
            heading: "News from the harbour",
            collection: { $ref: "page", id: "pg_news" },
            count: 12,
          },
        },
      },
    },
    pg_dates: newsPost("pg_dates", "dates-announced", "Dates announced", "2026-08-01"),
    pg_mentors: newsPost("pg_mentors", "meet-the-mentors", "Meet the mentors", "2026-09-15"),
  },
});

/** The News draft with a list of posts on the home page that still shows the sample posts. */
export const sampleListDraft: Draft = (() => {
  const encoded = Schema.encodeSync(Draft)(newsDraft);
  const home = encoded.pages["pg_home"];
  if (home === undefined) throw new Error("The News draft has no home page.");
  return Schema.decodeSync(Draft)({
    ...encoded,
    pages: {
      ...encoded.pages,
      pg_home: {
        ...home,
        root: [...home.root, "b_latest"],
        blocks: {
          ...home.blocks,
          b_latest: {
            type: "post-list",
            variant: "cards",
            surface: "default",
            props: {
              heading: "The latest from the harbour",
              collection: { $ref: "page", id: placeholderCollection },
              count: 3,
            },
          },
        },
      },
    },
  });
})();
