import { blockKey, latestLockfile, loadBlock, registeredVersions } from "@repo/blocks";
import { BlockType, SiteId } from "@repo/contracts/ids";
import { Timestamp } from "@repo/contracts/release";
import type { BlockVersionInfo, RemovableVersion } from "@repo/contracts/studio";
import { type Cause, Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";

/*
 * The block library's versions, and which of them D1's copy of each site's
 * live release and open drafts pin. Every lockfile pins every block type, so
 * pins say which versions must stay in the registry, not which a site shows.
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

/** Every block version a site's live release or one of its open drafts pins. */
const pinned = Effect.fn("StudioApi.pinnedBlocks")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ type: BlockType, version: Schema.Int }),
    execute: () => sql`select key as type, value as version
      from block_usage, json_each(block_usage.lockfile)`,
  })(undefined);
});

/** The versions of a block after `version`, oldest first. */
export const newerVersions = (type: BlockType, version: number) =>
  Effect.map(library, (blocks) =>
    (blocks.get(type) ?? [])
      .filter((definition) => definition.version > version)
      .map((definition): BlockVersionInfo => ({
        version: definition.version,
        changes: definition.changes,
      })),
  );

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
      where deleted_at is null and id not in (select site_id from block_usage where holder = 'live')`,
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
      pinned(),
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
