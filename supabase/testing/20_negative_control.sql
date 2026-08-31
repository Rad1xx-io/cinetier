-- Puts the holes back, so the checks can be watched failing.
--
-- A test that passes is worth nothing until it has been seen to fail for the
-- reason it claims to test. Applied to a scratch copy of the database, this
-- restores the policies and grants as they were written before review, and
-- 10_rls_checks and 13_image_path_checks should then abort on their exploits.
-- If they still pass here, they are not testing what they say they are.

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

-- Hole 3: image_path as an ordinary user-editable column, which is what let a
-- visible row on one board point at a picture on another and re-serve it after
-- a block, a hide or a switch to private. Migration 016 took the column-level
-- privilege away; this hands it back the way Supabase's default grants had it.
grant update on public.custom_items to authenticated;
grant insert, update on public.custom_tier_rows to authenticated;
