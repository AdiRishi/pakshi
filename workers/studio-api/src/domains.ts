import { SiteId } from "@repo/contracts/ids";
import { now, Timestamp } from "@repo/contracts/release";
import { DomainTaken, type Hostname, type Person, type SiteDomain } from "@repo/contracts/studio";
import { Effect, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { audit } from "./audit.ts";

/*
 * A site's own domains. Each waits until its ownership is proven, then KV
 * sends its host to the site. Until production brings Cloudflare for SaaS,
 * only names under .localhost are proven, and at the first check: they can
 * only reach the machine Pakshi runs on.
 */

const DomainRow = Schema.Struct({
  hostname: Schema.String,
  site_id: SiteId,
  status: Schema.Literals(["pending", "active"]),
  token: Schema.String,
  added_at: Timestamp,
  checked_at: Schema.NullOr(Timestamp),
});
type DomainRow = typeof DomainRow.Type;

const tokenAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A new ownership token for a domain's TXT record: 20 base-36 digits. */
const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), (byte) => tokenAlphabet[byte % 36]).join(
    "",
  );

/** The sites host without its port, which only the dev stack's has. */
const hostName = (sitesHost: string) => sitesHost.split(":")[0] ?? sitesHost;

/** The host KV knows a domain by: with the sites host's port, when it has one. */
export const routedHost = (hostname: string, sitesHost: string) => {
  const port = sitesHost.split(":")[1];
  return port === undefined ? hostname : `${hostname}:${port}`;
};

/** The address a host serves a site at: over HTTPS in production, and HTTP on a local stack. */
export const siteAddress = (host: string, environment: string) =>
  `${environment === "production" ? "https" : "http"}://${host}`;

/** Whether a domain's ownership is proven. */
const proven = (hostname: string) => hostname.endsWith(".localhost");

const domainOf = (row: DomainRow, sitesHost: string): SiteDomain => ({
  hostname: row.hostname,
  status: row.status,
  addedAt: row.added_at,
  checkedAt: row.checked_at,
  records: [
    { type: "CNAME", name: row.hostname, value: `connect.${hostName(sitesHost)}` },
    { type: "TXT", name: `_pakshi.${row.hostname}`, value: `pakshi-verify=${row.token}` },
  ],
});

const rows = Effect.fn("StudioApi.domainRows")(function* (where: {
  readonly site?: SiteId;
  readonly pending?: boolean;
}) {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: DomainRow,
    execute: () => sql`select hostname, site_id, status, token, added_at, checked_at from domains
      where ${where.site === undefined ? sql`1 = 1` : sql`site_id = ${where.site}`}
        and ${where.pending === true ? sql`status = 'pending'` : sql`1 = 1`}
      order by added_at, hostname`,
  })(undefined);
});

/** A site's own domains, oldest first, with the records that connect each. */
export const siteDomains = Effect.fn("StudioApi.siteDomains")(function* (
  site: SiteId,
  sitesHost: string,
) {
  return (yield* rows({ site })).map((row) => domainOf(row, sitesHost));
});

/**
 * Adds a domain to a site, waiting for its records. A domain that could be a
 * site's Pakshi address, or one another site has, is refused.
 */
export const addDomain = Effect.fn("StudioApi.addDomain")(function* (
  site: SiteId,
  hostname: Hostname,
  by: Person,
  sitesHost: string,
) {
  const sql = yield* SqlClient.SqlClient;
  // A name one label under the sites host is some site's Pakshi address, or could become one.
  const [, ...rest] = hostname.split(".");
  if (rest.join(".") === hostName(sitesHost)) return yield* new DomainTaken({ hostname });
  const added = yield* sql`insert into domains (hostname, site_id, token, added_by)
    values (${hostname}, ${site}, ${newToken()}, ${by.id})
    on conflict (hostname) do nothing returning hostname`;
  if (added.length === 0) return yield* new DomainTaken({ hostname });
  yield* audit(by, { site }, { _tag: "DomainAdded", hostname });
});

/**
 * Checks waiting domains, of one site or all of them, and makes each whose
 * ownership is proven serve its site. `route` writes the host to KV.
 */
export const checkDomains = Effect.fn("StudioApi.checkDomains")(function* (
  site: SiteId | undefined,
  route: (hostname: string, site: SiteId) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  const waiting = yield* rows(site === undefined ? { pending: true } : { site, pending: true });
  const checkedAt = now();
  for (const row of waiting) {
    if (!proven(row.hostname)) {
      yield* sql`update domains set checked_at = ${checkedAt} where hostname = ${row.hostname}`;
      continue;
    }
    // KV first, so a domain marked active always serves its site.
    yield* route(row.hostname, row.site_id);
    yield* sql`update domains set status = 'active', checked_at = ${checkedAt},
      active_at = ${checkedAt} where hostname = ${row.hostname}`;
    yield* audit(null, { site: row.site_id }, { _tag: "DomainProven", hostname: row.hostname });
  }
});

/** Takes a domain off a site. `unroute` deletes its host from KV. */
export const removeDomain = Effect.fn("StudioApi.removeDomain")(function* (
  site: SiteId,
  hostname: string,
  by: Person,
  unroute: (hostname: string) => Effect.Effect<void>,
) {
  const sql = yield* SqlClient.SqlClient;
  const [found] =
    yield* sql`select 1 from domains where hostname = ${hostname} and site_id = ${site}`;
  if (found === undefined) return;
  // KV first, so a removal that stops partway leaves a domain that can be removed again.
  yield* unroute(hostname);
  yield* sql`delete from domains where hostname = ${hostname} and site_id = ${site}`;
  yield* audit(by, { site }, { _tag: "DomainRemoved", hostname });
});
