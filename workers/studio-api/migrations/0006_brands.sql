-- Every saved version of each brand's look. Revisions never change; the
-- newest is the brand's current theme and identity. `theme` is the theme as
-- its admins set it, `resolved` the theme with its palettes generated, as
-- drafts pin it.
create table brand_revisions (
  brand_id text not null references brands (id),
  number integer not null check (number >= 1),
  theme text not null,
  resolved text not null,
  identity text not null,
  created_by text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (brand_id, number)
);

-- The brand's voice guide. It isn't part of a revision: the agent follows the
-- latest one, and saving it changes no page.
alter table brands add column voice text not null default '{"tone":"","examples":[],"wordsToAvoid":[]}';

-- The newest brand revision each site's SiteDoc has taken in, copied through
-- its outbox. The scheduled job offers a brand's newest revision again to
-- any site behind it.
alter table sites add column brand_revision integer;

-- A copy of the block versions each site's live release and open drafts pin,
-- for the block catalog and for knowing when a version can be removed.
create table block_usage (
  site_id text not null references sites (id),
  -- 'live', or the ID of an open draft.
  holder text not null,
  lockfile text not null,
  primary key (site_id, holder)
);

-- When each block version last stopped being used somewhere. A version no
-- holder pins any more can be removed from the registry 3 months after this.
create table block_versions (
  type text not null,
  version integer not null,
  last_used_at text not null,
  primary key (type, version)
);
