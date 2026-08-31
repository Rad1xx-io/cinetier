-- TierListOnline: make "a card's tier is on the card's board" a fact, not a check.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING.
--
-- `attach_upload` already refuses a tier row from another board — migration 016
-- added that check to both `p_row_id` and `p_tier_row_id`, before the grant is
-- spent. This migration is the structural half: the same rule expressed as a
-- constraint, so it holds for every writer rather than for the one function
-- that currently remembers to ask.
--
-- Why it is worth having both. `custom_items.row_id` is an ordinary column with
-- an ordinary UPDATE grant, and the RLS policy on that table checks the row's
-- `list_id` and nothing else — so a card can still be *moved* into a tier that
-- belongs to a different board, even though it can no longer be *created* in
-- one. That is `moveItem()`'s column, reachable from PostgREST. The single-
-- column foreign key that exists today is satisfied by any tier row anywhere,
-- because it only asks whether the id exists.
--
-- The read paths all scope by `list_id`, so such a card never appeared on
-- somebody else's board — this was never a disclosure. It was a foreign key
-- pointing across two people's data, and a card whose position depended on a
-- row its owner could not see. The constraint below makes that state
-- unrepresentable.

do $$
begin
  if to_regclass('public.custom_items') is null then
    raise exception 'TierListOnline: run migration 012 first — the custom board tables are missing.';
  end if;
end $$;

-- ------------------------------------------------------- existing offenders --

/*
 * Checked before anything is altered, and repaired rather than refused.
 *
 * A card pointing at a tier on another board is returned to the unassigned
 * pool of its own board — `row_id is null`, which is a state the schema already
 * has a meaning for ("under the board, not yet sorted") and which `on delete
 * set null` in 012 already produces when a tier is deleted. The alternative,
 * failing the migration and asking someone to sort it out by hand, would leave
 * the hole open for as long as that took.
 */
do $$
declare
  v_fixed integer;
begin
  update public.custom_items i
  set row_id = null
  where i.row_id is not null
    and not exists (
      select 1 from public.custom_tier_rows r
      where r.id = i.row_id and r.list_id = i.list_id
    );

  get diagnostics v_fixed = row_count;

  if v_fixed > 0 then
    raise notice 'TierListOnline: returned % card(s) pointing at a foreign tier to their own board''s pool.', v_fixed;
  else
    raise notice 'TierListOnline: no cards were pointing at a tier on another board.';
  end if;
end $$;

-- ---------------------------------------------------------- the constraint --

/*
 * The composite key the foreign key below needs.
 *
 * `id` is already the primary key, so (list_id, id) is unique for free — this
 * index exists to give the foreign key something to reference, not to enforce
 * anything new. It is therefore cheap and cannot fail on existing data.
 */
create unique index if not exists custom_tier_rows_list_id_idx
  on public.custom_tier_rows (list_id, id);

/*
 * (list_id, row_id) must name a tier on the same board.
 *
 * `on delete set null (row_id)` — the column list is not decoration, and
 * leaving it off is a data-loss bug rather than a style choice. A plain
 * `on delete set null` on a composite key nulls *every* referencing column,
 * `list_id` included, and `list_id` is `not null` — so deleting a tier would
 * abort with a constraint violation instead of returning its cards to the
 * pool. That is the behaviour 012 chose and this must not change it; naming
 * the column keeps `list_id` alone.
 *
 * This syntax needs Postgres 15 or newer. Supabase is well past that, and the
 * check at the bottom of this file proves the behaviour rather than the
 * version.
 *
 * `on update cascade` because the pair now includes `list_id`. A card cannot
 * change boards through the app, but if it ever did, the constraint should
 * follow rather than block.
 *
 * The old single-column foreign key is dropped: leaving it would mean two
 * constraints describing the same relationship, one of which is satisfied by
 * any tier row on any board, and the weaker of two overlapping rules is the one
 * that confuses a future reader about which is load-bearing.
 */
do $$
declare
  v_name text;
begin
  -- Found by shape rather than by name: 012 let Postgres name it, and a
  -- database restored from a dump may have named it differently.
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'custom_items'
    and con.contype = 'f'
    and con.conkey = array[
      (select attnum from pg_attribute
       where attrelid = 'public.custom_items'::regclass and attname = 'row_id')
    ]::smallint[];

  if v_name is not null then
    execute format('alter table public.custom_items drop constraint %I', v_name);
    raise notice 'TierListOnline: dropped the single-column row_id foreign key (%).', v_name;
  end if;
end $$;

alter table public.custom_items
  drop constraint if exists custom_items_list_row_fk;

alter table public.custom_items
  add constraint custom_items_list_row_fk
  foreign key (list_id, row_id)
  references public.custom_tier_rows (list_id, id)
  on delete set null (row_id)
  on update cascade;

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_bad integer;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'custom_items_list_row_fk'
      and conrelid = 'public.custom_items'::regclass
  ) then
    raise exception 'TierListOnline: the composite tier foreign key is missing.';
  end if;

  select count(*) into v_bad
  from public.custom_items i
  where i.row_id is not null
    and not exists (
      select 1 from public.custom_tier_rows r
      where r.id = i.row_id and r.list_id = i.list_id
    );

  if v_bad > 0 then
    raise exception 'TierListOnline: % card(s) still point at a tier on another board.', v_bad;
  end if;

  -- 012's guarantee, restated because this migration touched the same table:
  -- cards must still only be creatable through attach_upload.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'custom_items' and cmd = 'INSERT'
  ) then
    raise exception 'TierListOnline: custom_items grew an INSERT policy.';
  end if;

  /*
   * Deleting a tier must still return its cards to the pool.
   *
   * Proved rather than assumed, because the failure mode is specific and
   * silent-until-used: `on delete set null` without the column list nulls
   * `list_id` too, which is `not null`, so every tier deletion would abort.
   * The referential action is read straight out of the catalogue —
   * `confdeltype = 'n'` is SET NULL — and the column list is checked to be
   * exactly `row_id`.
   */
  if not exists (
    select 1
    from pg_constraint c
    where c.conname = 'custom_items_list_row_fk'
      and c.conrelid = 'public.custom_items'::regclass
      and c.confdeltype = 'n'
      and c.confdelsetcols = array[
        (select attnum from pg_attribute
         where attrelid = 'public.custom_items'::regclass and attname = 'row_id')
      ]::smallint[]
  ) then
    raise exception 'TierListOnline: the tier foreign key does not set only row_id to null on delete — deleting a tier would fail instead of freeing its cards.';
  end if;

  raise notice 'TierListOnline: a card''s tier must now be on the card''s own board.';
end $$;
