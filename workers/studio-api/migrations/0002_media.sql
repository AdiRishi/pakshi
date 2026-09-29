-- Images in a site's or a brand's library. Files never change, so neither do
-- their rows, except the alt text suggested when someone places the image.
create table media (
  id text primary key,
  site_id text references sites (id),
  brand_id text references brands (id),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  width integer not null check (width >= 1),
  height integer not null check (height >= 1),
  alt text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check ((site_id is null) <> (brand_id is null))
);
create index media_site_id_idx on media (site_id);
create index media_brand_id_idx on media (brand_id);
