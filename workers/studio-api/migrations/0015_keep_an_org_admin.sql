-- Only an org admin can give org admin, so the last one's grant stays even
-- when two admins take theirs away at once.
create trigger keep_an_org_admin
before delete on grants
when old.role = 'org-admin' and old.scope_kind = 'organization'
  and not exists (
    select 1 from grants
    where role = 'org-admin' and scope_kind = 'organization' and user_id <> old.user_id
  )
begin
  select raise(abort, 'The organization needs an org admin.');
end;
