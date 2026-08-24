-- Puts the two holes back, so the checks can be watched failing.
--
-- A test that passes is worth nothing until it has been seen to fail for the
-- reason it claims to test. Applied to a scratch copy of the database, this
-- restores the policies as they were written before review, and 10_rls_checks
-- should then abort on both exploits. If it still passes here, it is not
-- testing what it says it is.

-- Hole 1: writing anywhere under one's own folder, which is what made every
-- check in the upload route optional.
drop policy if exists "Uploads need a grant" on storage.objects;
create policy "Owners upload into their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'custom-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Hole 2: moderation as a column the content's owner may write.
drop policy if exists "Owners rearrange their own custom cards" on public.custom_items;
create policy "Owners write their own custom cards"
  on public.custom_items for all
  using (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ))
  with check (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

drop policy if exists "Custom cards follow their list" on public.custom_items;
create policy "Custom cards follow their list"
  on public.custom_items for select
  using (
    exists (
      select 1 from public.custom_tier_lists l
      where l.id = list_id
        and (auth.uid() = l.user_id or (hidden_at is null and l.is_public))
    )
  );
