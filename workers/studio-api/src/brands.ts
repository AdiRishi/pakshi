import {
  BrandIdentity,
  type BrandLook,
  type BrandRevision,
  noIdentity,
  VoiceGuide,
} from "@repo/contracts/brand";
import { BrandId, randomId, SiteId } from "@repo/contracts/ids";
import { Collaborator } from "@repo/contracts/live";
import { now, Timestamp } from "@repo/contracts/release";
import {
  BrandChanged,
  NotInBrandLibrary,
  NotPermitted,
  type Person,
  ScopeNotFound,
  ThemeUnreadable,
} from "@repo/contracts/studio";
import { authorize, permissionsOn } from "@repo/domain/access";
import {
  BrandTheme,
  type HexColor,
  type PresetId,
  ResolvedTheme,
  resolveTheme,
  themeValues,
} from "@repo/tokens";
import { Effect, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

import { loadAccess } from "./access.ts";
import { audit } from "./audit.ts";
import { brandMedia } from "./sites.ts";

/*
 * Brands, their revisions and voice guides, in D1. A brand's look is its
 * newest revision; saving one adds another, which each of the brand's sites
 * then takes in through a Brand update draft.
 */

const json = Schema.fromJsonString;

const BrandRow = Schema.Struct({ id: BrandId, name: Schema.String, voice: json(VoiceGuide) });

const RevisionRow = Schema.Struct({
  brand_id: BrandId,
  number: Schema.Int,
  theme: json(BrandTheme),
  resolved: json(ResolvedTheme),
  identity: json(BrandIdentity),
  created_by: json(Collaborator),
  created_at: Timestamp,
});
export type RevisionRow = typeof RevisionRow.Type;

const SiteRow = Schema.Struct({ id: SiteId, name: Schema.String, brand_id: BrandId });

const encode = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S,
  value: S["Type"],
) => Schema.encodeSync(json(schema))(value);

/** A revision as drafts pin it. */
export const pinnedRevision = (row: RevisionRow): BrandRevision => ({
  brand: row.brand_id,
  number: row.number,
  theme: row.resolved,
  identity: row.identity,
});

/** The newest revision of every brand. */
const latestRevisions = Effect.fn("StudioApi.latestRevisions")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: RevisionRow,
    execute: () => sql`select r.* from brand_revisions r
      where r.number = (select max(number) from brand_revisions where brand_id = r.brand_id)`,
  })(undefined);
});

/** A brand's newest revision. Every brand has one from the moment it's made. */
export const latestRevision = Effect.fn("StudioApi.latestRevision")(function* (brand: BrandId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: RevisionRow,
    execute: () => sql`select * from brand_revisions where brand_id = ${brand}
      order by number desc limit 1`,
  })(undefined);
  if (Option.isNone(row)) return yield* Effect.die(`Brand ${brand} has no revision.`);
  return row.value;
});

const brandSites = Effect.fn("StudioApi.brandSites")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: SiteRow,
    execute: () => sql`select id, name, brand_id from sites where deleted_at is null order by name`,
  })(undefined);
});

/** The brands a person holds a permission on, with their look and sites. */
export const brandsFor = Effect.fn("StudioApi.brandsFor")(function* (person: Person) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(person.id);
  const [brands, revisions, sites] = yield* Effect.all(
    [
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: BrandRow,
        execute: () => sql`select id, name, voice from brands order by name`,
      })(undefined),
      latestRevisions(),
      brandSites(),
    ],
    { concurrency: "unbounded" },
  );
  return brands
    .filter((brand) => permissionsOn(access, { kind: "brand", id: brand.id }).length > 0)
    .flatMap((brand) => {
      const revision = revisions.find((row) => row.brand_id === brand.id);
      if (revision === undefined) return [];
      return [
        {
          id: brand.id,
          name: brand.name,
          preset: revision.theme.preset,
          brandColor: themeValues(revision.theme).brandColor,
          sites: sites
            .filter((site) => site.brand_id === brand.id)
            .map(({ id, name }) => ({ id, name })),
        },
      ];
    });
});

/**
 * A brand the person holds any permission on, and whether they may change
 * its look. Anyone else is told it doesn't exist.
 */
const brandFor = Effect.fn("StudioApi.brandFor")(function* (person: Person, brand: BrandId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: BrandRow,
    execute: () => sql`select id, name, voice from brands where id = ${brand}`,
  })(undefined);
  const { access } = yield* loadAccess(person.id);
  const resource = { kind: "brand", id: brand } as const;
  if (Option.isNone(row) || permissionsOn(access, resource).length === 0)
    return yield* new ScopeNotFound({});
  return {
    ...row.value,
    edit: authorize(access, "brand.theme.edit", resource),
    delete: authorize(access, "brand.delete", resource),
  };
});

/** Everything Theme Studio shows for a brand. */
export const brandView = Effect.fn("StudioApi.brandView")(function* (
  person: Person,
  brand: BrandId,
) {
  const found = yield* brandFor(person, brand);
  const [revision, sites, media] = yield* Effect.all(
    [latestRevision(brand), brandSites(), brandMedia(brand)],
    { concurrency: "unbounded" },
  );
  return {
    brand: { id: found.id, name: found.name },
    revision: { number: revision.number, by: revision.created_by, at: revision.created_at },
    look: { theme: revision.theme, identity: revision.identity },
    voice: found.voice,
    sites: sites.filter((site) => site.brand_id === brand).map(({ id, name }) => ({ id, name })),
    media,
    can: { edit: found.edit, delete: found.delete },
  };
});

