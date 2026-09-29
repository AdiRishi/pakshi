import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describeViewer } from "../src/viewer.ts";
import { core } from "./support/core.ts";

const viewerOf = (id: string) =>
  describeViewer({ id, name: id, email: `${id}@pakshi.test` }).pipe(Effect.provide(core));

const siteNames = (id: string) =>
  Effect.map(viewerOf(id), (viewer) => viewer.sites.map((site) => site.name));

it.effect("an org admin can edit every site, and holds the role on the organization", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_org");
    expect(viewer.roles).toEqual([{ role: "Org admin", scope: "Organization" }]);
    expect(viewer.sites.map((site) => site.name)).toEqual([
      "Library Events",
      "Northbank Libraries",
      "Trails",
    ]);
  }),
);

it.effect("a brand admin can edit every site in their brand and none outside it", () =>
  Effect.gen(function* () {
    expect(yield* siteNames("user_brand")).toEqual(["Library Events", "Northbank Libraries"]);
  }),
);

it.effect("an editor on one site can edit only that site", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_editor");
    expect(viewer.roles).toEqual([{ role: "Editor", scope: "Library Events" }]);
    expect(viewer.sites.map((site) => site.brand)).toEqual(["City Libraries"]);
  }),
);

it.effect("an approver holds a role but edits no pages", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_approver");
    expect(viewer.roles).toEqual([{ role: "Approver", scope: "Northbank Libraries" }]);
    expect(viewer.sites).toEqual([]);
  }),
);

it.effect("a denial on one site hides it even though the brand's role would allow it", () =>
  Effect.gen(function* () {
    expect(yield* siteNames("user_denied")).toEqual(["Library Events"]);
  }),
);

it.effect("someone with no access sees nothing", () =>
  Effect.gen(function* () {
    const viewer = yield* viewerOf("user_nobody");
    expect(viewer.roles).toEqual([]);
    expect(viewer.sites).toEqual([]);
  }),
);
