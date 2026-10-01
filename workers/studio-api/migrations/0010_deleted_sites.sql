-- A deleted site stops serving at once and leaves every list. An org admin
-- can restore it for 30 days; after that its data is deleted for good.
alter table sites add column deleted_at text;
alter table sites add column deleted_by text references "user" (id) on delete set null;
