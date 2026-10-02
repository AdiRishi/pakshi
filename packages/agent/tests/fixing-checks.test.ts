import { describe, expect, it } from "@effect/vitest";
import { FormId } from "@repo/contracts/ids";
import { freeze } from "@repo/domain/freeze";
import { Effect, Layer } from "effect";
import { Chat } from "effect/unstable/ai";

import { runTurn } from "../src/turn.ts";
import { draftToFix } from "./support/draft.ts";
import { type Reply, scriptedModel } from "./support/model.ts";
import { desk } from "./support/workspace.ts";

/** Runs a turn on the draft with issues to fix, with the model replying from a script. */
const fixing = (script: ReadonlyArray<Reply>) =>
  Effect.gen(function* () {
    const { state, layer, contracts } = yield* Effect.promise(() => desk(draftToFix));
    const model = scriptedModel(script);
    yield* runTurn({
      chat: yield* Chat.empty,
      system: "You edit pages.",
      message: "Fix what the checks found.",
      afterStep: Effect.void,
    }).pipe(Effect.provide(Layer.merge(layer, model.layer)));
    const frozen = freeze(state.draft, contracts, { pages: [], gone: [] }, new Set());
    return {
      state,
      calls: model.calls,
      left: (frozen.ok ? [] : frozen.issues).map((issue) => issue._tag).toSorted(),
    };
  });

const site = (...ops: ReadonlyArray<object>) => ({
  calls: [{ name: "apply_ops", params: { page: "site", ops } }],
});

const contact = FormId.make("frm_contact");

describe("fixing what the checks found", () => {
  it.effect("the agent reads every issue with its IDs, and which ones are the person's", () =>
    Effect.gen(function* () {
      const { state, calls } = yield* fixing([{ calls: [{ name: "check_draft", params: {} }] }]);
      const toModel = JSON.stringify(calls[1]?.prompt);
      expect(toModel).toContain("Harbour Summer School (pg_home): no description.");
      expect(toModel).toContain("Only a person can fix this: you can't choose images.");
      expect(state.parts).toContainEqual(
        expect.objectContaining({ label: "Checked the draft: 6 things to fix" }),
      );
    }),
  );

  it.effect("adds a consent checkbox to a form, reading the form's fields first", () =>
    Effect.gen(function* () {
      const { state, calls, left } = yield* fixing([
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
      expect(JSON.stringify(calls[1]?.prompt)).toContain("ff_email");
      expect(left).not.toContain("MissingConsent");
      expect(state.draft.forms[contact]?.fields.map((field) => field.label)).toEqual([
        "Email",
        "I agree to the privacy policy",
      ]);
      expect(state.parts).toContainEqual(
        expect.objectContaining({ label: "Changed the Contact form", changed: true }),
      );
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
      const { state, left } = yield* fixing([
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
      expect(state.parts).toContainEqual(
        expect.objectContaining({ label: "Published Old programme again in the draft" }),
      );
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
