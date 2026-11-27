-- Per-person menu access in the staff portal.
-- profiles.menus: the staff portal menus this person can open. NULL = the default for their role.
-- Admins always see everything. Financials, Products and Team stay admin only (they show true costs and team settings).
alter table public.profiles add column if not exists menus text[];

create or replace function public.has_menu(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.active and (
      p.role = 'admin'
      or k = any(coalesce(p.menus, case p.role
        when 'staff' then array['customers','sales','new','deliveries','service','resources']
        when 'delivery' then array['deliveries','resources']
        else array[]::text[] end))
    )
  )
$$;
grant execute on function public.has_menu(text) to authenticated;

-- The Ad studio uploads approved ads to the private "ads" bucket: anyone given the Ads menu can.
drop policy if exists ads_admin_insert on storage.objects;
drop policy if exists ads_admin_select on storage.objects;
drop policy if exists ads_admin_delete on storage.objects;
create policy ads_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and public.has_menu('ads'));
create policy ads_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'ads' and public.has_menu('ads'));
create policy ads_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and public.has_menu('ads'));
