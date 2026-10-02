import { noIdentity } from "@repo/contracts/brand";
import { Draft } from "@repo/contracts/draft";
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
      b_header: { type: "header", variant: "simple", surface: "default", props: {} },
      b_footer: { type: "footer", variant: "simple", surface: "muted", props: {} },
    },
    menus: { main: [], footer: [] },
  },
  forms: {},
  redirects: {},
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
          variant: "centered",
          surface: "brand",
          props: {
            heading: "Learn by building",
            body: paragraph("Five days of workshops."),
            image: { $ref: "media", id: "med_harbour", alt: "Boats in the harbour" },
            cta: { label: "Register", link: "https://harbour.example/register" },
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
          variant: "centered",
          surface: "brand",
          props: {
            heading: "Learn by building",
            body: paragraph("Five days of workshops."),
            image: { $ref: "media", id: "med_harbour" },
            cta: { label: "Register", link: "https://harbour.example/register" },
          },
        },
        b_visit: {
          type: "split",
          variant: "image-right",
          surface: "default",
          props: {
            heading: "Visit the yard",
            body: paragraph("Open daily."),
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
