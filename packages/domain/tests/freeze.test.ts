import type { Draft } from "@repo/contracts/draft";
import { FormId, MenuItemId, PageId } from "@repo/contracts/ids";
import { Op } from "@repo/contracts/ops";
import { SnapshotManifest } from "@repo/contracts/snapshot";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { applyOps } from "../src/document.ts";
import { freeze } from "../src/freeze.ts";
import { contracts, harbourDraft } from "./support/draft.ts";

const edit = (draft: Draft, ops: ReadonlyArray<typeof Op.Encoded>) => {
  const applied = applyOps(draft, Schema.decodeSync(Schema.Array(Op))(ops), contracts);
  if (!applied.ok) throw new Error(JSON.stringify(applied.errors));
  return applied.draft;
};

/** The harbour draft with its one incomplete field filled in: alt text for the quay photo. */
const complete = edit(harbourDraft, [
  {
    op: "setProp",
    target: "pg_home",
    block: "b_gallery",
    path: ["images", "it_quay", "image", "alt"],
    value: "The quay at dawn",
  },
]);

const nothingLive: Pick<SnapshotManifest, "pages" | "gone"> = { pages: [], gone: [] };

/** What the checks found in a draft, or nothing when it freezes. */
const issuesIn = (draft: Draft, notified: ReadonlySet<FormId> = new Set()) => {
  const result = freeze(draft, contracts, nothingLive, notified);
  return result.ok ? [] : result.issues;
};

const about = complete.pages[PageId.make("pg_about")];
if (about === undefined) throw new Error("The harbour draft has an about page.");

