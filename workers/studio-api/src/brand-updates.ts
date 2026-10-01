import type { SiteId } from "@repo/contracts/ids";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect } from "effect";
import { getServerByName } from "partyserver";

import { pinnedRevision, type RevisionRow, sitesBehindTheirBrand } from "./brands.ts";

/**
 * Offers a brand revision to one of the brand's sites, whose SiteDoc moves or
 * makes its Brand update draft. Offering a revision again changes nothing.
 */
export const offerRevision = (env: StudioApiEnv, site: SiteId, revision: RevisionRow) =>
  Effect.tryPromise(async () =>
    (await getServerByName(env.SITE_DOC, site)).takeBrandRevision(
      revision.created_by,
      pinnedRevision(revision),
    ),
  );

/**
 * Offers each site its brand's newest revision when D1's copy says its
 * SiteDoc hasn't taken it, because a save couldn't reach it. Returns the
 * sites offered one; a site that fails again is logged, and the next run
 * tries again.
 */
export const offerMissedRevisions = Effect.fn("StudioApi.offerMissedRevisions")(function* (
  env: StudioApiEnv,
) {
  const behind = yield* sitesBehindTheirBrand();
  const offered = yield* Effect.forEach(
    behind,
    ({ site, revision }) =>
      offerRevision(env, site, revision).pipe(
        Effect.as([site]),
        Effect.catch((cause) =>
          Effect.as(Effect.logError(`Offering ${site} its brand's revision failed`, cause), []),
        ),
      ),
    { concurrency: 10 },
  );
  return offered.flat();
});
