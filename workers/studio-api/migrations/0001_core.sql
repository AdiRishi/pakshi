-- Better Auth's tables, as its schema generator writes them for SQLite.
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);
create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);
create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

create table brands (
  id text primary key,
  name text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table sites (
  id text primary key,
  brand_id text not null references brands (id),
  name text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index sites_brand_id_idx on sites (brand_id);

-- A role on the organization (scope_id null), a brand or a site.
create table grants (
  user_id text not null references "user" ("id") on delete cascade,
  role text not null,
  scope_kind text not null check (scope_kind in ('organization', 'brand', 'site')),
  scope_id text,
  check ((scope_kind = 'organization') = (scope_id is null))
);
create unique index grants_unique_idx on grants (user_id, role, scope_kind, coalesce(scope_id, ''));

-- One permission switched on or off for one person on one scope.
create table permission_overrides (
  user_id text not null references "user" ("id") on delete cascade,
  permission text not null,
  scope_kind text not null check (scope_kind in ('organization', 'brand', 'site')),
  scope_id text,
  allowed integer not null check (allowed in (0, 1)),
  check ((scope_kind = 'organization') = (scope_id is null))
);
create unique index permission_overrides_unique_idx on permission_overrides (user_id, permission, scope_kind, coalesce(scope_id, ''));
