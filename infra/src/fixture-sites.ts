import { loadBlocks } from "@repo/blocks";
import { blockFixtures, fixtureSite, fixtureTree } from "@repo/blocks/fixtures";
import {
  BlockId,
  type BlockType,
  PageId,
  ReleaseId,
  SiteId,
  SnapshotId,
} from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import { type BlockInstance, PageDocument } from "@repo/contracts/page";
import { contentHash, SnapshotManifest } from "@repo/contracts/snapshot";
import { harbour } from "@repo/tokens";
import { Schema } from "effect";

/** The page on each fixture site that shows its block fixtures. */
export const fixturesPath = "/fixtures";

const alphanumeric = (value: string) => value.replace(/[^A-Za-z0-9]/g, "");

/** A block tree as the flat instances a page stores. */
const flatten = (tree: BlockTree): ReadonlyArray<readonly [BlockId, BlockInstance]> => {
  const { id, slots, ...block } = tree;
  const items = Object.values(slots ?? {}).flat();
  const root: BlockInstance =
    slots === undefined
      ? block
      : {
          ...block,
          slots: Object.fromEntries(
            Object.entries(slots).map(([slot, list]) => [slot, list.map((item) => item.id)]),
          ),
        };
  return [[id, root], ...items.map(({ id: itemId, ...item }) => [itemId, item] as const)];
};

/**
 * The sites that show every block fixture, for the checks that the editor's
 * canvas renders exactly as sites does. The first site's fixtures page holds
 * every section fixture, and each item fixture in a section that accepts it.
 * A site has one header and one footer, so each further header and footer
 * fixture gets a site of its own.
 */
export const fixtureSites = async () => {
  const lockfile = Object.fromEntries(blockFixtures.map((entry) => [entry.type, entry.version]));
  if (
    new Set(blockFixtures.map((entry) => `${entry.type}@${entry.version}`)).size !==
    new Set(blockFixtures.map((entry) => entry.type)).size
  )
    throw new Error(
      "Fixture sites show one version of each block; add a site per version when blocks have more.",
    );
  const definitions = await loadBlocks(lockfile);
  const placementOf = (type: BlockType) => definitions.get(type)?.placement;
  const ofPlacement = (placement: string) =>
    blockFixtures.filter((entry) => placementOf(entry.type) === placement);

  const sections = ofPlacement("section").map(fixtureTree);
  const items = ofPlacement("item").map((entry) => {
    const host = blockFixtures.find((candidate) => {
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
      Object.entries(hostDefinition.slots).find(([, spec]) => spec.accepts.includes(entry.type)) ??
      [];
    if (slot === undefined) throw new Error(`No slot accepts a ${entry.type}.`);
    const id = BlockId.make(`b_host${alphanumeric(entry.type)}${alphanumeric(entry.name)}`);
    const { slots: _, ...section } = fixtureTree(host);
    return {
      ...section,
      id,
      slots: { [slot]: [{ ...fixtureTree(entry), id: BlockId.make(`${id}item`) }] },
    };
  });
  const headers = ofPlacement("header").map(fixtureTree);
  const footers = ofPlacement("footer").map(fixtureTree);
  const count = Math.max(headers.length, footers.length, 1);

  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const number = index + 1;
      const header = headers[index % headers.length];
      const footer = footers[index % footers.length];
      if (header === undefined || footer === undefined)
        throw new Error("Blocks need a header and a footer fixture.");
      const shown = index === 0 ? [...sections, ...items] : [];
      const documents = [
        ...fixtureSite.pages.map((entry) => ({
          ...entry,
          schema: "pakshi.page/1",
          root: [],
          blocks: {},
        })),
        {
          schema: "pakshi.page/1",
          id: "pg_fixtures",
          type: "page",
          path: fixturesPath,
          meta: {
            title: "Block fixtures",
            description: "Every block fixture, as sites renders it.",
          },
          root: shown.map((tree) => tree.id),
          blocks: Object.fromEntries(shown.flatMap(flatten)),
        },
      ];
      const pages = await Promise.all(
        documents.map(async (document) => {
          const page = Schema.decodeUnknownSync(PageDocument)(document);
          const json = Schema.encodeSync(PageDocument)(page);
          return { page, json, hash: await contentHash(json) };
        }),
      );
      const site = { id: SiteId.make(`site_fixtures${number}`), name: `Block fixtures ${number}` };
      const snapshot = SnapshotId.make(`snap_fixtures${number}`);
      const manifest = Schema.decodeUnknownSync(SnapshotManifest)({
        schema: "pakshi.snapshot/1",
        id: snapshot,
        site: site.id,
        settings: fixtureSite.settings,
        parts: {
          header: header.id,
          footer: footer.id,
          blocks: Object.fromEntries([...flatten(header), ...flatten(footer)]),
          menus: fixtureSite.menus,
        },
        forms: fixtureSite.forms,
        lockfile,
        theme: harbour,
        media: fixtureSite.media,
        pages: pages.map(({ page, hash }) => ({
          id: page.id,
          path: page.path,
          type: page.type,
          meta: page.meta,
          object: hash,
        })),
        gone: [],
      });
      return {
        site,
        /** The host the site answers at, beside the Sites Worker's own. */
        host: (sitesHost: string) => `fixtures-${number}.${sitesHost}`,
        snapshot,
        release: ReleaseId.make(`rel_fixtures${number}`),
        manifest,
        pages,
        page: PageId.make("pg_fixtures"),
      };
    }),
  );
};
