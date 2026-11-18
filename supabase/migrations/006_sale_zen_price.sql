-- Keep the regular Zen price on the sale (customer-visible, like msrp) so the agreement can show any extra
-- discount on top of it. Set by sales_deal_before while the sale is a draft; see Supabase migration "sale_zen_price".
alter table public.sales add column if not exists zen_price numeric(12,2);
