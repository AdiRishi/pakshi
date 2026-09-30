import { Draft } from "@repo/contracts/draft";
import { harbour } from "@repo/tokens";
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
  settings: { name: "Harbour Summer School" },
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
  theme: harbour,
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
          variant: "centered",
          surface: "brand",
          props: {
            heading: "Learn by building",
            body: paragraph("Five days of workshops."),
            image: { $ref: "media", id: "med_harbour", alt: "Boats in the harbour" },
          },
        },
        b_about: {
          type: "rich-text",
          variant: "narrow",
          surface: "default",
          props: { heading: "About", body: paragraph("We build boats.") },
        },
      },
    },
  },
});
