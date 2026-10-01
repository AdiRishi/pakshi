-- Roles the organization's admins made, beside the default roles Pakshi
-- ships in code. A grant names either kind by its ID. `permissions` is a JSON
-- array of the permissions the role holds.
create table roles (
  id text primary key,
  name text not null,
  description text not null default '',
  permissions text not null,
  created_by text references "user" (id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index roles_name_idx on roles (lower(name));
create index grants_role_idx on grants (role);

-- Who switched each override, and when.
alter table permission_overrides add column set_by text;
alter table permission_overrides add column set_at text;
