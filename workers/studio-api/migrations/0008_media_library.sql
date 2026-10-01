-- What each library image was called, how big it is and who uploaded it.
alter table media add column name text not null default '';
alter table media add column size integer not null default 0;
alter table media add column uploaded_by text references "user" (id) on delete set null;
-- When a site last used the image in a draft or its live release. A file is
-- kept while it's used, and for three months after.
alter table media add column last_used_at text;
