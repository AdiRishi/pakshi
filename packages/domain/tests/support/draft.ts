import { loadBlocks } from "@repo/blocks";
import { noIdentity } from "@repo/contracts/brand";
import { Draft } from "@repo/contracts/draft";
import { resolveTheme } from "@repo/tokens";
import { Schema } from "effect";

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

/**
 * A draft of the Harbour site: a home page with a hero, a feature grid with
 * two items and a gallery, an about page, and a post.
 */
export const harbourDraft: Draft = Schema.decodeSync(Draft)({
  id: "dr_harbour",
  site: "site_harbour",
  base: { release: "rel_sample1", snapshot: "snap_sample1" },
  revision: 0,
  parts: {
    header: "b_header",
    footer: "b_footer",
    blocks: {
      b_header: { type: "header", variant: "simple", surface: "default", props: {} },
      b_footer: { type: "footer", variant: "simple", surface: "muted", props: {} },
    },
    menus: { main: [], footer: [] },
  },
  forms: {},
  lockfile: Object.fromEntries(
    [
      "call-to-action",
      "feature-grid",
      "feature-item",
      "footer",
      "form-section",
      "gallery",
      "header",
      "hero",
      "post-list",
      "rich-text",
      "split",
    ].map((type) => [type, 1]),
  ),
  brand: {
    brand: "brand_harbour",
    number: 1,
    theme: resolveTheme({ preset: "editorial", changes: {} }).theme,
    identity: noIdentity,
  },
  pages: {
    pg_home: {
      schema: "pakshi.page/1",
      id: "pg_home",
      type: "page",
      path: "/",
      meta: { title: "Harbour Summer School", description: "Five days at the harbour." },
      root: ["b_hero", "b_features", "b_gallery"],
      blocks: {
        b_hero: {
          type: "hero",
          variant: "centered",
          surface: "brand",
          props: {
            heading: "Learn by building",
            body: paragraph("Five days of workshops."),
            cta: { label: "Register", link: "https://example.org/register" },
          },
        },
        b_features: {
          type: "feature-grid",
          variant: "three-columns",
          surface: "default",
          props: { heading: "What's included" },
          slots: { items: ["b_workshops", "b_mentors"] },
        },
        b_workshops: {
          type: "feature-item",
          variant: "default",
          props: { title: "Workshops", body: "Two a day." },
        },
        b_mentors: {
          type: "feature-item",
          variant: "default",
          props: { title: "Mentors", body: "One for every six students." },
        },
        b_gallery: {
          type: "gallery",
          variant: "grid",
          surface: "default",
          props: {
            images: [
              { id: "it_boats", image: { $ref: "media", id: "med_harbour", alt: "Boats" } },
              { id: "it_quay", image: { $ref: "media", id: "med_harbour" }, caption: "The quay" },
            ],
          },
        },
      },
    },
    pg_about: {
      schema: "pakshi.page/1",
      id: "pg_about",
      type: "page",
      path: "/about",
      meta: { title: "About", description: "Who runs summer school." },
      root: ["b_story"],
      blocks: {
        b_story: {
          type: "feature-grid",
          variant: "two-columns",
          surface: "muted",
          props: { heading: "Our story" },
          slots: { items: [] },
        },
      },
    },
    pg_dates: {
      schema: "pakshi.page/1",
      id: "pg_dates",
      type: "post",
      path: "/news/dates",
      meta: {
        title: "Dates announced",
        description: "Summer school runs in July.",
        date: "2027-03-02",
        author: "Meera Kapoor",
        tags: ["dates"],
        excerpt: "Summer school runs in the first two weeks of July.",
      },
      root: [],
      blocks: {},
    },
  },
});

export const contracts = await loadBlocks(harbourDraft.lockfile);
