-- The organization this deployment of Pakshi serves. A stage holds at most
-- one, made by the first person to set Pakshi up.
create table organization (
  id integer primary key check (id = 1),
  name text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- People asked to join, each with the grant they get on accepting. The link
-- they're sent carries a token; only its SHA-256 is stored.
create table invitations (
  id text primary key,
  token_hash text not null unique,
  email text not null,
  role text not null,
  scope_kind text not null check (scope_kind in ('organization', 'brand', 'site')),
  scope_id text,
  invited_by text not null,
  created_at text not null,
  expires_at text not null,
  accepted_at text,
  check ((scope_kind = 'organization') = (scope_id is null))
);
create index invitations_email_idx on invitations (email);

-- The name each site's platform subdomain starts with, such as
-- `northbank-libraries` in `northbank-libraries.<sites domain>`.
alter table sites add column address text;
create unique index sites_address_idx on sites (address);