describe("freezing", () => {
  test("lists every incomplete field, naming list items by ID and parts by their field", () => {
    const draft = edit(harbourDraft, [
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: "" },
    ]);
    const result = freeze(draft, contracts, nothingLive, new Set());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      expect.objectContaining({
        _tag: "Incomplete",
        place: { target: "pg_home", title: "Harbour Summer School" },
        block: { id: "b_hero", title: "Hero" },
        path: ["heading"],
        field: "Heading",
      }),
      expect.objectContaining({
        block: { id: "b_gallery", title: "Gallery" },
        path: ["images", "it_quay", "image", "alt"],
        field: "Photo alt text",
        message: "Fill this in",
      }),
    ]);
  });

  test("leaves unpublished pages out, and answers gone at addresses no page serves now", () => {
    const unpublished: Draft = {
      ...complete,
      pages: Object.fromEntries(
        Object.values(complete.pages).map((page) => [
          page.id,
          page.id === "pg_about" ? { ...page, status: "unpublished" } : page,
        ]),
      ),
    };
    const previous = Schema.decodeSync(
      Schema.Struct({ pages: SnapshotManifest.fields.pages, gone: SnapshotManifest.fields.gone }),
    )({
      pages: [
        {
          id: "pg_about",
          path: "/about",
          type: "page",
          meta: { title: "About", description: "" },
          object: "a".repeat(64),
        },
      ],
      gone: ["/old-programme", "/news/dates"],
    });
    const result = freeze(unpublished, contracts, previous, new Set());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.frozen.pages.map((page) => page.document.id).toSorted()).toEqual([
      "pg_dates",
      "pg_home",
      "pg_news",
    ]);
    expect(result.frozen.gone.toSorted()).toEqual(["/about", "/old-programme"]);
  });

  test("an unpublished blog takes its posts off the site, and their addresses answer gone", () => {
    const draft = edit(complete, [{ op: "setStatus", page: "pg_news", status: "unpublished" }]);
    const previous = Schema.decodeSync(
      Schema.Struct({ pages: SnapshotManifest.fields.pages, gone: SnapshotManifest.fields.gone }),
    )({
      pages: [
        {
          id: "pg_dates",
          path: "/news/dates",
          type: "entry",
          kind: "blog",
          collection: "pg_news",
          meta: {
            title: "Dates announced",
            description: "Summer school runs in July.",
            date: "2027-03-02",
            author: "Meera Kapoor",
            tags: [],
            excerpt: "",
          },
          object: "a".repeat(64),
        },
      ],
      gone: [],
    });
    const result = freeze(draft, contracts, previous, new Set());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.frozen.pages.map((page) => page.document.id).toSorted()).toEqual([
      "pg_about",
      "pg_home",
    ]);
    expect(result.frozen.gone).toEqual(["/news/dates"]);
  });

  test("lists the library images the snapshot shows", () => {
    const result = freeze(complete, contracts, nothingLive, new Set());
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.frozen.media).toEqual(["med_harbour"]);
  });

  test("lists content that is still a block's placeholder", () => {
    const draft = edit(complete, [
      {
        op: "setProp",
        target: "pg_home",
        block: "b_hero",
        path: ["heading"],
        value: "Start with the one thing people should know",
      },
    ]);
    expect(issuesIn(draft)).toEqual([
      {
        _tag: "Placeholder",
        place: { target: "pg_home", title: "Harbour Summer School" },
        block: { id: "b_hero", title: "Hero" },
        path: ["heading"],
        field: "Heading",
      },
    ]);
  });

  test("lists pages without a title or description", () => {
    const draft = edit(complete, [
      { op: "setMeta", page: "pg_about", field: "description", value: " " },
    ]);
    expect(issuesIn(draft)).toEqual([
      { _tag: "MissingMeta", place: { target: "pg_about", title: "About" }, field: "description" },
    ]);
  });

  test("lists links to pages that aren't served, from blocks and menus", () => {
    const draft = edit(complete, [
      {
        op: "setProp",
        target: "pg_home",
        block: "b_hero",
        path: ["cta", "link"],
        value: { $ref: "page", id: "pg_missing" },
      },
    ]);
    const withMenu: Draft = {
      ...draft,
      pages: { ...draft.pages, [about.id]: { ...about, status: "unpublished" } },
      parts: {
        ...draft.parts,
        menus: {
          main: [
            {
              id: MenuItemId.make("mi_about"),
              label: "About",
              target: { $ref: "page", id: PageId.make("pg_about") },
            },
          ],
          footer: [],
        },
      },
    };
    expect(issuesIn(withMenu)).toEqual([
      {
        _tag: "BrokenLink",
        place: { target: "pg_home", title: "Harbour Summer School" },
        block: { id: "b_hero", title: "Hero" },
        field: "Button",
        page: "pg_missing",
      },
      {
        _tag: "BrokenLink",
        place: { target: "site", title: "Main menu" },
        block: null,
        field: "About",
        page: "pg_about",
      },
    ]);
  });

  test("needs somewhere to send a served form's entries, and required consent when it asks for an email", () => {
    const visit = FormId.make("frm_visit");
    const withForm = edit(complete, [
      {
        op: "insertBlock",
        page: "pg_home",
        list: "root",
        after: null,
        block: {
          id: "b_visit",
          type: "form-section",
          variant: "card",
          surface: "default",
          props: { heading: "Plan a visit", form: { $ref: "form", id: "frm_visit" } },
        },
      },
    ]);
    expect(issuesIn(withForm)).toEqual([
      { _tag: "NoFormEmails", form: visit, name: "Plan a visit" },
      { _tag: "MissingConsent", form: visit, name: "Plan a visit" },
    ]);
    const withConsent = (required: boolean) =>
      edit(withForm, [
        {
          op: "setForm",
          form: {
            id: "frm_visit",
            name: "Plan a visit",
            submitLabel: "Send",
            fields: [
              { kind: "email", id: "ff_email", label: "Email", required: true },
              {
                kind: "checkbox",
                id: "ff_consent",
                label: "I agree to the privacy policy",
                required,
                link: { $ref: "page", id: "pg_about" },
              },
            ],
          },
        },
      ]);
    expect(issuesIn(withConsent(false), new Set([visit]))).toEqual([
      { _tag: "MissingConsent", form: visit, name: "Plan a visit" },
    ]);
    expect(issuesIn(withConsent(true), new Set([visit]))).toEqual([]);
  });

  test("lists links that show no text, from rich text and menus, and form fields without a label", () => {
    const visit = FormId.make("frm_visit");
    const draft = edit(complete, [
      {
        op: "setProp",
        target: "pg_home",
        block: "b_hero",
        path: ["body"],
        value: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Read the " },
                {
                  type: "text",
                  text: "guide",
                  marks: [{ type: "link", attrs: { href: "https://example.org/guide" } }],
                },
                {
                  type: "text",
                  text: " ",
                  marks: [{ type: "link", attrs: { href: "https://example.org/map" } }],
                },
              ],
            },
          ],
        },
      },
      {
        op: "insertBlock",
        page: "pg_home",
        list: "root",
        after: null,
        block: {
          id: "b_visit",
          type: "form-section",
          variant: "card",
          surface: "default",
          props: { heading: "Plan a visit", form: { $ref: "form", id: "frm_visit" } },
        },
      },
      {
        op: "setForm",
        form: {
          id: "frm_visit",
          name: "Plan a visit",
          submitLabel: "Send",
          fields: [
            { kind: "shortText", id: "ff_name", label: "Your name", required: true },
            { kind: "longText", id: "ff_notes", label: "  ", required: false },
          ],
        },
      },
    ]);
    const withMenu: Draft = {
      ...draft,
      parts: {
        ...draft.parts,
        menus: {
          main: [
            {
              id: MenuItemId.make("mi_about"),
              label: "",
              target: { $ref: "page", id: PageId.make("pg_about") },
            },
          ],
          footer: [],
        },
      },
    };
    expect(issuesIn(withMenu, new Set([visit]))).toEqual([
      {
        _tag: "LinkWithoutText",
        place: { target: "pg_home", title: "Harbour Summer School" },
        block: { id: "b_hero", title: "Hero" },
        path: ["body"],
        field: "Text",
      },
      {
        _tag: "LinkWithoutText",
        place: { target: "site", title: "Main menu" },
        block: null,
        path: [],
        field: "Main menu",
      },
      { _tag: "UnlabelledField", form: visit, name: "Plan a visit", field: "ff_notes" },
    ]);
  });

  test("lists a redirect to a page that isn't served as a broken link", () => {
    const draft = edit(complete, [
      { op: "setStatus", page: "pg_about", status: "unpublished" },
      { op: "setRedirect", from: "/old-about", to: { $ref: "page", id: "pg_about" } },
    ]);
    expect(issuesIn(draft)).toContainEqual(
      expect.objectContaining({ _tag: "BrokenLink", field: "/old-about", page: "pg_about" }),
    );
  });
});
