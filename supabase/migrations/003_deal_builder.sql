-- Deal builder: add-ons on a sale, MSRP on the agreement, a hidden price floor on true cost,
-- and GP / commission snapshots. Customers can read their own sales row, so nothing about cost,
-- GP or commission lives on it: those go in sale_deal (salesperson + admins) and sale_costs (admins).

alter table public.sales add column if not exists msrp numeric(12,2);
alter table public.sales add column if not exists extras jsonb not null default '[]'::jsonb;  -- [{id, name, price}]
alter table public.sales add column if not exists extras_total numeric(12,2) not null default 0;

alter table public.sale_costs add column if not exists pad numeric(12,2) not null default 0;
alter table public.sale_costs add column if not exists extras_cost numeric(12,2) not null default 0;
alter table public.sale_costs add column if not exists commission numeric(12,2) not null default 0;

create table if not exists public.sale_deal (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  sales_cost numeric(12,2),
  deal_gp numeric(12,2),
  commission_pct numeric(6,2),
  commission numeric(12,2),
  commission_paid_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.sale_deal enable row level security;
drop policy if exists sale_deal_read on public.sale_deal;
create policy sale_deal_read on public.sale_deal for select to authenticated
  using (is_admin() or exists (select 1 from sales s where s.id = sale_id and s.salesperson_id = auth.uid() and is_staff()));
drop policy if exists sale_deal_admin on public.sale_deal;
create policy sale_deal_admin on public.sale_deal for update to authenticated using (is_admin()) with check (is_admin());

-- The lowest price allowed for a hot tub, swim spa or mini pool: true cost at the minimum margin.
-- Returns nothing while the price is fine, so the floor stays hidden until someone goes under it.
create or replace function public.floor_for(p_type text, p_model text) returns numeric
language sql stable security definer set search_path = public as $$
  select ceil(c.cost / nullif(1 - coalesce(setting_get('min_margin_pct')::numeric, 40) / 100, 0))
  from product_costs c
  where p_type in ('hot_tub', 'swim_spa', 'mini_pool') and c.product_type = p_type and lower(c.model) = lower(trim(p_model)) and c.cost > 0
  limit 1
$$;
revoke all on function public.floor_for(text, text) from public, anon, authenticated;

create or replace function public.price_floor(p_type text, p_model text, p_price numeric) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare f numeric;
begin
  if not is_staff() then return null; end if;
  f := floor_for(p_type, p_model);
  if f is not null and coalesce(p_price, 0) > 0 and p_price < f then return f; end if;
  return null;
end $$;
revoke all on function public.price_floor(text, text, numeric) from public, anon;
grant execute on function public.price_floor(text, text, numeric) to authenticated;

-- While a sale is a draft: clean the add-ons, fill MSRP, enforce the floor, and work out tax and totals.
-- Once it leaves draft nothing here runs again, so the numbers are locked at signing.
create or replace function public.sales_deal_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare e jsonb; a record; out jsonb := '[]'::jsonb; ex_total numeric := 0; pr numeric; f numeric; m numeric; sub numeric;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then return new; end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then return new; end if;

  for e in select * from jsonb_array_elements(case when jsonb_typeof(new.extras) = 'array' then new.extras else '[]'::jsonb end) loop
    select * into a from addons where id = nullif(e->>'id', '')::uuid;
    if found then
      pr := greatest(coalesce(nullif(e->>'price', '')::numeric, a.sale_price, 0), 0);
      out := out || jsonb_build_object('id', a.id, 'name', a.name, 'price', pr);
      ex_total := ex_total + pr;
    end if;
  end loop;
  new.extras := out; new.extras_total := ex_total;

  select c.msrp into m from product_costs c where c.product_type = new.product_type and lower(c.model) = lower(trim(new.tub_model)) limit 1;
  if m is not null then new.msrp := m; end if;

  if auth.uid() is not null and not is_admin() and coalesce(new.hot_tub_value, 0) > 0 then
    f := floor_for(new.product_type, new.tub_model);
    if f is not null and new.hot_tub_value < f then
      raise exception 'The lowest price you can sell the % for is %.', new.tub_model, to_char(f, 'FM$999,999,990') using errcode = 'P0001';
    end if;
  end if;

  sub := coalesce(new.hot_tub_value, 0) + coalesce(new.sauna_total, 0) + new.extras_total + coalesce(new.delivery_fee, 0);
  new.tax := round(sub * coalesce(new.tax_rate, 0.12), 2);
  new.total := sub + new.tax;
  if new.payment_type = 'full' then new.deposit := new.total; end if;
  new.balance := new.total - coalesce(new.deposit, 0);
  return new;
end $$;

-- Snapshot what the salesperson earns (sale_deal) and what it really cost us (sale_costs).
create or replace function public.sales_deal_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; d record; e jsonb; a record; ex_sales numeric := 0; ex_true numeric := 0; del_sales numeric := 0; del_true numeric := 0;
        pct numeric; rev numeric; sc numeric; gp numeric; comm numeric;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then return null; end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then return null; end if;
  pct := coalesce(setting_get('commission_pct')::numeric, 25);

  select pc.cost, coalesce(l.pad, 0) as pad into c
  from product_costs pc left join product_lines l on l.id = pc.line_id
  where pc.product_type = new.product_type and lower(pc.model) = lower(trim(new.tub_model)) limit 1;

  for e in select * from jsonb_array_elements(new.extras) loop
    select * into a from addons where id = (e->>'id')::uuid;
    if found then ex_sales := ex_sales + a.cost + a.pad; ex_true := ex_true + a.cost; end if;
  end loop;
  if coalesce(new.delivery_fee, 0) > 0 then
    select * into d from addons where kind = 'delivery' order by offered desc limit 1;
    if found then del_sales := d.cost + d.pad; del_true := d.cost; end if;
  end if;

  if c.cost is null then
    delete from sale_deal where sale_id = new.id;
    return null;
  end if;

  rev := coalesce(new.hot_tub_value, 0) + new.extras_total + coalesce(new.delivery_fee, 0);
  sc := c.cost + c.pad + ex_sales + del_sales;
  gp := rev - sc;
  comm := round(greatest(gp, 0) * pct / 100, 2);

  insert into sale_deal (sale_id, sales_cost, deal_gp, commission_pct, commission, updated_at)
  values (new.id, sc, gp, pct, comm, now())
  on conflict (sale_id) do update set sales_cost = excluded.sales_cost, deal_gp = excluded.deal_gp,
    commission_pct = excluded.commission_pct, commission = excluded.commission, updated_at = now();

  insert into sale_costs (sale_id, product_cost, pad, extras_cost, delivery_cost, commission, updated_at)
  values (new.id, c.cost, c.pad, ex_true, del_true, comm, now())
  on conflict (sale_id) do update set product_cost = excluded.product_cost, pad = excluded.pad, extras_cost = excluded.extras_cost,
    delivery_cost = excluded.delivery_cost, commission = excluded.commission, updated_at = now();
  return null;
end $$;

drop trigger if exists sales_deal_before on public.sales;
create trigger sales_deal_before before insert or update on public.sales for each row execute function public.sales_deal_before();
drop trigger if exists sales_deal_after on public.sales;
create trigger sales_deal_after after insert or update on public.sales for each row execute function public.sales_deal_after();

-- The sales catalogue no longer hands out a minimum price: the floor stays hidden until someone goes under it.
drop function if exists public.sales_catalogue();
create function public.sales_catalogue()
returns table (id uuid, product_type text, line text, model text, sales_cost numeric, msrp numeric, zen_price numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.product_type, l.name, c.model, c.cost + coalesce(l.pad, 0), c.msrp, c.sale_price
  from product_costs c left join product_lines l on l.id = c.line_id
  where is_staff()
  order by l.sort nulls last, c.model
$$;
revoke all on function public.sales_catalogue() from public, anon;
grant execute on function public.sales_catalogue() to authenticated;
