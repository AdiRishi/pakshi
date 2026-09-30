-- Approval workflows set on the organization (scope_id null), a brand or a
-- site. A scope without a row uses the workflow of the scope above it.
create table workflows (
  scope_kind text not null check (scope_kind in ('organization', 'brand', 'site')),
  scope_id text,
  steps text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check ((scope_kind = 'organization') = (scope_id is null))
);
create unique index workflows_scope_idx on workflows (scope_kind, coalesce(scope_id, ''));

-- A copy of every site's submissions for approval, which each site's SiteDoc
-- records first and sends here through its outbox.
create table submissions (
  id text primary key,
  site_id text not null references sites (id),
  status text not null,
  submitted_by text not null,
  submitted_at text not null,
  submission text not null
);
create index submissions_site_status_idx on submissions (site_id, status);
create index submissions_submitted_by_idx on submissions (submitted_by);

-- A copy of the people each open draft is shared with, for "Shared with you".
create table draft_shares (
  site_id text not null references sites (id),
  draft_id text not null,
  draft_name text not null,
  user_id text not null,
  access text not null check (access in ('view', 'edit')),
  primary key (draft_id, user_id)
);
create index draft_shares_user_id_idx on draft_shares (user_id);
