-- Blocks people asked the platform team for through the agent, when nothing
-- in the library fit.
create table block_requests (
  id text primary key,
  site_id text not null references sites (id),
  requested_by text not null references "user" ("id"),
  need text not null,
  example text not null,
  nearest text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
