-- Everything people and Pakshi did in Studio. studio-api writes entries for
-- what it changes in D1, and each SiteDoc sends its own through its outbox,
-- so an entry sent twice keeps its ID. Entries outlive the sites they name,
-- so the log still says who deleted one.
create table audit_log (
  id text primary key,
  at text not null,
  actor_id text,
  actor_name text,
  site_id text,
  brand_id text,
  event text not null,
  -- The event's tag, copied out of `event` for filtering.
  kind text not null
);
create index audit_log_at_idx on audit_log (at);
create index audit_log_site_idx on audit_log (site_id, at);
create index audit_log_actor_idx on audit_log (actor_id, at);
create index audit_log_kind_idx on audit_log (kind, at);
