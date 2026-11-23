-- Card payments through Helcim (HelcimPay.js), replacing QuickBooks pay links.
-- Each sale gets a pay_token for its /pay/?t= page. Each time the customer opens the card form we
-- start a Helcim checkout session; the secret token stays here, server side only.

alter table public.sales add column if not exists pay_token uuid unique;

create table if not exists public.payment_sessions (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'balance')),
  amount numeric(12,2) not null,
  checkout_token text not null unique,
  secret_token text not null,
  created_at timestamptz not null default now(),
  transaction_id text,
  card_type text,
  card_last4 text,
  paid_at timestamptz
);
create index if not exists payment_sessions_sale on public.payment_sessions (sale_id);
create unique index if not exists payment_sessions_txn on public.payment_sessions (transaction_id) where transaction_id is not null;

-- Server only: no policies, so only the service role (edge functions) can read or write it.
alter table public.payment_sessions enable row level security;
