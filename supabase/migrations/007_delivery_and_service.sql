-- Delivery team and service requests.
-- Delivery team: a 'delivery' role that signs in to the staff portal and only sees the Deliveries screen.
-- They never read sales or customers directly: the portal function hands them just what a delivery needs.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','staff','delivery','customer'));

-- Photos of the tub in place on delivery day (paths in the private 'agreements' bucket), and who delivered it.
alter table public.sales add column if not exists delivery_photo_paths text[] not null default '{}';
alter table public.sales add column if not exists delivered_by uuid references public.profiles(id) on delete set null;

-- Service requests from the customer portal.
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  topic text not null default 'other',
  message text not null,
  photo_paths text[] not null default '{}',
  status text not null default 'new' check (status in ('new','booked','done')),
  staff_notes text,
  booked_for date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.service_requests enable row level security;
drop policy if exists service_admin on public.service_requests;
create policy service_admin on public.service_requests for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists service_staff on public.service_requests;
create policy service_staff on public.service_requests for select to authenticated
  using (is_staff() and customer_id in (select id from customers where created_by = auth.uid()));
drop policy if exists service_self on public.service_requests;
create policy service_self on public.service_requests for select to authenticated
  using (customer_id in (select id from customers where user_id = auth.uid()));
