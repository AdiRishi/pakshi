import { expect, it } from "@effect/vitest";
import { routingKeys } from "@repo/contracts/snapshot";
import { Hostname } from "@repo/contracts/studio";
import { testSitesHost } from "@repo/infra/test-bindings";
import { env } from "cloudflare:workers";
import { Effect, Schema } from "effect";

import { newSite } from "./support/sites.ts";
import { join, setUp, studio } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

const hostname = Schema.decodeSync(Hostname);

/** The site KV sends a host to, or null. */
const routedTo = (host: string) => Effect.promise(() => env.ROUTING.get(routingKeys.host(host)));

it.live(
  "a domain serves its site once its ownership is proven, and stops at once when it's removed",
  () =>
    Effect.gen(function* () {
      const priya = yield* studio(yield* admin);
      const site = yield* newSite(priya, "Northbank Rooms", "rooms");
      const rooms = hostname("rooms.northbank.localhost");
      const other = hostname("www.northbanklibraries.org");

      const added = yield* priya.addDomain({ site: site.site, hostname: rooms });
      expect(added.platform).toBe(`rooms.${testSitesHost}`);
      expect(added.domains).toMatchObject([
        {
          hostname: rooms,
          status: "pending",
          records: [
            { type: "CNAME", name: rooms },
            { type: "TXT", name: `_pakshi.${rooms}` },
          ],
        },
      ]);
      expect(yield* routedTo(rooms)).toBeNull();
      yield* priya.addDomain({ site: site.site, hostname: other });

      const checked = yield* priya.checkDomains({ site: site.site });
      expect(checked.domains.map(({ hostname, status }) => [hostname, status])).toEqual([
        [rooms, "active"],
        [other, "pending"],
      ]);
      expect(yield* routedTo(rooms)).toBe(site.site);

      yield* priya.removeDomain({ site: site.site, hostname: rooms });
      expect(yield* routedTo(rooms)).toBeNull();
    }),
);

it.live("a domain belongs to one site, and Pakshi's own host to none", () =>
  Effect.gen(function* () {
    const priya = yield* studio(yield* admin);
    const first = yield* newSite(priya, "Library Events", "events");
    const second = yield* newSite(priya, "Riverside Parks", "parks");
    const events = hostname("events.riverton.localhost");
    yield* priya.addDomain({ site: first.site, hostname: events });
    const taken = yield* Effect.flip(priya.addDomain({ site: second.site, hostname: events }));
    expect(taken._tag).toBe("DomainTaken");
    const ours = yield* Effect.flip(
      priya.addDomain({ site: second.site, hostname: hostname(`parks.${testSitesHost}`) }),
    );
    expect(ours._tag).toBe("DomainTaken");

    const sam = yield* studio(
      yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", {
        kind: "site",
        id: second.site,
      }),
    );
    const refused = yield* Effect.flip(
      sam.addDomain({ site: second.site, hostname: hostname("www.riversideparks.org") }),
    );
    expect(refused._tag).toBe("NotPermitted");
  }),
);
