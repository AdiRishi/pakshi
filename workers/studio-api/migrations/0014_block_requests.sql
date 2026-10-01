-- Block requests can be for any site, rather than one, and the platform team
-- closes each once it has answered it.
create table block_requests_next (
  id text primary key,
  site_id text references sites (id),
  requested_by text not null references "user" ("id"),
  need text not null,
  example text not null,
  nearest text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at text,
  closed_by text references "user" ("id") on delete set null
);
insert into block_requests_next (id, site_id, requested_by, need, example, nearest, created_at)
  select id, site_id, requested_by, need, example, nearest, created_at from block_requests;
drop table block_requests;
alter table block_requests_next rename to block_requests;
create index block_requests_created_at_idx on block_requests (created_at);
