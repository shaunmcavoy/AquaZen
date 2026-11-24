-- Send to Meta from the Ad studio (admins).
-- Approved ads are uploaded to the private "ads" bucket; the portal function hands Meta a short-lived signed link.

insert into storage.buckets (id, name, public) values ('ads', 'ads', false) on conflict (id) do nothing;

create policy ads_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ads' and public.is_admin());
create policy ads_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'ads' and public.is_admin());
create policy ads_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ads' and public.is_admin());

-- What was sent, where, and what Meta said. Server only (no policies).
create table if not exists public.meta_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid,
  kind text not null,            -- 'post' or 'ad'
  headline text,
  media_path text,
  result jsonb
);
alter table public.meta_sends enable row level security;
