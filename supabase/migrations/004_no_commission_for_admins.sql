-- No commission when an admin sells the deal (or no salesperson is set): there's nobody to pay,
-- so Financials shouldn't count a commission as a cost. GP is still recorded.
create or replace function public.sales_deal_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; d record; e jsonb; a record; ex_sales numeric := 0; ex_true numeric := 0; del_sales numeric := 0; del_true numeric := 0;
        pct numeric; rev numeric; sc numeric; gp numeric; comm numeric;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then return null; end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then return null; end if;
  pct := coalesce(setting_get('commission_pct')::numeric, 25);
  if new.salesperson_id is null or exists (select 1 from profiles p where p.id = new.salesperson_id and p.role = 'admin') then pct := 0; end if;

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
