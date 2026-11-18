-- Keep each add-on's regular price on the sale so the agreement can show "Included" or "was $X" when it's discounted.
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
      out := out || jsonb_build_object('id', a.id, 'name', a.name, 'price', pr, 'list', coalesce(a.sale_price, pr));
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

