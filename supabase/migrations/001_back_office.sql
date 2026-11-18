-- AquaZen back office: staff portal, customer portal, online signing, QuickBooks payments.
-- Admin: shaun@aquazen.ca. Salespeople see only their own customers and deals. Customers see only their own.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- People ----------
create table public.admin_emails (email text primary key);
insert into public.admin_emails values ('shaun@aquazen.ca');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('admin','staff','customer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin_email(e text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from admin_emails where email = lower(e)) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active) $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role in ('admin','staff') and active) $$;

-- New logins get a profile. Emails on the admin list become admins.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (new.id, lower(new.email), new.raw_user_meta_data->>'full_name',
          case when is_admin_email(new.email) then 'admin'
               when new.raw_user_meta_data->>'role' in ('staff') then 'staff'
               else 'customer' end)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Customers and sales ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  cell text,
  heard_about text,
  address text,
  city_pc text,
  notes text,
  user_id uuid references auth.users(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.customers (lower(email));
create index on public.customers (user_id);
create index on public.customers (created_by);

create sequence public.sales_number_seq start 1001;
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  number int not null unique default nextval('public.sales_number_seq'),
  customer_id uuid not null references public.customers(id) on delete cascade,
  salesperson_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','awaiting_customer','signed','deposit_paid','delivery_scheduled','delivered','cancelled')),
  sale_date date default (now() at time zone 'America/Vancouver')::date,
  product_type text not null default 'hot_tub' check (product_type in ('hot_tub','swim_spa','mini_pool','sauna')),
  tub_make text, tub_model text, tub_line text, shell_colour text, siding text, water_care text, stereo text,
  starter_kit text, steps text, lifter text, spa_cover text, other text, est_delivery text,
  hot_tub_value numeric(12,2) not null default 0,
  sauna_make text, sauna_model text, sauna_electrical text, sauna_total numeric(12,2) not null default 0,
  notes text,
  delivery_fee numeric(12,2) not null default 0,
  tax_rate numeric(6,4) not null default 0.12,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  deposit numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  payment_type text not null default 'deposit' check (payment_type in ('full','deposit')),
  pay_methods text not null default 'both' check (pay_methods in ('card','bank','both')),
  balance_method text not null default 'before_delivery' check (balance_method in ('before_delivery','cash','cheque','financing')),
  -- When the customer wants it: 'asap' (under two weeks) or the first day of a two-week window (YYYY-MM-DD).
  delivery_window text,
  delivery_date date,
  rep_name text, rep_signed_at timestamptz, rep_signature_path text,
  terms_version int,
  sign_token uuid unique, sign_token_expires timestamptz,
  customer_signed_at timestamptz, customer_typed_name text, customer_sign_ip text, customer_sign_ua text,
  customer_signature_path text, agreement_pdf_path text, agreement_sha256 text,
  signing_method text not null default 'online',
  paper_photo_paths text[],
  qb_customer_id text, qb_deposit_invoice_id text, qb_invoice_link text,
  qb_balance_invoice_id text, qb_balance_link text,
  deposit_paid_at timestamptz, balance_paid_at timestamptz, delivered_at timestamptz,
  serial_number text, delivery_notes text,
  recorded_past boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.sales (customer_id);
create index on public.sales (salesperson_id);
create index on public.sales (status);

create or replace function public.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger sales_touch before update on public.sales for each row execute function public.touch_updated_at();

create table public.sale_events (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  actor uuid,
  detail jsonb
);
create index on public.sale_events (sale_id);

-- What each sale cost us (admins only), and the cost list it's filled from.
create table public.sale_costs (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  product_cost numeric(12,2) not null default 0,
  sauna_cost numeric(12,2) not null default 0,
  warehouse_shipping numeric(12,2) not null default 0,
  delivery_cost numeric(12,2) not null default 0,
  other_costs numeric(12,2) not null default 0,
  notes text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table public.product_costs (
  id uuid primary key default gen_random_uuid(),
  product_type text not null,
  model text not null,
  cost numeric(12,2) not null default 0,
  msrp numeric(12,2),
  sale_price numeric(12,2),
  note text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (product_type, model)
);

-- ---------- Agreement terms (versioned; a signed sale keeps the version it was signed under) ----------
create table public.agreement_terms (
  version int primary key,
  delivery_terms text not null,
  purchase_terms text not null,
  created_at timestamptz not null default now()
);
insert into public.agreement_terms (version, delivery_terms, purchase_terms) values (1,
'DELIVERY: The customer chooses a two-week delivery window, or as soon as possible, when signing. AquaZen will call to confirm the exact delivery day. Before delivery the customer is responsible for a solid, level base able to carry the full weight of the filled unit, a dedicated electrical circuit and disconnect installed by a licensed electrician to the manufacturer''s specifications, and a clear path from the street to the installation site. If the site is not ready on the confirmed day, delivery will be rescheduled and extra delivery costs may apply. Cranes, removal of fences or other special equipment are not included unless written on this agreement. Delivery dates depend on the manufacturer and carrier and are estimates, not guarantees.',
'PURCHASE: Prices are in Canadian dollars. GST (5%) and PST (7%) apply unless an exemption is shown. The deposit confirms the order with the manufacturer and is non-refundable once the order has been placed. The balance is due before delivery unless another arrangement is written on this agreement. Ownership passes to the customer when paid in full. The manufacturer''s warranty applies as set out in the owner''s documentation, and requires installation and electrical work that meet the manufacturer''s specifications. Payments are made through secure QuickBooks invoices; AquaZen never sees or stores card or bank details. This agreement is the complete agreement between the customer and AquaZen (Aqua Zen Wellness Consulting), 7049 Russell Ave, Burnaby, BC, and is governed by the laws of British Columbia.');

create or replace function public.current_terms_version() returns int
language sql stable security definer set search_path = public as
$$ select max(version) from agreement_terms $$;

-- ---------- Private settings and QuickBooks connection (server only) ----------
create table public.settings (k text primary key, v text);
create table public.qb_connection (
  id int primary key default 1 check (id = 1),
  realm_id text, company_name text, access_token text, refresh_token text,
  access_expires timestamptz, refresh_expires timestamptz, connected_by uuid, updated_at timestamptz default now()
);
create table public.qb_oauth_states (state text primary key, uid uuid not null, created_at timestamptz not null default now());

create or replace function public.setting_get(k text) returns text
language sql stable security definer set search_path = public as $$ select v from settings where settings.k = setting_get.k $$;
create or replace function public.setting_put(k text, v text) returns void
language sql security definer set search_path = public as
$$ insert into settings values (k, nullif(v, '')) on conflict (k) do update set v = excluded.v $$;

create or replace function public.qb_get() returns jsonb
language sql stable security definer set search_path = public as
$$ select to_jsonb(q) - 'id' from qb_connection q where id = 1 and refresh_token is not null $$;
create or replace function public.qb_put(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into qb_connection (id) values (1) on conflict (id) do nothing;
  update qb_connection set
    realm_id = coalesce(p->>'realm_id', realm_id),
    company_name = coalesce(p->>'company_name', company_name),
    access_token = coalesce(p->>'access_token', access_token),
    refresh_token = coalesce(p->>'refresh_token', refresh_token),
    access_expires = coalesce((p->>'access_expires')::timestamptz, access_expires),
    refresh_expires = coalesce((p->>'refresh_expires')::timestamptz, refresh_expires),
    connected_by = coalesce((p->>'connected_by')::uuid, connected_by),
    updated_at = now()
  where id = 1;
end $$;
create or replace function public.qb_clear() returns void
language sql security definer set search_path = public as $$ delete from qb_connection where id = 1 $$;
create or replace function public.qb_state_new(uid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  delete from qb_oauth_states where created_at < now() - interval '1 hour';
  insert into qb_oauth_states values (s, uid);
  return s;
end $$;
create or replace function public.qb_state_take(s text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  delete from qb_oauth_states where state = s and created_at > now() - interval '1 hour' returning uid into u;
  return u;
end $$;
create or replace function public.check_cron_secret(s text) returns boolean
language sql stable security definer set search_path = public as
$$ select s <> '' and s = (select v from settings where k = 'cron_secret') $$;

-- Server-only functions: nobody signed in (or not) can call them from the browser.
revoke execute on function public.setting_get(text), public.setting_put(text, text), public.qb_get(), public.qb_put(jsonb),
  public.qb_clear(), public.qb_state_new(uuid), public.qb_state_take(text), public.check_cron_secret(text),
  public.is_admin_email(text), public.handle_new_user() from public, anon, authenticated;

-- ---------- Row level security ----------
alter table public.admin_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_events enable row level security;
alter table public.sale_costs enable row level security;
alter table public.product_costs enable row level security;
alter table public.agreement_terms enable row level security;
alter table public.settings enable row level security;
alter table public.qb_connection enable row level security;
alter table public.qb_oauth_states enable row level security;

-- Profiles: you see yourself; staff see the team; admins see everyone. You can change only your name and phone.
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or is_admin() or (is_staff() and role in ('admin','staff')));
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for update to authenticated using (is_admin()) with check (is_admin());
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Customers: admins all; salespeople their own; a customer their own record.
create policy customers_admin on public.customers for all to authenticated using (is_admin()) with check (is_admin());
create policy customers_staff on public.customers for all to authenticated
  using (is_staff() and created_by = auth.uid()) with check (is_staff() and created_by = auth.uid());
create policy customers_self on public.customers for select to authenticated using (user_id = auth.uid());

-- Sales: admins all; salespeople their own. In the browser only drafts can be changed; everything after
-- signing goes through the server. Customers can read their own signed sales.
create policy sales_read on public.sales for select to authenticated
  using (is_admin() or (is_staff() and salesperson_id = auth.uid())
         or (status not in ('draft') and customer_id in (select id from customers where user_id = auth.uid())));
create policy sales_insert on public.sales for insert to authenticated
  with check (status = 'draft' and (is_admin() or (is_staff() and salesperson_id = auth.uid())));
create policy sales_update on public.sales for update to authenticated
  using (status = 'draft' and (is_admin() or (is_staff() and salesperson_id = auth.uid())))
  with check (status = 'draft' and (is_admin() or (is_staff() and salesperson_id = auth.uid())));
create policy sales_delete on public.sales for delete to authenticated
  using (status = 'draft' and (is_admin() or (is_staff() and salesperson_id = auth.uid())));

create policy sale_events_read on public.sale_events for select to authenticated
  using (sale_id in (select id from sales));

create policy sale_costs_admin on public.sale_costs for all to authenticated using (is_admin()) with check (is_admin());
create policy product_costs_admin on public.product_costs for all to authenticated using (is_admin()) with check (is_admin());
create policy terms_read on public.agreement_terms for select to authenticated using (true);
-- settings, qb_connection, qb_oauth_states, admin_emails: no policies, server only.

-- ---------- Signed agreements and signatures ----------
insert into storage.buckets (id, name, public) values ('agreements', 'agreements', false) on conflict (id) do nothing;

-- ---------- QuickBooks payment check every 15 minutes ----------
insert into public.settings values ('cron_secret', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')) on conflict (k) do nothing;
select cron.schedule('qb-sync', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://zfqzajshbjfmflbttabq.supabase.co/functions/v1/portal/qb-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select v from public.settings where k = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);
