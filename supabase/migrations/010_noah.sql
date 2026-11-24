-- Noah: AquaZen's social media salesperson on Messenger and Instagram (an AI, honest about it when sincerely asked).
-- Server only: no policies; the portal function reads and writes with the service key.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  channel text not null,                 -- 'messenger' or 'instagram'
  psid text not null,                    -- the person's ID on that channel
  name text,
  status text not null default 'bot',    -- 'bot', or 'human' while someone on the team has taken over
  human_until timestamptz,
  handed_off_at timestamptz,             -- Noah passed them to the team (call or ready to buy)
  customer_id uuid references public.customers(id) on delete set null,
  last_user_at timestamptz,
  last_bot_at timestamptz,
  followup_at timestamptz,               -- Noah's one follow-up was sent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, psid)
);
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null,                    -- 'user', 'noah', 'team'
  text text not null,
  mid text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread on public.chat_messages (thread_id, created_at);
create unique index if not exists chat_messages_mid on public.chat_messages (mid) where mid is not null;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

insert into public.settings values ('noah_on', 'on') on conflict (k) do nothing;
insert into public.settings values ('noah_promo', 'Our Black Friday sale: every upgrade for the hot tub (cover lifter and steps) is included free, and local delivery is free too. You can quote the total savings off MSRP.') on conflict (k) do nothing;

-- Noah's one follow-up, checked every 15 minutes.
select cron.schedule('noah-followup', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://zfqzajshbjfmflbttabq.supabase.co/functions/v1/portal/noah-followup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select v from public.settings where k = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);
