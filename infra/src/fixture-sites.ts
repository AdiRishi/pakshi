import { flattenTree, loadBlocks, registeredVersions } from "@repo/blocks";
import { blockFixtures, fixtureSite, fixtureTree } from "@repo/blocks/fixtures";
import {
  BlockId,
  type BlockType,
  PageId,
  ReleaseId,
  SiteId,
  SnapshotId,
} from "@repo/contracts/ids";
import { PageDocument } from "@repo/contracts/page";
import { contentHash, type Lockfile, SnapshotManifest } from "@repo/contracts/snapshot";
import { Schema } from "effect";

import { manifestPages, sampleSite } from "./sample-site.ts";

/** Each fixture site shows its block fixtures on its home page. */
export const fixturesPath = "/";

const alphanumeric = (value: string) => value.replace(/[^A-Za-z0-9]/g, "");

/** The block version each type has `generation` versions before its newest, or its oldest. */
const generationLockfile = (generation: number): Lockfile =>
  Object.fromEntries(
    Map.groupBy(registeredVersions, ({ type }) => type)
      .entries()
      .map(([type, versions]) => [
        type,
        (versions.at(-1 - generation) ?? versions[0])?.version ?? 1,
      ]),
  );

/** The fixtures a generation shows: those of each version first pinned in it. */
const generationFixtures = (generation: number) => {
  const lockfile = generationLockfile(generation);
  const earlier = generation === 0 ? null : generationLockfile(generation - 1);
  return blockFixtures.filter(
    (entry) =>
      lockfile[entry.type] === entry.version &&
      (earlier === null || earlier[entry.type] !== entry.version),
  );
};

/**
 * The sites that show every block fixture, for the checks that the editor's
 * canvas renders exactly as sites does. A lockfile pins one version of each
 * block, so the sites come in generations: the first pins every block's
 * newest version, the next the version before for each block that has one,
 * and so on. The first site of each generation shows that generation's
 * section fixtures, and each item fixture in a section that accepts it. A
 * site has one header and one footer, so each further header and footer
 * fixture gets a site of its own.
 */
