import { BatchId, BlockId, type DraftId, type PageId, randomId, SiteId } from "@repo/contracts/ids";
import type { BlockTree, Op } from "@repo/contracts/ops";
import { LiveRelease, objectKeys, routingKeys, SnapshotManifest } from "@repo/contracts/snapshot";
import type { SiteAddress, SubmitOutcome } from "@repo/contracts/studio";
import { testSitesHost } from "@repo/infra/test-bindings";
import { env } from "cloudflare:workers";
import { Effect, Schema } from "effect";

import type { studio } from "./studio.ts";

type Studio = Effect.Success<ReturnType<typeof studio>>;

/** A brand, and a site in it with its first draft, made by someone who may make both. */
export const newSite = (client: Studio, name: string, address: SiteAddress) =>
  Effect.gen(function* () {
    const brand = yield* client.createBrand({
      name: `${name} brand`,
      brandColor: "#1f5c44",
    });
    const created = yield* client.createSite({ brand: brand.id, name, address });
    const { pages } = yield* client.draftPages({ site: created.site.id, draft: created.draft });
    const [home] = pages;
    if (home === undefined) return yield* Effect.die("A new site's first draft has a home page.");
    return { brand: brand.id, site: created.site.id, draft: created.draft, home: home.id };
  });

/** A section of text with a heading, as a person would add it. */
export const textSection = (heading: string): BlockTree => ({
  id: BlockId.make(randomId("b")),
  type: "rich-text",
  variant: "narrow",
  surface: "default",
  props: {
    heading,
    body: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: `${heading}, in a sentence.` }] },
      ],
    },
  },
});

/** Commits ops to a draft as the person, failing the test if they're refused. */
export const edit = (client: Studio, site: SiteId, draft: DraftId, ops: ReadonlyArray<Op>) =>
  Effect.gen(function* () {
    const outcome = yield* client.applyBatch({
      site,
      draft,
      batch: { id: BatchId.make(randomId("bat")), ops },
    });
    if (outcome.status === "rejected")
      return yield* Effect.die(`The batch was refused: ${JSON.stringify(outcome.errors)}`);
  });

/** The ops that make a page ready to publish: a description and one section. */
export const readyPage = (page: PageId, heading: string): ReadonlyArray<Op> => [
  { op: "setMeta", page, field: "description", value: `About ${heading}.` },
  { op: "insertBlock", page, list: "root", after: null, block: textSection(heading) },
];

/** Submits a draft on a site whose workflow has no steps, which publishes it. */
export const publish = (client: Studio, site: SiteId, draft: DraftId) =>
  Effect.gen(function* () {
    const outcome: SubmitOutcome = yield* client.submitDraft({ site, draft, note: "" });
    if (outcome._tag !== "Published")
      return yield* Effect.die(`Submitting didn't publish: ${JSON.stringify(outcome)}`);
    return outcome.release;
  });

const decodeLive = Schema.decodeUnknownSync(Schema.fromJsonString(LiveRelease));
const decodeManifest = Schema.decodeUnknownSync(Schema.fromJsonString(SnapshotManifest));

/** What `sites` reads to serve a host: the site it names, that site's live release and its manifest. */
export const served = (address: SiteAddress) =>
  Effect.promise(async () => {
    const host = await env.ROUTING.get(routingKeys.host(`${address}.${testSitesHost}`));
    if (host === null) return null;
    const site = SiteId.make(host);
    const live = await env.ROUTING.get(routingKeys.site(site));
    if (live === null) return { site, live: null, manifest: null };
    const release = decodeLive(live);
    const manifest = await env.CONTENT.get(objectKeys.manifest(site, release.snapshot));
    return {
      site,
      live: release,
      manifest: manifest === null ? null : decodeManifest(await manifest.text()),
    };
  });