/**
 * Saves a brand's look as its next revision, refusing a theme that's hard to
 * read, logos that aren't in the brand's library, and a save based on a
 * revision someone else has moved on from. Returns the new revision.
 */
export const saveLook = Effect.fn("StudioApi.saveLook")(function* (
  person: Person,
  brand: BrandId,
  look: BrandLook,
  seen: number,
) {
  const found = yield* brandFor(person, brand);
  if (!found.edit) return yield* new NotPermitted({ action: "change this brand's look" });
  const { theme, issues } = resolveTheme(look.theme);
  if (issues.length > 0) return yield* new ThemeUnreadable({ issues });
  const library = new Set((yield* brandMedia(brand)).map((file) => file.id));
  for (const media of Object.values(look.identity))
    if (media !== null && !library.has(media)) return yield* new NotInBrandLibrary({ media });
  const current = yield* latestRevision(brand);
  if (current.number !== seen) return yield* new BrandChanged({ revision: current.number });
  const row: RevisionRow = {
    brand_id: brand,
    number: current.number + 1,
    theme: look.theme,
    resolved: theme,
    identity: look.identity,
    created_by: { id: person.id, name: person.name },
    created_at: now(),
  };
  // Two saves from the same revision race for one number; the primary key lets one win.
  if (!(yield* recordRevision(row))) return yield* new BrandChanged({ revision: row.number });
  return row;
});

/** Records a revision, unless the brand has one with its number already. */
const recordRevision = Effect.fn("StudioApi.recordRevision")(function* (row: RevisionRow) {
  const sql = yield* SqlClient.SqlClient;
  const inserted = yield* sql`insert into brand_revisions
      (brand_id, number, theme, resolved, identity, created_by, created_at)
    values (${row.brand_id}, ${row.number}, ${encode(BrandTheme, row.theme)},
      ${encode(ResolvedTheme, row.resolved)}, ${encode(BrandIdentity, row.identity)},
      ${encode(Collaborator, row.created_by)}, ${row.created_at})
    on conflict (brand_id, number) do nothing returning number`;
  return inserted.length > 0;
});

/**
 * Makes a brand from a preset and a brand color, as its first revision. Only
 * the organization's admins make brands, and a color too light to read is
 * refused as it is in Theme Studio.
 */
export const createBrand = Effect.fn("StudioApi.createBrand")(function* (
  person: Person,
  name: string,
  preset: PresetId,
  brandColor: HexColor,
) {
  const sql = yield* SqlClient.SqlClient;
  const { access } = yield* loadAccess(person.id);
  if (!authorize(access, "brand.create", { kind: "organization" }))
    return yield* new NotPermitted({ action: "create brands" });
  const look: BrandTheme = { preset, changes: { brandColor } };
  const { theme, issues } = resolveTheme(look);
  if (issues.length > 0) return yield* new ThemeUnreadable({ issues });
  const id = BrandId.make(randomId("brand"));
  yield* sql`insert into brands (id, name) values (${id}, ${name})`;
  yield* recordRevision({
    brand_id: id,
    number: 1,
    theme: look,
    resolved: theme,
    identity: noIdentity,
    created_by: { id: person.id, name: person.name },
    created_at: now(),
  });
  yield* audit(person, { brand: id }, { _tag: "BrandCreated", name });
  return { id };
});

/** Replaces a brand's voice guide. The agent follows it from its next turn. */
export const saveVoice = Effect.fn("StudioApi.saveVoice")(function* (
  person: Person,
  brand: BrandId,
  voice: VoiceGuide,
) {
  const sql = yield* SqlClient.SqlClient;
  const found = yield* brandFor(person, brand);
  if (!found.edit) return yield* new NotPermitted({ action: "change this brand's voice guide" });
  yield* sql`update brands set voice = ${encode(VoiceGuide, voice)} where id = ${brand}`;
  yield* audit(person, { brand }, { _tag: "VoiceGuideSaved" });
  return voice;
});

/** A brand's voice guide, for the agent writing on one of its sites. */
export const voiceOf = Effect.fn("StudioApi.voiceOf")(function* (brand: BrandId) {
  const sql = yield* SqlClient.SqlClient;
  const row = yield* SqlSchema.findOne({
    Request: Schema.Void,
    Result: Schema.Struct({ voice: json(VoiceGuide) }),
    execute: () => sql`select voice from brands where id = ${brand}`,
  })(undefined);
  return row.voice;
});

/**
 * The sites whose SiteDoc hasn't taken their brand's newest revision, with
 * that revision, for the scheduled job to offer it again.
 */
export const sitesBehindTheirBrand = Effect.fn("StudioApi.sitesBehindTheirBrand")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const sites = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({
      id: SiteId,
      brand_id: BrandId,
      brand_revision: Schema.NullOr(Schema.Int),
    }),
    execute: () => sql`select id, brand_id, brand_revision from sites where deleted_at is null`,
  })(undefined);
  const latest = new Map((yield* latestRevisions()).map((row) => [row.brand_id, row]));
  return sites.flatMap((site) => {
    const revision = latest.get(site.brand_id);
    return revision !== undefined && (site.brand_revision ?? 0) < revision.number
      ? [{ site: site.id, revision }]
      : [];
  });
});
