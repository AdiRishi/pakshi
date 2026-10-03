import { describe, expect, it } from "@effect/vitest";
import type { Draft } from "@repo/contracts/draft";
import { BlockId, FormId, PageId } from "@repo/contracts/ids";
import { freeze } from "@repo/domain/freeze";
import { Effect } from "effect";

import { toolParts } from "./support/chat.ts";
import { draftToFix, harbourDraft, sampleListDraft } from "./support/draft.ts";
import type { Reply } from "./support/model.ts";
import { turnWith } from "./support/turn.ts";

/** Runs a turn on a draft with issues to fix, with the model replying from a script. */
const fixing = (script: ReadonlyArray<Reply>, draft: Draft = draftToFix) =>
  Effect.gen(function* () {
    const turn = yield* turnWith(script, "Fix what the checks found.", { draft });
    const frozen = freeze(turn.state.draft, turn.contracts, { pages: [], gone: [] }, new Set());
    return {
      ...turn,
      left: (frozen.ok ? [] : frozen.issues).map((issue) => issue._tag).toSorted(),
    };
  });

/** What the chat says an edit tool changed, in words. */
const changes = (chat: Parameters<typeof toolParts>[0]) =>
  toolParts(chat, "apply_ops").flatMap((part) =>
    part.type === "tool-call" && part.state === "complete" ? [part.output.change.label] : [],
  );

const site = (...ops: ReadonlyArray<object>) => ({
  calls: [{ name: "apply_ops", params: { page: "site", ops } }],
});

const contact = FormId.make("frm_contact");
const home = PageId.make("pg_home");
const signUp = BlockId.make("b_signup");

/** The Harbour draft with a form section still showing the placeholder form. */
const withPlaceholderForm = (draft: Draft): Draft => {
  const page = draft.pages[home];
  if (page === undefined) return draft;
  return {
    ...draft,
    pages: {
      ...draft.pages,
      [home]: {
        ...page,
        root: [...page.root, signUp],
        blocks: {
          ...page.blocks,
          [signUp]: {
            type: "form-section",
            variant: "card",
            surface: "muted",
            props: {
              heading: "Sign up for the summer school",
              intro: "We'll email you the timetable.",
              points: [],
              form: { $ref: "form", id: "frm_pakshiContact" },
            },
          },
        },
      },
    },
  };
};

describe("fixing what the checks found", () => {
  it.effect("the agent reads every issue with its IDs, and which ones are the person's", () =>
    Effect.gen(function* () {
      const { requests, chat } = yield* fixing([{ calls: [{ name: "check_draft", params: {} }] }]);
      const toModel = JSON.stringify(requests[1]?.messages);
      expect(toModel).toContain("Harbour Summer School (pg_home): no description.");
      expect(toModel).toContain("Only a person can fix this: you can't choose images.");
      const [checked] = toolParts(chat, "check_draft");
      expect(checked?.type === "tool-call" && checked.output.issues).toHaveLength(6);
    }),
  );

  it.effect("adds a consent checkbox to a form, reading the form's fields first", () =>
    Effect.gen(function* () {
      const { state, requests, chat, left } = yield* fixing([
        { calls: [{ name: "get_page", params: { page: "site" } }] },
        site({
          op: "setForm",
          form: {
            id: contact,
            name: "Contact",
            fields: [
              { kind: "email", id: "ff_email", label: "Email", required: true },
              {
                kind: "checkbox",
                id: "ff_consent",
                label: "I agree to the privacy policy",
                required: true,
                link: "https://harbour.example/privacy",
              },
            ],
            submitLabel: "Send",
          },
        }),
      ]);
      expect(JSON.stringify(requests[1]?.messages)).toContain("ff_email");
      expect(left).not.toContain("MissingConsent");
      expect(state.draft.forms[contact]?.fields.map((field) => field.label)).toEqual([
        "Email",
        "I agree to the privacy policy",
      ]);
      expect(changes(chat)).toEqual(["Changed the Contact form"]);
    }),
  );

  it.effect("mends a menu link to an unpublished page by changing the menu", () =>
    Effect.gen(function* () {
      const { state, left } = yield* fixing([
        site({
          op: "setMenu",
          menu: "main",
          items: [{ id: "mi_home", label: "Home", target: { $ref: "page", id: "pg_home" } }],
        }),
      ]);
      expect(left).not.toContain("BrokenLink");
      expect(state.draft.parts.menus.main.map((item) => item.label)).toEqual(["Home"]);
    }),
  );

  it.effect("mends a link to an unpublished page by publishing the page again", () =>
    Effect.gen(function* () {
      const { chat, left } = yield* fixing([
        {
          calls: [
            {
              name: "apply_ops",
              params: { page: "pg_old", ops: [{ op: "setStatus", status: "published" }] },
            },
          ],
        },
      ]);
      expect(left).not.toContain("BrokenLink");
      expect(changes(chat)).toEqual(["Published Old programme again in the draft"]);
    }),
  );

  it.effect("replaces a placeholder form with a form of the draft's own", () =>
    Effect.gen(function* () {
      const { state, requests, left } = yield* fixing(
        [
          { calls: [{ name: "check_draft", params: {} }] },
          {
            calls: [
              {
                name: "apply_ops",
                params: {
                  page: "pg_home",
                  ops: [
                    {
                      op: "setForm",
                      form: {
                        id: "frm_signup",
                        name: "Sign up",
                        fields: [
                          { kind: "shortText", id: "ff_name", label: "Name", required: true },
                        ],
                        submitLabel: "Sign up",
                      },
                    },
                    {
                      op: "setProp",
                      block: signUp,
                      path: ["form"],
                      value: { $ref: "form", id: "frm_signup" },
                    },
                  ],
                },
              },
            ],
          },
        ],
        withPlaceholderForm(harbourDraft),
      );
      expect(JSON.stringify(requests[1]?.messages)).toContain(
        "field form: still the placeholder form. Point it at one of the draft's forms, or add one with setForm",
      );
      expect(left).toEqual(["NoFormEmails"]);
      expect(state.draft.forms[FormId.make("frm_signup")]?.name).toBe("Sign up");
    }),
  );

  it.effect("points a list still on the sample posts at the site's blog", () =>
    Effect.gen(function* () {
      const { requests, left } = yield* fixing(
        [
          { calls: [{ name: "check_draft", params: {} }] },
          {
            calls: [
              {
                name: "apply_ops",
                params: {
                  page: "pg_home",
                  ops: [
                    {
                      op: "setProp",
                      block: "b_latest",
                      path: ["collection"],
                      value: { $ref: "page", id: "pg_news" },
                    },
                  ],
                },
              },
            ],
          },
        ],
        sampleListDraft,
      );
      expect(JSON.stringify(requests[1]?.messages)).toContain(
        "field collection: still shows sample posts",
      );
      expect(left).toEqual([]);
    }),
  );

  it.effect("sets and removes redirects", () =>
    Effect.gen(function* () {
      const { state } = yield* fixing([
        site({ op: "setRedirect", from: "/programme", to: { $ref: "page", id: "pg_home" } }),
        site({ op: "setRedirect", from: "/programme" }),
      ]);
      expect(state.commits).toHaveLength(2);
      expect(state.draft.redirects).toEqual({});
    }),
  );
});
