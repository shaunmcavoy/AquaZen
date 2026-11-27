-- Noah's private links: each chat gets a code; the presentation reports how far they got, so Noah can follow up
-- with one curious question about a minute after they leave. Server only (portal function, service key).
alter table public.chat_threads add column if not exists link_code text unique;

create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  page text not null default 'presentation',
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seconds int not null default 0,
  chapter text,
  furthest text,
  furthest_i int not null default -1,
  away_at timestamptz,
  form_sent boolean not null default false,
  nudged_at timestamptz,
  nudge_text text
);
create index if not exists page_visits_open on public.page_visits (last_seen) where nudged_at is null;
create index if not exists page_visits_thread on public.page_visits (thread_id, started_at desc);
alter table public.page_visits enable row level security;
