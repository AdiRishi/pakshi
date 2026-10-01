import {
  type BlockDefinition,
  blockKey,
  latestLockfile,
  loadBlock,
  registeredVersions,
} from "@repo/blocks";
import { BlockType, SiteId } from "@repo/contracts/ids";
import { Timestamp } from "@repo/contracts/release";
import type { BlockVersionInfo, CatalogBlock, RemovableVersion } from "@repo/contracts/studio";
import { type Cause, Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

/*
 * The block library as Studio shows it: every version the registry holds,
 * with how many sites have each live, from D1's copy of what each site's
 * live release and open drafts pin.
 */

/** How long a version no one pins stays in the registry before it can be removed. */
const keptUnused = 90 * 24 * 60 * 60 * 1000;

/** Every version the registry holds of each block type, oldest first. */
export const library = Effect.promise(async () => {
  const definitions = await Promise.all(
    registeredVersions.map(({ type, version }) => loadBlock(type, { [type]: version })),
  );
  return Map.groupBy(definitions, (definition) => definition.type);
});

const UsageRow = Schema.Struct({
  type: BlockType,
  version: Schema.Int,
  holder: Schema.String,
  site_id: SiteId,
});
type UsageRow = typeof UsageRow.Type;

/** Every block version a site's live release or one of its open drafts pins. */
const usage = Effect.fn("StudioApi.blockUsage")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: UsageRow,
    execute: () => sql`select key as type, value as version, holder, site_id
      from block_usage, json_each(block_usage.lockfile)`,
  })(undefined);
});

/** How many sites have each version live, keyed as the registry names versions. */
const liveCounts = (rows: ReadonlyArray<UsageRow>) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.holder !== "live") continue;
    const key = blockKey(row.type, row.version);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const versionInfo = (
  definition: BlockDefinition,
  counts: ReadonlyMap<string, number>,
): BlockVersionInfo => ({
  version: definition.version,
  changes: definition.changes,
  sites: counts.get(blockKey(definition.type, definition.version)) ?? 0,
});

/** The block library, with how many sites have each version live. */
export const catalog = Effect.fn("StudioApi.catalog")(function* () {
  const [blocks, rows] = yield* Effect.all([library, usage()], { concurrency: "unbounded" });
  const counts = liveCounts(rows);
  return Array.from(blocks.values(), (versions): CatalogBlock => {
    const latest = versions.at(-1);
    if (latest === undefined) throw new Error("The registry lists a block with no versions.");
    return {
      type: latest.type,
      title: latest.title,
      purpose: latest.agent.purpose,
      placement: latest.placement,
      latest: latest.version,
      versions: versions.map((definition) => versionInfo(definition, counts)).toReversed(),
    };
  }).toSorted((a, b) => a.title.localeCompare(b.title));
});

/** The versions of a block after `version`, oldest first. */
export const newerVersions = Effect.fn("StudioApi.newerVersions")(function* (
  type: BlockType,
  version: number,
) {
  const [blocks, rows] = yield* Effect.all([library, usage()], { concurrency: "unbounded" });
  const counts = liveCounts(rows);
  return (blocks.get(type) ?? [])
    .filter((definition) => definition.version > version)
    .map((definition) => versionInfo(definition, counts));
});

/** The title of a block type's newest version. */
export const blockTitle = (type: BlockType) =>
  Effect.promise(async () => (await loadBlock(type, latestLockfile)).title);

/**
 * The sites whose SiteDoc hasn't copied the block versions it serves to D1,
 * such as one no one has opened since it was seeded. The scheduled job asks
 * each for them.
 */
export const sitesWithoutBlockUsage = Effect.fn("StudioApi.sitesWithoutBlockUsage")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: SiteId }),
    execute: () => sql`select id from sites
      where id not in (select site_id from block_usage where holder = 'live')`,
  })(undefined);
});

/**
 * The versions the platform team may remove from the registry: not the
 * newest of their block, pinned by no live release or open draft, unused for
 * 3 months, and with no older version of their block in use, since an upgrade
 * from that version migrates through them. None are listed while any site
 * hasn't reported the versions it serves.
 */
export const removableVersions = Effect.fn("StudioApi.removableVersions")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const [rows, lastUsed, unreported] = yield* Effect.all(
    [
      usage(),
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Schema.Struct({ type: BlockType, version: Schema.Int, last_used_at: Timestamp }),
        execute: () => sql`select type, version, last_used_at from block_versions`,
      })(undefined),
      sitesWithoutBlockUsage(),
    ],
    { concurrency: "unbounded" },
  );
  if (unreported.length > 0) return [];
  const oldestInUse = new Map<BlockType, number>();
  for (const row of rows)
    oldestInUse.set(row.type, Math.min(oldestInUse.get(row.type) ?? row.version, row.version));
  const used = new Map(lastUsed.map((row) => [blockKey(row.type, row.version), row.last_used_at]));
  const cutoff = Date.now() - keptUnused;
  return registeredVersions.flatMap(({ type, version }): ReadonlyArray<RemovableVersion> => {
    const lastUsedAt = used.get(blockKey(type, version)) ?? null;
    const removable =
      version !== latestLockfile[type] &&
      version < (oldestInUse.get(type) ?? Number.POSITIVE_INFINITY) &&
      (lastUsedAt === null || Date.parse(lastUsedAt) < cutoff);
    return removable ? [{ type, version, lastUsedAt }] : [];
  });
});

/**
 * Asks each site that hasn't reported the block versions it serves to
 * report them, through `report`. Returns the sites asked; one whose request
 * fails is logged, and the next run asks again.
 */
export const collectBlockUsage = Effect.fn("StudioApi.collectBlockUsage")(function* (
  report: (site: SiteId) => Effect.Effect<void, Cause.UnknownError>,
) {
  const sites = yield* sitesWithoutBlockUsage();
  const asked = yield* Effect.forEach(
    sites,
    ({ id }) =>
      report(id).pipe(
        Effect.as([id]),
        Effect.catch((cause) =>
          Effect.as(Effect.logError(`Asking ${id} for its block versions failed`, cause), []),
        ),
      ),
    { concurrency: 10 },
  );
  return asked.flat();
});

/** The sites with a version of a block older than `latest` live. */
export const sitesBehind = Effect.fn("StudioApi.sitesBehind")(function* (
  type: BlockType,
  latest: number,
) {
  const rows = yield* usage();
  return Array.from(
    new Set(
      rows
        .filter((row) => row.holder === "live" && row.type === type && row.version < latest)
        .map((row) => row.site_id),
    ),
  );
});
