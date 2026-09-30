-- A copy of every site's releases, which each site's SiteDoc records first
-- and sends here through its outbox. A site's live release is its release
-- with the highest seq.
create table releases (
  id text primary key,
  site_id text not null references sites (id),
  seq integer not null,
  snapshot text not null,
  release text not null,
  published_at text not null,
  unique (site_id, seq)
);
