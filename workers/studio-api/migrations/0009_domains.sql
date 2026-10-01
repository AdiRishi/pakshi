-- A site's own domains. A hostname belongs to one site. It serves the site
-- once its ownership is proven with the TXT record holding `token`.
create table domains (
  hostname text primary key,
  site_id text not null references sites (id),
  status text not null default 'pending' check (status in ('pending', 'active')),
  token text not null,
  added_by text references "user" (id) on delete set null,
  added_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  checked_at text,
  active_at text
);
create index domains_site_id_idx on domains (site_id);
