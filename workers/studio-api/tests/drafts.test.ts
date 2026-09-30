import { expect, it } from "@effect/vitest";
import { type Draft, DraftName } from "@repo/contracts/draft";
import { BlockId, PageId } from "@repo/contracts/ids";
import { Batch } from "@repo/contracts/ops";
import { Effect, Layer, Schema } from "effect";

import { SiteDrafts } from "../src/site/drafts.ts";
import { Outbox } from "../src/site/outbox.ts";
import { harbourLive, home, platform, storage } from "./support/site.ts";

/** The site's drafts as a freshly started SiteDoc sees them, over the same storage. */
const drafts = Effect.provide(
  SiteDrafts.use((service) => Effect.succeed(service)),
  Layer.fresh(SiteDrafts.layer).pipe(Layer.provide(Outbox.layer)),
);

const summerLaunch = Schema.decodeSync(DraftName)("Summer launch");

/** The storage with one draft of the Harbour site in it, started by Sam. */
const withDraft = Effect.gen(function* () {
  const { state } = yield* platform();
  const manifest = state.manifests.get(harbourLive.snapshot);
  if (manifest === undefined) throw new Error("The platform is seeded.");
  const summary = yield* (yield* drafts).create({
    name: summerLaunch,
    by: sam,
    base: harbourLive,
    content: { ...manifest, pages: { [home.id]: home } },
  });
  return summary.id;
});

const batch = (id: string, ops: typeof Batch.Encoded.ops, undo = false) =>
  Schema.decodeSync(Batch)({ id, ops, undo });

const sam = { id: "user_sam", name: "Sam Okafor" };
const meera = { id: "user_meera", name: "Meera Kapoor" };

const setHeading = (id: string, heading: string) =>
  batch(id, [
    { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: heading },
  ]);

const heading = (draft: Draft) =>
  draft.pages[PageId.make("pg_home")]?.blocks[BlockId.make("b_hero")]?.props["heading"];

it.effect("a new draft holds the content it started from", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const draft = yield* (yield* drafts).draft(id);
    expect(draft.base).toEqual(harbourLive);
    expect(draft.revision).toBe(0);
    expect(Object.keys(draft.pages)).toEqual(["pg_home"]);
    expect(draft.parts.header).toBe("b_header");
  }).pipe(Effect.provide(storage)),
);

it.effect("a committed batch survives the object restarting", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const first = yield* drafts;
    expect(
      yield* first.commit(sam, id, setHeading("bat_one", "Build and sail"), "person"),
    ).toMatchObject({
      status: "committed",
      commit: { batch: { id: "bat_one", revision: 1, actor: sam } },
    });
    const restarted = yield* (yield* drafts).draft(id);
    expect(restarted.revision).toBe(1);
    expect(heading(restarted)).toBe("Build and sail");
    expect((yield* (yield* drafts).summary(id)).lastEdit?.by).toEqual(sam);
  }).pipe(Effect.provide(storage)),
);

it.effect("a batch sent twice applies once", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const store = yield* drafts;
    yield* store.commit(sam, id, setHeading("bat_one", "Build and sail"), "person");
    yield* store.commit(sam, id, setHeading("bat_two", "Sail"), "person");
    expect(yield* store.commit(sam, id, setHeading("bat_one", "Build and sail"), "person")).toEqual(
      {
        status: "duplicate",
        revision: 1,
      },
    );
    expect(heading(yield* store.draft(id))).toBe("Sail");
  }).pipe(Effect.provide(storage)),
);

it.effect("a rejected batch changes nothing and says why", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const store = yield* drafts;
    const outcome = yield* store.commit(sam, id, setHeading("bat_long", "x".repeat(81)), "person");
    expect(outcome).toMatchObject({
      status: "rejected",
      errors: [{ rule: "value", path: ["heading"] }],
    });
    const draft = yield* (yield* drafts).draft(id);
    expect(draft.revision).toBe(0);
    expect(heading(draft)).toBe("Learn by building");
  }).pipe(Effect.provide(storage)),
);

it.effect("created and deleted pages are stored as their own rows", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const store = yield* drafts;
    yield* store.commit(
      sam,
      id,
      batch("bat_create", [
        {
          op: "createPage",
          page: {
            schema: "pakshi.page/1",
            id: "pg_visit",
            type: "page",
            path: "/visit",
            meta: { title: "Visit", description: "" },
            root: [],
            blocks: {},
          },
        },
      ]),
      "person",
    );
    expect(Object.keys((yield* (yield* drafts).draft(id)).pages).toSorted()).toEqual([
      "pg_home",
      "pg_visit",
    ]);
    yield* store.commit(
      sam,
      id,
      batch("bat_delete", [{ op: "deletePage", page: "pg_home" }]),
      "person",
    );
    expect(Object.keys((yield* (yield* drafts).draft(id)).pages)).toEqual(["pg_visit"]);
  }).pipe(Effect.provide(storage)),
);

it.effect("an editor behind the draft catches up on the batches it missed, in order", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const store = yield* drafts;
    yield* store.commit(sam, id, setHeading("bat_one", "Build"), "person");
    yield* store.commit(meera, id, setHeading("bat_two", "Sail"), "person");
    const restarted = yield* drafts;
    expect(yield* restarted.catchUp(id, 1)).toEqual({
      _tag: "Batches",
      batches: [
        { id: "bat_two", revision: 2, actor: meera, ops: setHeading("bat_two", "Sail").ops },
      ],
    });
    expect(yield* restarted.catchUp(id, 2)).toEqual({ _tag: "Batches", batches: [] });
    expect((yield* restarted.catchUp(id, 7))._tag).toBe("Draft");
  }).pipe(Effect.provide(storage)),
);

it.effect("undo leaves a field someone else wrote to since, after the object restarts", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const store = yield* drafts;
    yield* store.commit(sam, id, setHeading("bat_sam", "Build"), "person");
    yield* store.commit(meera, id, setHeading("bat_meera", "Sail"), "person");
    const restarted = yield* drafts;
    const undone = yield* restarted.commit(
      sam,
      id,
      batch("bat_undo", setHeading("bat_x", "Learn by building").ops, true),
      "person",
    );
    expect(undone).toMatchObject({
      status: "committed",
      commit: { skipped: [0], batch: { ops: [] } },
    });
    expect(heading(yield* restarted.draft(id))).toBe("Sail");
  }).pipe(Effect.provide(storage)),
);

it.effect("a commit names whose write it replaced", () =>
  Effect.gen(function* () {
    const id = yield* withDraft;
    const store = yield* drafts;
    yield* store.commit(sam, id, setHeading("bat_sam", "Build"), "person");
    expect(yield* store.commit(meera, id, setHeading("bat_meera", "Sail"), "person")).toMatchObject(
      {
        status: "committed",
        commit: { replaced: [{ person: sam.id, op: 0 }] },
      },
    );
  }).pipe(Effect.provide(storage)),
);