export const fixtureSites = async () => {
  const sample = await sampleSite();
  const { revision } = sample;
  // The fixtures' images, and the brand's logos and icon, which headers show.
  const media = {
    ...fixtureSite.media,
    ...Object.fromEntries(
      sample.media.map(({ id, contentType, width, height }) => [
        id,
        { contentType, width, height },
      ]),
    ),
  };
  const generations = Math.max(
    ...Map.groupBy(registeredVersions, ({ type }) => type)
      .values()
      .map((versions) => versions.length),
  );
  const plans = await Promise.all(
    Array.from({ length: generations }, async (_, generation) => {
      const lockfile = generationLockfile(generation);
      const shown = generationFixtures(generation);
      const definitions = await loadBlocks(lockfile);
      const placementOf = (type: BlockType) => definitions.get(type)?.placement;
      const pinned = blockFixtures.filter((entry) => lockfile[entry.type] === entry.version);
      const ofPlacement = (placement: string, from: typeof blockFixtures) =>
        from.filter((entry) => placementOf(entry.type) === placement);
      const sections = ofPlacement("section", shown).map((entry) => ({
        tree: fixtureTree(entry),
        fixture: entry,
        item: false,
      }));
      const items = ofPlacement("item", shown).map((entry) => {
        const host = pinned.find((candidate) => {
          const definition = definitions.get(candidate.type);
          return (
            definition?.placement === "section" &&
            Object.values(definition.slots).some((slot) => slot.accepts.includes(entry.type))
          );
        });
        const hostDefinition = host === undefined ? undefined : definitions.get(host.type);
        if (host === undefined || hostDefinition?.placement !== "section")
          throw new Error(`No section fixture can hold a ${entry.type}.`);
        const [slot] =
          Object.entries(hostDefinition.slots).find(([, spec]) =>
            spec.accepts.includes(entry.type),
          ) ?? [];
        if (slot === undefined) throw new Error(`No slot accepts a ${entry.type}.`);
        const id = BlockId.make(
          `b_host${alphanumeric(entry.type)}${entry.version}${alphanumeric(entry.name)}`,
        );
        const { slots: _, ...section } = fixtureTree(host);
        return {
          tree: {
            ...section,
            id,
            slots: { [slot]: [{ ...fixtureTree(entry), id: BlockId.make(`${id}item`) }] },
          },
          fixture: entry,
          item: true,
        };
      });
      // A generation shows its new header and footer fixtures, or any pinned one when it has none.
      const newOr = (placement: "header" | "footer") => {
        const fresh = ofPlacement(placement, shown);
        return (fresh.length > 0 ? fresh : ofPlacement(placement, pinned).slice(0, 1)).map(
          (entry) => ({ tree: fixtureTree(entry), fixture: entry }),
        );
      };
      const headers = newOr("header");
      const footers = newOr("footer");
      return {
        lockfile,
        sections: [...sections, ...items],
        headers,
        footers,
        count: Math.max(headers.length, footers.length, 1),
      };
    }),
  );
  const sites = plans.flatMap((plan) =>
    Array.from({ length: plan.count }, (_, index) => ({
      lockfile: plan.lockfile,
      header: plan.headers[index % plan.headers.length],
      footer: plan.footers[index % plan.footers.length],
      shown: index === 0 ? plan.sections : [],
    })),
  );

  return Promise.all(
    sites.map(async ({ lockfile, header, footer, shown }, index) => {
      const number = index + 1;
      if (header === undefined || footer === undefined)
        throw new Error("Blocks need a header and a footer fixture.");
      const site = { id: SiteId.make(`site_fixtures${number}`), name: `Block fixtures ${number}` };
      // The fixtures' other pages are empty and exist so their links and post lists resolve.
      const documents = Object.values(fixtureSite.pages).map((page) =>
        page.type === "page" && page.path === fixturesPath
          ? {
              ...page,
              meta: {
                title: site.name,
                description:
                  shown.length > 0
                    ? "Block fixtures, for the checks that the editor renders as sites does."
                    : "This site's header and footer fixtures, which another fixture site can't show.",
              },
              root: shown.map(({ tree }) => tree.id),
              blocks: Object.fromEntries(shown.flatMap(({ tree }) => flattenTree(tree))),
            }
          : page,
      );
      const pages = await Promise.all(
        documents.map(async (document) => {
          const page = Schema.decodeSync(PageDocument)(document);
          const json = Schema.encodeSync(PageDocument)(page);
          return { page, json, hash: await contentHash(json) };
        }),
      );
      const parts = {
        header: header.tree.id,
        footer: footer.tree.id,
        blocks: Object.fromEntries([header.tree, footer.tree].flatMap(flattenTree)),
        menus: fixtureSite.menus,
      };
      // The IDs follow the content, so a changed fixture is a new release, as a publish
      // would be, and sites' page cache, keyed by release, serves it at once.
      const version = (
        await contentHash({
          pages: pages.map(({ hash }) => hash),
          parts,
          lockfile,
          name: site.name,
          brand: Schema.encodeSync(SnapshotManifest.fields.brand)(revision),
        })
      ).slice(0, 12);
      const snapshot = SnapshotId.make(`snap_fixtures${number}${version}`);
      const manifest = Schema.decodeSync(SnapshotManifest)({
        schema: "pakshi.snapshot/1",
        id: snapshot,
        site: site.id,
        settings: { name: site.name, sharingImage: null },
        parts,
        forms: fixtureSite.forms,
        redirects: {},
        lockfile,
        brand: revision,
        media,
        pages: manifestPages(pages),
        unpublished: [],
        gone: [],
      });
      return {
        site,
        /** The host the site answers at, beside the Sites Worker's own. */
        host: (sitesHost: string) => `fixtures-${number}.${sitesHost}`,
        snapshot,
        release: ReleaseId.make(`rel_fixtures${number}${version}`),
        manifest,
        pages,
        page: PageId.make("pg_home"),
        /**
         * The fixture each part of the fixtures page shows, in page order: the
         * header, each section or the item a section holds, and the footer.
         */
        fixtures: [
          { fixture: header.fixture, item: false },
          ...shown.map(({ fixture, item }) => ({ fixture, item })),
          { fixture: footer.fixture, item: false },
        ],
      };
    }),
  );
};
