-- Noah learns from his real chats.
-- Every message Noah sends records where the chat is in the SCP process (stage) and the move he made.
-- A daily review compares the chats that went far with the ones that stalled and writes lessons,
-- which Noah reads before every reply. Admins can see, turn off or go back to an earlier set.

alter table chat_messages add column if not exists stage text;
alter table chat_messages add column if not exists move text;
alter table chat_threads add column if not exists max_stage int not null default 0;

create table if not exists noah_lessons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  active boolean not null default false,
  keep text[] not null default '{}',      -- what worked: do more of it
  change text[] not null default '{}',    -- what stalled: do it differently
  summary text,
  chats int not null default 0,           -- how many chats the lessons came from
  stats jsonb,                            -- the numbers the review was based on
  made_by text not null default 'auto'    -- auto, or the admin who asked for it
);
alter table noah_lessons enable row level security; -- read and written only by the portal function
create index if not exists noah_lessons_active on noah_lessons (active) where active;
