-- Pricing: line pads, add-on pads, settings, and safe catalogue functions.
-- True cost is admin-only (product_costs, addons have admin-only RLS). Salespeople read the
-- sales catalogue through sales_catalogue()/sales_addons(), which only return cost + pad.

create table if not exists public.product_lines (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null default 'AquaSolus',
  product_type text not null,
  name text not null,
  pad numeric(12,2) not null default 0,
  show_price boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now(),
  unique (product_type, name)
);
alter table public.product_lines enable row level security;
drop policy if exists product_lines_admin on public.product_lines;
create policy product_lines_admin on public.product_lines for all to authenticated using (is_admin()) with check (is_admin());

insert into public.product_lines (product_type, name, sort) values
  ('hot_tub', 'Series One', 10), ('hot_tub', 'Series Two', 20), ('hot_tub', 'Series Three', 30),
  ('swim_spa', 'Swim spas', 40), ('mini_pool', 'Mini pools', 50)
on conflict (product_type, name) do nothing;

alter table public.product_costs add column if not exists line_id uuid references public.product_lines(id) on delete set null;
alter table public.addons add column if not exists pad numeric(12,2) not null default 0;

insert into public.settings (k, v) values ('commission_pct', '25'), ('min_margin_pct', '40'), ('website_prices', 'off')
on conflict (k) do nothing;

create or replace function public.slugify(t text) returns text language sql immutable as
$$ select trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g')) $$;

-- What a salesperson may see: sales cost (true cost + line pad), never the true cost or the pad.
create or replace function public.sales_catalogue()
returns table (id uuid, product_type text, line text, model text, sales_cost numeric, msrp numeric, zen_price numeric, min_price numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.product_type, l.name, c.model,
         c.cost + coalesce(l.pad, 0),
         c.msrp, c.sale_price,
         round((c.cost + coalesce(l.pad, 0)) / nullif(1 - coalesce(setting_get('min_margin_pct')::numeric, 40) / 100, 0), 2)
  from product_costs c left join product_lines l on l.id = c.line_id
  where is_staff()
  order by l.sort nulls last, c.model
$$;

create or replace function public.sales_addons()
returns table (id uuid, name text, sales_cost numeric, sale_price numeric)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.cost + a.pad, a.sale_price from addons a where a.offered and is_staff() order by a.sort, a.name
$$;

-- What the public website may see: MSRP and Zen price only, and only when prices are switched on.
create or replace function public.public_prices()
returns table (key text, msrp numeric, zen_price numeric)
language sql stable security definer set search_path = public as $$
  select c.product_type || ':' || slugify(c.model), c.msrp, c.sale_price
  from product_costs c left join product_lines l on l.id = c.line_id
  where setting_get('website_prices') = 'on' and coalesce(l.show_price, true) and c.sale_price is not null
$$;

revoke all on function public.sales_catalogue() from public, anon;
revoke all on function public.sales_addons() from public, anon;
grant execute on function public.sales_catalogue() to authenticated;
grant execute on function public.sales_addons() to authenticated;
grant execute on function public.public_prices() to anon, authenticated;

update public.addons set cost = 500, pad = 50, sale_price = 650 where name = 'Delivery' and cost = 0 and sale_price is null;

-- Pricing settings: staff can read commission and minimum margin; only admins can change them.
create or replace function public.pricing_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when is_staff() then jsonb_build_object(
    'commission_pct', coalesce(setting_get('commission_pct')::numeric, 25),
    'min_margin_pct', coalesce(setting_get('min_margin_pct')::numeric, 40),
    'website_prices', coalesce(setting_get('website_prices'), 'off')) end
$$;
create or replace function public.pricing_settings_put(commission_pct numeric, min_margin_pct numeric, website_prices text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can change pricing settings'; end if;
  if commission_pct is not null then perform setting_put('commission_pct', least(greatest(commission_pct, 0), 100)::text); end if;
  if min_margin_pct is not null then perform setting_put('min_margin_pct', least(greatest(min_margin_pct, 0), 95)::text); end if;
  if website_prices in ('on', 'off') then perform setting_put('website_prices', website_prices); end if;
end $$;
revoke all on function public.pricing_settings() from public, anon;
revoke all on function public.pricing_settings_put(numeric, numeric, text) from public, anon;
grant execute on function public.pricing_settings() to authenticated;
grant execute on function public.pricing_settings_put(numeric, numeric, text) to authenticated;
