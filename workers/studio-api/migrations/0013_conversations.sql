-- Every conversation with the agent, one per person and draft, so a site
-- deleted for good can have each of its SiteAgents erased too.
create table conversations (
  site_id text not null references sites (id),
  draft_id text not null,
  user_id text not null,
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (site_id, draft_id, user_id)
);
